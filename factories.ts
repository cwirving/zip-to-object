import type { FileSystemReader } from "@scroogieboy/directory-to-object/interfaces";
import type { ZipReaderOptions } from "./interfaces.ts";
import { ZipReaderImpl } from "./zip_reader.ts";

/**
 * Create a new object implementing the {@linkcode FileSystemReader} interface. It is a customized file and directory
 * reader that reads from zip file contents rather than the file system directly. It defaults to using the
 * platform-specific file reader from `@scroogieboy/directory-to-object`, but can be initialized with any
 * underlying file reader -- e.g., to load the zip file from a remote location.
 *
 * @param options The options customizing the `FileSystemReader` implementation.
 */
export function newZipReader(
  options?: Readonly<ZipReaderOptions>,
): FileSystemReader {
  return new ZipReaderImpl(options);
}
