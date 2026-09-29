import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, expect, it, vi } from "vitest";

const readExcel = vi.hoisted(() => vi.fn());
vi.mock("read-excel-file/node", () => ({ default: readExcel }));

import { convertLocalDocument } from "../../src/node/document-conversion/convert.js";

const directory = mkdtempSync(path.join(tmpdir(), "archi-cl1-preflight-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it("rejects an oversized sparse grid before calling read-excel-file", async () => {
  const archive = await JSZip.loadAsync(readFileSync("test/fixtures/document-conversion/two-sheets.xlsx"));
  archive.file("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1"/><sheetData><row r="20000"><c r="Z20000"><v>1</v></c></row></sheetData></worksheet>');
  const source = path.join(directory, "sparse.xlsx");
  writeFileSync(source, await archive.generateAsync({ type: "nodebuffer", compression: "STORE" }));
  expect(await convertLocalDocument(source)).toEqual({ status: "failed", code: "too-many-cells" });
  expect(readExcel).not.toHaveBeenCalled();
});
