import type { ZipReader, ZipReaderOptions } from "./interfaces.ts";
import { ZipReaderImpl } from "./zip_reader.ts";

/**
 * Create a new object implementing the {@linkcode ZipReader} interface. It is a customized file and directory
 * reader that reads from zip file contents rather than the file system directly. It defaults to using the
 * platform-specific file reader from `@scroogieboy/directory-to-object`, but can be initialized with any
 * underlying file reader -- e.g., to load the zip file from a remote location.
 *
 * @param options The options customizing the `ZipReader` implementation.
 */
export function newZipReader(
  options?: Readonly<ZipReaderOptions>,
): ZipReader {
  return new ZipReaderImpl(options);
}
