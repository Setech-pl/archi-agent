import { configuredArchitectureSource } from "../settings.js";
import { inspectArchitectureSource } from "../../../src/runtime/index.js";
import path from "node:path";
import * as vscode from "vscode";
import { cleanupStarterKnowledgePack, createStarterKnowledgePack, defaultKnowledgePackPath, StarterPackCreateError, validateKnowledgePackDirectory, type FirstSystem, type StarterPackReceipt } from "../../../src/runtime/index.js";
import { settingKeys, settingsSection } from "../contributions.js";

type PackChoice = "create" | "existing" | "cancel" | "settings";
type PackOutcome = { readonly status: "ready"; readonly resource?: vscode.Uri } | { readonly status: "cancelled" | "failed" };

const createReasons = {
  "invalid-location": "The location is not a valid absolute directory path.",
  "location-exists": "The destination is not empty or a pack file already exists.",
  "symbolic-link": "A directory in the path is a symbolic link.",
  "permission-denied": "The editor cannot write to this location.",
  "storage-full": "There is not enough storage space for the Knowledge Pack.",
  "file-changed": "A new pack file changed during creation.",
  "cancelled": "The operation was cancelled.",
  "write-failed": "The Knowledge Pack could not be written at this location."
} as const;

function validationReason(code: string, loaderMessage?: string): string {
  // Loader messages are fixed, safe strings; they contain no pack content or local paths.
  if (loaderMessage !== undefined) return loaderMessage;
  if (code === "missing-file") return "The directory or one of the five required pack files is missing.";
  if (code === "invalid-path") return "The location is not a safe local Knowledge Pack directory.";
  if (code === "read-failed") return "The Knowledge Pack could not be read.";
  if (code === "invalid-value") return "A Knowledge Pack file contains an invalid value.";
  return "The Knowledge Pack did not pass validation.";
}

interface ConfigurationSnapshot {
  readonly present: boolean;
  readonly value: unknown;
  readonly effective: unknown;
  readonly architectureSource: string;
}

const activeOperations = new Map<string, Promise<void>>();

async function serialForResource<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = activeOperations.get(key) ?? Promise.resolve();
  let release!: () => void;
  const finished = new Promise<void>((resolve) => { release = resolve; });
  activeOperations.set(key, finished);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (activeOperations.get(key) === finished) activeOperations.delete(key);
  }
}

function scopedValue(configuration: vscode.WorkspaceConfiguration, target: vscode.ConfigurationTarget): unknown {
  const inspected = configuration.inspect(settingKeys.knowledgePackPath);
  return target === vscode.ConfigurationTarget.Global ? inspected?.globalValue : inspected?.workspaceFolderValue;
}

function snapshot(configuration: vscode.WorkspaceConfiguration, target: vscode.ConfigurationTarget): ConfigurationSnapshot {
  const value = scopedValue(configuration, target);
  return { present: value !== undefined, value, effective: configuration.get(settingKeys.knowledgePackPath), architectureSource: JSON.stringify(configuration.get(settingKeys.architectureSource) ?? null) };
}

function matches(configuration: vscode.WorkspaceConfiguration, target: vscode.ConfigurationTarget,
  expected: ConfigurationSnapshot): boolean {
  const current = snapshot(configuration, target);
  return current.present === expected.present && Object.is(current.value, expected.value) &&
    Object.is(current.effective, expected.effective) && current.architectureSource === expected.architectureSource;
}

async function configurationConflict(receipt?: StarterPackReceipt, configuration?: vscode.WorkspaceConfiguration): Promise<PackOutcome> {
  let recovery = "";
  if (receipt !== undefined && configuration?.get(settingKeys.knowledgePackPath) !== receipt.directory)
    recovery = (await cleanupStarterKnowledgePack(receipt)).recovery;
  await vscode.window.showErrorMessage(`Archi Agent: [settings-conflict] The Knowledge Pack setting changed while the wizard was open. Run Configure Knowledge Pack again.${recovery ? ` ${recovery}` : ""}`);
  return { status: "failed" };
}

async function firstSystem(): Promise<FirstSystem | undefined> {
  const id = await vscode.window.showInputBox({ title: "Archi Agent: first system identifier", prompt: "Lowercase letters, digits and hyphens; start with a letter.",
    ignoreFocusOut: true, validateInput: (value) => /^[a-z][a-z0-9-]{0,63}$/u.test(value) ? undefined : "Enter a valid system identifier." });
  if (id === undefined) return undefined;
  const canonicalName = await vscode.window.showInputBox({ title: "Archi Agent: first system name", prompt: "Name of a real system in this project.",
    ignoreFocusOut: true, validateInput: (value) => value.trim() !== "" && value.length <= 256 ? undefined : "Enter a system name (up to 256 characters)." });
  if (canonicalName === undefined) return undefined;
  const kinds = ["system", "service", "database", "queue", "external"] as const;
  const picked = await vscode.window.showQuickPick(kinds.map((kind) => ({ label: kind, systemKind: kind })),
    { title: "Archi Agent: first system kind", placeHolder: "Choose the actual kind" });
  if (picked === undefined) return undefined;
  const description = await vscode.window.showInputBox({ title: "Archi Agent: first system description", prompt: "Describe what this system does.",
    ignoreFocusOut: true, validateInput: (value) => value.trim() !== "" && value.length <= 2000 ? undefined : "Enter a description (up to 2000 characters)." });
  if (description === undefined) return undefined;
  return { id, canonicalName: canonicalName.trim(), kind: picked.systemKind, description: description.trim() };
}

async function selectedFolder(): Promise<vscode.WorkspaceFolder | undefined | "cancelled"> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length < 2) return folders[0];
  const picked = await vscode.window.showQuickPick(folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: "Archi Agent: select project folder", placeHolder: "Choose which project owns the Knowledge Pack" });
  return picked?.folder ?? "cancelled";
}

async function storePath(configuration: vscode.WorkspaceConfiguration, target: vscode.ConfigurationTarget,
  before: ConfigurationSnapshot, directory: string, resource?: vscode.Uri, receipt?: StarterPackReceipt): Promise<PackOutcome> {
  // This narrows the race, but VS Code Configuration.update has no compare-and-swap operation.
  if (!matches(configuration, target, before)) return configurationConflict(receipt, configuration);
  try {
    await configuration.update(settingKeys.knowledgePackPath, directory, target);
    if (scopedValue(configuration, target) !== directory || JSON.stringify(configuration.get(settingKeys.architectureSource) ?? null) !== before.architectureSource) return configurationConflict(receipt, configuration);
    if (before.architectureSource !== "null") {
      await configuration.update(settingKeys.architectureSource, null, target);
      const active = configuredArchitectureSource(configuration);
      if (active.kind !== "local-directory" || active.path !== directory) return configurationConflict(receipt, configuration);
    }
    return { status: "ready", ...(resource === undefined ? {} : { resource }) };
  } catch {
    // A rejected update may already have applied. An unconditional rollback could overwrite an
    // external change between inspection and update, so leave the current setting untouched.
    const recovery = receipt !== undefined && configuration.get(settingKeys.knowledgePackPath) !== directory ?
      (await cleanupStarterKnowledgePack(receipt)).recovery : "";
    await vscode.window.showErrorMessage(`Archi Agent: [settings-write-failed] The Knowledge Pack path could not be confirmed. The current setting was left untouched; check it before retrying.${recovery ? ` ${recovery}` : ""}`);
    return { status: "failed" };
  }
}

/** The same local wizard serves Generate Diagram and explicit configuration. */
export async function ensureKnowledgePack(explicit = false): Promise<PackOutcome> {
  const folder = await selectedFolder();
  if (folder === "cancelled") return { status: "cancelled" };
  return serialForResource(folder === undefined ? "global" : `folder:${folder.uri.fsPath}`,
    () => ensureKnowledgePackForFolder(folder, explicit));
}

async function ensureKnowledgePackForFolder(folder: vscode.WorkspaceFolder | undefined, explicit: boolean, directChoice?: "existing" | "create"): Promise<PackOutcome> {
  if (folder !== undefined && folder.uri.scheme !== "file") {
    await vscode.window.showErrorMessage("Archi Agent: choose a local project folder for the Knowledge Pack.");
    return { status: "failed" };
  }
  const configuration = vscode.workspace.getConfiguration(settingsSection, folder?.uri);
  const target = folder === undefined ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.WorkspaceFolder;
  const before = snapshot(configuration, target);
  if (!explicit && configuration.get(settingKeys.architectureSource) != null) {
    try {
      const validation = await inspectArchitectureSource(configuredArchitectureSource(configuration));
      if (!validation.ok) { await vscode.window.showErrorMessage(`Archi Agent: [${validation.code}] Architecture source is invalid. Check Configuration / Source Settings.`); return { status: "failed" }; }
      if (!matches(configuration, target, before)) return configurationConflict();
      return {status:"ready", ...(folder ? {resource:folder.uri} : {})};
    } catch { await vscode.window.showErrorMessage("Archi Agent: [architecture-source-invalid] Check Source Settings."); return {status:"failed"}; }
  }
  const configured = configuration.get<string>(settingKeys.knowledgePackPath)?.trim();
  let invalidCode: string | undefined;
  let invalidReason: string | undefined;
  if (configured) {
    const validation = await validateKnowledgePackDirectory(configured);
    if (validation.ok && !explicit) {
      if (!matches(configuration, target, before)) return configurationConflict();
      return { status: "ready", ...(folder === undefined ? {} : { resource: folder.uri }) };
    }
    if (!validation.ok) {
      invalidCode = validation.code;
      invalidReason = validationReason(validation.code, validation.issues[0]?.message);
    }
  }

  let choice: PackChoice | undefined;
  if (directChoice) {
    choice = directChoice;
  } else if (invalidCode !== undefined) {
    const action = await vscode.window.showErrorMessage(`Archi Agent: [${invalidCode}] ${invalidReason} Repair the current pack or choose a valid one.`,
      "Open Settings", "Create Knowledge Pack", "Choose Existing", "Cancel");
    if (action === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", `${settingsSection}.${settingKeys.knowledgePackPath}`);
      return { status: "cancelled" };
    }
    choice = action === "Create Knowledge Pack" ? "create" : action === "Choose Existing" ? "existing" : "cancel";
  } else {
    const picked = await vscode.window.showQuickPick([
      { label: "Create Knowledge Pack", id: "create" as PackChoice },
      { label: "Choose Existing", id: "existing" as PackChoice },
      { label: "Cancel", id: "cancel" as PackChoice }
    ], { title: "Archi Agent: Knowledge Pack", placeHolder: "Choose how to provide architecture knowledge" });
    choice = picked?.id;
  }
  if (choice === undefined || choice === "cancel") return { status: "cancelled" };
  if (!matches(configuration, target, before)) return configurationConflict();

  let directory: string;
  let receipt: StarterPackReceipt | undefined;
  if (choice === "existing") {
    const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
      openLabel: "Use Knowledge Pack", title: "Archi Agent: choose an existing Knowledge Pack" });
    if (selected?.[0] === undefined) return { status: "cancelled" };
    if (selected[0].scheme !== "file") {
      await vscode.window.showErrorMessage("Archi Agent: the Knowledge Pack must be a local directory.");
      return { status: "failed" };
    }
    directory = selected[0].fsPath;
    if (!matches(configuration, target, before)) return configurationConflict();
  } else {
    let proposed = defaultKnowledgePackPath(folder?.uri.fsPath);
    let system: FirstSystem | undefined;
    while (true) {
      const parent = directChoice ? await vscode.window.showOpenDialog({ title: "Archi Agent: choose parent folder for new pack", canSelectFolders: true, canSelectFiles: false, canSelectMany: false }) : undefined;
      if (directChoice && (!parent?.[0] || parent[0].scheme !== "file")) return { status: "cancelled" };
      const entered = await vscode.window.showInputBox(directChoice ? { title: "Archi Agent: new pack folder name", ignoreFocusOut: true, value: "knowledge-pack",
        validateInput: (value) => !!value && value.trim() === value && value !== "." && value !== ".." && !/[\\/\x00-\x1f\x7f]/u.test(value) ? undefined : "Enter one new folder name." } : { title: "Archi Agent: new Knowledge Pack location",
        prompt: "Review or change the absolute destination before entering the first system.", value: proposed,
        ignoreFocusOut: true, validateInput: (value) => path.isAbsolute(value.trim()) ? undefined : "Enter an absolute directory path." });
      if (entered === undefined) return { status: "cancelled" };
      if (directChoice && (!entered || entered.trim() !== entered || entered === "." || entered === ".." || /[\\/\x00-\x1f\x7f]/u.test(entered))) return { status: "failed" };
      directory = directChoice ? path.join(parent![0]!.fsPath, entered) : entered.trim();
      proposed = directory;
      system ??= await firstSystem();
      if (system === undefined) return { status: "cancelled" };
      if (!matches(configuration, target, before)) return configurationConflict();
      try {
        receipt = await createStarterKnowledgePack(directory, system);
        break;
      } catch (error) {
        const code = error instanceof StarterPackCreateError ? error.code : "write-failed";
        const recovery = error instanceof StarterPackCreateError && error.recovery !== "" ? error.recovery : "Choose another location and try again.";
        const action = await vscode.window.showErrorMessage(`Archi Agent: [${code}] ${createReasons[code]} ${recovery}`,
          "Choose Another Location", "Cancel");
        if (action !== "Choose Another Location") return { status: "failed" };
      }
    }
  }

  const validation = await validateKnowledgePackDirectory(directory);
  if (!validation.ok) {
    const recovery = receipt === undefined ? "" : (await cleanupStarterKnowledgePack(receipt)).recovery;
    await vscode.window.showErrorMessage(`Archi Agent: [${validation.code}] ${validationReason(validation.code, validation.issues[0]?.message)} Repair it or run Configure Knowledge Pack to choose another location.${recovery ? ` ${recovery}` : ""}`);
    return { status: "failed" };
  }
  return storePath(configuration, target, before, directory, folder?.uri, receipt);
}

export async function configureKnowledgePack(): Promise<void> {
  await ensureKnowledgePack(true);
}

/** Direct workbench action, with the project already explicitly selected by its screen. */
export async function configureKnowledgePackForFolder(folder: vscode.WorkspaceFolder | undefined, choice: "existing" | "create"): Promise<PackOutcome> {
  return serialForResource(folder ? `folder:${folder.uri.fsPath}` : "global", () => ensureKnowledgePackForFolder(folder, true, choice));
}

/** Reuse UX3 scope selection, serialization and guarded update without a cleanup receipt. */
export async function preparePackActivation(scope?: { folder: vscode.WorkspaceFolder | undefined }): Promise<{ activate(directory: string): Promise<boolean> } | undefined> {
  const folder = scope ? scope.folder : await selectedFolder();
  if (folder === "cancelled" || (folder && folder.uri.scheme !== "file")) return undefined;
  const configuration = vscode.workspace.getConfiguration(settingsSection, folder?.uri);
  const target = folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Global;
  const before = snapshot(configuration, target);
  return { activate: (directory) => serialForResource(folder ? `folder:${folder.uri.fsPath}` : "global", async () => {
    const valid = await validateKnowledgePackDirectory(directory);
    if (!valid.ok) return false;
    return (await storePath(configuration, target, before, directory, folder?.uri)).status === "ready";
  }) };
}
