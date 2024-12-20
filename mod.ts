import type {
  FluentLoader,
  LoaderBuilder,
  ValueLoaderOptions,
} from "@scroogieboy/directory-to-object/interfaces";
import { DefaultLoaderBuilder } from "@scroogieboy/directory-to-object/factories";
import { newZipReader } from "./factories.ts";
import type { ZipReader } from "./interfaces.ts";

/**
 * A singleton implementing the {@linkcode ZipReader} interface. This is usable as both a file reader and a
 * directory contents reader in one.
 *
 * This singleton uses the default platform-specific file reader from `@scroogieboy/directory-to-object` to read
 * zip files from the local file system.
 */
export const zipReader: ZipReader = newZipReader({
  name: "Default .zip file reader",
});

/**
 * The loader builder to create any of the built-in `@scroogieboy/directory-to-object` loaders and customize them to
 * your needs. See the [LoaderBuilder](https://jsr.io/@scroogieboy/directory-to-object/doc/interfaces/~/LoaderBuilder)
 * interface in the `@scroogieboy/directory-to-object` library for more details.
 *
 * It is called `ZipLoaders` in order to minimize confusion with the `Loaders` singleton in the
 * `@scroogieboy/directory-to-object` library. This is an instance of the same class, but initialized with a
 * file/directory reader that can read contents from a zip file in the local file system.
 */
export const ZipLoaders: LoaderBuilder = new DefaultLoaderBuilder(
  zipReader,
  zipReader,
);

/**
 * The loaders that the {@linkcode loadObjectFromZipFile} function will use to initialize its loader.
 * This array is mutable for customization.
 *
 * For example, to add a YAML parser to the default loaders:
 *
 * ```typescript
 * import * as YAML from "@std/yaml";
 *
 * // Create a YAML file loader
 * const yamlLoader = ZipLoaders.customFile({
 *   extension: ".yaml",
 *   name: "YAML file value loader",
 *   parser: YAML.parse,
 * });
 *
 * // Add it to the default loaders
 * zipDefaultLoaders.push(yamlLoader);
 *
 * // From now on, calls to loadObjectFromZipFile() will know to parse
 * // files with a ".yaml" extension as YAML...
 * ```
 */
export const zipDefaultLoaders: FluentLoader<unknown>[] = ZipLoaders.defaults();

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
  const directoryObjectLoader = ZipLoaders.directoryAsObject({
    loaders: zipDefaultLoaders,
  });

  return directoryObjectLoader.loadDirectory(zipFileUrl, options);
}
