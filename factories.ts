import type { FileSystemReader } from "@scroogieboy/directory-to-object/interfaces";
import type { ZipReaderOptions } from "./interfaces.ts";
import { ZipReader } from "./zip_reader.ts";

/**
 * Create a new object implementing the {@linkcode FileSystemReader} interface that can load the contents of zip
 * archives. It is a customized file and directory reader that reads zip archives from the file system and
 * treats the archive as a directory. It defaults to using the platform-specific file reader from
 * `@scroogieboy/directory-to-object`, but can be initialized with any underlying file reader -- e.g., to load the
 * archive from a remote location.
 *
 * @param options The options customizing the `FileSystemReader` implementation.
 */
export function newZipReader(
  options?: Readonly<ZipReaderOptions>,
): FileSystemReader {
  return new ZipReader(options);
}
