import type {
  FileSystemReader,
} from "@scroogieboy/directory-to-object/interfaces";

export interface ZipReaderOptions {
  name?: string;
  fileSystemReader?: FileSystemReader;
  archiveTTL?: number;
}

export interface ZipReader extends FileSystemReader {
  /**
   * Clear any cached contents in the ZipReader. This is useful when zip file contents change on disk and
   * the consumer wants to ensure that the reader loads fresh contents.
   */
  clear(): void;
}
