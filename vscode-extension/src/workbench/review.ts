import { assertProfileAvailable, profileConflict, withProfileSignal, profileLifetimeSignal } from "../profile-availability.js";
import path from "node:path";
import * as vscode from "vscode";
import { KnowledgePackReviewSession, type PackPreview } from "../../../src/runtime/index.js";
import { preparePackActivation } from "../commands/knowledge-pack-onboarding.js";
import { reviewHtml } from "./review-ui.js";
import { plainMessage } from "./webview.js";

export async function openKnowledgePackReview(session: KnowledgePackReviewSession, scope: { folder: vscode.WorkspaceFolder | undefined }): Promise<void> {
  const panel = vscode.window.createWebviewPanel("archiAgent.packReview", "Archi: Knowledge Pack Review", vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
  panel.webview.html = reviewHtml();
  let preview: PackPreview | undefined, directory = "", busy = "", closed = false, completed = false;
  const controller = new AbortController();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const safeCode = (error: unknown) => typeof (error as {code?:unknown})?.code === "string" && /^[a-z-]+$/u.test((error as {code:string}).code) ? (error as {code:string}).code : "operation-failed";
  const publish = async (notice = "", error = "") => {
    const state = await session.state();
    if (closed) return;
    await panel.webview.postMessage({ type: "state", revision: state.revision, entries: state.draft.entries, edited: state.edited,
      issues: state.validation.ok ? [] : state.validation.issues, originals: session.result.candidates,
      sources: session.result.bundle.sources.map(({text: _text, ...s}) => s), previews: preview?.documents ?? [], directory, busy, notice, error, completed,
      project: `Project: ${scope.folder ? scope.folder.name + " — " + scope.folder.uri.fsPath : "No project — User scope"}. Save and use writes ${scope.folder ? "Workspace Folder" : "User"} settings.` });
  };
  const receive = async (value: unknown) => {
    if(profileConflict()){controller.abort();panel.dispose();return;}
    if (!plainMessage(value, ["ready", "decide", "edit", "preview", "destination", "save", "save-use", "cancel"]) || closed) return;
    const m = value;
    if (m.op === "cancel") { controller.abort(); panel.dispose(); return; }
    if (m.op === "ready") { await publish(); return; }
    if (busy || completed) return;
    busy = "Working…";
    const state = await session.state();
    if (closed) return;
    if (m.revision !== state.revision) { busy = ""; await publish("Review changed. Check the current rows before retrying."); return; }
    await publish();
    if (closed) return;
    try {
      if (m.op === "decide") {
        if (!Array.isArray(m.indices) || m.indices.length > state.draft.entries.length || m.indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= state.draft.entries.length) || !["accepted", "rejected", "pending"].includes(String(m.decision))) throw { code: "invalid-selection" };
        await session.decide(m.indices, m.decision as "accepted" | "rejected" | "pending"); preview = undefined;
      } else if (m.op === "edit") {
        if (!Number.isSafeInteger(m.index) || typeof m.changes !== "object" || !m.changes || Array.isArray(m.changes) || Object.values(m.changes).some((v) => typeof v !== "string" || v.length > 8192)) throw { code: "invalid-edit" };
        await session.edit(m.index as number, m.changes as Record<string,string>); preview = undefined;
      } else if (m.op === "preview") preview = await session.prepare(controller.signal);
      else if (m.op === "destination") {
        const parent = await vscode.window.showOpenDialog({ title: "Archi Agent: choose parent folder for new pack", openLabel: "Choose parent folder", canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
        if (closed || !parent?.[0]) { busy = ""; await publish(); return; }
        if (parent[0].scheme !== "file") throw { code: "invalid-location" };
        const name = await vscode.window.showInputBox({ title: "Archi Agent: new pack folder name", ignoreFocusOut: true, prompt: "A new folder only; an existing empty folder also blocks saving.", value: "knowledge-pack",
          validateInput: (v) => !!v && v.trim() === v && v !== "." && v !== ".." && !/[\\/\x00-\x1f\x7f]/u.test(v) ? undefined : "Enter one new folder name." });
        if (closed || name === undefined) { busy = ""; await publish(); return; }
        if (!name || name.trim() !== name || name === "." || name === ".." || /[\\/\x00-\x1f\x7f]/u.test(name)) throw { code: "invalid-location" };
        const target = path.join(parent[0].fsPath, name), install = path.resolve(__dirname, "..");
        if (target === install || target.startsWith(install + path.sep)) throw { code: "invalid-location" };
        directory = target;
      } else if (m.op === "save" || m.op === "save-use") {
        if (!preview || !directory || !state.validation.ok || preview.revision !== state.revision) throw { code: "invalid-draft" };
        if (m.op === "save-use" && scope.folder && !vscode.workspace.workspaceFolders?.some((f) => f.uri.toString() === scope.folder!.uri.toString())) throw { code: "project-changed" };
        const activation = m.op === "save-use" ? await preparePackActivation(scope) : undefined;
        if (m.op === "save-use" && !activation) throw { code: "activation-unavailable" };
        await session.save(preview, directory, { signal: withProfileSignal(controller.signal) }); completed = true;
        let used = false;
        if (activation) { try { used = await activation.activate(directory); } catch { /* The committed files survive. */ } }
        busy = ""; await publish(activation && !used ? `Saved, not activated: ${directory}. Check Knowledge Pack settings.` : `Saved${used ? " and activated" : ""}: ${directory}`);
        // Release the build guard at the commit point, regardless of notification or panel closure.
        finish(); return;
      }
      busy = ""; await publish();
    } catch (error) {
      busy = "";
      const save = m.op === "save" || m.op === "save-use";
      const recovery = (error as { recovery?: unknown })?.recovery;
      const message = save ? `Save failed [${safeCode(error)}]. ${directory}. ${typeof recovery === "string" && recovery ? recovery : "Choose another new folder."}` : `Operation blocked [${safeCode(error)}]. Resolve pending decisions and validation problems before saving.`;
      if (save) directory = "";
      await publish("", message);
    }
  };
  const stop=()=>{controller.abort();panel.dispose();};
  profileLifetimeSignal.addEventListener("abort",stop,{once:true});
  const subscriptions = [{dispose:()=>profileLifetimeSignal.removeEventListener("abort",stop)},panel.webview.onDidReceiveMessage((m: unknown) => receive(m)), panel.onDidDispose(() => { closed = true; controller.abort(); subscriptions.forEach((s) => s.dispose()); finish(); })];
  await done;
}
