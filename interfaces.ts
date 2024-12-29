import type {
  FileSystemReader,
} from "@scroogieboy/directory-to-object/interfaces";

/**
 * The options to customize new zip archive readers.
 */
export interface ZipReaderOptions {
  /**
   * The name of the new reader.
   */
  name?: string;

  /**
   * The underlying file system reader to read archives from.
   */
  fileSystemReader?: FileSystemReader;

  /**
   * The length of time to cache archives once they are read into memory.
   * The cache duration is specified in milliseconds. The default is 10 seconds.
   *
   * Under normal circumstances, the loader that calls the `readDirectoryContents` method will also dispose the
   * contents, which also cleans up any cached data in the zip archive reader, but if a non-compliant loader omits
   * the `dispose` call, the reader maintains an eviction schedule controlled by the `archiveTTL` option.
   *
   * A cache duration of zero means to cache archives until they are garbage-collected.
   */
  archiveTTL?: number;
}

export interface ZipReader extends FileSystemReader {
  /**
   * Clear any cached contents in the ZipReader. This is useful when zip file contents change on disk and
   * the consumer wants to ensure that the reader loads fresh contents.
   */
  clear(): void;
}
