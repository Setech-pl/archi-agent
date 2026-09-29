import { ConversionFailure, formatFromPath, type ConvertOutcome } from "../../core/document-conversion/contract.js";
import { readDocument } from "./read-document.js";
import { canonicalOfficeZip, guardOfficeZip } from "./zip-guard.js";
import { normalizeMissingFormulaCaches } from "./xlsx-normalize.js";
import { convertPdf } from "./pdf.js";
import { convertDocx } from "./docx.js";
import { convertXlsx } from "./xlsx.js";
import { guardXlsx } from "./xlsx-guard.js";

/** One conversion request. No settings, model, secret store, network or output file is involved. */
export async function convertLocalDocument(filePath: string): Promise<ConvertOutcome> {
  const format = formatFromPath(filePath);
  if (!format) return { status: "failed", code: "unsupported-format" };
  try {
    const bytes = await readDocument(filePath);
    if (format === "pdf") return await convertPdf(bytes);
    if (bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))) {
      const encrypted = bytes.includes(Buffer.from("EncryptedPackage", "utf16le")) && bytes.includes(Buffer.from("EncryptionInfo", "utf16le"));
      throw new ConversionFailure(encrypted ? "encrypted-document" : "corrupt-document");
    }
    const entries = await guardOfficeZip(bytes);
    const sheetPaths = format === "xlsx" ? guardXlsx(entries) : undefined;
    const safeZip = await canonicalOfficeZip(sheetPaths ? normalizeMissingFormulaCaches(entries, sheetPaths) : entries);
    return format === "docx" ? await convertDocx(safeZip) : await convertXlsx(safeZip);
  } catch (error) {
    return { status: "failed", code: error instanceof ConversionFailure ? error.code : "conversion-failed" };
  }
}
