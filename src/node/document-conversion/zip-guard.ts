import { fromBufferPromise, type Entry } from "yauzl";
import JSZip from "jszip";
import { ConversionFailure, conversionLimits } from "../../core/document-conversion/contract.js";

function safeEntry(entry: Entry, names: Set<string>): void {
  const name = entry.fileName;
  const parts = name.split("/");
  if (
    !name || name.startsWith("/") || name.includes("\\") || name.includes(":") ||
    /[\u0000-\u001f\u007f-\u009f]/.test(name) ||
    parts.some((part, index) => part === ".." || (part === "" && index < parts.length - 1)) ||
    names.has(name) || entry.isEncrypted() ||
    ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
  ) {
    throw new ConversionFailure(entry.isEncrypted() ? "encrypted-document" : "archive-limit");
  }
  names.add(name);
}

/** Validate actual bytes and return only canonical entries for a fresh ZIP passed to parsers. */
export async function guardOfficeZip(bytes: Buffer): Promise<Map<string, Buffer>> {
  let archive;
  try {
    // Size validation is performed below on actual streamed bytes. Disabling yauzl's eager
    // stored-size check lets us identify encrypted entries before it reports a misleading mismatch.
    archive = await fromBufferPromise(bytes, { lazyEntries: true, autoClose: false, validateEntrySizes: false });
  } catch (error) {
    throw classifyArchiveError(error);
  }

  let entries = 0;
  let total = 0;
  const names = new Set<string>();
  const verified = new Map<string, Buffer>();
  try {
    for await (const entry of archive.eachEntry()) {
      entries += 1;
      if (entries > conversionLimits.archiveEntries) throw new ConversionFailure("archive-limit");
      safeEntry(entry, names);
      if (entry.uncompressedSize > conversionLimits.archiveEntryBytes ||
          total + entry.uncompressedSize > conversionLimits.archiveTotalBytes ||
          (entry.uncompressedSize > 0 && (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > conversionLimits.archiveRatio))) {
        throw new ConversionFailure("archive-limit");
      }

      let actual = 0;
      const chunks: Buffer[] = [];
      try {
        const stream = await archive.openReadStreamPromise(entry);
        for await (const chunk of stream) {
          const part = chunk as Buffer;
          actual += part.length;
          if (actual > conversionLimits.archiveEntryBytes || total + actual > conversionLimits.archiveTotalBytes ||
              (entry.compressedSize > 0 && actual / entry.compressedSize > conversionLimits.archiveRatio)) {
            stream.destroy();
            throw new ConversionFailure("archive-limit");
          }
          chunks.push(part);
        }
      } catch (error) {
        if (error instanceof ConversionFailure) throw error;
        throw new ConversionFailure("archive-limit");
      }
      if (actual !== entry.uncompressedSize) throw new ConversionFailure("archive-limit");
      total += actual;
      verified.set(entry.fileName, Buffer.concat(chunks, actual));
    }
  } catch (error) {
    if (error instanceof ConversionFailure) throw error;
    throw classifyArchiveError(error);
  } finally {
    archive.close();
  }
  return verified;
}

/** A canonical ZIP prevents a second parser from trusting conflicting local ZIP headers. */
export async function canonicalOfficeZip(entries: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const archive = new JSZip();
  for (const [name, content] of entries) {
    archive.file(name, content, { binary: true, createFolders: false, dir: name.endsWith("/") });
  }
  return await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 1 } });
}

/** Classify known yauzl validation failures without exposing its message to callers. */
function classifyArchiveError(error: unknown): ConversionFailure {
  const message = error instanceof Error ? error.message : "";
  if (/encrypt/i.test(message)) return new ConversionFailure("encrypted-document");
  if (/invalid relative path|absolute path|invalid characters|path traversal|duplicate/i.test(message)) {
    return new ConversionFailure("archive-limit");
  }
  return new ConversionFailure("corrupt-document");
}
