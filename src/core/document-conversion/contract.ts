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
  | "too-many-ocr-pages"
  | "canvas-limit"
  | "embedded-image-limit"
  | "image-decode-failed"
  | "canvas-binding-unavailable"
  | "ocr-model-unavailable"
  | "ocr-model-corrupt"
  | "ocr-busy"
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
  inputBytes: 50 * 1024 * 1024,
  outputBytes: 8 * 1024 * 1024,
  timeoutMs: 120_000,
  pages: 300,
  ocrPages: 20,
  canvasPixels: 10_000_000,
  embeddedImagePixels: 16_000_000,
  ocrTimeoutMs: 300_000,
  archiveEntries: 1000,
  archiveTotalBytes: 100 * 1024 * 1024,
  archiveEntryBytes: 25 * 1024 * 1024,
  archiveRatio: 100,
  sheets: 40,
  rows: 20_000,
  columns: 150,
  cells: 250_000,
  worksheetXmlBytes: 24 * 1024 * 1024,
  worksheetXmlTotalBytes: 64 * 1024 * 1024,
  sharedStringsXmlBytes: 16 * 1024 * 1024,
  stylesXmlBytes: 8 * 1024 * 1024
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
