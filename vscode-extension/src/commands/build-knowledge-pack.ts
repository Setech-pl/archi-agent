import path from "node:path";
import * as vscode from "vscode";
import { KnowledgePackReviewSession, validateDocumentSelection, type PackReviewState, type PackPreview, type GeneratorConfig, type KnowledgePackCandidate } from "../../../src/runtime/index.js";
import { settingsSection } from "../contributions.js";
import { readLocalModelSettings } from "../settings.js";
import { readApiKey } from "../api-key-storage.js";
import { selectLocalModel } from "./local-provider-selection.js";
import { preparePackActivation } from "./knowledge-pack-onboarding.js";
import type { GenerateCommandDependencies } from "./generate-sequence-diagram.js";

let active = false;
const title = (step: string) => `Archi Agent: ${step}`;
const text = async (content: string, language = "plaintext") => {
  const document = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(document, { preview: false });
};
const summary = (c: KnowledgePackCandidate) => Object.entries(c.row).map(([k, v]) => `${k}: ${v}`).join("; ");
const actions = ["Show review details", "Accept selected", "Accept all pending", "Reject selected", "Reject remaining pending", "Return selected to pending", "Edit candidate", "Validate and preview", "Cancel"];
async function review(session: KnowledgePackReviewSession): Promise<PackPreview | undefined> {
  for (;;) {
    const state = await session.state();
    const pending = state.draft.entries.filter((e) => e.decision === "pending").length;
    const selected = await vscode.window.showQuickPick(actions, { title: title("review Knowledge Pack candidates"),
      placeHolder: `${pending} pending. Technical validation does not establish truth. Review evidence before accepting.` });
    if (!selected || selected === "Cancel") return undefined;
    if (selected === "Show review details") {
      await text(JSON.stringify({ semanticAcceptance: "User review required; technical validation does not confirm semantic truth", sources: session.result.bundle.sources.map(({ text: _text, ...s }) => s),
        candidates: state.draft.entries.map((e, i) => ({ number: i + 1, ...e, editedByUser: state.edited[i], original: session.result.candidates[i] })),
        validation: state.validation }, null, 2));
      continue;
    }
    if (selected === "Validate and preview") {
      if (!state.validation.ok) {
        await text(JSON.stringify(state.validation.issues, null, 2));
        await vscode.window.showErrorMessage("Archi Agent: resolve pending decisions and the displayed validation problems before saving.");
        continue;
      }
      try { return await session.prepare(); }
      catch (error) { await vscode.window.showErrorMessage(`Archi Agent: preview blocked [${safeCode(error)}].`); continue; }
    }
    if (selected === "Accept all pending" || selected === "Reject remaining pending") {
      await session.decide(state.draft.entries.flatMap((e, i) => e.decision === "pending" ? [i] : []), selected === "Accept all pending" ? "accepted" : "rejected");
      continue;
    }
    const items = state.draft.entries.map((e, i) => ({ label: `${i + 1}. ${e.candidate.table}: ${summary(e.candidate)}`,
      description: `${e.decision} · ${e.candidate.basis}${state.edited[i] ? " · edited by user" : ""}`,
      detail: e.candidate.evidence.map((v) => `${v.sourceId} lines ${v.location?.startLine}-${v.location?.endLine}: ${v.excerpt}`).join("; ") +
        " · " + session.result.bundle.sources.flatMap((s) => s.conversion.warnings).join(", "), index: i }));
    if (selected === "Edit candidate") {
      const candidate = await vscode.window.showQuickPick(items, { title: title("edit candidate"), matchOnDescription: true, matchOnDetail: true });
      if (candidate) await edit(session, state, candidate.index);
      continue;
    }
    const chosen = await vscode.window.showQuickPick(items, { title: title(selected.toLowerCase()), canPickMany: true, matchOnDescription: true, matchOnDetail: true,
      placeHolder: "Select a group explicitly. No dependent entity will be accepted automatically." });
    if (chosen) await session.decide(chosen.map((v) => v.index), selected === "Accept selected" ? "accepted" : selected === "Reject selected" ? "rejected" : "pending");
  }
}
async function edit(session: KnowledgePackReviewSession, state: PackReviewState, index: number): Promise<void> {
  const c = state.draft.entries[index]!.candidate;
  const field = await vscode.window.showQuickPick(Object.keys(c.row).filter((k) => k !== "id"), { title: title("candidate field"), placeHolder: "Evidence, IDs and explicit/inferred basis cannot be edited." });
  if (!field) return;
  let value: string | undefined;
  if (["from_id", "to_id", "target_id"].includes(field)) {
    const entity = await vscode.window.showQuickPick(state.draft.entries.flatMap((e) => e.candidate.table === "systems" || e.candidate.table === "actors" ?
      [{ label: e.candidate.row.canonical_name, description: e.decision, id: e.candidate.row.id }] : []), { title: title("candidate reference") });
    value = entity?.id;
  } else {
    value = await vscode.window.showInputBox({ title: title(`edit ${field}`), value: (c.row as unknown as Record<string, string>)[field],
      prompt: "Change the proposed row only. The original evidence and inferred basis are preserved.", ignoreFocusOut: true });
  }
  if (value === undefined) return;
  try { const updated = await session.edit(index, { [field]: value });
    if (!updated.validation.ok) await text(JSON.stringify(updated.validation.issues, null, 2));
  } catch (error) { await vscode.window.showErrorMessage(`Archi Agent: edit rejected [${safeCode(error)}].`); }
}
function safeCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^[a-z-]+$/u.test(code) ? code : "operation-failed";
}
/** Native pickers + QuickPick + untitled previews. No drafts, autosave or additional generation. */
export async function buildKnowledgePackCommand({ runtime, output, secrets }: GenerateCommandDependencies): Promise<void> {
  if (active) { await vscode.window.showWarningMessage("Archi Agent: a Knowledge Pack build is already active."); return; }
  active = true;
  try {
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
      let settings = readLocalModelSettings(vscode.workspace.getConfiguration(settingsSection));
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
    const session = new KnowledgePackReviewSession(outcome.result);
    for (;;) {
      const preview = await review(session);
      if (!preview) return;
      const parent = await vscode.window.showOpenDialog({ title: title("choose parent folder for new pack"), openLabel: "Choose parent folder", canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (!parent?.[0]) return;
      if (parent[0].scheme !== "file") throw { code: "invalid-location" };
      const name = await vscode.window.showInputBox({ title: title("new pack folder name"), prompt: "A new folder only; an existing empty folder also blocks saving.", value: "knowledge-pack",
        validateInput: (v) => v.trim() === v && !!v && v !== "." && v !== ".." && !/[\\/\x00-\x1f\x7f]/u.test(v) ? undefined : "Enter one new folder name." });
      if (name === undefined) return;
      const directory = path.join(parent[0].fsPath, name);
      // Never allow a destination inside the installation tree.
      const install = path.resolve(__dirname, "..");
      if (directory === install || directory.startsWith(install + path.sep)) throw { code: "invalid-location" };
      let restart = false;
      for (;;) {
        const picked = await vscode.window.showQuickPick(["Show summary and additions", ...preview.documents.map((d) => d.file), "Save", "Save and use", "Back to review", "Cancel"],
          { title: title("preview new Knowledge Pack"), placeHolder: `${directory} · ${preview.accepted} accepted, ${preview.rejected} rejected · five new files` });
        if (!picked || picked === "Cancel") return;
        if (picked === "Back to review") { restart = true; break; }
        if (picked === "Show summary and additions") {
          await text(`${directory}\n${preview.accepted} accepted, ${preview.rejected} rejected\nNew pack: all five files are additions. No existing pack is changed.\nTechnical validation is not semantic proof.\n` +
            JSON.stringify(outcome.result.bundle.sources.map(({ text: _text, ...s }) => s), null, 2) + "\n\n" + preview.documents.map((d) => `+++ ${path.join(directory, d.file)}\n` + d.text.split("\n").map((line) => `+${line}`).join("\n")).join("\n")); continue;
        }
        const file = preview.documents.find((d) => d.file === picked);
        if (file) { await text(file.text, "markdown"); continue; }
        const activation = picked === "Save and use" ? await preparePackActivation() : undefined;
        if (picked === "Save and use" && !activation) continue;
        try {
          await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: title("saving new Knowledge Pack"), cancellable: true }, async (_progress, token) => {
            const controller = new AbortController(); const subscription = token.onCancellationRequested(() => controller.abort());
            if (token.isCancellationRequested) controller.abort();
            try { await session.save(preview, directory, { signal: controller.signal }); }
            finally { subscription.dispose(); }
          });
        } catch (error) { await vscode.window.showErrorMessage(`Archi Agent: save failed [${safeCode(error)}]. ${directory}. ${(error as { recovery?: string }).recovery || "Choose another new folder."}`); restart = true; break; }
        let used = false;
        if (activation) { try { used = await activation.activate(directory); } catch { /* Preserve the committed pack. */ } }
        void vscode.window.showInformationMessage(activation && !used ? `Archi Agent: saved, not activated: ${directory}. Check Knowledge Pack settings.` : `Archi Agent: saved${used ? " and activated" : ""}: ${directory}`);
        return;
      }
      if (!restart) return;
    }
  } catch (error) { void vscode.window.showErrorMessage(`Archi Agent: Knowledge Pack build failed [${safeCode(error)}].`); }
  finally { active = false; }
}
