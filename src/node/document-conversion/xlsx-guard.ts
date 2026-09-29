import path from "node:path";
import { Parser } from "saxen";
import { ConversionFailure, conversionLimits } from "../../core/document-conversion/contract.js";

function xml(bytes: Buffer, expectedRoot: string, visit: (name: string, attrs: Record<string, string>) => void): void {
  const parser = new Parser();
  const stack: string[] = [];
  let invalid = false;
  let roots = 0;
  parser.on("openTag", (name, getAttrs, decode) => {
    const localName = name.split(":").at(-1) ?? name;
    if (stack.length === 0 && (++roots !== 1 || localName !== expectedRoot)) invalid = true;
    stack.push(name);
    const attrs = Object.fromEntries(Object.entries(getAttrs()).map(([key, value]) => [key, decode(value)]));
    visit(localName, attrs);
  });
  parser.on("closeTag", (name) => { if (stack.pop() !== name) invalid = true; });
  parser.on("error", () => { invalid = true; });
  parser.on("warn", () => { invalid = true; });
  parser.on("attention", () => { invalid = true; });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
      parser.write(decoder.decode(bytes.subarray(offset, offset + 64 * 1024), { stream: true }));
    }
    parser.write(decoder.decode());
    if (parser.end() || stack.length !== 0 || roots !== 1 || invalid) throw new ConversionFailure("corrupt-document");
  } catch (error) {
    if (error instanceof ConversionFailure) throw error;
    throw new ConversionFailure("corrupt-document");
  }
}

function required(entries: ReadonlyMap<string, Buffer>, name: string): Buffer {
  const bytes = entries.get(name);
  if (!bytes) throw new ConversionFailure("corrupt-document");
  return bytes;
}

function index(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw new ConversionFailure("corrupt-document");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new ConversionFailure("corrupt-document");
  return number;
}

function cellAddress(address: string | undefined): { row: number; column: number } {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(address ?? "");
  if (!match) throw new ConversionFailure("corrupt-document");
  let column = 0;
  for (const letter of match[1]!) {
    column = column * 26 + letter.charCodeAt(0) - 64;
    if (!Number.isSafeInteger(column)) throw new ConversionFailure("corrupt-document");
  }
  return { column, row: index(match[2]) };
}

function targetPath(target: string | undefined): string {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes("\\") || target.includes("?") || target.includes("#")) {
    throw new ConversionFailure("corrupt-document");
  }
  const normalized = path.posix.normalize(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  if (!normalized.startsWith("xl/") || normalized.split("/").includes("..")) throw new ConversionFailure("corrupt-document");
  return normalized;
}

/** Reject dangerous XLSX grids before read-excel-file can allocate rows or cells. */
export function guardXlsx(entries: ReadonlyMap<string, Buffer>): readonly string[] {
  const relationships = new Map<string, string>();
  const auxiliaryPaths = new Map<string, string>();
  xml(required(entries, "xl/_rels/workbook.xml.rels"), "Relationships", (name, attrs) => {
    if (name !== "Relationship") return;
    if (!attrs.Id || relationships.has(attrs.Id)) throw new ConversionFailure("corrupt-document");
    if (attrs.TargetMode === "External") return;
    if (attrs.Type?.endsWith("/worksheet")) relationships.set(attrs.Id, targetPath(attrs.Target));
    if (attrs.Type?.endsWith("/sharedStrings")) auxiliaryPaths.set("sharedStrings", targetPath(attrs.Target));
    if (attrs.Type?.endsWith("/styles")) auxiliaryPaths.set("styles", targetPath(attrs.Target));
  });
  const sheetPaths: string[] = [];
  let sheetCount = 0;
  xml(required(entries, "xl/workbook.xml"), "workbook", (name, attrs) => {
    if (name !== "sheet") return;
    if (++sheetCount > conversionLimits.sheets) throw new ConversionFailure("too-many-sheets");
    const relation = attrs["r:id"];
    const sheetPath = relation && relationships.get(relation);
    if (!sheetPath || !entries.has(sheetPath) || sheetPaths.includes(sheetPath)) throw new ConversionFailure("corrupt-document");
    sheetPaths.push(sheetPath);
  });
  let rows = 0;
  let grids = 0;
  let totalCells = 0;
  let sheetXmlBytes = 0;
  for (const sheetPath of sheetPaths) {
    const bytes = required(entries, sheetPath);
    sheetXmlBytes += bytes.length;
    if (bytes.length > conversionLimits.worksheetXmlBytes || sheetXmlBytes > conversionLimits.worksheetXmlTotalBytes) throw new ConversionFailure("archive-limit");
    let maxRow = 0;
    let maxColumn = 0;
    let currentRow = 0;
    let cellCount = 0;
    xml(bytes, "worksheet", (name, attrs) => {
      if (name === "row") {
        rows += 1;
        if (rows > conversionLimits.rows) throw new ConversionFailure("too-many-rows");
        currentRow = attrs.r === undefined ? currentRow + 1 : index(attrs.r);
        if (currentRow > conversionLimits.rows) throw new ConversionFailure("too-many-rows");
        maxRow = Math.max(maxRow, currentRow);
      } else if (name === "c") {
        cellCount += 1;
        totalCells += 1;
        if (totalCells > conversionLimits.cells) throw new ConversionFailure("too-many-cells");
        const address = cellAddress(attrs.r);
        if (address.row > conversionLimits.rows) throw new ConversionFailure("too-many-rows");
        if (address.column > conversionLimits.columns) throw new ConversionFailure("too-many-cells");
        maxRow = Math.max(maxRow, address.row);
        maxColumn = Math.max(maxColumn, address.column);
      }
    });
    grids += maxRow * maxColumn;
    if (grids > conversionLimits.cells) throw new ConversionFailure("too-many-cells");
  }
  for (const [part, limit] of [["sharedStrings", conversionLimits.sharedStringsXmlBytes], ["styles", conversionLimits.stylesXmlBytes]] as const) {
    const bytes = entries.get(auxiliaryPaths.get(part) ?? `xl/${part}.xml`);
    if (bytes && bytes.length > limit) throw new ConversionFailure("archive-limit");
  }
  return sheetPaths;
}
