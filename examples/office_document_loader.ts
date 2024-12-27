import { defaultLoaders, Loaders } from "@scroogieboy/directory-to-object";
import { loadObjectFromZipFile, zipReader } from '../mod.ts';
import { parse } from "@libs/xml";

const zipFileUrl = new URL(
  "../test_data/hello_world.docx",
  import.meta.url,
);

const xmlLoader = Loaders.customFile({name: "XML file value loader", parser: parse}).whenExtensionIsOneOf([".xml", ".rels"]);

defaultLoaders.push(xmlLoader);

const contents = await loadObjectFromZipFile(zipFileUrl);

console.log(JSON.stringify(contents, null, 2));

// So we don't have to wait for eviction to happen.
zipReader.clear();
