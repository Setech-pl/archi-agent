import * as vscode from "vscode";
import { KnowledgePackReviewSession, validateDocumentSelection, type GeneratorConfig } from "../../../src/runtime/index.js";
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
export async function buildKnowledgePackCommand({ runtime, output, secrets }: GenerateCommandDependencies, scope?: { folder: vscode.WorkspaceFolder | undefined }): Promise<void> {
  if (active) { await vscode.window.showWarningMessage("Archi Agent: a Knowledge Pack build is already active."); return; }
  active = true;
  try {
    if (!scope) {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const picked = folders.length > 1 ? await vscode.window.showQuickPick(folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })), { title: title("select project folder") }) : undefined;
      if (folders.length > 1 && !picked) return;
      scope = { folder: picked?.folder ?? folders[0] };
    }
    const uris = await vscode.window.showOpenDialog({ title: title("choose source documents"), openLabel: "Use documents", canSelectMany: true, canSelectFiles: true, canSelectFolders: false,
      filters: { Documents: ["md", "txt", "pdf", "docx", "xlsx"] } });
    if (!uris?.length) return;
    if (uris.some((u) => u.scheme !== "file")) throw { code: "invalid-document-input" };
    const documents = uris.map((u) => ({ path: u.fsPath }));
    await validateDocumentSelection(documents);
    let pdfOcrMode: "none" | "auto" | "all" = "none";
    if (documents.some((d) => /\.pdf$/iu.test(d.path))) {
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
        const selection = await selectLocalModel(runtime, output, secrets, token);
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
      progress.report({ message: "Local conversion, one extraction, evidence validation" });
      try { return await runtime.extractDocumentCandidates!({ documents: documents.map((d) => /\.pdf$/iu.test(d.path) ? { ...d, pdfOcrMode } : d), generator, signal: controller.signal }); }
      finally { subscription.dispose(); }
    });
    if (outcome.status === "cancelled") return;
    if (outcome.status !== "success") throw { code: outcome.code };
    await openKnowledgePackReview(new KnowledgePackReviewSession(outcome.result), scope);
  } catch (error) { void vscode.window.showErrorMessage(`Archi Agent: Knowledge Pack build failed [${safeCode(error)}].`); }
  finally { active = false; }
}
