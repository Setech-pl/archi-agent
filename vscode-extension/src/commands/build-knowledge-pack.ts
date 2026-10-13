import * as vscode from "vscode";
import { KnowledgePackReviewSession, validateDocumentSelection, type DocumentInput, type GeneratorConfig } from "../../../src/runtime/index.js";
import { settingsSection } from "../contributions.js";
import { readLocalModelSettings } from "../settings.js";
import { readApiKey } from "../api-key-storage.js";
import { selectLocalModel } from "./local-provider-selection.js";
import { openKnowledgePackReview } from "../workbench/review.js";
import type { GenerateCommandDependencies } from "./generate-sequence-diagram.js";

let active = false;
const title = (step: string) => `Archi Agent: ${step}`;
function safeCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^[a-z-]+$/u.test(code) ? code : "operation-failed";
}
/** Native document pickers and one production extraction, followed by the review workbench. */
export async function buildKnowledgePackCommand({ runtime, output, secrets }: GenerateCommandDependencies, scope?: { folder: vscode.WorkspaceFolder | undefined }, activeSource?: DocumentInput): Promise<void> {
  if (active) { await vscode.window.showWarningMessage("Archi Agent: a Knowledge Pack build is already active."); return; }
  active = true;
  try {
    if (!scope) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const picked = folders.length > 1 ? await vscode.window.showQuickPick(folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })), { title: title("select project folder") }) : undefined;
      if (folders.length > 1 && !picked) return;
      scope = { folder: picked?.folder ?? folders[0] };
    }
    const uris = activeSource ? undefined : await vscode.window.showOpenDialog({ title: title("choose source documents"), openLabel: "Use documents", canSelectMany: true, canSelectFiles: true, canSelectFolders: false,
      filters: { Documents: ["md", "txt", "pdf", "docx", "xlsx"] } });
    if (!activeSource && !uris?.length) return;
    if (uris?.some((u) => u.scheme !== "file")) throw { code: "invalid-document-input" };
    const documents: DocumentInput[] = activeSource ? [activeSource] : uris!.map((u) => ({ path: u.fsPath }));
    if (!activeSource || !("kind" in activeSource)) await validateDocumentSelection(documents as { path: string }[]);
    let pdfOcrMode: "none" | "auto" | "all" = "none";
    if (documents.some((d) => "path" in d && /\.pdf$/iu.test(d.path))) {
      const picked = await vscode.window.showQuickPick(["none", "auto", "all"] as const, { title: title("PDF OCR mode") });
      if (!picked) return; pdfOcrMode = picked as typeof pdfOcrMode;
    }
    const generator = async (signal: AbortSignal): Promise<GeneratorConfig | undefined> => {
      const token: vscode.CancellationToken = {
        get isCancellationRequested() { return signal.aborted; },
        onCancellationRequested(listener, thisArg, disposables) {
          const fire = () => listener.call(thisArg, undefined);
          signal.addEventListener("abort", fire, { once: true });
          const subscription = { dispose: () => signal.removeEventListener("abort", fire) };
          disposables?.push(subscription);
          if (signal.aborted) queueMicrotask(fire);
          return subscription;
        }
      };
      if (signal.aborted) return undefined;
      let settings = readLocalModelSettings(vscode.workspace.getConfiguration(settingsSection, scope?.folder?.uri));
      if (!settings.ok) { await vscode.window.showErrorMessage(`Archi Agent: ${settings.problems.map((p) => p.message).join(" ")}`); return undefined; }
      if (!settings.settings.modelId) {
        const selection = await selectLocalModel(runtime, output, secrets, token, scope?.folder?.uri);
        if (signal.aborted || selection.status !== "selected") return undefined;
        settings = { ok: true, settings: selection.settings };
      }
      const model = settings.settings;
      if (!model.modelId) return undefined;
      const profile = runtime.listProviderProfiles().find((p) => p.profileId === model.profileId);
      if (!profile) throw { code: "unknown-provider-profile" };
      const key = secrets ? await readApiKey(secrets, profile) : undefined;
      if (signal.aborted) return undefined;
      if (profile.credentialRequirement === "api-key" && !key) throw { code: "credential-required" };
      return model.baseUrl ? { kind: "openai-compatible-local", profileId: model.profileId, baseUrl: model.baseUrl, modelId: model.modelId, timeoutMs: model.timeoutMs } :
        { kind: "remote-provider", profileId: model.profileId, modelId: model.modelId, timeoutMs: model.timeoutMs, ...(key ? { credential: { type: "api-key", value: key } } : {}) };
    };
    const outcome = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: title("extracting document candidates"), cancellable: true }, async (progress, token) => {
      const controller = new AbortController(); const subscription = token.onCancellationRequested(() => controller.abort());
      if (token.isCancellationRequested) controller.abort();
      const stages: Record<string, string> = { input: "Checking frozen input", read: "Reading captured source", conversion: "Local conversion / OCR", "provider-selection": "Selecting applied provider / model", generation: "One LLM extraction — maximum 120s (or shorter provider timeout)", validation: "Validating exact evidence" };
      progress.report({ message: "Checking sources" });
      try { return await runtime.extractDocumentCandidates!({ documents: documents.map((d) => "path" in d && /\.pdf$/iu.test(d.path) ? { ...d, pdfOcrMode } : d), onStage: stage => progress.report({ message: stages[stage] ?? "Processing source" }), generator, signal: controller.signal }); }
      finally { subscription.dispose(); }
    });
    if (outcome.status === "cancelled") return;
    if (outcome.status !== "success") {
      const action = outcome.code === "timeout" ? outcome.stage === "generation" ? "LLM extraction exceeded its 120s deadline or the shorter provider timeout. Choose a faster model or reduce the selected input; retry explicitly. Conversion limits are separate." : `The ${outcome.stage} stage exceeded its deadline. Reduce the input or check the local provider, then retry explicitly.` :
        outcome.code === "evidence-location-mismatch" ? "The model returned an excerpt with an incorrect frozen-text location. Choose a model that follows the supplied evidence slices, then retry explicitly." : "Check the selected input and provider configuration, then retry explicitly.";
      void vscode.window.showErrorMessage(`Archi Agent: Knowledge Pack build failed [${safeCode(outcome)}] at ${outcome.stage}. ${action}`); return;
    }
    await openKnowledgePackReview(new KnowledgePackReviewSession(outcome.result), scope);
  } catch (error) { void vscode.window.showErrorMessage(`Archi Agent: Knowledge Pack build failed [${safeCode(error)}].`); }
  finally { active = false; }
}

/** Capture synchronously before a project picker, conversion or provider access can yield. */
export function captureActiveSource(): DocumentInput | undefined {
  const editor = vscode.window.activeTextEditor;
  const tab = vscode.window.tabGroups?.activeTabGroup.activeTab;
  const input = tab?.input;
  const uri = (vscode.TabInputText && input instanceof vscode.TabInputText) || (vscode.TabInputCustom && input instanceof vscode.TabInputCustom) ? input.uri : undefined;
  // A custom preview may leave a different text editor visible. Never use that other editor.
  if (tab && !uri) return undefined;
  const doc = editor?.document;
  if (doc && (!uri || uri.toString() === doc.uri.toString()) && ["file", "untitled"].includes(doc.uri.scheme)) {
    const type = /\.md$/iu.test(doc.fileName) || (doc.isUntitled && doc.languageId === "markdown") ? "md" :
      /\.txt$/iu.test(doc.fileName) || (doc.isUntitled && doc.languageId === "plaintext") ? "txt" : undefined;
    if (type) return { kind: "editor-buffer", uri: doc.uri.toString(), type, content: doc.getText() };
  }
  if (uri?.scheme === "file" && /\.(pdf|docx|xlsx)$/iu.test(uri.fsPath)) return { path: uri.fsPath };
  return undefined;
}
export async function buildKnowledgePackFromActiveFileCommand(dependencies: GenerateCommandDependencies): Promise<void> {
  const source = captureActiveSource();
  if (!source) { void vscode.window.showErrorMessage("Archi Agent: activate a Markdown/TXT editor (including untitled), or a local PDF/DOCX/XLSX preview with a file URI, then run Build Knowledge Pack from Active File."); return; }
  await buildKnowledgePackCommand(dependencies, undefined, source);
}
