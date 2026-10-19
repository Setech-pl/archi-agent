import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStarterKnowledgePack, defaultKnowledgePackPath } from "../../src/runtime/index.js";
import { configureKnowledgePack, ensureKnowledgePack } from "../../vscode-extension/src/commands/knowledge-pack-onboarding.js";
import { generateDiagramCommand, generateSequenceDiagramCommand } from "../../vscode-extension/src/commands/generate-sequence-diagram.js";
import { settingKeys } from "../../vscode-extension/src/contributions.js";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import { ConfigurationTarget, makeDocument, resetDouble, state, Uri, window, workspace } from "../doubles/vscode-module-double.js";

const roots: string[] = [];
const system = { id: "order-service", canonicalName: "Order Service", kind: "service" as const, description: "Handles orders" };
function root(): string { const value = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-ux3-ui-"))); roots.push(value); return value; }
function folder(name = "project") {
  const location = root();
  return { name, uri: Uri.file(location), index: 0 };
}
const choose = (id: string) => (items: readonly unknown[]) => items.find((item) => (item as { id?: string }).id === id);
const chooseLabel = (label: string) => (items: readonly unknown[]) => items.find((item) => (item as { label?: string }).label === label);
function answerSystem(location = defaultKnowledgePackPath(state.workspaceFolders?.[0]?.uri.fsPath)) {
  state.quickPickAnswers.push(choose("create"), chooseLabel("service"));
  state.inputBoxAnswers.push(location, system.id, system.canonicalName, system.description);
}
beforeEach(resetDouble);
afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }); });

describe("Knowledge Pack onboarding", () => {
  it("uses configured Structurizr without a standalone pack and activates K3 packs explicitly",async()=>{
    const project=folder();state.workspaceFolders=[project];const fixture=path.join(project.uri.fsPath,"fixture");cpSync("test/fixtures/structurizr/big-bank-plc",fixture,{recursive:true});
    const config={kind:"structurizr-json",sourceId:"big-bank",modelPath:path.join(fixture,"workspace.json"),overlayPath:path.join(fixture,"overlay")};
    state.configuration.set("archiAgent.architectureSource",config);
    expect((await ensureKnowledgePack()).status).toBe("ready");expect(state.quickPicks).toEqual([]);
    const {preparePackActivation}=await import("../../vscode-extension/src/commands/knowledge-pack-onboarding.js");
    const destination=path.join(project.uri.fsPath,"new-pack");await createStarterKnowledgePack(destination,system);
    const activation=await preparePackActivation();expect(await activation!.activate(destination)).toBe(true);
    expect(workspace.getConfiguration("archiAgent",project.uri).get("architectureSource")).toBeNull();
  });

  it("uses project and Documents defaults without resolving against the process directory", () => {
    expect(defaultKnowledgePackPath("/projects/p", "/home/owner")).toBe(path.join("/projects/p", ".archi-agent", "knowledge"));
    expect(defaultKnowledgePackPath(undefined, "/home/owner")).toBe(path.join("/home/owner", "Documents", "ArchiAgent", "knowledge"));
  });

  it("preserves an explicit path and performs no onboarding write", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const existing = path.join(root(), "pack");
    await createStarterKnowledgePack(existing, system);
    state.configuration.set(`archiAgent.${settingKeys.knowledgePackPath}`, existing);
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(state.quickPicks).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("explicit configuration opens the wizard for a valid pack and Cancel keeps it", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const existing = path.join(root(), "valid-pack");
    await createStarterKnowledgePack(existing, system);
    state.configuration.set(`archiAgent.${settingKeys.knowledgePackPath}`, existing);
    state.quickPickAnswers.push(choose("cancel"));
    await configureKnowledgePack();
    expect(state.quickPicks[0]?.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "create" }),
      expect.objectContaining({ id: "existing" })]));
    expect(state.configurationUpdates).toEqual([]);
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe(existing);
  });

  it("explicit configuration can replace a valid pack by choosing another validated pack", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const first = path.join(root(), "first"); const second = path.join(root(), "second");
    await createStarterKnowledgePack(first, system); await createStarterKnowledgePack(second, system);
    state.configuration.set(`archiAgent.${settingKeys.knowledgePackPath}`, first);
    state.quickPickAnswers.push(choose("existing")); state.openDialogAnswers.push([Uri.file(second)]);
    expect((await ensureKnowledgePack(true)).status).toBe("ready");
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe(second);
    expect(existsSync(path.join(first, "systems.md"))).toBe(true);
  });

  it("Generate Diagram offers repair actions for an empty configured directory before model or secrets", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const empty = path.join(root(), "empty"); mkdirSync(empty);
    state.configuration.set(`archiAgent.${settingKeys.knowledgePackPath}`, empty);
    state.quickPickAnswers.push(choose("sequence"));
    await generateDiagramCommand({ runtime: createArchiAgentRuntime(), output: window.createOutputChannel("test") });
    expect(state.messages[0]).toMatchObject({ level: "error", actions: ["Open Settings", "Create Knowledge Pack", "Choose Existing", "Cancel"] });
    expect(state.messages[0]?.text).toContain("[missing-file]");
    expect(state.secretReads).toEqual([]);
    expect(state.progressTitles).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("Generate Diagram uses the same Create wizard to repair an empty configured directory", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const empty = path.join(root(), "empty"); mkdirSync(empty);
    state.configuration.set(`archiAgent.${settingKeys.knowledgePackPath}`, empty);
    const replacement = path.join(project.uri.fsPath, "replacement");
    state.quickPickAnswers.push(choose("sequence"), chooseLabel("service"));
    state.messageAnswers.push("Create Knowledge Pack");
    state.inputBoxAnswers.push(replacement, system.id, system.canonicalName, system.description);
    await generateDiagramCommand({ runtime: createArchiAgentRuntime(), output: window.createOutputChannel("test") });
    expect(state.configurationUpdates[0]?.value).toBe(replacement);
    expect(existsSync(path.join(replacement, "systems.md"))).toBe(true);
    expect(existsSync(empty)).toBe(true);
    expect(state.secretReads).toEqual([]);
    expect(state.progressTitles).toEqual([]);
  });

  it("proposes Documents without a workspace and allows cancellation before file creation", async () => {
    state.quickPickAnswers.push(choose("create"));
    expect((await ensureKnowledgePack()).status).toBe("cancelled");
    expect(state.inputBoxes[0]).toMatchObject({ value: defaultKnowledgePackPath(undefined) });
    expect(state.configurationUpdates).toEqual([]);
  });

  it("lets Create use an existing empty destination", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const initial = defaultKnowledgePackPath(project.uri.fsPath); mkdirSync(initial, { recursive: true });
    answerSystem(initial);
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(existsSync(path.join(initial, "systems.md"))).toBe(true);
    expect(state.messages).toEqual([]);
  });

  it("lets Create move away from a nonempty destination after a collision, without editing settings", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const initial = defaultKnowledgePackPath(project.uri.fsPath); mkdirSync(initial, { recursive: true });
    writeFileSync(path.join(initial, "owner.txt"), "owner data");
    const alternative = path.join(project.uri.fsPath, "other-pack");
    answerSystem(initial); state.inputBoxAnswers.push(alternative);
    state.messageAnswers.push("Choose Another Location");
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(state.messages[0]?.text).toContain("[location-exists]");
    expect(state.inputBoxes[0]).toMatchObject({ value: initial });
    expect(state.inputBoxes[4]).toMatchObject({ value: initial });
    expect(existsSync(path.join(alternative, "systems.md"))).toBe(true);
    expect(existsSync(initial)).toBe(true);
  });

  it("shows the proposed location before the first system and honors a changed absolute path", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const changed = path.join(project.uri.fsPath, "custom-pack"); answerSystem(changed);
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(state.inputBoxes[0]).toMatchObject({ value: defaultKnowledgePackPath(project.uri.fsPath) });
    expect(state.configurationUpdates[0]?.value).toBe(changed);
    expect(existsSync(path.join(changed, "systems.md"))).toBe(true);
  });

  it("Cancel after a location collision preserves foreign files", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const occupied = defaultKnowledgePackPath(project.uri.fsPath); mkdirSync(occupied, { recursive: true });
    writeFileSync(path.join(occupied, "owner.txt"), "synthetic owner data");
    answerSystem(occupied); state.messageAnswers.push("Choose Another Location");
    expect((await ensureKnowledgePack()).status).toBe("cancelled");
    expect(state.inputBoxes).toHaveLength(5);
    expect(existsSync(path.join(occupied, "owner.txt"))).toBe(true);
    expect(existsSync(path.join(occupied, "systems.md"))).toBe(false);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("Cancel blocks model selection, secret reads and generation", async () => {
    state.workspaceFolders = [folder()];
    state.quickPickAnswers.push(choose("cancel"));
    const inner = createArchiAgentRuntime();
    let providerCalls = 0;
    await generateSequenceDiagramCommand({ runtime: {
      listProviderProfiles: () => { providerCalls += 1; return inner.listProviderProfiles(); },
      listProviderModels: async () => { providerCalls += 1; return { ok: true, models: [] }; },
      listLocalModels: async () => { providerCalls += 1; return { ok: true, models: [] }; },
      generateSequenceDiagram: async (request) => { providerCalls += 1; return inner.generateSequenceDiagram(request); }
    }, output: window.createOutputChannel("test") });
    expect(providerCalls).toBe(0);
    expect(state.configurationUpdates).toEqual([]);
    expect(state.secretReads).toEqual([]);
    expect(state.progressTitles).toEqual([]);
  });

  it("Create failure blocks provider calls and leaves no configuration", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const occupied = defaultKnowledgePackPath(project.uri.fsPath); mkdirSync(occupied, { recursive: true });
    writeFileSync(path.join(occupied, "owner.txt"), "owner data");
    answerSystem(occupied);
    state.messageAnswers.push("Cancel");
    const inner = createArchiAgentRuntime();
    let calls = 0;
    await generateSequenceDiagramCommand({ runtime: {
      listProviderProfiles: () => { calls += 1; return inner.listProviderProfiles(); },
      listProviderModels: async () => { calls += 1; return { ok: true, models: [] }; },
      listLocalModels: async () => { calls += 1; return { ok: true, models: [] }; },
      generateSequenceDiagram: async (request) => { calls += 1; return inner.generateSequenceDiagram(request); }
    }, output: window.createOutputChannel("test") });
    expect(calls).toBe(0);
    expect(state.secretReads).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("creates and validates five files in the chosen project before saving a folder-scoped absolute path", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    expect((await ensureKnowledgePack()).status).toBe("ready");
    const location = defaultKnowledgePackPath(project.uri.fsPath);
    expect(state.configurationUpdates).toEqual([{ key: `archiAgent.${settingKeys.knowledgePackPath}`,
      value: location, target: ConfigurationTarget.WorkspaceFolder }]);
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe(location);
    expect(existsSync(path.join(location, "systems.md"))).toBe(true);
    expect(existsSync(path.join(location, "relationships.md"))).toBe(true);
    expect(state.secretReads).toEqual([]);
    expect(state.progressTitles).toEqual([]);
  });

  it.each(["system", "service", "database", "queue", "external"] as const)("accepts first system kind %s", async (kind) => {
    const project = folder(); state.workspaceFolders = [project];
    state.quickPickAnswers.push(choose("create"), chooseLabel(kind));
    state.inputBoxAnswers.push(defaultKnowledgePackPath(project.uri.fsPath), system.id, system.canonicalName, system.description);
    expect((await ensureKnowledgePack()).status).toBe("ready");
    await expect((await import("../../src/runtime/index.js")).validateKnowledgePackDirectory(defaultKnowledgePackPath(project.uri.fsPath)))
      .resolves.toMatchObject({ ok: true });
  });

  it.each(["choice", "location", "identifier", "name", "kind", "description"] as const)("Cancel at %s leaves no pack", async (step) => {
    const project = folder(); state.workspaceFolders = [project];
    if (step === "choice") state.quickPickAnswers.push(() => undefined);
    else {
      state.quickPickAnswers.push(choose("create"));
      if (step !== "kind") state.quickPickAnswers.push(chooseLabel("service"));
      const answers: (string | undefined)[] = [defaultKnowledgePackPath(project.uri.fsPath), system.id, system.canonicalName, system.description];
      const index = { location: 0, identifier: 1, name: 2, description: 3 }[step as "location" | "identifier" | "name" | "description"];
      if (index !== undefined) answers[index] = undefined;
      state.inputBoxAnswers.push(...answers);
    }
    expect((await ensureKnowledgePack()).status).toBe("cancelled");
    expect(existsSync(defaultKnowledgePackPath(project.uri.fsPath))).toBe(false);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("requires a conscious choice in multi-root before creating in that folder", async () => {
    const left = folder("left"); const right = folder("right"); right.index = 1;
    state.workspaceFolders = [left, right];
    state.quickPickAnswers.push((items: readonly unknown[]) => items.find((item) => (item as { label?: string }).label === "right"));
    answerSystem(defaultKnowledgePackPath(right.uri.fsPath));
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(existsSync(defaultKnowledgePackPath(left.uri.fsPath))).toBe(false);
    expect(existsSync(path.join(defaultKnowledgePackPath(right.uri.fsPath), "systems.md"))).toBe(true);
  });

  it("validates an existing pack and saves its path without changing its files", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const existing = path.join(root(), "knowledge");
    await createStarterKnowledgePack(existing, system);
    state.quickPickAnswers.push(choose("existing"));
    state.openDialogAnswers.push([Uri.file(existing)]);
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe(existing);
  });

  it("Cancel in the existing-pack folder picker makes no writes", async () => {
    const project = folder(); state.workspaceFolders = [project];
    state.quickPickAnswers.push(choose("existing"));
    expect((await ensureKnowledgePack()).status).toBe("cancelled");
    expect(state.inputBoxes).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
    expect(existsSync(defaultKnowledgePackPath(project.uri.fsPath))).toBe(false);
  });

  it("Cancel in multi-root project selection makes no writes", async () => {
    state.workspaceFolders = [folder("left"), folder("right")];
    expect((await ensureKnowledgePack()).status).toBe("cancelled");
    expect(state.quickPicks).toHaveLength(1);
    expect(state.inputBoxes).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("keeps the completed pack and setting when model selection is cancelled later", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    expect((await ensureKnowledgePack()).status).toBe("ready");
    const location = defaultKnowledgePackPath(project.uri.fsPath);
    state.activeTextEditor = { document: makeDocument("a flow") };
    state.quickPickAnswers.push(chooseLabel("$(file) Use the active editor document"));
    const inner = createArchiAgentRuntime();
    let generations = 0;
    await generateSequenceDiagramCommand({ runtime: {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: async () => ({ ok: true, models: ["synthetic-model"] }),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      generateSequenceDiagram: async (request) => { generations += 1; return inner.generateSequenceDiagram(request); }
    }, output: window.createOutputChannel("test") });
    expect(generations).toBe(0);
    expect(existsSync(path.join(location, "systems.md"))).toBe(true);
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe(location);
  });

  it("passes the selected folder's absolute pack path to the generation runtime", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    expect((await ensureKnowledgePack()).status).toBe("ready");
    state.configuration.set(`archiAgent.${settingKeys.localModelId}`, "synthetic-model");
    state.activeTextEditor = { document: makeDocument("a flow") };
    state.quickPickAnswers.push(chooseLabel("$(file) Use the active editor document"));
    const inner = createArchiAgentRuntime();
    let receivedPath: string | undefined;
    await generateSequenceDiagramCommand({ runtime: {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: (selection, options) => inner.listProviderModels(selection, options),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      generateSequenceDiagram: async (request) => { receivedPath = request.knowledgePack.kind === "local-directory" ? request.knowledgePack.path : undefined;
        return { status: "failed", stage: "flow", issues: [], ambiguities: [], unconfirmedNewParticipants: [] }; }
    }, output: window.createOutputChannel("test") });
    expect(receivedPath).toBe(defaultKnowledgePackPath(project.uri.fsPath));
    expect(path.isAbsolute(receivedPath!)).toBe(true);
  });

  it("keeps the pack and setting after a later generation failure", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    state.configuration.set(`archiAgent.${settingKeys.localModelId}`, "synthetic-model");
    state.activeTextEditor = { document: makeDocument("a flow") };
    state.quickPickAnswers.push(chooseLabel("$(file) Use the active editor document"));
    const inner = createArchiAgentRuntime();
    let generations = 0;
    await generateSequenceDiagramCommand({ runtime: {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: (selection, options) => inner.listProviderModels(selection, options),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      generateSequenceDiagram: async () => { generations += 1;
        return { status: "failed", stage: "invalid-generator-output", issues: [], ambiguities: [], unconfirmedNewParticipants: [] }; }
    }, output: window.createOutputChannel("test") });
    const location = defaultKnowledgePackPath(project.uri.fsPath);
    expect(generations).toBe(1);
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe(location);
    expect(existsSync(path.join(location, "systems.md"))).toBe(true);
  });

  it("serializes two own wizards for the same folder", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    const [first, second] = await Promise.all([ensureKnowledgePack(), ensureKnowledgePack()]);
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(state.configurationUpdates).toHaveLength(1);
  });

  it("preserves the pack after an applied-then-rejected write without a risky rollback", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    const location = defaultKnowledgePackPath(project.uri.fsPath);
    state.configurationUpdateFailureCalls.add(1);
    state.configurationUpdateHook = (_key, value, target) => {
      if (target === ConfigurationTarget.WorkspaceFolder && value === location) {
        state.configurationInspect.set(`archiAgent.${settingKeys.knowledgePackPath}@${project.uri.fsPath}`, { workspaceFolderValue: value });
      }
    };
    expect((await ensureKnowledgePack()).status).toBe("failed");
    expect(workspace.getConfiguration("archiAgent", project.uri).inspect(settingKeys.knowledgePackPath)?.workspaceFolderValue).toBe(location);
    expect(existsSync(path.join(location, "systems.md"))).toBe(true);
    expect(state.configurationUpdates).toHaveLength(1);
  });

  it("does not overwrite a concurrent setting change during failed persistence", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    const location = defaultKnowledgePackPath(project.uri.fsPath);
    state.configurationUpdateFailureCalls.add(1);
    state.configurationUpdateHook = (_key, value) => {
      if (value === location) state.configurationInspect.set(`archiAgent.${settingKeys.knowledgePackPath}@${project.uri.fsPath}`,
        { workspaceFolderValue: "/another/owner/path" });
    };
    expect((await ensureKnowledgePack()).status).toBe("failed");
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe("/another/owner/path");
    expect(existsSync(location)).toBe(false);
  });

  it("keeps an external edit and gives concrete repair instructions after failed persistence", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    const location = defaultKnowledgePackPath(project.uri.fsPath);
    const file = path.join(location, "systems.md");
    let inode: number | undefined;
    state.configurationUpdateFailureCalls.add(1);
    state.configurationUpdateHook = () => {
      writeFileSync(file, "owner edit during settings write\n");
      inode = statSync(file).ino;
    };
    expect((await ensureKnowledgePack()).status).toBe("failed");
    expect(readFileSync(file, "utf8")).toBe("owner edit during settings write\n");
    expect(statSync(file).ino).toBe(inode);
    expect(existsSync(path.join(location, "actors.md"))).toBe(false);
    expect(state.messages.at(-1)?.text).toContain("Inspect the chosen directory, keep any edits");
    expect(state.messages.at(-1)?.text).toContain("move the preserved files before retrying there");
    expect(workspace.getConfiguration("archiAgent", project.uri).inspect(settingKeys.knowledgePackPath)?.workspaceFolderValue).toBeUndefined();
  });

  it("writes in Global scope without a workspace", async () => {
    const location = path.join(root(), "global-pack");
    answerSystem(location);
    expect((await ensureKnowledgePack()).status).toBe("ready");
    expect(state.configurationUpdates).toEqual([{ key: `archiAgent.${settingKeys.knowledgePackPath}`,
      value: location, target: ConfigurationTarget.Global }]);
    expect(workspace.getConfiguration("archiAgent").inspect(settingKeys.knowledgePackPath)?.globalValue).toBe(location);
  });

  it("preserves a previous nonempty scoped value when the new write rejects before applying", async () => {
    const project = folder(); state.workspaceFolders = [project];
    const key = `archiAgent.${settingKeys.knowledgePackPath}@${project.uri.fsPath}`;
    const previous = path.join(project.uri.fsPath, "missing-pack");
    state.configurationInspect.set(key, { workspaceFolderValue: previous });
    const location = path.join(project.uri.fsPath, "new-pack");
    state.messageAnswers.push("Create Knowledge Pack");
    state.quickPickAnswers.push(chooseLabel("service"));
    state.inputBoxAnswers.push(location, system.id, system.canonicalName, system.description);
    state.configurationUpdateFailureCalls.add(1);
    expect((await ensureKnowledgePack()).status).toBe("failed");
    expect(workspace.getConfiguration("archiAgent", project.uri).inspect(settingKeys.knowledgePackPath)?.workspaceFolderValue).toBe(previous);
    expect(existsSync(location)).toBe(false);
    expect(state.configurationUpdates).toHaveLength(1);
  });

  it("reports a setting changed during the form and leaves that value untouched", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    const key = `archiAgent.${settingKeys.knowledgePackPath}@${project.uri.fsPath}`;
    state.inputBoxHook = (_options, call) => {
      if (call === 2) state.configurationInspect.set(key, { workspaceFolderValue: "/owner/new-pack" });
    };
    expect((await ensureKnowledgePack()).status).toBe("failed");
    expect(state.messages.at(-1)?.text).toContain("[settings-conflict]");
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe("/owner/new-pack");
    expect(state.configurationUpdates).toEqual([]);
    expect(existsSync(defaultKnowledgePackPath(project.uri.fsPath))).toBe(false);
  });

  it("does not roll back over an external change during a rejected write", async () => {
    const project = folder(); state.workspaceFolders = [project]; answerSystem();
    const key = `archiAgent.${settingKeys.knowledgePackPath}@${project.uri.fsPath}`;
    state.configurationUpdateFailureCalls.add(1);
    state.configurationUpdateHook = () => {
      state.configurationInspect.set(key, { workspaceFolderValue: defaultKnowledgePackPath(project.uri.fsPath) });
      queueMicrotask(() => state.configurationInspect.set(key, { workspaceFolderValue: "/owner/changed-during-write" }));
    };
    expect((await ensureKnowledgePack()).status).toBe("failed");
    expect(workspace.getConfiguration("archiAgent", project.uri).get(settingKeys.knowledgePackPath)).toBe("/owner/changed-during-write");
    expect(state.configurationUpdates).toHaveLength(1);
    expect(existsSync(defaultKnowledgePackPath(project.uri.fsPath))).toBe(false);
  });
});
