import * as vscode from "vscode";
import path from "node:path";
import { inspectKnowledgePackDirectory, classifyProviderDiagnostic, defaultLocalModelBaseUrl, type ArchiAgentRuntime } from "../../../src/runtime/index.js";
import { readApiKey } from "../api-key-storage.js";
import { commandIds, settingKeys, settingsSection } from "../contributions.js";
import { readLocalModelSettings } from "../settings.js";
import { describeProviderDiagnostic } from "../user-messages.js";
import { configureKnowledgePackForFolder } from "../commands/knowledge-pack-onboarding.js";
import { setApiKey, removeApiKey } from "../commands/api-key-management.js";
import { profileSelection } from "../commands/local-provider-selection.js";
import { buildKnowledgePackCommand } from "../commands/build-knowledge-pack.js";
import { configurationHtml } from "./configuration-ui.js";
import { plainMessage } from "./webview.js";

const files = ["systems.md", "actors.md", "relationships.md", "aliases.md", "rules.md"];
const operations = ["ready", "refresh", "project", "apply", "discard", "draft-changed", "models", "diagnose", "set-key", "delete-key", "choose", "create", "build", "browse", "open-file"];
interface ProviderForm { profile: string; endpoint: string; timeout: number; model: string }
function validForm(value: unknown): value is ProviderForm {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join(",") === "endpoint,model,profile,timeout" && typeof v.profile === "string" && typeof v.endpoint === "string" &&
    typeof v.timeout === "number" && typeof v.model === "string" && v.endpoint.length < 2048 && v.model.length < 1024;
}

/** One editor panel per extension activation; no credentials enter its public state. */
export class ConfigurationWorkbench implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private initialTab: "knowledge" | "provider" = "knowledge";
  private lifetime = 0;
  private folder?: vscode.WorkspaceFolder;
  private projectSelected = false;
  private revision = 0;
  private epoch = 0;
  private disposed = false;
  private busy = "";
  private dirty = false;
  private diagnostic = "";
  private models: readonly string[] = [];
  private controller?: AbortController;
  private subscriptions: vscode.Disposable[] = [];
  constructor(private readonly runtime: ArchiAgentRuntime, private readonly output: vscode.OutputChannel, private readonly secrets: vscode.SecretStorage) {}
  open(tab: "knowledge" | "provider" = "knowledge"): void {
    if (this.panel) { this.panel.reveal(); void this.panel.webview.postMessage({ type: "tab", tab }); return; }
    this.disposed = false; this.initialTab = tab; this.lifetime++;
    const folders = vscode.workspace.workspaceFolders ?? [];
    this.folder = folders.length === 1 ? folders[0] : undefined;
    this.projectSelected = folders.length < 2;
    this.panel = vscode.window.createWebviewPanel("archiAgent.configuration", "Archi: Configuration", vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
    this.panel.webview.html = configurationHtml();
    this.subscriptions = [
      this.panel.webview.onDidReceiveMessage((message: unknown) => this.receive(message)),
      this.panel.onDidDispose(() => { this.panel = undefined; this.dispose(); }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(settingsSection)) return;
        this.invalidate(); void this.publish("Settings changed. Effective configuration has been re-read; unapplied edits are retained.");
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (this.folder && !vscode.workspace.workspaceFolders?.some((f) => f.uri.toString() === this.folder!.uri.toString())) {
          this.folder = undefined; this.projectSelected = false;
        }
        if ((vscode.workspace.workspaceFolders?.length ?? 0) > 1 && !this.folder) this.projectSelected = false;
        this.invalidate(); void this.publish("Workspace changed. Check the selected project before continuing.");
      }),
      this.secrets.onDidChange(() => { this.epoch++; this.controller?.abort(); this.diagnostic = ""; this.models = []; void this.publish(); })
    ];
    void this.panel.webview.postMessage({ type: "tab", tab });
  }
  dispose(): void {
    this.disposed = true; this.lifetime++; this.busy = ""; this.dirty = false; this.diagnostic = ""; this.models = []; this.invalidate();
    const panel = this.panel; this.panel = undefined;
    this.subscriptions.splice(0).forEach((s) => s.dispose()); panel?.dispose();
  }
  private invalidate(): void { this.revision++; this.epoch++; this.controller?.abort(); this.diagnostic = ""; this.models = []; }
  private configuration() { return vscode.workspace.getConfiguration(settingsSection, this.folder?.uri); }
  private async publish(notice = "", error = "", applied = false): Promise<void> {
    const epoch = ++this.epoch, configuration = this.configuration(), selected = readLocalModelSettings(configuration);
    const profileId = selected.ok ? selected.settings.profileId : String(configuration.inspect(settingKeys.localModelProfile)?.globalValue ?? "local-lm-studio");
    const profile = this.runtime.listProviderProfiles().find((p) => p.profileId === profileId);
    let keyPresent = false;
    const profileKeys: Record<string, boolean> = {};
    try {
      for (const entry of this.runtime.listProviderProfiles()) profileKeys[entry.profileId] = !!(await readApiKey(this.secrets, entry));
      keyPresent = profileKeys[profileId] ?? false;
    }
    catch { error ||= "SecretStorage could not be read. Retry the operation."; }
    const packPath = this.projectSelected ? configuration.get<string>(settingKeys.knowledgePackPath) ?? "" : "";
    const validation = packPath ? await inspectKnowledgePackDirectory(packPath) : undefined;
    if (this.disposed || epoch !== this.epoch) return;
    const inspected = configuration.inspect(settingKeys.knowledgePackPath);
    const source = !vscode.workspace.isTrusted ? "User settings only (untrusted workspace)" : inspected?.workspaceFolderValue !== undefined ? "Workspace Folder" : inspected?.workspaceValue !== undefined ? "Workspace" : inspected?.globalValue !== undefined ? "User" : "Default";
    const savedPath = this.folder ? inspected?.workspaceFolderValue : inspected?.globalValue;
    const form: ProviderForm = {
      profile: profileId,
      endpoint: String(configuration.inspect(settingKeys.localModelBaseUrl)?.globalValue ?? defaultLocalModelBaseUrl),
      timeout: Number(configuration.inspect(settingKeys.localModelTimeoutSeconds)?.globalValue ?? 120),
      model: selected.ok ? selected.settings.modelId ?? "" : ""
    };
    const folders = vscode.workspace.workspaceFolders ?? [];
    await this.panel?.webview.postMessage({ type: "state", revision: this.revision, applied, notice, error, busy: this.busy,
      projects: [{ id: "", label: folders.length > 1 ? "Select a project explicitly" : "No project — User scope" }, ...folders.map((f, i) => ({ id: String(i), label: `${f.name} — ${f.uri.fsPath}` }))],
      project: this.folder ? String(folders.indexOf(this.folder)) : "", projectSelected: this.projectSelected,
      scope: !this.projectSelected ? "Choose a project. Knowledge operations are disabled until a project is selected." : `Write scope: ${this.folder ? "Workspace Folder: " + this.folder.name : "User"}. Saved value in write scope: ${savedPath ?? "not set"}. Effective source: ${source}. ${!vscode.workspace.isTrusted ? "Workspace settings are restricted by Workspace Trust." : ""}`,
      packPath, validation: !this.projectSelected ? "Select the project whose knowledge you want to manage." : !validation ? "Choose or create a Knowledge Pack." : validation.ok ? "Valid — production loader passed." : `[${validation.code}] ${validation.issues.map((i) => i.message).join(" ")} Repair the five required tables or choose another valid pack.`,
      counts: validation?.ok ? validation.counts : undefined, files: validation?.ok ? files : [],
      profiles: this.runtime.listProviderProfiles(), form,
      effective: selected.ok ? `${selected.settings.profileId}\nEndpoint: ${selected.settings.baseUrl ?? "fixed HTTPS profile endpoint"}\nModel: ${selected.settings.modelId ?? "none selected"}\nTimeout: ${selected.settings.timeoutMs / 1000}s\nSelection: ${selected.settings.selectionMode}` : selected.problems.map((p) => `${p.setting}: ${p.message}`).join("\n"),
      profileKeys, keyRequired: profile?.credentialRequirement === "api-key", keyPresent, models: this.models, diagnostic: this.diagnostic });
  }
  private async receive(value: unknown): Promise<void> {
    if (!plainMessage(value, operations) || !this.panel) return;
    const m = value;
    if (m.op === "draft-changed") { if (typeof m.dirty !== "boolean") return; this.dirty = m.dirty === true; this.controller?.abort(); this.diagnostic = ""; this.models = []; this.epoch++; return; }
    if (m.op === "ready") { await this.panel.webview.postMessage({ type: "tab", tab: this.initialTab }); await this.publish(); return; }
    if (m.revision !== this.revision) { await this.publish("The project or settings changed. Review the current state and retry."); if (m.op === "apply") await this.panel?.webview.postMessage({ type: "apply-finished" }); return; }
    if (m.op === "discard") { this.dirty = false; await this.publish(); return; }
    if (this.busy) { if (m.op === "apply") await this.panel.webview.postMessage({ type: "apply-finished" }); return; }
    if (m.op === "project") {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (typeof m.project !== "string" || (m.project !== "" && !/^(0|[1-9][0-9]*)$/u.test(m.project))) return;
      const folder = m.project === "" ? undefined : folders[Number(m.project)];
      if (m.project !== "" && !folder) return;
      this.folder = folder; this.projectSelected = !!folder || folders.length < 2; this.invalidate(); await this.publish("Project changed. Provider edits are retained; Apply requires Discard after this change."); return;
    }
    const lifetime = this.lifetime;
    this.busy = m.op === "apply" ? "Applying settings…" : m.op === "models" || m.op === "diagnose" ? "Checking applied provider configuration / model listing…" : "Working…"; await this.publish();
    if (this.disposed || !this.panel || lifetime !== this.lifetime) return;
    try {
      if (m.op === "refresh") { this.invalidate(); }
      else if (m.op === "apply") await this.apply(m);
      else if (["models", "diagnose", "set-key", "delete-key"].includes(m.op)) {
        if (this.dirty && (m.op === "models" || m.op === "diagnose")) throw new Error("Apply or Discard Changes before using the applied provider configuration.");
        if (m.op === "models" || m.op === "diagnose") await this.listModels(m.op);
        else {
          const keyProfile = typeof m.profile === "string" ? this.runtime.listProviderProfiles().find(p => p.profileId === m.profile) : undefined;
          if (!keyProfile || keyProfile.credentialRequirement !== "api-key") throw new WorkbenchError("Select a registered cloud profile for the key operation.");
          if (m.op === "set-key") await setApiKey(this.runtime, this.secrets, this.output, keyProfile.profileId);
          else await removeApiKey(this.runtime, this.secrets, this.output, keyProfile.profileId);
          this.epoch++; this.diagnostic = ""; this.models = [];
        }
      } else if (["choose", "create", "build", "browse", "open-file"].includes(m.op)) {
        if (!this.projectSelected || (this.folder && !vscode.workspace.workspaceFolders?.includes(this.folder))) throw new Error("Select a current local project first.");
        if (this.folder?.uri.scheme && this.folder.uri.scheme !== "file") throw new Error("Choose a local project folder.");
        if (m.op === "choose" || m.op === "create") await configureKnowledgePackForFolder(this.folder, m.op === "choose" ? "existing" : "create");
        else if (m.op === "browse") await vscode.commands.executeCommand(commandIds.knowledgeBrowser);
        else if (m.op === "build") await buildKnowledgePackCommand({ runtime: this.runtime, output: this.output, secrets: this.secrets }, { folder: this.folder });
        else if (typeof m.file === "string" && files.includes(m.file)) {
          const pack = this.configuration().get<string>(settingKeys.knowledgePackPath);
          if (!pack || !(await inspectKnowledgePackDirectory(pack)).ok) throw new Error("Validate the active pack before opening its files.");
          await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(pack, m.file))), { preview: false });
        }
      }
      if (lifetime !== this.lifetime) return;
      this.busy = ""; await this.publish("", "", m.op === "apply");
    } catch (error) {
      if (lifetime !== this.lifetime) return;
      this.busy = "";
      // Only our fixed operation messages may be shown; provider/source exceptions are untrusted.
      const message = error instanceof WorkbenchError ? error.message : error instanceof Error && ["Apply or Discard Changes before using the applied provider configuration.", "Select a current local project first.", "Choose a local project folder.", "Validate the active pack before opening its files."].includes(error.message) ? error.message : "Operation failed. Current settings have been re-read; check them before retrying.";
      await this.publish("", message);
    } finally {
      if (m.op === "apply" && lifetime === this.lifetime) await this.panel?.webview.postMessage({ type: "apply-finished" });
    }
  }
  private async apply(m: Record<string, unknown>): Promise<void> {
    if (!validForm(m.form) || m.baseRevision !== this.revision) throw new WorkbenchError("Settings changed since editing began. Discard Changes and re-enter the intended values.");
    const f = m.form;
    const values: Record<string, unknown> = { [settingKeys.localModelProfile]: f.profile, [settingKeys.localModelBaseUrl]: f.endpoint,
      [settingKeys.localModelTimeoutSeconds]: f.timeout, [settingKeys.localModelSelectedModel]: f.model, [settingKeys.localModelSelectedModelProfile]: f.profile };
    const valid = readLocalModelSettings({ get: (key) => values[key], inspect: (key) => ({ globalValue: values[key] }) });
    if (!valid.ok) throw new WorkbenchError(valid.problems.map((p) => `${p.setting}: ${p.message}`).join("\n"));
    this.invalidate();
    const configuration = vscode.workspace.getConfiguration(settingsSection);
    // Existing fail-closed model binding order; multiple VS Code updates are not atomic.
    await configuration.update(settingKeys.localModelSelectedModel, undefined, vscode.ConfigurationTarget.Global);
    await configuration.update(settingKeys.localModelSelectedModelProfile, undefined, vscode.ConfigurationTarget.Global);
    await configuration.update(settingKeys.localModelProfile, f.profile, vscode.ConfigurationTarget.Global);
    if (f.profile === "local-lm-studio") await configuration.update(settingKeys.localModelBaseUrl, f.endpoint, vscode.ConfigurationTarget.Global);
    await configuration.update(settingKeys.localModelTimeoutSeconds, f.timeout, vscode.ConfigurationTarget.Global);
    if (f.model) {
      await configuration.update(settingKeys.localModelSelectedModel, f.model, vscode.ConfigurationTarget.Global);
      await configuration.update(settingKeys.localModelSelectedModelProfile, f.profile, vscode.ConfigurationTarget.Global);
    }
    this.dirty = false;
  }
  private async listModels(operation: "models" | "diagnose"): Promise<void> {
    const settings = readLocalModelSettings(this.configuration());
    if (!settings.ok) throw new WorkbenchError(settings.problems.map((p) => p.message).join(" "));
    const selected = settings.settings, profile = this.runtime.listProviderProfiles().find((p) => p.profileId === selected.profileId);
    if (!profile) throw new WorkbenchError("The selected provider is not registered.");
    const epoch = this.epoch, revision = this.revision;
    const controller = new AbortController(); this.controller = controller;
    let key: string | undefined, failure: string | undefined;
    try { key = await readApiKey(this.secrets, profile); }
    catch { failure = "secret-storage-read-failed"; }
    if (controller.signal.aborted || revision !== this.revision || epoch !== this.epoch || this.disposed) return;
    if (!failure && profile.credentialRequirement === "api-key" && !key) failure = "credential-required";
    const result = failure ? { ok: false as const, code: failure } : await this.runtime.listProviderModels(profileSelection(selected, key), { signal: controller.signal });
    if (controller.signal.aborted || revision !== this.revision || epoch !== this.epoch || this.disposed) return;
    if (result.ok && operation === "models") this.models = result.models;
    const message = describeProviderDiagnostic(classifyProviderDiagnostic({ profileId: profile.profileId, operation: "listing", credentialRequired: profile.credentialRequirement === "api-key",
      outcome: result.ok ? "success" : result.code === "cancelled" ? "cancelled" : "failure", ...(result.ok ? {} : { code: result.code }),
      modelSelected: selected.modelId !== undefined, selectedModelListed: result.ok && selected.modelId !== undefined && result.models.includes(selected.modelId) }));
    this.diagnostic = [message.text, ...message.details].join("\n");
    this.output.appendLine(message.text);
    for (const detail of message.details) this.output.appendLine(`  ${detail}`);
    this.controller = undefined;
  }
}
class WorkbenchError extends Error {}
