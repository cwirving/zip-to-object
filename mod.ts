import type {
  ValueLoaderOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { defaultLoaders, Loaders } from "@scroogieboy/directory-to-object";
import { newZipReader } from "./factories.ts";
import type { ZipReader } from "./interfaces.ts";

/**
 * A singleton implementing the {@linkcode ZipReader} interface.
 *
 * This singleton uses the default platform-specific file reader from `@scroogieboy/directory-to-object` to read
 * zip files from the local file system.
 */
export const zipReader: ZipReader = newZipReader({
  name: "Default .zip file reader",
});

/**
 * Asynchronously load the contents of a directory into a new plain JavaScript object.
 * This will retrieve a listing of the directory, iterate over each file/directory listed
 * and load those that have file value loaders registered.
 *
 * **Note:** The file value loaders defined in the `defaultLoaders` variable are queried in array order,
 * so consumers that care about loader precedence should make sure to sort the array appropriately.
 *
 * @param zipFileUrl The URL of the zip file to load. For local files, this should be a `file:` URL.
 * @param options Options governing the loading of zip file contents, including an optional `AbortSignal`.
 */
export function loadObjectFromZipFile(
  zipFileUrl: URL,
  options?: ValueLoaderOptions,
): Promise<Record<string, unknown>> {
  const directoryObjectLoader = Loaders.directoryAsObject({
    loaders: defaultLoaders,
  });

  const copiedOptions: ValueLoaderOptions = options
    ? Object.fromEntries(Object.entries(options))
    : {};
  copiedOptions.fileSystemReader = zipReader;

  return directoryObjectLoader.loadDirectory(zipFileUrl, copiedOptions);
}
