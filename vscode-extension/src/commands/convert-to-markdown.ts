import * as vscode from "vscode";
import { convertDocument, type ConvertErrorCode, type PdfOcrMode } from "../../../src/runtime/index.js";

const messages: Record<ConvertErrorCode, string> = {
  "unsupported-format": "Choose a PDF, DOCX or XLSX document.",
  "non-local-source": "Choose a local file.",
  "not-a-file": "Choose a regular local file.",
  "input-too-large": "The document exceeds the 50 MiB input limit.",
  "archive-limit": "The Office document exceeds an archive safety limit.",
  "too-many-pages": "The PDF exceeds the 300-page limit.",
  "too-many-sheets": "The spreadsheet exceeds the 40-sheet limit.",
  "too-many-rows": "The spreadsheet exceeds the 20000-row limit.",
  "too-many-cells": "The spreadsheet exceeds a column or cell limit.",
  "output-too-large": "The Markdown result exceeds the 8 MiB limit.",
  "no-text-layer": "No text layer was found in this PDF. Choose an OCR mode to read scanned pages.",
  "too-many-ocr-pages": "The PDF exceeds the 20-page OCR limit.",
  "canvas-limit": "A PDF page exceeds the 10-megapixel OCR canvas limit.",
  "embedded-image-limit": "An embedded PDF image exceeds the 16-megapixel limit.",
  "image-decode-failed": "An embedded PDF image could not be decoded.",
  "canvas-binding-unavailable": "Local OCR is unavailable on this platform.",
  "ocr-model-unavailable": "The bundled OCR language data is unavailable.",
  "ocr-model-corrupt": "The bundled OCR language data failed verification.",
  "ocr-busy": "Another OCR conversion is in progress. Try again when it finishes.",
  "corrupt-document": "The document could not be read. It may be damaged or unsupported.",
  "encrypted-document": "Encrypted documents are not supported.",
  "timeout": "Conversion exceeded its time limit.",
  "read-failed": "The local file could not be read.",
  "conversion-failed": "The document could not be converted."
};

/** Local utility: does not read settings, provider state, SecretStorage or Knowledge Pack. */
export async function convertToMarkdownCommand(): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title: "Archi Agent: choose a document",
    openLabel: "Convert to Markdown",
    filters: { Documents: ["pdf", "docx", "xlsx"] }
  });
  const uri = uris?.[0];
  if (!uri) return;
  if (uri.scheme !== "file") {
    await vscode.window.showErrorMessage(`Archi Agent: ${messages["non-local-source"]}`);
    return;
  }

  let pdfOcrMode: PdfOcrMode = "none";
  if (/\.pdf$/i.test(uri.fsPath)) {
    const choice = await vscode.window.showQuickPick([
      { label: "Auto OCR", description: "Use text where available; read scanned pages locally", mode: "auto" as const },
      { label: "No OCR", description: "Use the PDF text layer only", mode: "none" as const },
      { label: "OCR all pages", description: "Read every page locally, including pages with text", mode: "all" as const }
    ], { title: "Archi Agent: PDF conversion", placeHolder: "Choose how to read this PDF" });
    if (!choice) return;
    pdfOcrMode = choice.mode;
  }

  const controller = new AbortController();
  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Archi Agent: converting document", cancellable: true },
    async (progress, token) => {
      const subscription = token.onCancellationRequested(() => controller.abort());
      try {
        return await convertDocument(uri.fsPath, { signal: controller.signal, pdfOcrMode,
          onProgress: (stage) => progress.report({ message: stage === "recognize" ? "Reading scanned page…" : "Processing PDF…" }) });
      } finally {
        subscription.dispose();
      }
    }
  );
  if (controller.signal.aborted || outcome.status === "cancelled") return;
  if (outcome.status === "failed") {
    await vscode.window.showErrorMessage(`Archi Agent: ${messages[outcome.code]}`);
    return;
  }
  const document = await vscode.workspace.openTextDocument({ language: "markdown", content: outcome.markdown });
  await vscode.window.showTextDocument(document, { preview: false });
}
