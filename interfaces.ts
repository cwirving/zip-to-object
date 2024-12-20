import type {
  DirectoryContentsReader,
  FileReader,
} from "@scroogieboy/directory-to-object/interfaces";

export interface ZipReaderOptions {
  name?: string;
  fileReader?: FileReader;
  softTTL?: number;
  hardTTL?: number;
}

export interface ZipReader extends FileReader, DirectoryContentsReader {
  /**
   * Clear any cached contents in the ZipReader. This is useful when zip file contents change on disk and
   * the consumer wants to ensure that the file contents are fresh.
   */
  clear(): void;
}
