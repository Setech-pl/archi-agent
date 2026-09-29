import readExcelFile from "read-excel-file/node";
import { MarkdownBuilder, escapeMarkdown, escapeTableCell } from "../../core/document-conversion/markdown.js";
import { ConversionFailure, conversionLimits, type ConvertOutcome } from "../../core/document-conversion/contract.js";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export async function convertXlsx(bytes: Buffer): Promise<Extract<ConvertOutcome, { status: "success" }>> {
  try {
    const sheets = await readExcelFile(bytes);
    if (sheets.length > conversionLimits.sheets) throw new ConversionFailure("too-many-sheets");
    let rows = 0;
    let cells = 0;
    const markdown = new MarkdownBuilder();
    markdown.append("Formula results are saved values; formulas were not recalculated.\n");
    for (const sheet of sheets) {
      rows += sheet.data.length;
      if (rows > conversionLimits.rows) throw new ConversionFailure("too-many-rows");
      const columns = sheet.data.reduce((largest, row) => Math.max(largest, row.length), 0);
      if (columns > conversionLimits.columns) throw new ConversionFailure("too-many-cells");
      cells += sheet.data.length * columns;
      if (cells > conversionLimits.cells) throw new ConversionFailure("too-many-cells");
      markdown.append(`\n## Sheet: ${escapeMarkdown(sheet.sheet)}\n`);
      if (columns === 0) continue;
      markdown.append(`\n| ${Array.from({ length: columns }, (_, index) => `Column ${index + 1}`).join(" | ")} |\n| ${Array(columns).fill("---").join(" | ")} |\n`);
      for (const row of sheet.data) {
        const values = Array.from({ length: columns }, (_, index) => escapeTableCell(cellText(row[index])));
        markdown.append(`| ${values.join(" | ")} |\n`);
      }
    }
    return { status: "success", format: "xlsx", markdown: markdown.finish(), counts: { sheets: sheets.length, rows, cells } };
  } catch (error) {
    if (error instanceof ConversionFailure) throw error;
    throw new ConversionFailure("corrupt-document");
  }
}
