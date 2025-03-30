import { assertEquals } from "@std/assert";
import { test } from "@cross/test";
import { loadObjectFromZipFile } from "./mod.ts";
import * as zip from "@zip-js/zip-js";

// Let's not use web workers in zip-js, to keep testing more predictable.
zip.configure({ useWebWorkers: false });

test("Bug #2 is fixed", async () => {
  const zipFileUrl = new URL(import.meta.resolve("./test_data/bug_%232.zip"));
  const contents = await loadObjectFromZipFile(zipFileUrl);

  assertEquals(contents, {
    contains: {
      empty: {},
    },
    empty: {},
    text: "text\n",
  });
});
