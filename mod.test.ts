import { test } from "@cross/test";
import { assert, assertEquals, assertExists } from "@std/assert";
import { loadObjectFromZipFile, zipReader } from "./mod.ts";
import * as zip from "@zip-js/zip-js";
import { ZipReader } from "./zip_reader.ts";

// Let's not use web workers in zip-js, to keep testing more predictable.
zip.configure({ useWebWorkers: false });

test("zipReader is defined", () => {
  assertExists(zipReader);
  assert(zipReader instanceof ZipReader);
});

test("loadObjectFromZipFile reads SimpleDirectory.zip", async () => {
  const zipFileUrl = new URL(
    "test_data/SimpleDirectory.zip",
    import.meta.url,
  );
  const contents = await loadObjectFromZipFile(zipFileUrl);

  assertEquals(contents, {
    json: {
      foo: "bar",
    },
    subdirectory: {
      text: "another test\n",
    },
    text: "This is a test\n",
  });
});
