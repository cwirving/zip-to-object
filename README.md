# Zip file support for `@scroogieboy/directory-to-object`

This library is both an example of writing your own file system reader
implementation for
[`@scroogieboy/directory-to-object`](https://jsr.io/@scroogieboy/directory-to-object)and
a useful library in its own right, given the prevalence of application file
formats that are internally a zip file. Just like
`@scroogieboy/directory-to-object` on its own allows directory structures to be
loaded as a single object in memory, this allows complete zip file contents to
be loaded as one.

## Installation & example

### Deno

```
deno add jsr:@scroogieboy/zip-to-object
```

Then, you can refer to the contents of the package by importing the library
exports. For example:

```typescript
import { loadObjectFromZipFile } from "@scroogieboy/zip-to-object";

const zipFileUrl = new URL("file:///some/directory/archive.zip");
const contents = await loadObjectFromZipFile(zipFileUrl);

console.log(JSON.stringify(contents, null, 2));
```

### Bun

```
bunx jsr add @scroogieboy/zip-to-object
```

### Node.js

```
npx jsr add @scroogieboy/zip-to-object
```

**Note:** This is an ESM-only package, so -- as per the
[JSR documentation](https://jsr.io/docs/with/node), this means that the
consuming project must be an ESM project (`"type": "module"` in the project's
`package.json` ).

## Examples

### Loading Office documents

Combining the `loadObjectFromZipFile` function and a custom XML loader, we can
load the contents of zip-based compound file formats, such as Microsoft Word
documents:

```typescript
import { defaultLoaders, Loaders } from "@scroogieboy/directory-to-object";
import { loadObjectFromZipFile } from "@scroogieboy/zip-to-object";
import { parse } from "@libs/xml";

const zipFileUrl = new URL(
  "../test_data/hello_world.docx",
  import.meta.url,
);

// Use the `@libs/xml` XML parser to load the XML content in the Word document.
const xmlLoader = Loaders.customFile({
  name: "XML file value loader",
  parser: parse,
}).whenExtensionIsOneOf([".xml", ".rels"]);
defaultLoaders.push(xmlLoader);

// Let's load the Word document as a zip archive, with the XML parser as part of the default loaders.
const contents = await loadObjectFromZipFile(zipFileUrl);

// What to do now? Sure, let's dump it to the console...
console.log(JSON.stringify(contents, null, 2));
```

## Limitations

This is mostly a proof of concept -- not an industrially-tested library at the
moment. Use with caution.

The zip file reader does not support nested archives. Directories can contain
many archive files, but archive files cannot contain other archives -- there is
no concept of runtime reader containment, there is only static containment
determined at compile time.

The zip file reader only decodes textual contents in UTF-8 encoding. Don't try
to read old MS-DOS zip files with this!
