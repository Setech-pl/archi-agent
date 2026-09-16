// Minimal reader for the ZIP container of a VSIX. It understands the end-of-central-directory
// record, the central directory and stored or deflated local entries, which is all a VSIX built by
// vsce uses. It exists so that package verification needs no third-party archive library.
// ZIP64 archives are rejected; a VSIX of this extension is far below the ZIP64 thresholds.

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;
const localHeaderSignature = 0x04034b50;
const maxCommentBytes = 0xffff;
const maxEntries = 10_000;
const maxEntryBytes = 64 * 1024 * 1024;

export class VsixZipError extends Error {
  constructor(message) {
    super(message);
    this.name = "VsixZipError";
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - maxCommentBytes - 22);

  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      return offset;
    }
  }

  throw new VsixZipError("The file is not a ZIP archive.");
}

/** Lists the central-directory entries: name, sizes, compression method and local header offset. */
export function listZipEntries(buffer) {
  const end = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);

  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new VsixZipError("ZIP64 archives are not supported.");
  }

  if (entryCount > maxEntries || directoryOffset + directorySize > buffer.length) {
    throw new VsixZipError("The central directory is out of bounds.");
  }

  const entries = [];
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      throw new VsixZipError("A central directory entry is malformed.");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    entries.push(Object.freeze({ name, method, compressedSize, uncompressedSize, localOffset }));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return Object.freeze(entries);
}

/** Decompressed content of one entry as a Buffer. */
export function readZipEntry(buffer, entry) {
  const header = entry.localOffset;

  if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== localHeaderSignature) {
    throw new VsixZipError(`The local header of ${entry.name} is malformed.`);
  }

  if (entry.uncompressedSize > maxEntryBytes || entry.compressedSize > maxEntryBytes) {
    throw new VsixZipError(`The entry ${entry.name} is too large.`);
  }

  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) {
    return Buffer.from(compressed);
  }

  if (entry.method === 8) {
    const inflated = inflateRawSync(compressed, { maxOutputLength: maxEntryBytes });

    if (inflated.length !== entry.uncompressedSize) {
      throw new VsixZipError(`The entry ${entry.name} has an unexpected size.`);
    }

    return inflated;
  }

  throw new VsixZipError(`The entry ${entry.name} uses an unsupported compression method.`);
}

/** Convenience: every entry with a reader for its content. */
export function openVsix(filePath) {
  const buffer = readFileSync(filePath);
  const entries = listZipEntries(buffer);
  return Object.freeze({
    entries,
    read(name) {
      const entry = entries.find((candidate) => candidate.name === name);

      if (entry === undefined) {
        throw new VsixZipError(`The archive has no entry ${name}.`);
      }

      return readZipEntry(buffer, entry);
    }
  });
}
