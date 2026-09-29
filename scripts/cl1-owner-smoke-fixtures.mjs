import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = process.argv[2] ? path.resolve(process.argv[2]) : mkdtempSync(path.join(tmpdir(), "archi-cl1-owner-smoke-"));
mkdirSync(directory, { recursive: true });
const fixtures = path.join(root, "test/fixtures/document-conversion");

const sourcePdf = readFileSync(path.join(fixtures, "two-pages.pdf"));
const xrefAt = sourcePdf.indexOf(Buffer.from("xref\n"));
if (xrefAt < 0) throw new Error("PDF fixture has no xref");
const padding = Buffer.from(("%" + "x".repeat(1022) + "\n").repeat(11 * 1024));
const tail = sourcePdf.subarray(xrefAt).toString().replace(/startxref\n\d+/, `startxref\n${xrefAt + padding.length}`);
writeFileSync(path.join(directory, "large.pdf"), Buffer.concat([sourcePdf.subarray(0, xrefAt), padding, Buffer.from(tail)]));

for (const [source, output, extra] of [
  ["structured.docx", "large.docx", "word/media/unreferenced-padding.bin"],
  ["two-sheets.xlsx", "large.xlsx", "xl/custom/unreferenced-padding.bin"]
]) {
  const archive = await JSZip.loadAsync(readFileSync(path.join(fixtures, source)));
  archive.file(extra, randomBytes(11 * 1024 * 1024), { compression: "STORE" });
  writeFileSync(path.join(directory, output), await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
writeFileSync(path.join(directory, "over-limit.pdf"), Buffer.alloc(50 * 1024 * 1024 + 1));
console.log(directory);
