import type {
  DirectoryContents,
  FileSystemReader,
  ReadBinaryFromFileOptions,
  ReadDirectoryContentsOptions,
  ReadTextFromFileOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { newFileSystemReader } from "@scroogieboy/directory-to-object/factories";
import type { ZipReaderOptions } from "./interfaces.ts";
import { ZipSingleArchiveReader } from "./zip_single_archive_reader.ts";

/**
 * The `ZipReader` file system reader is a shim to create single-archive file system readers on demand.
 * The single-archive readers will actually load and parse the archives, but `ZipReader` is the first reader
 * that loaders will call: for every request to read directory contents with the URL of a zip archive in the file
 * system, the `ZipReader` will create a new single-archive reader to handle the request and those for the archive
 * contents.
 */
export class ZipReader implements FileSystemReader {
  readonly name: string;
  readonly #fileSystemReader: FileSystemReader;

  constructor(options?: Readonly<ZipReaderOptions>) {
    this.name = options?.name ?? "Zip file reader";
    this.#fileSystemReader = options?.fileSystemReader ?? newFileSystemReader();
  }

  async readDirectoryContents(
    directoryUrl: URL,
    options?: Readonly<ReadDirectoryContentsOptions>,
  ): Promise<DirectoryContents> {
    options?.signal?.throwIfAborted();

    const reader = await ZipSingleArchiveReader.newZipSingleArchiveReader(
      directoryUrl,
      this.#fileSystemReader,
    );

    const contents = await reader.readDirectoryContents(
      directoryUrl,
      options,
    );

    contents.innerFileSystemReader = reader;

    return contents;
  }

  readBinaryFromFile(
    fileUrl: URL,
    options?: Readonly<ReadBinaryFromFileOptions>,
  ): Promise<Uint8Array> {
    options?.signal?.throwIfAborted();

    return Promise.reject(
      new Error(
        `readBinaryFromFile: method should not be called for "${fileUrl.href}"`,
      ),
    );
  }

  readTextFromFile(
    fileUrl: URL,
    options?: Readonly<ReadTextFromFileOptions>,
  ): Promise<string> {
    options?.signal?.throwIfAborted();

    return Promise.reject(
      new Error(
        `readTextFromFile: method should not be called for "${fileUrl.href}"`,
      ),
    );
  }
}
