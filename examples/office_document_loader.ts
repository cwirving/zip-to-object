import { loadObjectFromZipFile, zipDefaultLoaders, ZipLoaders } from '../mod.ts';
import { parse } from "@libs/xml";

const zipFileUrl = new URL(
  "../test_data/hello_world.docx",
  import.meta.url,
);

const xmlLoader = ZipLoaders.customFile({name: "XML file value loader", parser: parse}).whenExtensionIsOneOf([".xml", ".rels"]);

zipDefaultLoaders.push(xmlLoader);

const contents = await loadObjectFromZipFile(zipFileUrl);

console.log(JSON.stringify(contents, null, 2));
