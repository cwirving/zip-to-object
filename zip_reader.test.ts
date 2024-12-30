import { assertEquals, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { ZipReaderImpl } from "./zip_reader.ts";
import * as zip from "@zip-js/zip-js";

// Let's not use web workers in zip-js, to keep testing more predictable.
zip.configure({ useWebWorkers: false });

test("ZipReaderImpl rejects on attempts to read nonexistent cache contents", async () => {
  const zipReader = new ZipReaderImpl();

  await assertRejects(
    () => zipReader.readBinaryFromFile(new URL("czf://nonexistent/file")),
    "readBinaryFromFile: method should not be called",
  );
  await assertRejects(
    () => zipReader.readTextFromFile(new URL("czf://nonexistent/file")),
    "readTextFromFile: method should not be called",
  );
});

test("ZipReaderImpl rejects on attempts to read nonexistent file", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  const zipReader = new ZipReaderImpl();
  const contents = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(contents.entries.length, 4);

  const uuid = contents.entries[0].url.hostname;
  assertEquals(contents.entries[1], {
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

test("ZipReaderImpl reloads zip files", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  const zipReader = new ZipReaderImpl();
  const contents1 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(contents1.entries.length, 4);

  // Load it again.
  const contents2 = await zipReader.readDirectoryContents(zipFileUrl);
  // Make sure that the same names, types and URL paths are there
  assertEquals(
    contents2.entries.map((e) => e.name),
    contents1.entries.map((e) => e.name),
  );
  assertEquals(
    contents2.entries.map((e) => e.type),
    contents1.entries.map((e) => e.type),
  );
  assertEquals(
    contents2.entries.map((e) => e.url.pathname),
    contents1.entries.map((e) => e.url.pathname),
  );
});
