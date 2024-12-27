import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { test } from "@cross/test";
import { ZipReaderImpl } from "./zip_reader.ts";
import * as zip from "@zip-js/zip-js";
import type { ZipSingleArchiveReader } from "./zip_single_archive_reader.ts";
import { cloneEntry } from "./test_utilities.ts";

// Let's not use web workers in zip-js, to keep testing more predictable.
zip.configure({ useWebWorkers: false });

// Make all the protected ZipReader members public so we can test them.
class OpenZipReader extends ZipReaderImpl {
  override urlToZipSingleArchiveReader(
    url: URL,
  ): ZipSingleArchiveReader | undefined {
    return super.urlToZipSingleArchiveReader(url);
  }

  override lookupZipSingleArchiveReaderByUuid(
    uuid: string,
  ): ZipSingleArchiveReader | undefined {
    return super.lookupZipSingleArchiveReaderByUuid(uuid);
  }

  override lookupZipSingleArchiveReaderByLocation(
    location: Readonly<URL>,
  ): ZipSingleArchiveReader | undefined {
    return super.lookupZipSingleArchiveReaderByLocation(location);
  }

  override loadAndCacheZipFile(
    location: Readonly<URL>,
  ): Promise<ZipSingleArchiveReader> {
    return super.loadAndCacheZipFile(location);
  }

  override calculateEvictionDelay(): number {
    return super.calculateEvictionDelay();
  }

  override scheduleEvictor(): void {
    return super.scheduleEvictor();
  }

  override get cache(): Map<string, WeakRef<ZipSingleArchiveReader>> {
    return super.cache;
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), delayMs));
}

test("ZipReaderImpl happens", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ archiveTTL: 50 });

  const entries = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries.length, 4);
  assertEquals(zipReader.cache.size, 1);

  await sleep(200);

  assertEquals(zipReader.cache.size, 0);
});

test("ZipReaderImpl has no eviction until the timeout", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ archiveTTL: 100 });

  const entries1 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries1.length, 4);
  const cache1 = zipReader.cache;
  assertEquals(cache1.size, 1);
  const cachedReader1 = cache1.values().next().value?.deref();
  assertExists(cachedReader1);

  // If we immediately read the contents again, it will use the existing cached reader.
  const entries2 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries2.length, 4);
  const cache2 = zipReader.cache;
  assertEquals(cache2.size, 1);
  const cachedReader2 = cache2.values().next().value?.deref();
  assertEquals(cachedReader2, cachedReader1);

  await sleep(200);

  assertEquals(zipReader.cache.size, 0);
});

test("ZipReaderImpl cache can be cleared", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ archiveTTL: 0 });

  await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(zipReader.cache.size, 1);

  zipReader.clear();
  assertEquals(zipReader.cache.size, 0);
});

test("ZipReaderImpl archiveTTL of zero means 'cache forever'", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );
  const zipReader = new OpenZipReader({ archiveTTL: 0 });

  await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(zipReader.cache.size, 1);
  assertEquals(zipReader.calculateEvictionDelay(), -1);
});

test("ZipReaderImpl rejects on attempts to read evicted cache contents", async () => {
  const zipReader = new OpenZipReader({ archiveTTL: 0 });

  await assertRejects(
    () =>
      zipReader.readDirectoryContents(
        new URL("czf://nonexistent/subdirectory"),
      ),
    "Could not find zip file",
  );
  await assertRejects(
    () => zipReader.readBinaryFromFile(new URL("czf://nonexistent/file")),
    "readBinaryFromFile: Cannot find cached zip file reader",
  );
  await assertRejects(
    () => zipReader.readTextFromFile(new URL("czf://nonexistent/file")),
    "readTextFromFile: Cannot find cached zip file reader",
  );
});

test("ZipReaderImpl rejects on attempts to read nonexistent file", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  const zipReader = new OpenZipReader({ archiveTTL: 0 });
  const entries = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries.length, 4);

  const uuid = entries[0].url.hostname;
  assertEquals(cloneEntry(entries[1]), {
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

test("ZipReaderImpl reloads evicted zip files", async () => {
  const zipFileUrl = new URL(
    import.meta.resolve("./test_data/CompleteDirectory.zip"),
  );

  const zipReader = new OpenZipReader({ archiveTTL: 10 });
  const entries1 = await zipReader.readDirectoryContents(zipFileUrl);
  assertEquals(entries1.length, 4);

  // Wait for the cached data to be evicted
  await sleep(100);
  assertEquals(zipReader.cache.size, 0);

  // Load it again.
  const entries2 = await zipReader.readDirectoryContents(zipFileUrl);
  // Make sure that the same names, types and URL paths are there
  assertEquals(entries2.map((e) => e.name), entries1.map((e) => e.name));
  assertEquals(entries2.map((e) => e.type), entries1.map((e) => e.type));
  assertEquals(
    entries2.map((e) => e.url.pathname),
    entries1.map((e) => e.url.pathname),
  );

  zipReader.clear();
});
