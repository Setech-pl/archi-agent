import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { convertLocalDocument } from "../../src/node/document-conversion/convert.js";
import { convertPdf } from "../../src/node/document-conversion/pdf.js";
import { normalizeMissingFormulaCaches } from "../../src/node/document-conversion/xlsx-normalize.js";
import { canonicalOfficeZip, guardOfficeZip } from "../../src/node/document-conversion/zip-guard.js";
import { readDocument } from "../../src/node/document-conversion/read-document.js";
import { conversionLimits } from "../../src/core/document-conversion/contract.js";
import { guardXlsx } from "../../src/node/document-conversion/xlsx-guard.js";

const fixtures = path.resolve("test/fixtures/document-conversion");
const temporary = mkdtempSync(path.join(tmpdir(), "archi-ux1-tests-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
const fixture = (name: string) => path.join(fixtures, name);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function pdf(pages: number): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ")}] >>`];
  for (let i = 0; i < pages; i += 1) objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>");
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(output + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}

async function zip(entries: Record<string, string | Buffer>, compression: "STORE" | "DEFLATE" = "DEFLATE"): Promise<Buffer> {
  const archive = new JSZip();
  for (const [name, value] of Object.entries(entries)) archive.file(name, value);
  return await archive.generateAsync({ type: "nodebuffer", compression });
}

describe("local document conversion", () => {
  it("converts a two-page text PDF in page order and rejects a scanned PDF", async () => {
    const before = sha(readFileSync(fixture("two-pages.pdf")));
    const result = await convertLocalDocument(fixture("two-pages.pdf"));
    expect(result).toMatchObject({ status: "success", format: "pdf", counts: { pages: 2 } });
    if (result.status === "success") {
      expect(result.markdown).toBe("## Page 1\n\nFirst page\n\n## Page 2\n\nSecond page");
      expect(result.markdown).not.toMatch(/<[^>]+>/);
    }
    expect(sha(readFileSync(fixture("two-pages.pdf")))).toBe(before);
    expect(await convertLocalDocument(fixture("no-text.pdf"))).toEqual({ status: "failed", code: "no-text-layer" });
  });

  it("converts DOCX headings, list, table and Unicode", async () => {
    const before = sha(readFileSync(fixture("structured.docx")));
    const result = await convertLocalDocument(fixture("structured.docx"));
    expect(result).toMatchObject({ status: "success", format: "docx" });
    if (result.status === "success") {
      expect(result.markdown).toContain("# Mission overview");
      expect(result.markdown).toContain("Żółw 🚀");
      expect(result.markdown).toContain("First item");
      expect(result.markdown).toContain("| Name | Value |");
      expect(result.markdown).not.toMatch(/<[^>]+>/);
    }
    expect(sha(readFileSync(fixture("structured.docx")))).toBe(before);
  });

  it("converts every XLSX sheet with neutral headers, blanks and cached formulas", async () => {
    const before = sha(readFileSync(fixture("two-sheets.xlsx")));
    const result = await convertLocalDocument(fixture("two-sheets.xlsx"));
    expect(result).toMatchObject({ status: "success", format: "xlsx", counts: { sheets: 2, rows: 3, cells: 8 } });
    if (result.status === "success") {
      expect(result.markdown).toContain("## Sheet: Primary");
      expect(result.markdown).toContain("## Sheet: Dane Żółw");
      expect(result.markdown).toContain("| Column 1 | Column 2 | Column 3 |");
      expect(result.markdown).toContain("| Alpha |  | Omega |");
      expect(result.markdown).toContain("| 3 |  | Żółw |");
      expect(result.markdown).toContain("formulas were not recalculated");
    }
    expect(sha(readFileSync(fixture("two-sheets.xlsx")))).toBe(before);
  });

  it("fails with closed safe codes for unsupported, missing and damaged inputs", async () => {
    expect(await convertLocalDocument("/synthetic/a.doc")).toEqual({ status: "failed", code: "unsupported-format" });
    expect(await convertLocalDocument("relative.pdf")).toEqual({ status: "failed", code: "non-local-source" });
    const damagedPdf = path.join(temporary, "damaged.pdf");
    const damagedDocx = path.join(temporary, "damaged.docx");
    writeFileSync(damagedPdf, "BAD DOCUMENT CONTENT SENTINEL");
    writeFileSync(damagedDocx, "BAD DOCUMENT CONTENT SENTINEL");
    const pdfResult = await convertLocalDocument(damagedPdf);
    const docxResult = await convertLocalDocument(damagedDocx);
    expect(pdfResult).toEqual({ status: "failed", code: "corrupt-document" });
    expect(docxResult).toEqual({ status: "failed", code: "corrupt-document" });
    expect(JSON.stringify([pdfResult, docxResult])).not.toContain("SENTINEL");
    expect(JSON.stringify([pdfResult, docxResult])).not.toContain(temporary);
  });

  it("enforces input and page limits before large output", async () => {
    const exact = path.join(temporary, "exact-limit.pdf");
    writeFileSync(exact, Buffer.alloc(conversionLimits.inputBytes));
    expect((await readDocument(exact)).length).toBe(conversionLimits.inputBytes);
    const oversized = path.join(temporary, "large.pdf");
    writeFileSync(oversized, Buffer.alloc(conversionLimits.inputBytes + 1));
    await expect(readDocument(oversized)).rejects.toMatchObject({ code: "input-too-large" });
    await expect(convertPdf(pdf(conversionLimits.pages))).rejects.toMatchObject({ code: "no-text-layer" });
    await expect(convertPdf(pdf(conversionLimits.pages + 1))).rejects.toMatchObject({ code: "too-many-pages" });
  });
});

describe("Office ZIP guard", () => {
  it("accepts the synthetic Office files", async () => {
    await expect(guardOfficeZip(readFileSync(fixture("structured.docx")))).resolves.toBeInstanceOf(Map);
    await expect(guardOfficeZip(readFileSync(fixture("two-sheets.xlsx")))).resolves.toBeInstanceOf(Map);
  });

  it("rebuilds a canonical ZIP so a conflicting local size cannot reach the XLSX parser", async () => {
    const bytes = Buffer.from(readFileSync(fixture("two-sheets.xlsx")));
    bytes.writeUInt32LE(0x7fffffff, 22); // local size; the central size stays bounded
    const entries = await guardOfficeZip(bytes);
    const canonical = await canonicalOfficeZip(entries);
    expect(canonical.readUInt32LE(22)).toBeLessThanOrEqual(conversionLimits.archiveEntryBytes);
    const source = path.join(temporary, "conflicting-local-header.xlsx");
    writeFileSync(source, bytes);
    expect(await convertLocalDocument(source)).toMatchObject({ status: "success", format: "xlsx" });
  });

  it("rejects too many entries, oversized entries, excessive ratio and unsafe names", async () => {
    const exactEntries: Record<string, string> = {};
    for (let i = 0; i < conversionLimits.archiveEntries; i += 1) exactEntries[`exact-${i}.xml`] = "x";
    expect((await guardOfficeZip(await zip(exactEntries, "STORE"))).size).toBe(conversionLimits.archiveEntries);
    const entries: Record<string, string> = {};
    for (let i = 0; i <= conversionLimits.archiveEntries; i += 1) entries[`part-${i}.xml`] = "x";
    await expect(guardOfficeZip(await zip(entries))).rejects.toMatchObject({ code: "archive-limit" });
    await expect(guardOfficeZip(await zip({ "big.xml": Buffer.alloc(conversionLimits.archiveEntryBytes + 1) }, "STORE"))).rejects.toMatchObject({ code: "archive-limit" });
    await expect(guardOfficeZip(await zip({ "bomb.xml": "A".repeat(100_000) }))).rejects.toMatchObject({ code: "archive-limit" });
    await expect(guardOfficeZip(await zip({ "../unsafe.xml": "x" }))).rejects.toMatchObject({ code: "archive-limit" });
  });

  it("rejects encrypted, duplicate and falsely declared entries", async () => {
    const encrypted = await zip({ "data.xml": "abc" }, "STORE");
    const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 1, 6);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
    await expect(guardOfficeZip(encrypted)).rejects.toMatchObject({ code: "encrypted-document" });

    const duplicate = await zip({ "a.txt": "a", "b.txt": "b" }, "STORE");
    let at = duplicate.indexOf("b.txt");
    while (at >= 0) { duplicate.write("a.txt", at); at = duplicate.indexOf("b.txt", at + 5); }
    await expect(guardOfficeZip(duplicate)).rejects.toMatchObject({ code: "archive-limit" });

    const falseSize = await zip({ "part.xml": "small" }, "STORE");
    const header = falseSize.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    falseSize.writeUInt32LE(conversionLimits.archiveEntryBytes + 1, header + 24);
    await expect(guardOfficeZip(falseSize)).rejects.toMatchObject({ code: "archive-limit" });
  });

  it("rejects total inflated size over 100 MiB", async () => {
    const exactEntry = await guardOfficeZip(await zip({ "exact.bin": Buffer.alloc(conversionLimits.archiveEntryBytes) }, "STORE"));
    expect(exactEntry.get("exact.bin")?.length).toBe(conversionLimits.archiveEntryBytes);
    const exactTotal: Record<string, Buffer> = {};
    for (let i = 0; i < 4; i += 1) exactTotal[`exact-${i}.bin`] = Buffer.alloc(conversionLimits.archiveEntryBytes, i);
    expect((await guardOfficeZip(await zip(exactTotal, "STORE"))).size).toBe(4);
    const entries: Record<string, Buffer> = {};
    for (let i = 0; i < 5; i += 1) entries[`part-${i}.bin`] = Buffer.alloc(21 * 1024 * 1024, i);
    await expect(guardOfficeZip(await zip(entries, "STORE"))).rejects.toMatchObject({ code: "archive-limit" });
  }, 30_000);
});

describe("spreadsheet limits", () => {
  async function changedSheet(xmlText: string): Promise<Map<string, Buffer>> {
    const entries = await guardOfficeZip(readFileSync(fixture("two-sheets.xlsx")));
    entries.set("xl/worksheets/sheet1.xml", Buffer.from(xmlText));
    return entries;
  }

  it("guards sparse grids and distant empty rows without trusting dimension", async () => {
    const start = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1"/><sheetData>';
    const end = "</sheetData></worksheet>";
    const sparse = await changedSheet(start + '<row r="20000"><c r="Z20000"><v>1</v></c></row>' + end);
    const distantRow = await changedSheet(start + '<row r="20001"/>' + end);
    const distantColumn = await changedSheet(start + '<row r="1"><c r="OT1"/></row>' + end);
    expect(() => guardXlsx(sparse)).toThrowError(expect.objectContaining({ code: "too-many-cells" }));
    expect(() => guardXlsx(distantRow)).toThrowError(expect.objectContaining({ code: "too-many-rows" }));
    expect(() => guardXlsx(distantColumn)).toThrowError(expect.objectContaining({ code: "too-many-cells" }));
  });

  it("rejects bad addresses and relationships as corrupt documents", async () => {
    const entries = await changedSheet('<worksheet><sheetData><row r="1"><c r="A0"/></row></sheetData></worksheet>');
    expect(() => guardXlsx(entries)).toThrowError(expect.objectContaining({ code: "corrupt-document" }));
    const rels = entries.get("xl/_rels/workbook.xml.rels")!.toString().replace("worksheets/sheet1.xml", "../other/sheet1.xml");
    entries.set("xl/_rels/workbook.xml.rels", Buffer.from(rels));
    expect(() => guardXlsx(entries)).toThrowError(expect.objectContaining({ code: "corrupt-document" }));
  });

  it("bounds worksheet, shared string and style XML before the spreadsheet parser", async () => {
    const entries = await guardOfficeZip(readFileSync(fixture("two-sheets.xlsx")));
    const worksheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
    const atLimit = worksheet + `<!--${"x".repeat(conversionLimits.worksheetXmlBytes - Buffer.byteLength(worksheet) - 7)}-->`;
    const valid = new Map(entries);
    valid.set("xl/worksheets/sheet1.xml", Buffer.from(atLimit));
    expect(guardXlsx(valid)).toHaveLength(2);
    for (const [name, limit] of [
      ["xl/worksheets/sheet1.xml", conversionLimits.worksheetXmlBytes],
      ["xl/sharedStrings.xml", conversionLimits.sharedStringsXmlBytes],
      ["xl/styles.xml", conversionLimits.stylesXmlBytes]
    ] as const) {
      const changed = new Map(entries);
      changed.set(name, Buffer.alloc(limit + 1));
      expect(() => guardXlsx(changed)).toThrowError(expect.objectContaining({ code: "archive-limit" }));
    }
    for (const [name, limit] of [["xl/sharedStrings.xml", conversionLimits.sharedStringsXmlBytes], ["xl/styles.xml", conversionLimits.stylesXmlBytes]] as const) {
      const atBoundary = new Map(entries);
      atBoundary.set(name, Buffer.alloc(limit));
      expect(guardXlsx(atBoundary)).toHaveLength(2);
    }
  });

  it("accepts 64 MiB of worksheet XML and rejects one byte more", async () => {
    const entries = await guardOfficeZip(readFileSync(fixture("two-sheets.xlsx")));
    const workbookXml = '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      [1, 2, 3].map((number) => `<sheet name="S${number}" sheetId="${number}" r:id="rId${number}"/>`).join("") + '</sheets></workbook>';
    const relationsXml = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      [1, 2, 3].map((number) => `<Relationship Id="rId${number}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${number}.xml"/>`).join("") + '</Relationships>';
    entries.set("xl/workbook.xml", Buffer.from(workbookXml));
    entries.set("xl/_rels/workbook.xml.rels", Buffer.from(relationsXml));
    const minimal = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
    for (const [number, mib] of [[1, 22], [2, 21], [3, 21]] as const) {
      const size = mib * 1024 * 1024;
      entries.set(`xl/worksheets/sheet${number}.xml`, Buffer.from(minimal + `<!--${"x".repeat(size - Buffer.byteLength(minimal) - 7)}-->`));
    }
    expect(guardXlsx(entries)).toHaveLength(3);
    const over = new Map(entries);
    over.set("xl/worksheets/sheet3.xml", Buffer.concat([entries.get("xl/worksheets/sheet3.xml")!, Buffer.from(" ")]));
    expect(() => guardXlsx(over)).toThrowError(expect.objectContaining({ code: "archive-limit" }));
  }, 30_000);

  async function workbook(sheetCount: number, rows: number, columns: number): Promise<Buffer> {
    const archive = await JSZip.loadAsync(readFileSync(fixture("two-sheets.xlsx")));
    const sheets = Array.from({ length: sheetCount }, (_, i) => `<sheet name="S${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
    archive.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`);
    const rels = Array.from({ length: sheetCount }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
    archive.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
    const columnName = (index: number): string => {
      let number = index + 1;
      let name = "";
      while (number > 0) {
        number -= 1;
        name = String.fromCharCode(65 + number % 26) + name;
        number = Math.floor(number / 26);
      }
      return name;
    };
    const cells = Array.from({ length: columns }, (_, index) => `<c r="${columnName(index)}1"><v>${index}</v></c>`).join("");
    const data = Array.from({ length: rows }, (_, index) => `<row r="${index + 1}">${cells.replaceAll("1\"", `${index + 1}\"`)}</row>`).join("");
    for (let i = 0; i < sheetCount; i += 1) archive.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`);
    return await archive.generateAsync({ type: "nodebuffer", compression: "STORE" });
  }

  it("rejects more than 40 sheets", async () => {
    await expect(convertLocalDocument(writeWorkbook("sheets", await workbook(41, 1, 1)))).resolves.toMatchObject({ status: "failed", code: "too-many-sheets" });
  });
  function writeWorkbook(name: string, bytes: Buffer): string {
    const file = path.join(temporary, `${name}.xlsx`);
    writeFileSync(file, bytes);
    return file;
  }
  it("accepts the sheet, row, column and cell-grid boundaries in preflight", async () => {
    expect(guardXlsx(await guardOfficeZip(await workbook(40, 1, 1)))).toHaveLength(40);
    expect(guardXlsx(await guardOfficeZip(await workbook(1, 20000, 1)))).toHaveLength(1);
    expect(guardXlsx(await guardOfficeZip(await workbook(1, 1, 150)))).toHaveLength(1);
    expect(guardXlsx(await guardOfficeZip(await workbook(1, 2000, 125)))).toHaveLength(1);
  }, 30_000);
  it("rejects a second sheet that raises the total grid from 250000 to 250001 cells", async () => {
    const entries = await guardOfficeZip(await workbook(1, 2000, 125));
    entries.set("xl/workbook.xml", Buffer.from('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S1" sheetId="1" r:id="rId1"/><sheet name="S2" sheetId="2" r:id="rId2"/></sheets></workbook>'));
    entries.set("xl/_rels/workbook.xml.rels", Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'));
    entries.set("xl/worksheets/sheet2.xml", Buffer.from('<worksheet><sheetData><row r="1"><c r="A1"/></row></sheetData></worksheet>'));
    expect(() => guardXlsx(entries)).toThrowError(expect.objectContaining({ code: "too-many-cells" }));
  }, 30_000);
  it("rejects more than 20000 rows", async () => {
    await expect(convertLocalDocument(writeWorkbook("rows", await workbook(1, 20001, 1)))).resolves.toMatchObject({ status: "failed", code: "too-many-rows" });
  }, 30_000);
  it("rejects too many columns or cells", async () => {
    await expect(convertLocalDocument(writeWorkbook("columns", await workbook(1, 1, 151)))).resolves.toMatchObject({ status: "failed", code: "too-many-cells" });
    await expect(convertLocalDocument(writeWorkbook("cells", await workbook(1, 1700, 150)))).resolves.toMatchObject({ status: "failed", code: "too-many-cells" });
  }, 30_000);

  it("renders a text formula with no cached value as an empty cell", async () => {
    const archive = await JSZip.loadAsync(readFileSync(fixture("two-sheets.xlsx")));
    const xml = await archive.file("xl/worksheets/sheet1.xml")!.async("string");
    archive.file("xl/worksheets/sheet1.xml", xml.replace('<c r="B2"><f>', '<c r="B2" t="str"><f>'));
    const source = path.join(temporary, "formula-no-cache.xlsx");
    writeFileSync(source, await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    const result = await convertLocalDocument(source);
    expect(result).toMatchObject({ status: "success", format: "xlsx" });
    if (result.status === "success") expect(result.markdown).toContain("| 3 |  | Żółw |");
  });

  it("normalizes formulas in relocated and Strict OOXML worksheet parts", async () => {
    const namespace = "http://purl.oclc.org/ooxml/spreadsheetml/main";
    const source = new Map([["xl/custom/nested/data.xml", Buffer.from(`<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1" t="str"><f>1+1</f></c></row></sheetData></worksheet>`)]]);
    const result = normalizeMissingFormulaCaches(source, ["xl/custom/nested/data.xml"]);
    expect(result.get("xl/custom/nested/data.xml")?.toString()).not.toContain("<f>");
    expect(result.get("xl/custom/nested/data.xml")?.toString()).not.toContain('t="str"');
    expect(source.get("xl/custom/nested/data.xml")?.toString()).toContain("<f>");
  });

  it("converts a workbook whose worksheet part is nested under a nonstandard path", async () => {
    const archive = await JSZip.loadAsync(readFileSync(fixture("two-sheets.xlsx")));
    const original = await archive.file("xl/worksheets/sheet1.xml")!.async("string");
    archive.remove("xl/worksheets/sheet1.xml");
    archive.file("xl/custom/nested/sheet1.xml", original.replace('<c r="B2"><f>', '<c r="B2" t="str"><f>'));
    const relationships = await archive.file("xl/_rels/workbook.xml.rels")!.async("string");
    archive.file("xl/_rels/workbook.xml.rels", relationships.replace("worksheets/sheet1.xml", "custom/nested/sheet1.xml"));
    const source = path.join(temporary, "nested-worksheet.xlsx");
    writeFileSync(source, await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    const result = await convertLocalDocument(source);
    expect(result).toMatchObject({ status: "success", format: "xlsx" });
    if (result.status === "success") expect(result.markdown).toContain("| 3 |  | Żółw |");
  });
});

describe("encrypted Office containers", () => {
  it("recognizes the OLE encrypted-package signature without exposing metadata", async () => {
    const source = path.join(temporary, "password.docx");
    const bytes = Buffer.concat([
      Buffer.from("d0cf11e0a1b11ae1", "hex"),
      Buffer.from("EncryptedPackage", "utf16le"),
      Buffer.from("EncryptionInfo", "utf16le")
    ]);
    writeFileSync(source, bytes);
    expect(await convertLocalDocument(source)).toEqual({ status: "failed", code: "encrypted-document" });
  });
});
