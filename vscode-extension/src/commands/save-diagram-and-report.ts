import path from "node:path";
import * as vscode from "vscode";
import { isCompletedDiagramArtifact, planDiagramBundle, saveDiagramBundle, StarterPackCreateError,
  type DiagramArtifact } from "../../../src/runtime/index.js";

/** Only completed originals associated with currently open result previews; no disk history. */
export class OpenDiagramResults {
  private readonly entries = new Map<DiagramArtifact, Set<string>>();
  remember(artifact: DiagramArtifact | undefined, documents: readonly vscode.TextDocument[]): void {
    if (isCompletedDiagramArtifact(artifact)) this.entries.set(artifact, new Set(documents.map((doc) => `${doc.uri.scheme}:${doc.uri.path}`)));
  }
  close(document: vscode.TextDocument): void {
    for (const [artifact, uris] of this.entries) {
      uris.delete(`${document.uri.scheme}:${document.uri.path}`);
      if (uris.size === 0) this.entries.delete(artifact);
    }
  }
  results(): readonly DiagramArtifact[] { return [...this.entries.keys()]; }
}
export const saveDiagramAction = "Save Diagram and Report";
export async function saveDiagramAndReportCommand(results: OpenDiagramResults, selected?: DiagramArtifact): Promise<void> {
  let artifact = selected;
  if (!artifact) {
    const entries = results.results();
    if (entries.length === 0) {
      await vscode.window.showInformationMessage("Archi Agent: no completed diagram with a linked report. Generate a Sequence or Component diagram first.");
      return;
    }
    const item = await vscode.window.showQuickPick(entries.map((result) => ({
      label: `${result.diagramType} — ${result.createdAt}`,
      description: result.resultId,
      detail: "Save original generation bytes and linked report. Manual editor changes are excluded.", result
    })), { title: "Archi Agent: choose original diagram result", ignoreFocusOut: true });
    if (!item) return;
    artifact = item.result;
  }
  if (!isCompletedDiagramArtifact(artifact)) {
    await vscode.window.showInformationMessage("Archi Agent: this result has no linked report. Generate a Sequence or Component diagram first."); return;
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    await vscode.window.showInformationMessage("Archi Agent: open a project folder before saving a diagram and report."); return;
  }
  const project = folders.length === 1 ? folders[0] : (await vscode.window.showQuickPick(folders.map((folder) => ({
    label: folder.name, description: folder.uri.fsPath, folder
  })), { title: "Archi Agent: select save project", ignoreFocusOut: true }))?.folder;
  if (!project) return;
  if (project.uri.scheme !== "file") {
    await vscode.window.showInformationMessage("Archi Agent: open a local project folder before saving."); return;
  }
  const plan = planDiagramBundle(), destination = path.join(project.uri.fsPath, plan.relativeDirectory);
  const confirm = await vscode.window.showWarningMessage(
    `Save original ${artifact.diagramType} result ${artifact.resultId} (${artifact.createdAt})? Manual editor changes are excluded.`,
    { modal: true, detail: `${destination}\n\ndiagram.puml\nreport.json\n\nA new folder will be created. Existing results are never overwritten.` }, saveDiagramAction);
  if (confirm !== saveDiagramAction) return;
  const original = artifact;
  let saved: { readonly directory: string };
  try {
    saved = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Archi Agent: saving diagram and report", cancellable: true },
      async (_progress, token) => {
        const controller = new AbortController();
        const listener = token.onCancellationRequested(() => controller.abort());
        if (token.isCancellationRequested) controller.abort();
        try { return await saveDiagramBundle(project.uri.fsPath, original, plan, { signal: controller.signal }); }
        finally { listener.dispose(); }
      });
  } catch (error) {
    if (error instanceof StarterPackCreateError && error.code === "cancelled" && !error.cleanupIncomplete) {
      await vscode.window.showInformationMessage("Archi Agent: diagram and report save cancelled."); return;
    }
    const recovery = error instanceof StarterPackCreateError && error.cleanupIncomplete ?
      ` Preserved data at ${destination}. Inspect it and keep any edits; move preserved files or choose a new location before retrying.` : " Retry Save Diagram and Report to choose a new bundle.";
    await vscode.window.showErrorMessage(`Archi Agent: diagram and report save failed (${error instanceof StarterPackCreateError ? error.code : "invalid-location"}).${recovery}`); return;
  }
  // The runtime returned a verified committed bundle; late cancellation cannot undo this success.
  const action = await vscode.window.showInformationMessage(`Archi Agent: diagram and report saved at ${saved.directory}`, "Open Diagram", "Open Report");
  if (action === "Open Diagram" || action === "Open Report") {
    const file = path.join(saved.directory, action === "Open Diagram" ? "diagram.puml" : "report.json");
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      await vscode.window.showTextDocument(document, { preview: false });
    } catch {
      await vscode.window.showWarningMessage(`Archi Agent: diagram and report are saved at ${saved.directory}. Could not open ${file}. Open this file manually.`);
    }
  }
}
