import { assert, assertEquals, assertExists } from "@std/assert";
import { test } from "@cross/test";
import {
  ExtendedZipEntry,
  extendZipEntry,
  getOrCreateContentsMapEntry,
  getZipEntryPath,
  makeContentsMap,
  makeDirectoryEntryType,
  ZipSingleArchiveReader,
} from "./zip_single_archive_reader.ts";
import * as zip from "@zip-js/zip-js";
import {
  newFileSystemReader,
  newLoaderBuilder,
} from "@scroogieboy/directory-to-object/factories";
import type {
  LoaderBuilder,
  ValueLoaderOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { merge } from "@es-toolkit/es-toolkit";
import { makeZipEntry } from "./test_utilities.ts";

// Let's not use web workers in zip-js, to keep testing more predictable.
zip.configure({ useWebWorkers: false });

test("extendZipEntry extends entries as expected", () => {
  const entry1 = makeZipEntry("foo", false);
  const extendedEntry1 = extendZipEntry("xyz", entry1);
  assertEquals(extendedEntry1, {
    parentPath: "",
    name: "foo",
    url: new URL("czf://xyz/foo"),
    entry: entry1,
    type: "file",
  });

  const entry2 = makeZipEntry("foo/", true);
  const extendedEntry2 = extendZipEntry("xyz", entry2);
  assertEquals(extendedEntry2, {
    parentPath: "",
    name: "foo",
    url: new URL("czf://xyz/foo"),
    entry: entry2,
    type: "directory",
  });

  const entry3 = makeZipEntry("foo/bar/baz", false);
  const extendedEntry3 = extendZipEntry("xyz", entry3);
  assertEquals(extendedEntry3, {
    parentPath: "/foo/bar",
    name: "baz",
    url: new URL("czf://xyz/foo/bar/baz"),
    entry: entry3,
    type: "file",
  });

  const entry4 = makeZipEntry("foo/bar/baz/", true);
  const extendedEntry4 = extendZipEntry("xyz", entry4);
  assertEquals(extendedEntry4, {
    parentPath: "/foo/bar",
    name: "baz",
    url: new URL("czf://xyz/foo/bar/baz"),
    entry: entry4,
    type: "directory",
  });
});

test("makeDirectoryEntryType returns the correct type", () => {
  assertEquals(makeDirectoryEntryType(makeZipEntry("foo", false)), "file");
  assertEquals(makeDirectoryEntryType(makeZipEntry("foo", true)), "directory");
});

test("ZipReaderImpl can read CompleteDirectory.zip directories", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = await ZipSingleArchiveReader.newZipSingleArchiveReader(
    zipFileUrl,
    newFileSystemReader(),
  );
  assertEquals(zipReader.name, zipFileUrl.href);

  const contents = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(contents.entries.length, 4);

  // Since we control the zip file, we know the order of the entries (but we move the directories to the beginning)...
  const uuid = contents.entries[0].url.hostname;
  assertEquals(contents.entries, [
    {
      name: "subdirectory",
      type: "directory",
      url: new URL(`czf://${uuid}/subdirectory`),
    },
    {
      name: "binary.bin",
      type: "file",
      url: new URL(`czf://${uuid}/binary.bin`),
    },
    {
      name: "subdirectory.json",
      type: "file",
      url: new URL(`czf://${uuid}/subdirectory.json`),
    },
    {
      name: "test.txt",
      type: "file",
      url: new URL(`czf://${uuid}/test.txt`),
    },
  ]);

  const subdirectoryContents = await zipReader.readDirectoryContents(
    contents.entries[0].url,
  );
  assertEquals(subdirectoryContents.entries, [{
    name: "nested.json",
    type: "file",
    url: new URL(`czf://${uuid}/subdirectory/nested.json`),
  }]);
});

test("ZipReaderImpl can read CompleteDirectory_windows.zip directories", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory_windows.zip"),
  );
  const zipReader = await ZipSingleArchiveReader.newZipSingleArchiveReader(
    zipFileUrl,
    newFileSystemReader(),
  );

  const contents = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(contents.entries.length, 4);

  // Since we control the zip file, we know the order of the entries (but we move the directories to the beginning)...
  const uuid = contents.entries[0].url.hostname;
  assertEquals(contents.entries, [
    {
      name: "subdirectory",
      type: "directory",
      url: new URL(`czf://${uuid}/subdirectory`),
    },
    {
      name: "test.txt",
      type: "file",
      url: new URL(`czf://${uuid}/test.txt`),
    },
    {
      name: "binary.bin",
      type: "file",
      url: new URL(`czf://${uuid}/binary.bin`),
    },
    {
      name: "subdirectory.json",
      type: "file",
      url: new URL(`czf://${uuid}/subdirectory.json`),
    },
  ]);

  const subdirectoryContents = await zipReader.readDirectoryContents(
    contents.entries[0].url,
  );
  assertEquals(subdirectoryContents.entries, [{
    name: "nested.json",
    type: "file",
    url: new URL(`czf://${uuid}/subdirectory/nested.json`),
  }]);
});

async function canReadCompleteDirectory(zipFileUrl: URL, newline: string) {
  // The merge options we'll use.
  const mergeOptions: ValueLoaderOptions = {
    arrayMergeFunction: merge,
    objectMergeFunction: merge,
  };

  const zipReader = await ZipSingleArchiveReader.newZipSingleArchiveReader(
    zipFileUrl,
    newFileSystemReader(),
  );
  const builder: LoaderBuilder = newLoaderBuilder(zipReader);
  const loaders = builder.defaults();
  loaders.push(builder.binaryFile({ extension: ".bin" }));

  const directoryLoader = builder.directoryAsObject({ loaders: loaders });
  const contents = await directoryLoader.loadDirectory(
    zipFileUrl,
    mergeOptions,
  );

  // Node.js returns binary data as a Buffer, which is a Uint8Array subclass.
  const binary = contents["binary"];
  assert(binary instanceof Uint8Array);
  assertEquals(binary.length, 4);
  assertEquals(binary[0], 0);
  assertEquals(binary[1], 255);
  assertEquals(binary[2], 0);
  assertEquals(binary[3], 255);

  // Remove it because we can't directly test equality when the actual value may be a Uint8Array subclass.
  delete contents["binary"];

  assertEquals(contents, {
    test: `This is a test!${newline}`,
    subdirectory: {
      another: "value",
      nested: {
        key: "value",
        key2: "value2",
      },
    },
  });
}

test("ZipReaderImpl can read CompleteDirectory.zip contents", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  await canReadCompleteDirectory(zipFileUrl, "\n");
});

test("ZipReaderImpl can read CompleteDirectory_windows.zip contents", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory_windows.zip"),
  );

  await canReadCompleteDirectory(zipFileUrl, "\r\n");
});

test("ZipReaderImpl can read zip files without explicit directory entries", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/hello_world.docx"),
  );

  const zipReader = await ZipSingleArchiveReader.newZipSingleArchiveReader(
    zipFileUrl,
    newFileSystemReader(),
  );

  const contents = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(contents.entries.length, 4);
});

test("makeContentsMap creates a contents map", () => {
  const emptyContentsMap = makeContentsMap([]);
  assertEquals(emptyContentsMap.size, 0);

  const contentsMap = makeContentsMap([
    extendZipEntry("xyz", makeZipEntry("baz", true)),
    extendZipEntry("xyz", makeZipEntry("foo", true)),
    extendZipEntry("xyz", makeZipEntry("foo/bar", false)),
  ]);

  assertEquals(contentsMap.size, 3);
  assertExists(contentsMap.get(""));
  assertEquals(contentsMap.get("")!.map((e) => e.name), ["baz", "foo"]);
  assertExists(contentsMap.get("/baz"));
  assertEquals(contentsMap.get("/baz")!.length, 0);
  assertExists(contentsMap.get("/foo"));
  assertEquals(contentsMap.get("/foo")!.map((e) => e.name), ["bar"]);
});

test("getOrCreateContentsMapEntry creates new entries", () => {
  const contentsMap = new Map<string, ExtendedZipEntry[]>();

  const e = getOrCreateContentsMapEntry(
    contentsMap,
    "/foo/bar/baz",
  );
  assertEquals(e, []);

  assert(contentsMap.get("/foo/bar/baz") === e);
});

test("getOrCreateContentsMapEntry reuses existing entries", () => {
  const contentsMap = new Map<string, ExtendedZipEntry[]>();
  const arr: ExtendedZipEntry[] = [];
  contentsMap.set("/foo/bar/baz", arr);

  const e = getOrCreateContentsMapEntry(
    contentsMap,
    "/foo/bar/baz",
  );
  assert(arr === e);
});

test("getZipEntryPath works as expected", () => {
  const topLevelEntry = makeZipEntry("foo", false);
  const extendedTopLevelEntry = extendZipEntry("xyz", topLevelEntry);

  assertEquals(getZipEntryPath(extendedTopLevelEntry), "/foo");

  const entry = makeZipEntry("foo/bar/baz", false);
  const extendedEntry = extendZipEntry("xyz", entry);

  assertEquals(getZipEntryPath(extendedEntry), "/foo/bar/baz");
});
