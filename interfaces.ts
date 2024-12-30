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
}
