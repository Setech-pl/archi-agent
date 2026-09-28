import * as vscode from "vscode";
import { convertDocument, type ConvertErrorCode } from "../../../src/runtime/index.js";

const messages: Record<ConvertErrorCode, string> = {
  "unsupported-format": "Choose a PDF, DOCX or XLSX document.",
  "non-local-source": "Choose a local file.",
  "not-a-file": "Choose a regular local file.",
  "input-too-large": "The document exceeds the 10 MiB input limit.",
  "archive-limit": "The Office document exceeds an archive safety limit.",
  "too-many-pages": "The PDF exceeds the 100-page limit.",
  "too-many-sheets": "The spreadsheet exceeds the 20-sheet limit.",
  "too-many-rows": "The spreadsheet exceeds the 5000-row limit.",
  "too-many-cells": "The spreadsheet exceeds a column or cell limit.",
  "output-too-large": "The Markdown result exceeds the 2 MiB limit.",
  "no-text-layer": "No text layer was found in this PDF. Scanned PDFs need OCR, which is not available here.",
  "corrupt-document": "The document could not be read. It may be damaged or unsupported.",
  "encrypted-document": "Encrypted documents are not supported.",
  "timeout": "Conversion exceeded the 30-second limit.",
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

  const controller = new AbortController();
  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Archi Agent: converting document", cancellable: true },
    async (_progress, token) => {
      const subscription = token.onCancellationRequested(() => controller.abort());
      try {
        return await convertDocument(uri.fsPath, { signal: controller.signal });
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
