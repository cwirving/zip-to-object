# Zip file support for `@scroogieboy/directory-to-object`

## Installation & usage

### Deno

First, install the package:

```
deno add jsr:@scroogieboy/zip-to-object
```

Then, you can refer to the contents of the package by importing the library exports. For example:

```typescript
import { loadObjectFromZipFile } from "@scroogieboy/zip-to-object";

const zipFileUrl = new URL("file:///some/directory/archive.zip");
const contents = await loadObjectFromZipFile(zipFileUrl);

console.log(JSON.stringify(contents, null, 2));
```

### Bun

Install the package:

```
bunx jsr add @scroogieboy/zip-to-object
```

Usage is the same as with Deno.

### Node.js

Install the package:

```
npx jsr add @scroogieboy/zip-to-object
```

This is an ESM-only package, so -- as per the [JSR documentation](https://jsr.io/docs/with/node), this means that 
the consuming project must be an ESM project (`"type": "module"` in the project's `package.json` ).

