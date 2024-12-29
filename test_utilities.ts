import type * as zip from "@zip-js/zip-js";

export function makeZipEntry(filename: string, directory: boolean): zip.Entry {
  return {
    offset: 0,
    filename: filename,
    rawFilename: new TextEncoder().encode(filename),
    filenameUTF8: false,
    directory: directory,
    encrypted: false,
    zipCrypto: false,
    compressedSize: 0,
    uncompressedSize: 0,
    lastModDate: new Date(0),
    rawLastModDate: 0,
    comment: "",
    rawComment: new Uint8Array(0),
    commentUTF8: false,
    signature: 0,
    rawExtraField: new Uint8Array(0),
    zip64: false,
    version: 0,
    versionMadeBy: 0,
    msDosCompatible: false,
    internalFileAttribute: 0,
    externalFileAttribute: 0,
    diskNumberStart: 0,
    compressionMethod: 0,
  };
}
