import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertRejects,
} from "@std/assert";
import { test } from "@cross/test";
import {
  directoryEntriesForPath,
  type ExtendedZipEntry,
  extendZipEntry,
  haveHardEvictionCandidates,
  haveSoftEvictionCandidates,
  makeDirectoryEntryType,
  type ZipFileInformation,
  ZipReaderImpl,
} from "./zip_reader.ts";
import { DefaultLoaderBuilder } from "@scroogieboy/directory-to-object/factories";
import type {
  LoaderBuilder,
  ValueLoaderOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { merge } from "@es-toolkit/es-toolkit";
import * as zip from "@zip-js/zip-js";

// Let's not use web workers in zip-js, to keep testing more predictable.
zip.configure({ useWebWorkers: false });

// Make all the ZipReader members public so we can test them.
class OpenZipReader extends ZipReaderImpl {
  override touchZipFileInformation(info: ZipFileInformation): void {
    super.touchZipFileInformation(info);
  }
  override lookupZipFileInformationByUuid(
    uuid: string,
  ): ZipFileInformation | undefined {
    return super.lookupZipFileInformationByUuid(uuid);
  }

  override urlToZipFileInformation(
    url: URL,
  ): Promise<ZipFileInformation | undefined> {
    return super.urlToZipFileInformation(url);
  }

  override lookupZipFileInformationByLocation(
    location: Readonly<URL>,
  ): ZipFileInformation | undefined {
    return super.lookupZipFileInformationByLocation(location);
  }

  override loadZipFile(path: Readonly<URL>): Promise<ZipFileInformation> {
    return super.loadZipFile(path);
  }

  override loadAndCacheZipFile(
    path: Readonly<URL>,
  ): Promise<ZipFileInformation> {
    return super.loadAndCacheZipFile(path);
  }

  override scheduleEvictor(): number {
    return super.scheduleEvictor();
  }

  override get cache(): Map<string, ZipFileInformation> {
    return super.cache;
  }
}

function makeZipEntry(filename: string, directory: boolean): zip.Entry {
  return {
    offset: 0,
    filename: filename,
    rawFilename: new TextEncoder().encode(filename),
    filenameUTF8: false,
    directory: directory,
    encrypted: false,
    zipCrypto: false,
    compressedSize: 0,
    uncompressedSize: 0,
    lastModDate: new Date(0),
    rawLastModDate: 0,
    comment: "",
    rawComment: new Uint8Array(0),
    commentUTF8: false,
    signature: 0,
    rawExtraField: new Uint8Array(0),
    zip64: false,
    version: 0,
    versionMadeBy: 0,
    msDosCompatible: false,
    internalFileAttribute: 0,
    externalFileAttribute: 0,
    diskNumberStart: 0,
    compressionMethod: 0,
  };
}

test("extendZipEntry extends entries as expected", () => {
  const entry1 = makeZipEntry("foo", false);
  const extendedEntry1 = extendZipEntry("xyz", entry1);
  assertEquals(extendedEntry1, {
    parentPath: "",
    name: "foo",
    url: new URL("czf://xyz/foo"),
    entry: entry1,
  });

  const entry2 = makeZipEntry("foo/", true);
  const extendedEntry2 = extendZipEntry("xyz", entry2);
  assertEquals(extendedEntry2, {
    parentPath: "",
    name: "foo",
    url: new URL("czf://xyz/foo"),
    entry: entry2,
  });

  const entry3 = makeZipEntry("foo/bar/baz", false);
  const extendedEntry3 = extendZipEntry("xyz", entry3);
  assertEquals(extendedEntry3, {
    parentPath: "/foo/bar",
    name: "baz",
    url: new URL("czf://xyz/foo/bar/baz"),
    entry: entry3,
  });

  const entry4 = makeZipEntry("foo/bar/baz/", true);
  const extendedEntry4 = extendZipEntry("xyz", entry4);
  assertEquals(extendedEntry4, {
    parentPath: "/foo/bar",
    name: "baz",
    url: new URL("czf://xyz/foo/bar/baz"),
    entry: entry4,
  });
});

test("makeDirectoryEntryType returns the correct type", () => {
  assertEquals(makeDirectoryEntryType(makeZipEntry("foo", false)), "file");
  assertEquals(makeDirectoryEntryType(makeZipEntry("foo", true)), "directory");
});

test("directoryEntriesForPath returns the correct entries", () => {
  const contents: ExtendedZipEntry[] = [
    extendZipEntry("xyz", makeZipEntry("bar/abc/", true)),
    extendZipEntry("xyz", makeZipEntry("bar/abc/def", false)),
    extendZipEntry("xyz", makeZipEntry("foo", false)),
    extendZipEntry("xyz", makeZipEntry("bar/", true)),
    extendZipEntry("xyz", makeZipEntry("baz", false)),
    extendZipEntry("xyz", makeZipEntry("bar/xyz", false)),
  ];

  assertEquals(directoryEntriesForPath(contents, ""), [
    {
      name: "foo",
      type: "file",
      url: new URL("czf://xyz/foo"),
    },
    {
      name: "bar",
      type: "directory",
      url: new URL("czf://xyz/bar"),
    },
    {
      name: "baz",
      type: "file",
      url: new URL("czf://xyz/baz"),
    },
  ]);

  assertEquals(directoryEntriesForPath(contents, "x"), []);
  assertEquals(directoryEntriesForPath(contents, "/x"), []);

  assertEquals(directoryEntriesForPath(contents, "/bar"), [
    {
      name: "abc",
      type: "directory",
      url: new URL("czf://xyz/bar/abc"),
    },
    {
      name: "xyz",
      type: "file",
      url: new URL("czf://xyz/bar/xyz"),
    },
  ]);

  assertEquals(directoryEntriesForPath(contents, "/bar/abc"), [
    {
      name: "def",
      type: "file",
      url: new URL("czf://xyz/bar/abc/def"),
    },
  ]);
});

test("ZipReaderImpl can read CompleteDirectory.zip directories", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new ZipReaderImpl({ name: "foo", softTTL: 0, hardTTL: 0 });
  assertEquals(zipReader.name, "foo");

  const entries = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries.length, 4);

  // Since we control the zip file, we know the order of the entries...
  const uuid = entries[0].url.hostname;
  assertEquals(entries, [
    {
      name: "binary.bin",
      type: "file",
      url: new URL(`czf://${uuid}/binary.bin`),
    },
    {
      name: "subdirectory",
      type: "directory",
      url: new URL(`czf://${uuid}/subdirectory`),
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

  const subdirectoryEntries = await zipReader.readDirectoryContents(
    entries[1].url,
  );
  assertEquals(subdirectoryEntries, [{
    name: "nested.json",
    type: "file",
    url: new URL(`czf://${uuid}/subdirectory/nested.json`),
  }]);
});

test("ZipReaderImpl can read CompleteDirectory_windows.zip directories", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory_windows.zip"),
  );
  const zipReader = new ZipReaderImpl({ softTTL: 0, hardTTL: 0 });

  const entries = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries.length, 4);

  // Since we control the zip file, we know the order of the entries...
  const uuid = entries[0].url.hostname;
  assertEquals(entries, [
    {
      name: "test.txt",
      type: "file",
      url: new URL(`czf://${uuid}/test.txt`),
    },
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
  ]);

  const subdirectoryEntries = await zipReader.readDirectoryContents(
    entries[1].url,
  );
  assertEquals(subdirectoryEntries, [{
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

  const zipReader = new ZipReaderImpl({ softTTL: 0, hardTTL: 0 });
  const builder: LoaderBuilder = new DefaultLoaderBuilder(zipReader, zipReader);
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

test("ZipReaderImpl soft-eviction happens", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ softTTL: 100, hardTTL: 0 });

  const entries = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries.length, 4);
  assert(haveSoftEvictionCandidates(zipReader.cache));
  assert(haveHardEvictionCandidates(zipReader.cache));

  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 200);
  await promise;

  assertFalse(haveSoftEvictionCandidates(zipReader.cache));
  assert(haveHardEvictionCandidates(zipReader.cache));
});

test("ZipReaderImpl hard-eviction happens", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ softTTL: 0, hardTTL: 100 });

  await zipReader.readDirectoryContents(zipFileUrl);

  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 200);
  await promise;

  assertFalse(haveSoftEvictionCandidates(zipReader.cache));
  assertFalse(haveHardEvictionCandidates(zipReader.cache));
});

test("ZipReaderImpl has no soft-eviction until the timeout", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ softTTL: 100, hardTTL: 0 });

  const entries1 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries1.length, 4);
  const cache1 = zipReader.cache;
  assertEquals(cache1.size, 1);
  const cachedReader1 = cache1.values().next().value?.reader;
  assertExists(cachedReader1);

  // If we immediately read the contents again, it will use the existing cached reader.
  const entries2 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries2.length, 4);
  const cache2 = zipReader.cache;
  assertEquals(cache2.size, 1);
  const cachedReader2 = cache2.values().next().value?.reader;
  assertEquals(cachedReader2, cachedReader1);

  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 200);
  await promise;

  assertFalse(haveSoftEvictionCandidates(zipReader.cache));
  assert(haveHardEvictionCandidates(zipReader.cache));
});

test("ZipReaderImpl cache can be cleared", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ softTTL: 100, hardTTL: 0 });

  await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(zipReader.cache.size, 1);

  zipReader.clear();
  assertEquals(zipReader.cache.size, 0);
});

test("ZipReaderImpl rejects on attempts to read evicted cache contents", async () => {
  const zipReader = new OpenZipReader({ softTTL: 0, hardTTL: 0 });

  await assertRejects(
    () =>
      zipReader.readDirectoryContents(
        new URL("czf://nonexistent/subdirectory"),
      ),
    "Could not find zip file",
  );
  await assertRejects(
    () => zipReader.readBinaryFromFile(new URL("czf://nonexistent/file")),
    "Could not find zip file",
  );
});

test("ZipReaderImpl rejects on attempts to read nonexistent file", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  const zipReader = new OpenZipReader({ softTTL: 0, hardTTL: 0 });
  const entries = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries.length, 4);

  const uuid = entries[0].url.hostname;
  assertEquals(entries[0], {
    name: "binary.bin",
    type: "file",
    url: new URL(`czf://${uuid}/binary.bin`),
  });

  const fileUrl = new URL(`czf://${uuid}/nonexistent`);
  await assertRejects(
    () => zipReader.readBinaryFromFile(fileUrl),
    'There is no file at path "/nonexistent" in zip file',
  );
});

test("ZipReaderImpl reloads soft-evicted zip files", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  const zipReader = new OpenZipReader({ softTTL: 0, hardTTL: 0 });
  const entries1 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries1.length, 4);

  // Remove the references to cached data.
  const cache = Array.from(zipReader.cache.values());
  cache[0].reader = undefined;
  cache[0].contents = undefined;

  // Load it again.
  const entries2 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries2, entries1);
});
