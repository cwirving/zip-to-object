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
 * The `ZipReaderImpl` class keeps track of the individual single-archive readers that may be created
 */
export class ZipReaderImpl implements FileSystemReader {
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
