export type ConvertFormat = "pdf" | "docx" | "xlsx";

export type ConvertErrorCode =
  | "unsupported-format"
  | "non-local-source"
  | "not-a-file"
  | "input-too-large"
  | "archive-limit"
  | "too-many-pages"
  | "too-many-sheets"
  | "too-many-rows"
  | "too-many-cells"
  | "output-too-large"
  | "no-text-layer"
  | "corrupt-document"
  | "encrypted-document"
  | "timeout"
  | "read-failed"
  | "conversion-failed";

export type ConvertOutcome =
  | {
      readonly status: "success";
      readonly format: ConvertFormat;
      readonly markdown: string;
      readonly counts: {
        readonly pages?: number;
        readonly sheets?: number;
        readonly rows?: number;
        readonly cells?: number;
      };
    }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly code: ConvertErrorCode };

export const conversionLimits = Object.freeze({
  inputBytes: 10 * 1024 * 1024,
  outputBytes: 2 * 1024 * 1024,
  timeoutMs: 30_000,
  pages: 100,
  archiveEntries: 1000,
  archiveTotalBytes: 50 * 1024 * 1024,
  archiveEntryBytes: 10 * 1024 * 1024,
  archiveRatio: 100,
  sheets: 20,
  rows: 5000,
  columns: 100,
  cells: 100_000
});

export class ConversionFailure extends Error {
  constructor(readonly code: ConvertErrorCode) {
    super(code);
    this.name = "ConversionFailure";
  }
}

export function formatFromPath(filePath: string): ConvertFormat | undefined {
  const extension = /\.([^.\\/]+)$/.exec(filePath)?.[1]?.toLowerCase();
  return extension === "pdf" || extension === "docx" || extension === "xlsx" ? extension : undefined;
}
