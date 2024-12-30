import { defaultLoaders, Loaders } from "@scroogieboy/directory-to-object";
import { loadObjectFromZipFile } from "../mod.ts";
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
