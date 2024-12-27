import type {
  DirectoryEntry,
  FileSystemReader,
  ReadBinaryFromFileOptions,
  ReadDirectoryContentsOptions,
  ReadTextFromFileOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { newFileSystemReader } from "@scroogieboy/directory-to-object/factories";
import type { ZipReader, ZipReaderOptions } from "./interfaces.ts";
import { ZipSingleArchiveReader } from "./zip_single_archive_reader.ts";
import { CACHED_ZIP_FILE_PROTOCOL, DEFAULT_ARCHIVE_TTL } from "./constants.ts";

/**
 * The `ZipReaderImpl` class keeps track of the individual single-archive readers that may be created
 */
export class ZipReaderImpl implements ZipReader {
  readonly name: string;
  readonly #fileSystemReader: FileSystemReader;
  readonly #archiveTTL: number;
  readonly #cache = new Map<string, WeakRef<ZipSingleArchiveReader>>();
  #evictorTimeoutId = 0;

  constructor(options?: Readonly<ZipReaderOptions>) {
    this.name = options?.name ?? "Zip file reader";
    this.#fileSystemReader = options?.fileSystemReader ?? newFileSystemReader();
    this.#archiveTTL = options?.archiveTTL ?? DEFAULT_ARCHIVE_TTL;
  }

  async readDirectoryContents(
    directoryUrl: URL,
    options?: Readonly<ReadDirectoryContentsOptions>,
  ): Promise<DirectoryEntry[]> {
    options?.signal?.throwIfAborted();

    const cachedReader = this.urlToZipSingleArchiveReader(directoryUrl) ??
      await this.loadAndCacheZipFile(directoryUrl);

    return cachedReader.readDirectoryContents(directoryUrl, options);
  }

  readBinaryFromFile(
    fileUrl: URL,
    options?: Readonly<ReadBinaryFromFileOptions>,
  ): Promise<Uint8Array> {
    options?.signal?.throwIfAborted();

    const cachedReader = this.urlToZipSingleArchiveReader(fileUrl);
    if (!cachedReader) {
      return Promise.reject(
        new Error(
          `readBinaryFromFile: Cannot find cached zip file reader for "${fileUrl.href}"`,
        ),
      );
    }

    return cachedReader.readBinaryFromFile(fileUrl, options);
  }

  readTextFromFile(
    fileUrl: URL,
    options?: Readonly<ReadTextFromFileOptions>,
  ): Promise<string> {
    options?.signal?.throwIfAborted();

    const cachedReader = this.urlToZipSingleArchiveReader(fileUrl);
    if (!cachedReader) {
      return Promise.reject(
        new Error(
          `readTextFromFile: Cannot find cached zip file reader for "${fileUrl.href}"`,
        ),
      );
    }

    return cachedReader.readTextFromFile(fileUrl, options);
  }

  clear(): void {
    this.cache.clear();
    if (this.#evictorTimeoutId > 0) {
      clearTimeout(this.#evictorTimeoutId);
      this.#evictorTimeoutId = 0;
    }
  }

  protected urlToZipSingleArchiveReader(
    url: URL,
  ): ZipSingleArchiveReader | undefined {
    const cachedReader = (url.protocol === CACHED_ZIP_FILE_PROTOCOL)
      ? this.lookupZipSingleArchiveReaderByUuid(url.hostname)
      : this.lookupZipSingleArchiveReaderByLocation(url);
    if (!cachedReader) return undefined;

    cachedReader.updateLastUsed();
    this.scheduleEvictor();
    return cachedReader;
  }

  protected lookupZipSingleArchiveReaderByUuid(
    uuid: string,
  ): ZipSingleArchiveReader | undefined {
    const readerRef = this.#cache.get(uuid);
    return readerRef?.deref();
  }

  protected lookupZipSingleArchiveReaderByLocation(
    location: Readonly<URL>,
  ): ZipSingleArchiveReader | undefined {
    for (const readerRef of this.#cache.values()) {
      const reader = readerRef.deref();
      if (reader?.location?.href === location.href) {
        return reader;
      }
    }
    return undefined;
  }

  protected async loadAndCacheZipFile(
    location: Readonly<URL>,
  ): Promise<ZipSingleArchiveReader> {
    const reader = await ZipSingleArchiveReader.newZipSingleArchiveReader(
      location,
      this.#fileSystemReader,
    );
    this.#cache.set(reader.uuid, new WeakRef(reader));
    this.scheduleEvictor();
    return reader;
  }

  /**
   * Calculate how long to wait for the first time we could evict something from the cache.
   *
   * @returns The delay in milliseconds until we may need to evict something or `-1` if there is nothing to evict.
   * @protected
   */
  protected calculateEvictionDelay(): number {
    if (this.#cache.size === 0 || this.#archiveTTL === 0) return -1;

    const now = Date.now();
    let delay = 0;
    for (const readerRef of this.#cache.values()) {
      const readerDeadline = (readerRef.deref()?.lastUsed ?? 0) +
        this.#archiveTTL;
      const readerDelay = readerDeadline - now;
      delay = Math.min(delay, Math.max(readerDelay, 0));
    }

    return delay;
  }

  protected scheduleEvictor(): void {
    if (this.#evictorTimeoutId > 0) return;

    const delay = this.calculateEvictionDelay();
    if (delay < 0) return;

    this.#evictorTimeoutId = setTimeout(() => {
      this.evictExpiredCacheEntries();
      this.#evictorTimeoutId = 0;
      this.scheduleEvictor();
    }, delay);
  }

  protected get cache(): Map<string, WeakRef<ZipSingleArchiveReader>> {
    return this.#cache;
  }

  protected evictExpiredCacheEntries(): void {
    const cutoff = Date.now() - this.#archiveTTL;
    const keysToRemove: string[] = [];

    for (const [key, readerRef] of this.#cache) {
      const reader = readerRef.deref();
      if (!reader || reader.lastUsed <= cutoff) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.#cache.delete(key);
    }
  }
}
