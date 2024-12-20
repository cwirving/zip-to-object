import type {
  DirectoryContentsReaderOptions,
  DirectoryEntry,
  DirectoryEntryType,
  FileReader,
  ReadBinaryFromFileOptions,
  ReadTextFromFileOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { newFileReader } from "@scroogieboy/directory-to-object/factories";
import * as zip from "@zip-js/zip-js";
import type { ZipReader, ZipReaderOptions } from "./interfaces.ts";

// The default amount of time the ZipReader will cache zip file contents, in milliseconds.
const DEFAULT_SOFT_TTL = 10000;

// The default amount of time the ZipReader will remember zip files, in milliseconds.
const DEFAULT_HARD_TTL = 60000;

// The UTL protocol we'll use for cached zip files.
const CACHED_ZIP_FILE_PROTOCOL = "czf:";

// Capture more useful information about zip file entries:
// - split the entry path into a parent path and file/directory name (with trailing slashes removed).
// - generate the URL of the corresponding entry
// - the entry type (so that we don't need to refer to the zip entry).
export interface ExtendedZipEntry {
  parentPath: string;
  name: string;
  url: URL;
  entry: zip.Entry | undefined;
  type: DirectoryEntryType;
}

/**
 *  The cached information about zip files. Only exported for testing.
 */
export interface ZipFileInformation {
  /**
   * The zip file reader that we'll use to work with this file (can be `undefined` if the file has been soft-evicted).
   */
  reader: zip.ZipReader<Uint8Array> | undefined;

  /**
   * The uuid we've assigned to this cache entry -- it is the hostname of cached URLs and the key in the cache.
   */
  uuid: string;

  /**
   * The location of the source zip file.
   */
  location: Readonly<URL>;

  /**
   * The (extended) entries for all the zip file contents (can be `undefined` if the file has been soft-evicted).
   * The contents are grouped by parent path for fast retrieval.
   */
  contents: Map<string, ExtendedZipEntry[]> | undefined;

  /**
   * The time when this entry soft-expires.
   */
  softExpires: number;

  /**
   * The time when this entry hard expires (is fully evicted).
   */
  hardExpires: number;
}

export function splitPath(path: string): [string, string] {
  const lastSlashIndex = path.lastIndexOf("/");

  return (lastSlashIndex >= 0)
    ? [
      (path.startsWith("/") ? "" : "/") + path.slice(0, lastSlashIndex),
      path.slice(lastSlashIndex + 1),
    ]
    : ["", path];
}

/**
 * Take a raw zip-js entry and extend it into a {@linkcode ExtendedZipEntry} by:
 * - Removing trailing slashes from directories
 * - Splitting the filename into a path and name.
 * - Creating a URL for the entry.
 *
 * @param hostname The hostname we'll use in URLs.
 * @param entry The entry to extend.
 * @returns The extended entry.
 */
export function extendZipEntry(
  hostname: string,
  entry: zip.Entry,
): ExtendedZipEntry {
  const fileName = (entry.directory && entry.filename.endsWith("/"))
    ? entry.filename.slice(0, -1)
    : entry.filename;
  const url = Object.freeze(
    new URL(`${CACHED_ZIP_FILE_PROTOCOL}//${hostname}/${fileName}`),
  );
  const [parentPath, name] = splitPath(fileName);
  const type = makeDirectoryEntryType(entry);

  return {
    parentPath,
    name,
    url,
    entry,
    type,
  };
}

/**
 * Since Microsoft Office documents are zip archives without directory entries, let's synthesize the missing directory
 * entries for the contents of the archive.
 *
 * @param contents The current archive contents
 * @returns The contents of the archive with missing directories added as synthetic nodes (i.e., `ExtendedZipEntry` with an `entry` property set to `undefined`).
 */
export function addMissingDirectoryEntries(
  contents: ExtendedZipEntry[],
): ExtendedZipEntry[] {
  // These are the directories we have so far
  const directories = new Map<string, ExtendedZipEntry>();
  for (const entry of contents) {
    if (entry.type === "directory") {
      directories.set(`${entry.parentPath}/${entry.name}`, entry);
    }
  }

  // Are they good enough?
  for (const entry of contents) {
    if (entry.parentPath !== "" && !directories.has(entry.parentPath)) {
      // Nope, this entry's parent (possibly all its parents) is missing.
      const parentPathElements = entry.parentPath.split("/");
      let workingPath = parentPathElements.join("/");

      while (parentPathElements.length > 1) {
        // Figure out the URL for the parent entry
        const newUrl = new URL(entry.url);
        newUrl.pathname = workingPath;

        // Pop off the name and create a synthetic entry
        const name = parentPathElements.pop() ?? "";
        workingPath = parentPathElements.join("/");
        const newEntry: ExtendedZipEntry = {
          parentPath: workingPath,
          name: name,
          url: newUrl,
          entry: undefined,
          type: "directory",
        };

        if (!directories.has(newUrl.pathname)) {
          directories.set(newUrl.pathname, newEntry);
        }
      }
    }
  }

  // Now it is time to merge the directories from our map with the rest of the entries.
  return [
    ...directories.values(),
    ...contents.filter((e) => e.type !== "directory"),
  ];
}

export function makeDirectoryEntryType(entry: zip.Entry): DirectoryEntryType {
  return entry.directory ? "directory" : "file";
}

export function makeDirectoryEntry(entry: ExtendedZipEntry): DirectoryEntry {
  return {
    name: entry.name,
    type: entry.type,
    url: entry.url,
  };
}

export function haveSoftEvictionCandidates(
  cache: Readonly<Map<string, ZipFileInformation>>,
): boolean {
  for (const value of cache.values()) {
    if (value.reader !== undefined) return true;
  }
  return false;
}

export function haveHardEvictionCandidates(
  cache: Readonly<Map<string, ZipFileInformation>>,
): boolean {
  return cache.size > 0;
}

export function evictExpiredCacheEntries(
  cache: Map<string, ZipFileInformation>,
): void {
  const now = Date.now();

  // Do hard expiration (a.k.a., eviction) first.
  const cacheKeys = Array.from(cache.keys());
  for (const key of cacheKeys) {
    const cacheEntry = cache.get(key);
    if (cacheEntry && cacheEntry.hardExpires < now) {
      cache.delete(key);
    }
  }

  // Do soft expiration (a.k.a., removal of file contents) after all eviction has happened.
  for (const value of cache.values()) {
    if (value.softExpires < now) {
      value.reader = undefined;
      value.contents = undefined;
      value.softExpires = Number.MAX_SAFE_INTEGER;
    }
  }
}

/**
 * The `ZipReaderImpl` class provides functionality for reading the contents of zip files.
 * It implements `FileReader` and `DirectoryContentsReader` interfaces to allow retrieval
 * of directory structure and file data in binary or text format.
 *
 * The class caches the contents of zip files in memory for a minimum of a specified "soft" time-to-live (TTL) after
 * any read operations. Access to the file after the TTL has passed will result in re-reading the file from the
 * file system. There is also a "hard" TTL after which the `ZipReaderImpl` forgets that the zip file exists.
 */
export class ZipReaderImpl implements ZipReader {
  readonly name: string;
  readonly #fileReader: FileReader;
  readonly #softTTL: number;
  readonly #hardTTL: number;
  readonly #cache = new Map<string, ZipFileInformation>();
  readonly #textDecoder = new TextDecoder();
  #evictorTimeoutId = 0;

  constructor(options?: Readonly<ZipReaderOptions>) {
    this.name = options?.name ?? "Zip file reader";
    this.#fileReader = options?.fileReader ?? newFileReader();
    this.#softTTL = options?.softTTL ?? DEFAULT_SOFT_TTL;
    this.#hardTTL = options?.hardTTL ?? DEFAULT_HARD_TTL;
  }

  async readDirectoryContents(
    directoryUrl: URL,
    options?: Readonly<DirectoryContentsReaderOptions>,
  ): Promise<DirectoryEntry[]> {
    options?.signal?.throwIfAborted();

    const zipFileInformation =
      (await this.urlToZipFileInformation(directoryUrl)) ??
        await this.loadAndCacheZipFile(directoryUrl);
    const pathInZipFile = (directoryUrl.protocol === CACHED_ZIP_FILE_PROTOCOL)
      ? directoryUrl.pathname
      : "";

    if (!zipFileInformation || !zipFileInformation.reader) {
      throw new Error(`Could not find zip file at "${directoryUrl.href}"`);
    }

    const reader = zipFileInformation.reader;
    if (zipFileInformation.contents === undefined) {
      const fixedContents = addMissingDirectoryEntries(
        (await reader.getEntries()).map((e) =>
          extendZipEntry(zipFileInformation.uuid, e)
        ),
      );
      zipFileInformation.contents = Map.groupBy(
        fixedContents,
        (e) => e.parentPath,
      );
    }

    const result = zipFileInformation.contents.get(pathInZipFile);
    if (!result) {
      throw new Error(
        `There is no directory at path "${pathInZipFile}" in zip file`,
      );
    }

    return result.map(makeDirectoryEntry);
  }

  async readBinaryFromFile(
    fileUrl: URL,
    options?: Readonly<ReadBinaryFromFileOptions>,
  ): Promise<Uint8Array> {
    options?.signal?.throwIfAborted();

    const zipFileInformation = await this.urlToZipFileInformation(fileUrl);

    if (
      !zipFileInformation || !zipFileInformation.reader ||
      !zipFileInformation.contents
    ) {
      throw new Error(`Could not find zip file at "${fileUrl.href}"`);
    }

    const [parentPath, _name] = splitPath(fileUrl.pathname);
    const directoryContents = zipFileInformation.contents.get(parentPath) ?? [];
    const fileExtendedEntry = directoryContents.find((e) =>
      e.url.href === fileUrl.href
    );
    if (!fileExtendedEntry) {
      throw new Error(
        `There is no file at path "${fileUrl.pathname}" in zip file`,
      );
    }

    if (!fileExtendedEntry.entry) {
      throw new Error(
        `Internal error reading file at path "${fileUrl.pathname}" in zip file -- attempting to load a synthetic entry`,
      );
    }

    if (!fileExtendedEntry.entry.getData) {
      throw new Error(
        `Internal error reading file at path "${fileUrl.pathname}" in zip file -- there is no getData method`,
      );
    }

    const writer = new zip.Uint8ArrayWriter();
    return fileExtendedEntry.entry.getData(writer);
  }

  async readTextFromFile(
    fileUrl: URL,
    options?: Readonly<ReadTextFromFileOptions>,
  ): Promise<string> {
    const bytes = await this.readBinaryFromFile(fileUrl, options);
    return this.#textDecoder.decode(bytes);
  }

  clear(): void {
    this.cache.clear();
    if (this.#evictorTimeoutId > 0) {
      clearTimeout(this.#evictorTimeoutId);
      this.#evictorTimeoutId = 0;
    }
  }

  protected touchZipFileInformation(info: ZipFileInformation): void {
    const now = Date.now();
    info.softExpires = (this.#softTTL > 0)
      ? now + this.#softTTL
      : Number.MAX_SAFE_INTEGER;
    info.hardExpires = (this.#hardTTL > 0)
      ? now + this.#hardTTL
      : Number.MAX_SAFE_INTEGER;
  }

  protected async urlToZipFileInformation(
    url: URL,
  ): Promise<ZipFileInformation | undefined> {
    const cacheEntry = (url.protocol === CACHED_ZIP_FILE_PROTOCOL)
      ? this.lookupZipFileInformationByUuid(url.hostname)
      : this.lookupZipFileInformationByLocation(url);
    if (!cacheEntry) return undefined;

    if (cacheEntry.reader) {
      this.touchZipFileInformation(cacheEntry);
      this.scheduleEvictor();
      return cacheEntry;
    }

    // Last resort: reload the zip file.
    try {
      const reloadedZipFile = await this.loadZipFile(cacheEntry.location);

      cacheEntry.reader = reloadedZipFile.reader;
      cacheEntry.contents = reloadedZipFile.contents;
      this.touchZipFileInformation(cacheEntry);
      this.scheduleEvictor();
      return cacheEntry;
    } catch (e) {
      // The cache entry no longer holds anything of value. Delete it.
      this.#cache.delete(cacheEntry.uuid);
      throw e;
    }
  }

  protected lookupZipFileInformationByUuid(
    uuid: string,
  ): ZipFileInformation | undefined {
    return this.#cache.get(uuid);
  }

  protected lookupZipFileInformationByLocation(
    location: Readonly<URL>,
  ): ZipFileInformation | undefined {
    for (const value of this.#cache.values()) {
      if (value.location.href === location.href) return value;
    }
    return undefined;
  }

  protected async loadZipFile(
    path: Readonly<URL>,
  ): Promise<ZipFileInformation> {
    const info: ZipFileInformation = {
      reader: new zip.ZipReader(
        new zip.Uint8ArrayReader(
          await this.#fileReader.readBinaryFromFile(path),
        ),
      ),
      uuid: crypto.randomUUID(),
      location: Object.freeze(new URL(path)),
      contents: undefined,
      softExpires: 0,
      hardExpires: 0,
    };

    this.touchZipFileInformation(info);
    return info;
  }

  protected async loadAndCacheZipFile(
    path: Readonly<URL>,
  ): Promise<ZipFileInformation> {
    const zipFileInformation = await this.loadZipFile(path);
    this.#cache.set(zipFileInformation.uuid, zipFileInformation);
    this.scheduleEvictor();
    return zipFileInformation;
  }

  protected scheduleEvictor(): number {
    if (this.#evictorTimeoutId > 0) return 0;

    const delay = this.#softTTL > 0 && haveSoftEvictionCandidates(this.#cache)
      ? this.#softTTL
      : haveHardEvictionCandidates(this.#cache)
      ? this.#hardTTL
      : 0;
    if (delay === 0) return 0;

    this.#evictorTimeoutId = setTimeout(() => {
      evictExpiredCacheEntries(this.#cache);
      this.#evictorTimeoutId = 0;
      this.scheduleEvictor();
    }, delay);
    return delay;
  }

  protected get cache(): Map<string, ZipFileInformation> {
    return this.#cache;
  }
}
