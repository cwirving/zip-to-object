import type {
  DirectoryContents,
  DirectoryEntry,
  DirectoryEntryType,
  FileSystemReader,
  ReadBinaryFromFileOptions,
  ReadDirectoryContentsOptions,
  ReadTextFromFileOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import * as zip from "@zip-js/zip-js";

// The URL protocol we'll use for references to zip contents.
export const CACHED_ZIP_FILE_PROTOCOL = "czf:";

const textDecoder = new TextDecoder();

class DirectoryContentsWithReaderReference implements DirectoryContents {
  readonly #reader: FileSystemReader;
  readonly entries: DirectoryEntry[];

  constructor(
    reader: FileSystemReader,
    entries: DirectoryEntry[],
  ) {
    this.#reader = reader;
    this.entries = entries;
  }
}

/**
 *  The cached information about one zip archive, implementing the `FileSystemReader` interface.
 */
export class ZipSingleArchiveReader implements FileSystemReader {
  /**
   * The zip file reader that we'll use to work with this file.
   */
  #reader: zip.ZipReader<Uint8Array> | undefined;

  /**
   * The (extended) entries for all the zip file contents.
   * The contents are grouped by parent path for fast retrieval.
   */
  #contents: Map<string, ExtendedZipEntry[]> | undefined;

  /**
   * The uuid that we'll use as an identifier for this archive.
   */
  readonly #uuid: string = crypto.randomUUID();

  /**
   * The location of the source zip file.
   */
  readonly location: Readonly<URL>;

  protected constructor(location: URL) {
    this.location = Object.freeze(new URL(location));
  }

  get name(): string {
    return this.location.href;
  }

  readDirectoryContents(
    path: URL,
    _options?: Readonly<ReadDirectoryContentsOptions>,
  ): Promise<DirectoryContents> {
    const pathInZipFile = (path.protocol === CACHED_ZIP_FILE_PROTOCOL)
      ? path.pathname
      : "";

    const result = this.#contents?.get(pathInZipFile);
    if (!result) {
      throw new Error(
        `There is no directory at path "${pathInZipFile}" in zip file`,
      );
    }

    const entries = result.map(makeDirectoryEntry);
    return Promise.resolve(
      new DirectoryContentsWithReaderReference(this, entries),
    );
  }

  readBinaryFromFile(
    path: URL,
    options?: Readonly<ReadBinaryFromFileOptions>,
  ): Promise<Uint8Array> {
    if (options?.signal?.aborted) {
      return Promise.reject(options.signal.reason);
    }

    const [parentPath, _name] = splitPath(path.pathname);
    const directoryContents = this.#contents?.get(parentPath) ?? [];
    const fileExtendedEntry = directoryContents.find((e) =>
      e.url.href === path.href
    );
    if (!fileExtendedEntry) {
      return Promise.reject(
        new Error(
          `There is no file at path "${path.pathname}" in zip file`,
        ),
      );
    }

    if (!fileExtendedEntry.entry) {
      return Promise.reject(
        new Error(
          `Internal error reading file at path "${path.pathname}" in zip file -- attempting to load a synthetic entry`,
        ),
      );
    }

    if (!fileExtendedEntry.entry.getData) {
      return Promise.reject(
        new Error(
          `Internal error reading file at path "${path.pathname}" in zip file -- there is no getData method`,
        ),
      );
    }

    const writer = new zip.Uint8ArrayWriter();
    return fileExtendedEntry.entry.getData(writer);
  }

  async readTextFromFile(
    path: URL,
    options?: Readonly<ReadTextFromFileOptions>,
  ): Promise<string> {
    const bytes = await this.readBinaryFromFile(path, options);
    return textDecoder.decode(bytes);
  }

  static async newZipSingleArchiveReader(
    location: URL,
    fileSystemReader: FileSystemReader,
  ): Promise<ZipSingleArchiveReader> {
    const reader = new ZipSingleArchiveReader(location);
    await reader.loadArchive(fileSystemReader);
    return reader;
  }

  async loadArchive(fileSystemReader: FileSystemReader): Promise<void> {
    this.#reader = new zip.ZipReader(
      new zip.Uint8ArrayReader(
        await fileSystemReader.readBinaryFromFile(this.location),
      ),
    );

    // Load the entries from the zip reader, extend them and synthesize any missing directory entries.
    const fixedContents = addMissingDirectoryEntries(
      (await this.#reader.getEntries()).map((e) =>
        extendZipEntry(this.#uuid, e)
      ),
    );

    this.#contents = Map.groupBy(
      fixedContents,
      (e) => e.parentPath,
    );
  }
}

/**
 * Capture more useful information about zip file entries:
 * - Split the entry path into a parent path and file/directory name (with trailing slashes removed).
 * - Generate the URL of the corresponding entry.
 * - The entry type (so that we don't need to refer to the zip entry).
 * - The zip entry is optional, so that we can have synthetic extended entries.
 *
 *  Exported for testing only.
 */
export interface ExtendedZipEntry {
  parentPath: string;
  name: string;
  url: URL;
  entry: zip.Entry | undefined;
  type: DirectoryEntryType;
}

/**
 * Split a path on it's last slash and return a tuple with the parent path (with a slash prepended) and name.
 *
 * @param path The path to split.
 * @returns A tuple of parent path (with slash prepended) and name.
 */
export function splitPath(path: string): [string, string] {
  const lastSlashIndex = path.lastIndexOf("/");

  return (lastSlashIndex >= 0)
    ? [
      (path.startsWith("/") ? "" : "/") + path.slice(0, lastSlashIndex),
      path.slice(lastSlashIndex + 1),
    ]
    : ["", path];
}

/**
 * Take a raw zip-js entry and extend it into a {@linkcode ExtendedZipEntry} by:
 * - Removing trailing slashes from directories
 * - Splitting the filename into a path and name.
 * - Creating a URL for the entry.
 *
 * @param hostname The hostname we'll use in URLs.
 * @param entry The entry to extend.
 * @returns The extended entry.
 */
export function extendZipEntry(
  hostname: string,
  entry: zip.Entry,
): ExtendedZipEntry {
  const fileName = (entry.directory && entry.filename.endsWith("/"))
    ? entry.filename.slice(0, -1)
    : entry.filename;
  const url = Object.freeze(
    new URL(`${CACHED_ZIP_FILE_PROTOCOL}//${hostname}/${fileName}`),
  );
  const [parentPath, name] = splitPath(fileName);
  const type = makeDirectoryEntryType(entry);

  return {
    parentPath,
    name,
    url,
    entry,
    type,
  };
}

/**
 * Since Microsoft Office documents are zip archives without directory entries, let's synthesize the missing directory
 * entries for the contents of the archive.
 *
 * @param contents The current archive contents
 * @returns The contents of the archive with missing directories added as synthetic nodes (i.e., `ExtendedZipEntry` with an `entry` property set to `undefined`).
 */
export function addMissingDirectoryEntries(
  contents: ExtendedZipEntry[],
): ExtendedZipEntry[] {
  // These are the directories we have so far
  const directories = new Map<string, ExtendedZipEntry>();
  for (const entry of contents) {
    if (entry.type === "directory") {
      directories.set(`${entry.parentPath}/${entry.name}`, entry);
    }
  }

  // Are they good enough?
  for (const entry of contents) {
    if (entry.parentPath !== "" && !directories.has(entry.parentPath)) {
      // Nope, this entry's parent (possibly all its parents) is missing.
      const parentPathElements = entry.parentPath.split("/");
      let workingPath = parentPathElements.join("/");

      while (parentPathElements.length > 1) {
        // Figure out the URL for the parent entry
        const newUrl = new URL(entry.url);
        newUrl.pathname = workingPath;

        // Pop off the name and create a synthetic entry
        const name = parentPathElements.pop() ?? "";
        workingPath = parentPathElements.join("/");
        const newEntry: ExtendedZipEntry = {
          parentPath: workingPath,
          name: name,
          url: newUrl,
          entry: undefined,
          type: "directory",
        };

        if (!directories.has(newUrl.pathname)) {
          directories.set(newUrl.pathname, newEntry);
        }
      }
    }
  }

  // Now it is time to merge the directories from our map with the rest of the entries.
  return [
    ...directories.values(),
    ...contents.filter((e) => e.type !== "directory"),
  ];
}

/**
 * Given a zip archive entry, determine its type (file or directory).
 *
 * @param entry The zip file entry to inspect.
 * @returns The directory entry type.
 */
export function makeDirectoryEntryType(entry: zip.Entry): DirectoryEntryType {
  return entry.directory ? "directory" : "file";
}

/**
 * Create a {@linkcode DirectoryEntryType} from a {@linkcode ExtendedZipEntry}.
 *
 * @param entry The source extended entry.
 * @returns An object implementing interface {@linkcode DirectoryEntry} for the entry.
 */
export function makeDirectoryEntry(
  entry: ExtendedZipEntry,
): DirectoryEntry {
  return {
    name: entry.name,
    type: entry.type,
    url: entry.url,
  };
}
