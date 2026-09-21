import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createArchiAgentRuntime, type ArchiAgentRuntime, type GenerateSequenceDiagramRequest } from "../../src/runtime/index.js";
import { generateSequenceDiagramCommand } from "../../vscode-extension/src/commands/generate-sequence-diagram.js";
import { secretIdForProfile } from "../../vscode-extension/src/api-key-storage.js";
import { selectLocalModel, selectLocalProviderProfile } from "../../vscode-extension/src/commands/local-provider-selection.js";
import { commandIds, legacyCommandIds, settingKeys, settingsSection } from "../../vscode-extension/src/contributions.js";
import { activate, deactivate } from "../../vscode-extension/src/extension.js";
import { readLocalModelSettings } from "../../vscode-extension/src/settings.js";
import { ContextEchoGenerator } from "../doubles/context-echo-generator.js";
import { basePackRows, buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";
import * as vscodeDouble from "../doubles/vscode-module-double.js";

const packagedRuntime = vi.hoisted(() => ({ current: undefined as ArchiAgentRuntime | undefined }));

vi.mock("../../vscode-extension/src/runtime/packaged-runtime-adapter.js", () => ({
  createPackagedRuntime: () => packagedRuntime.current
}));

/**
 * Drives the editor layer through the in-memory vscode double: activation registers the command,
 * and the command collects input, resolves ambiguity through quick picks, opens the artifacts and
 * reports failures without touching the network (the runtime receives an echo generator).
 */

const LF = String.fromCharCode(10);
const { state, resetDouble, makeDocument, createExtensionContext, ConfigurationTarget } = vscodeDouble;
const workspaces: string[] = [];
let packDirectory: string;

function temporaryDirectory(prefix: string): string {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  workspaces.push(directory);
  return directory;
}

function flowDocument(lines: readonly string[]): string {
  return ["---", "diagram_name: observation-run", "flow_name: Observation run", "author: Test Suite", "language: en", "---", ...lines, ""].join(LF);
}

const groundedLines = [
  "The Night Observer asks the Scheduler for observation slots.",
  "The Telescope Scheduler signals the Dome Controller and registers frames in the Archive."
];

function configure(values: Readonly<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(values)) {
    state.configuration.set(`${settingsSection}.${key}`, value);
  }
}

function configureGlobal(values: Readonly<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(values)) {
    state.configurationInspect.set(`${settingsSection}.${key}`, { globalValue: value });
  }
}

function echoRuntime(): ArchiAgentRuntime {
  return createArchiAgentRuntime({ generatorFactory: () => new ContextEchoGenerator() });
}

function output(): ReturnType<typeof vscodeDouble.window.createOutputChannel> {
  return vscodeDouble.window.createOutputChannel("Archi Agent");
}

function pickByLabel(fragment: string): (items: readonly unknown[]) => unknown {
  return (items) => items.find((item) => typeof item === "object" && item !== null && String((item as { label: unknown }).label).includes(fragment));
}

function readAfterRestart() {
  return readLocalModelSettings(vscodeDouble.workspace.getConfiguration(settingsSection));
}

beforeAll(() => {
  const root = temporaryDirectory("archi-agent-ext-");
  packDirectory = path.join(root, "architecture");
  mkdirSync(packDirectory);

  const files = buildPackFiles({ aliases: [...basePackRows.aliases, ["Controller", "dome-controller"], ["Controller", "telescope-scheduler"]] });

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(packDirectory, name), content, "utf8");
  }
});

afterEach(() => {
  packagedRuntime.current = undefined;
  resetDouble();
});

afterAll(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("activation", () => {
  it("registers exactly the command contributed by the manifest and owns its disposables", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../vscode-extension/package.json", import.meta.url), "utf8")) as {
      contributes: { commands: { command: string }[]; configuration: { properties: Record<string, unknown> } };
      activationEvents: string[];
    };
    const context = createExtensionContext();

    activate(context as never);

    expect([...state.registeredCommands.keys()]).toEqual([...Object.values(commandIds), ...Object.values(legacyCommandIds)]);
    expect(manifest.contributes.commands.map((entry) => entry.command)).toEqual(Object.values(commandIds));
    expect(manifest.activationEvents).toEqual([...Object.values(commandIds), ...Object.values(legacyCommandIds)].map((command) => `onCommand:${command}`));
    expect(Object.keys(manifest.contributes.configuration.properties).sort()).toEqual(
      Object.values(settingKeys)
        .map((key) => `${settingsSection}.${key}`)
        .sort()
    );
    expect(context.subscriptions.length).toBe(8);
    deactivate();
  });

  it("reports missing settings through the registered command without any runtime call", async () => {
    const context = createExtensionContext();
    activate(context as never);

    const handler = state.registeredCommands.get(commandIds.generateSequenceDiagram);
    await handler?.();

    expect(state.messages).toEqual([
      expect.objectContaining({ level: "error", text: "archiAgent.knowledgePackPath: Set the absolute path of the Architecture Knowledge Pack directory." })
    ]);
    expect(state.messages[0]?.actions).toContain("Open Settings");
    expect(state.openedDocuments).toEqual([]);
  });

  it("executes both P1 compatibility aliases through their current commands", async () => {
    configureGlobal({ [settingKeys.localModelProfile]: "local-lm-studio" });
    const calls = { listings: 0 };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models: ["model-a"] };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      generateSequenceDiagram: (request) => inner.generateSequenceDiagram(request)
    };
    state.quickPickAnswers.push(pickByLabel("LM Studio"));
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(legacyCommandIds.selectLocalProviderProfile)?.();
    await state.registeredCommands.get(legacyCommandIds.selectLocalModel)?.();

    expect(state.executedCommands.map((entry) => entry.command)).toEqual([commandIds.selectProviderProfile, commandIds.selectModel]);
    expect(calls.listings).toBe(1);
    expect(state.quickPicks).toHaveLength(2);
  });

  it("waits for the real Generate command before listing after a manual profile change and does not generate when model picking is cancelled", async () => {
    configure({
      [settingKeys.knowledgePackPath]: packDirectory,
      [settingKeys.localModelId]: "legacy-lm-studio-model"
    });
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "previous-lm-studio-model",
      [settingKeys.localModelSelectedModelProfile]: "local-lm-studio"
    });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    const calls = { listings: 0, generations: 0, requests: [] as GenerateSequenceDiagramRequest[] };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels(selection) {
        calls.listings += 1;
        expect(selection).toMatchObject({ profileId: "local-ollama" });
        return { ok: true, models: ["qwen3:8b"] };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        calls.generations += 1;
        calls.requests.push(request);
        return inner.generateSequenceDiagram(request);
      }
    };
    const context = createExtensionContext();

    activate(context as never);

    expect(calls).toEqual({ listings: 0, generations: 0, requests: [] });
    expect(state.configurationUpdates).toEqual([]);
    expect(state.quickPicks).toEqual([]);
    expect(state.progressTitles).toEqual([]);
    expect(readAfterRestart()).toEqual({
      ok: true,
      settings: expect.objectContaining({ profileId: "local-ollama", modelId: undefined })
    });

    state.quickPickAnswers.push(pickByLabel("active editor"));
    const handler = state.registeredCommands.get(commandIds.generateSequenceDiagram);
    await handler?.();

    expect(calls).toEqual({ listings: 1, generations: 0, requests: [] });
    expect(state.quickPicks).toHaveLength(2);
    expect((state.quickPicks[1]?.items as { label: string }[]).map((item) => item.label)).toEqual(["qwen3:8b"]);
    expect(state.configurationUpdates).toEqual([]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelProfile}`)?.globalValue).toBe("local-ollama");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBe("previous-lm-studio-model");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBe("local-lm-studio");
    expect(state.openedDocuments).toEqual([]);
  });
});

describe("generate command", () => {
  it("lists cloud models once and writes or generates nothing when its model picker is cancelled", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    configureGlobal({ [settingKeys.localModelProfile]: "cloud-openai" });
    const secretId = secretIdForProfile("cloud-openai") ?? "";
    state.secrets.set(secretId, "synthetic-cloud-key");
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    const transport = new RemoteJsonTransportDouble(JSON.stringify({ data: [{ id: "gpt-test" }] }));
    const inner = createArchiAgentRuntime({ remoteTransport: transport });
    const calls = { generations: 0 };
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: (selection, options) => inner.listProviderModels(selection, options),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        calls.generations += 1;
        return inner.generateSequenceDiagram(request);
      }
    };
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.generateSequenceDiagram)?.();

    expect(state.secretReads).toEqual([secretId]);
    expect(transport.requests.map((request) => request.endpoint)).toEqual(["openai-models"]);
    expect(transport.requests.filter((request) => request.endpoint === "openai-chat-completions")).toHaveLength(0);
    expect(state.configurationUpdates).toEqual([]);
    expect(calls.generations).toBe(0);
    expect(state.openedDocuments).toEqual([]);
    expect(state.quickPicks).toHaveLength(2);
  });

  it("runs cloud generation through the registered command and reads its secret only after the flow picker", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    configureGlobal({
      [settingKeys.localModelProfile]: "cloud-openai",
      [settingKeys.localModelSelectedModel]: "gpt-test",
      [settingKeys.localModelSelectedModelProfile]: "cloud-openai"
    });
    const secretId = secretIdForProfile("cloud-openai") ?? "";
    state.secrets.set(secretId, "synthetic-cloud-key");
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    const requests: GenerateSequenceDiagramRequest[] = [];
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: (selection, options) => inner.listProviderModels(selection, options),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        requests.push(request);
        return inner.generateSequenceDiagram({
          ...request,
          generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "echo-model" }
        });
      }
    };
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.generateSequenceDiagram)?.();

    expect(state.secretReads).toEqual([secretId]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.generator).toEqual({
      kind: "remote-provider",
      profileId: "cloud-openai",
      modelId: "gpt-test",
      timeoutMs: 120_000,
      credential: { type: "api-key", value: "synthetic-cloud-key" }
    });
    expect(state.openedDocuments).toHaveLength(2);
  });

  it("cancels flow-source selection before SecretStorage.get, provider I/O, generation and writes", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    configureGlobal({
      [settingKeys.localModelProfile]: "cloud-openrouter",
      [settingKeys.localModelSelectedModel]: "vendor/model",
      [settingKeys.localModelSelectedModelProfile]: "cloud-openrouter"
    });
    const calls = { listings: 0, generations: 0 };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models: [] };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram() {
        calls.generations += 1;
        throw new Error("must not generate");
      }
    };
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.generateSequenceDiagram)?.();

    expect(state.secretReads).toEqual([]);
    expect(state.secretWrites).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
    expect(calls).toEqual({ listings: 0, generations: 0 });
    expect(state.quickPicks).toHaveLength(1);
    expect(state.quickPicks[0]?.options).toMatchObject({ title: "Archi Agent: flow source" });
  });

  it("restores a cloud selection and secret, then deletion after restart blocks generation before runtime I/O", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    configureGlobal({
      [settingKeys.localModelProfile]: "cloud-openai",
      [settingKeys.localModelSelectedModel]: "gpt-restart",
      [settingKeys.localModelSelectedModelProfile]: "cloud-openai"
    });
    const secretId = secretIdForProfile("cloud-openai") ?? "";
    state.secrets.set(secretId, "restart-secret");
    const calls = { generations: 0 };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: (selection, options) => inner.listProviderModels(selection, options),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram() {
        calls.generations += 1;
        throw new Error("must be blocked after deletion");
      }
    };
    const context = createExtensionContext();
    activate(context as never);
    activate(context as never);
    expect(readAfterRestart()).toEqual({
      ok: true,
      settings: expect.objectContaining({ profileId: "cloud-openai", modelId: "gpt-restart" })
    });
    expect(state.secrets.get(secretId)).toBe("restart-secret");

    state.messageAnswers.push("Delete API Key");
    await state.registeredCommands.get(commandIds.deleteApiKey)?.();
    expect(state.secrets.has(secretId)).toBe(false);

    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    await state.registeredCommands.get(commandIds.generateSequenceDiagram)?.();
    expect(calls.generations).toBe(0);
    expect(state.messages.at(-1)?.text).toContain("no valid API key");
  });

  it("generates from the active editor document and opens the PlantUML and the grounding report", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines), { fileName: path.join("C:", "flows", "observation-run.md") }) };
    state.quickPickAnswers.push(pickByLabel("active editor"));

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.openedDocuments.map((document) => document.languageId)).toEqual(["plaintext", "json"]);
    expect(state.openedDocuments[0]?.getText().startsWith("@startuml")).toBe(true);
    expect(JSON.parse(state.openedDocuments[1]?.getText() ?? "{}")).toMatchObject({ reportSchemaVersion: 1, sources: { flow: "observation-run.md" } });
    expect(state.shownDocuments).toHaveLength(2);
    expect(state.messages).toEqual([expect.objectContaining({ level: "info", text: expect.stringContaining('generated "observation-run"') })]);
    expect(state.progressTitles).toEqual(["Archi Agent: generating sequence diagram"]);
    expect(state.outputLines.join(LF)).not.toContain("@startuml");
    expect(state.outputLines.join(LF)).not.toContain(packDirectory);
    expect(state.secretReads).toEqual([]);
  });

  it("uses the plantuml language when an extension registered it", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    state.languages.push("plantuml");
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.openedDocuments[0]?.languageId).toBe("plantuml");
  });

  it("resolves an ambiguous mention through a quick pick of the candidates", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    state.activeTextEditor = { document: makeDocument(flowDocument([groundedLines[0] ?? "", "The Controller opens the dome."])) };
    state.quickPickAnswers.push(pickByLabel("active editor"), pickByLabel("Dome Controller"));

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    const candidatePick = state.quickPicks[1];
    expect((candidatePick?.options as { title: string }).title).toContain('"controller" is ambiguous');
    expect((candidatePick?.items as { description: string }[]).map((item) => item.description)).toEqual(["dome-controller", "telescope-scheduler"]);
    expect(state.openedDocuments[0]?.getText()).toContain("Dome Controller");
    expect(state.messages[0]?.level).toBe("info");
  });

  it("confirms [NEW: ...] participants through a multi-select quick pick", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    state.activeTextEditor = { document: makeDocument(flowDocument([...groundedLines, "The Telescope Scheduler notifies the [NEW: Weather Station]."])) };
    state.quickPickAnswers.push(pickByLabel("active editor"), (items) => items);

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect((state.quickPicks[1]?.options as { canPickMany: boolean }).canPickMany).toBe(true);
    expect((state.quickPicks[1]?.items as { label: string }[]).map((item) => item.label)).toEqual(["weather station"]);
    expect(state.openedDocuments[0]?.getText()).toContain("[NEW] Weather Station");
  });

  it("reports a cancelled candidate prompt and generates nothing", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    state.activeTextEditor = { document: makeDocument(flowDocument(["The Controller opens the dome."])) };
    state.quickPickAnswers.push(pickByLabel("active editor"));

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.openedDocuments).toEqual([]);
    expect(state.messages).toEqual([expect.objectContaining({ level: "info", text: expect.stringContaining("cancelled") })]);
  });

  it("reads a flow file chosen in the open dialog through the runtime", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    const flowDirectory = temporaryDirectory("archi-agent-ext-flow-");
    const flowPath = path.join(flowDirectory, "observation-run.md");
    writeFileSync(flowPath, flowDocument(groundedLines), "utf8");
    state.quickPickAnswers.push(pickByLabel("Choose a flow file"));
    state.openDialogAnswers.push([vscodeDouble.Uri.file(flowPath)]);

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.openedDocuments).toHaveLength(2);
    expect(state.messages[0]?.level).toBe("info");
  });

  it("composes a flow from a typed description with the configured author", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model", [settingKeys.defaultAuthor]: "Observatory Team" });
    state.quickPickAnswers.push(pickByLabel("Describe a flow"));
    state.inputBoxAnswers.push("Nightly observation run", groundedLines.join(" "));

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.openedDocuments[0]?.getText()).toContain("nightly-observation-run");
    expect(state.openedDocuments[0]?.getText()).toContain("Observatory Team");
  });

  it("lists the local models when none is configured and stores the choice in the user settings", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"), (items) => items[1]);
    const requests: GenerateSequenceDiagramRequest[] = [];
    const inner = echoRuntime();
    const runtime: ArchiAgentRuntime = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        return { ok: true, models: ["model-a", "model-b"] };
      },
      async listLocalModels() {
        return { ok: true, models: ["model-a", "model-b"] };
      },
      async generateSequenceDiagram(request) {
        requests.push(request);
        return inner.generateSequenceDiagram(request);
      }
    };

    await generateSequenceDiagramCommand({ runtime, output: output() });

    expect((state.quickPicks[1]?.items as { label: string }[]).map((item) => item.label)).toEqual(["model-a", "model-b"]);
    expect(state.configurationUpdates).toEqual([
      { key: `${settingsSection}.${settingKeys.localModelSelectedModel}`, value: "model-b", target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, value: "local-lm-studio", target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelProfile}`, value: "local-lm-studio", target: ConfigurationTarget.Global }
    ]);
    expect(requests[0]?.generator.modelId).toBe("model-b");
    expect(requests[0]?.generator).toMatchObject({ profileId: "local-lm-studio" });
    expect(state.openedDocuments).toHaveLength(2);
  });

  it("explains an unreachable local server with the loopback endpoint and offers the settings", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    const runtime: ArchiAgentRuntime = {
      listProviderProfiles: () => echoRuntime().listProviderProfiles(),
      async listProviderModels() {
        return { ok: false, code: "connection-failed" };
      },
      async listLocalModels() {
        return { ok: false, code: "connection-failed" };
      },
      async generateSequenceDiagram() {
        throw new Error("must not be called");
      }
    };

    await generateSequenceDiagramCommand({ runtime, output: output() });

    expect(state.messages).toEqual([expect.objectContaining({ level: "error", text: expect.stringContaining("http://127.0.0.1:1234/v1") })]);
    expect(state.messages[0]?.actions).toEqual(["Show Details", "Open Settings"]);
    expect(state.openedDocuments).toEqual([]);
  });

  it("opens the settings when the user chooses that action on a Knowledge Pack failure", async () => {
    configure({ [settingKeys.knowledgePackPath]: path.join(path.dirname(packDirectory), "absent"), [settingKeys.localModelId]: "test-model" });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    state.messageAnswers.push("Open Settings");

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.messages[0]?.text).toContain("Knowledge Pack could not be loaded");
    expect(state.executedCommands).toEqual([{ command: "workbench.action.openSettings", args: [settingsSection] }]);
    expect(state.outputLines.some((line) => line.includes("[missing-file]"))).toBe(true);
  });

  it("shows the output channel when the user asks for details of a rejected model answer", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    state.messageAnswers.push("Show Details");
    const runtime = createArchiAgentRuntime({ generatorFactory: () => new ContextEchoGenerator({ produce: () => ({ participants: [], messages: [], extra: 1 }) }) });

    await generateSequenceDiagramCommand({ runtime, output: output() });

    expect(state.messages[0]?.level).toBe("error");
    expect(state.outputShown).toBe(true);
    expect(state.openedDocuments).toEqual([]);
  });

  it("does nothing when the flow source prompt is dismissed", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory, [settingKeys.localModelId]: "test-model" });

    await generateSequenceDiagramCommand({ runtime: echoRuntime(), output: output() });

    expect(state.quickPicks).toHaveLength(1);
    expect(state.messages).toEqual([]);
    expect(state.openedDocuments).toEqual([]);
  });
});

describe("local provider and model selection", () => {
  function runtimeWithModels(models: readonly string[], calls: { listings: number }): ArchiAgentRuntime {
    const inner = echoRuntime();
    return {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      generateSequenceDiagram: (request) => inner.generateSequenceDiagram(request)
    };
  }

  it("shows profiles deterministically, marks the current profile and performs no network request", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "qwen3:8b",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    const calls = { listings: 0 };
    state.quickPickAnswers.push(pickByLabel("LM Studio"));

    await selectLocalProviderProfile(runtimeWithModels([], calls), output());

    expect((state.quickPicks[0]?.items as { label: string }[]).map((item) => item.label)).toEqual([
      "Anthropic",
      "OpenAI",
      "OpenRouter",
      "LM Studio",
      "Ollama"
    ]);
    expect((state.quickPicks[0]?.items as { label: string; description: string }[])[4]?.description).toContain("Current profile");
    expect((state.quickPicks[0]?.items as { detail: string }[]).map((item) => item.detail).join("\n")).not.toMatch(/saved|not saved/i);
    expect(calls.listings).toBe(0);
    expect(state.secretReads).toEqual([]);
    expect(state.configurationUpdates).toEqual([
      { key: `${settingsSection}.${settingKeys.localModelSelectedModel}`, value: undefined, target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, value: undefined, target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelProfile}`, value: "local-lm-studio", target: ConfigurationTarget.Global }
    ]);
  });

  it.each([
    ["local-lm-studio", "Ollama", "local-ollama"],
    ["local-ollama", "LM Studio", "local-lm-studio"]
  ])("clears the selected model and its binding before changing %s", async (from, label, to) => {
    configureGlobal({
      [settingKeys.localModelProfile]: from,
      [settingKeys.localModelSelectedModel]: "old-model",
      [settingKeys.localModelSelectedModelProfile]: from
    });
    state.quickPickAnswers.push(pickByLabel(label));

    await selectLocalProviderProfile(runtimeWithModels([], { listings: 0 }), output());

    expect(state.configurationUpdates.map((entry) => [entry.key, entry.value])).toEqual([
      [`${settingsSection}.${settingKeys.localModelSelectedModel}`, undefined],
      [`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, undefined],
      [`${settingsSection}.${settingKeys.localModelProfile}`, to]
    ]);
  });

  it("preserves the model when the same explicit profile is selected again", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "qwen3:8b",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    state.quickPickAnswers.push(pickByLabel("Ollama"));

    await selectLocalProviderProfile(runtimeWithModels([], { listings: 0 }), output());

    expect(state.configurationUpdates).toEqual([]);
  });

  it("does not write anything when either picker is cancelled", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "qwen3:8b",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    const calls = { listings: 0 };
    const runtime = runtimeWithModels(["model-b", "model-a"], calls);

    expect(await selectLocalProviderProfile(runtime, output())).toEqual({ status: "cancelled" });
    expect(await selectLocalModel(runtime, output())).toEqual({ status: "cancelled" });
    expect(calls.listings).toBe(1);
    expect(state.configurationUpdates).toEqual([]);
  });

  it("reads one cloud secret and performs one model-list GET before a cancelled Select Model picker", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "cloud-openai",
      [settingKeys.localModelSelectedModel]: "previous-model",
      [settingKeys.localModelSelectedModelProfile]: "cloud-openai"
    });
    const secretId = secretIdForProfile("cloud-openai") ?? "";
    state.secrets.set(secretId, "synthetic-cloud-key");
    const transport = new RemoteJsonTransportDouble(JSON.stringify({ data: [{ id: "gpt-test" }] }));
    const inner = createArchiAgentRuntime({ remoteTransport: transport });
    const calls = { generations: 0 };
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      listProviderModels: (selection, options) => inner.listProviderModels(selection, options),
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        calls.generations += 1;
        return inner.generateSequenceDiagram(request);
      }
    };
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.selectModel)?.();

    expect(state.secretReads).toEqual([secretId]);
    expect(transport.requests.map((request) => request.endpoint)).toEqual(["openai-models"]);
    expect(transport.requests.filter((request) => request.endpoint === "openai-chat-completions")).toHaveLength(0);
    expect(state.configurationUpdates).toEqual([]);
    expect(calls.generations).toBe(0);
    expect(state.openedDocuments).toEqual([]);
    expect(state.quickPicks).toHaveLength(1);
  });

  it("stops a profile change when clearing selectedModel fails", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-lm-studio",
      [settingKeys.localModelSelectedModel]: "old-model",
      [settingKeys.localModelSelectedModelProfile]: "local-lm-studio"
    });
    state.configurationUpdateFailures.add(`${settingsSection}.${settingKeys.localModelSelectedModel}`);
    state.quickPickAnswers.push(pickByLabel("Ollama"));

    expect(await selectLocalProviderProfile(runtimeWithModels([], { listings: 0 }), output())).toEqual({ status: "failed" });
    expect(state.configurationUpdates).toEqual([
      { key: `${settingsSection}.${settingKeys.localModelSelectedModel}`, value: undefined, target: ConfigurationTarget.Global }
    ]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelProfile}`)?.globalValue).toBe("local-lm-studio");
  });

  it("stops a profile change when clearing selectedModelProfile fails", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-lm-studio",
      [settingKeys.localModelSelectedModel]: "old-model",
      [settingKeys.localModelSelectedModelProfile]: "local-lm-studio"
    });
    state.configurationUpdateFailureCalls.add(2);
    state.quickPickAnswers.push(pickByLabel("Ollama"));

    expect(await selectLocalProviderProfile(runtimeWithModels([], { listings: 0 }), output())).toEqual({ status: "failed" });
    expect(state.configurationUpdates.map((entry) => [entry.key, entry.value])).toEqual([
      [`${settingsSection}.${settingKeys.localModelSelectedModel}`, undefined],
      [`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, undefined]
    ]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelProfile}`)?.globalValue).toBe("local-lm-studio");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBeUndefined();
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBe("local-lm-studio");
  });

  it("leaves the previous profile without an active model when storing the new profile fails", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-lm-studio",
      [settingKeys.localModelSelectedModel]: "old-model",
      [settingKeys.localModelSelectedModelProfile]: "local-lm-studio"
    });
    state.configurationUpdateFailureCalls.add(3);
    state.quickPickAnswers.push(pickByLabel("Ollama"));

    expect(await selectLocalProviderProfile(runtimeWithModels([], { listings: 0 }), output())).toEqual({ status: "failed" });
    expect(state.configurationUpdates.map((entry) => [entry.key, entry.value])).toEqual([
      [`${settingsSection}.${settingKeys.localModelSelectedModel}`, undefined],
      [`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, undefined],
      [`${settingsSection}.${settingKeys.localModelProfile}`, "local-ollama"]
    ]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelProfile}`)?.globalValue).toBe("local-lm-studio");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBeUndefined();
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBeUndefined();
  });

  it("rejects an unknown explicit profile before listing or generating and never uses legacy settings", async () => {
    configure({
      [settingKeys.knowledgePackPath]: packDirectory,
      [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
      [settingKeys.localModelId]: "legacy-model"
    });
    configureGlobal({
      [settingKeys.localModelProfile]: "unknown-profile",
      [settingKeys.localModelSelectedModel]: "stale-model",
      [settingKeys.localModelSelectedModelProfile]: "unknown-profile"
    });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    const calls = { listings: 0, generations: 0 };
    const runtime: ArchiAgentRuntime = {
      listProviderProfiles: () => [],
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models: ["must-not-be-seen"] };
      },
      async listLocalModels() {
        calls.listings += 1;
        return { ok: true, models: ["must-not-be-seen"] };
      },
      async generateSequenceDiagram() {
        calls.generations += 1;
        throw new Error("must not be called");
      }
    };

    expect(readAfterRestart()).toEqual({
      ok: false,
      problems: [expect.objectContaining({ code: "unknown-provider-profile" })]
    });
    expect(await selectLocalModel(runtime, output())).toEqual({ status: "failed" });
    await generateSequenceDiagramCommand({ runtime, output: output() });

    expect(calls).toEqual({ listings: 0, generations: 0 });
    expect(state.quickPicks).toEqual([]);
    expect(state.configurationUpdates).toEqual([]);
    expect(state.messages).toHaveLength(2);
    expect(state.outputLines.join(LF)).toContain("unknown-provider-profile");
    expect(state.outputLines.join(LF)).not.toContain("legacy-model");
    expect(state.outputLines.join(LF)).not.toContain("4321");
  });

  it("first explicit model selection performs one GET-equivalent listing and keeps legacy settings", async () => {
    configure({
      [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
      [settingKeys.localModelId]: "legacy-workspace-model"
    });
    const calls = { listings: 0 };
    state.quickPickAnswers.push((items) => items[1]);

    const result = await selectLocalModel(runtimeWithModels(["a-model", "z-model"], calls), output());

    expect(result.status).toBe("selected");
    expect(calls.listings).toBe(1);
    expect((state.quickPicks[0]?.items as { label: string }[]).map((item) => item.label)).toEqual(["a-model", "z-model"]);
    expect(state.configuration.get(`${settingsSection}.${settingKeys.localModelBaseUrl}`)).toBe("http://127.0.0.1:4321/v1");
    expect(state.configuration.get(`${settingsSection}.${settingKeys.localModelId}`)).toBe("legacy-workspace-model");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelProfile}`)?.globalValue).toBe("local-lm-studio");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBe("z-model");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBe("local-lm-studio");
  });

  it.each([
    [1, false, false],
    [2, true, false],
    [3, true, true]
  ])("does not activate a profile when legacy materialization update %i fails", async (failureCall, modelStored, bindingStored) => {
    configure({
      [settingKeys.localModelBaseUrl]: "http://127.0.0.1:4321/v1",
      [settingKeys.localModelId]: "legacy-workspace-model"
    });
    state.configurationUpdateFailureCalls.add(failureCall);
    state.quickPickAnswers.push((items) => items[0]);

    const result = await selectLocalModel(runtimeWithModels(["chosen-model"], { listings: 0 }), output());

    expect(result).toEqual({ status: "failed" });
    expect(state.configurationUpdates).toHaveLength(failureCall);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelProfile}`)?.globalValue).toBeUndefined();
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBe(
      modelStored ? "chosen-model" : undefined
    );
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBe(
      bindingStored ? "local-lm-studio" : undefined
    );
    expect(state.configuration.get(`${settingsSection}.${settingKeys.localModelBaseUrl}`)).toBe("http://127.0.0.1:4321/v1");
    expect(state.configuration.get(`${settingsSection}.${settingKeys.localModelId}`)).toBe("legacy-workspace-model");
  });

  it("stores an explicit model with a profile binding and invalidates the old binding first", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "old-model",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    state.quickPickAnswers.push((items) => items[0]);

    expect(await selectLocalModel(runtimeWithModels(["qwen3:8b"], { listings: 0 }), output())).toMatchObject({ status: "selected" });
    expect(state.configurationUpdates.map((entry) => [entry.key, entry.value])).toEqual([
      [`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, undefined],
      [`${settingsSection}.${settingKeys.localModelSelectedModel}`, "qwen3:8b"],
      [`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, "local-ollama"]
    ]);
  });

  it("keeps the previous explicit model safely active after the first model-selection update fails, including after restart", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "previous-ollama-model",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    const calls = { listings: 0, generations: 0 };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models: ["new-ollama-model"] };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        calls.generations += 1;
        return inner.generateSequenceDiagram(request);
      }
    };
    state.configurationUpdateFailureCalls.add(1);
    state.quickPickAnswers.push((items) => items[0]);
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.selectModel)?.();

    expect(calls).toEqual({ listings: 1, generations: 0 });
    expect(state.configurationUpdates).toEqual([
      { key: `${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, value: undefined, target: ConfigurationTarget.Global }
    ]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBe("previous-ollama-model");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBe("local-ollama");
    expect(readAfterRestart()).toEqual({
      ok: true,
      settings: expect.objectContaining({ profileId: "local-ollama", modelId: "previous-ollama-model" })
    });
  });

  it("leaves the previous explicit model inactive after the second model-selection update fails, including after restart", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "previous-ollama-model",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    const calls = { listings: 0, generations: 0 };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models: ["new-ollama-model"] };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        calls.generations += 1;
        return inner.generateSequenceDiagram(request);
      }
    };
    state.configurationUpdateFailureCalls.add(2);
    state.quickPickAnswers.push((items) => items[0]);
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.selectModel)?.();

    expect(calls).toEqual({ listings: 1, generations: 0 });
    expect(state.configurationUpdates).toEqual([
      { key: `${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, value: undefined, target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelSelectedModel}`, value: "new-ollama-model", target: ConfigurationTarget.Global }
    ]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBe("previous-ollama-model");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBeUndefined();
    expect(readAfterRestart()).toEqual({
      ok: true,
      settings: expect.objectContaining({ profileId: "local-ollama", modelId: undefined })
    });
  });

  it("leaves a newly stored explicit model inactive after the third model-selection update fails, including after restart", async () => {
    configureGlobal({
      [settingKeys.localModelProfile]: "local-ollama",
      [settingKeys.localModelSelectedModel]: "previous-ollama-model",
      [settingKeys.localModelSelectedModelProfile]: "local-ollama"
    });
    const calls = { listings: 0, generations: 0 };
    const inner = echoRuntime();
    packagedRuntime.current = {
      listProviderProfiles: () => inner.listProviderProfiles(),
      async listProviderModels() {
        calls.listings += 1;
        return { ok: true, models: ["new-ollama-model"] };
      },
      listLocalModels: (endpoint, options) => inner.listLocalModels(endpoint, options),
      async generateSequenceDiagram(request) {
        calls.generations += 1;
        return inner.generateSequenceDiagram(request);
      }
    };
    state.configurationUpdateFailureCalls.add(3);
    state.quickPickAnswers.push((items) => items[0]);
    activate(createExtensionContext() as never);

    await state.registeredCommands.get(commandIds.selectModel)?.();

    expect(calls).toEqual({ listings: 1, generations: 0 });
    expect(state.configurationUpdates).toEqual([
      { key: `${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, value: undefined, target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelSelectedModel}`, value: "new-ollama-model", target: ConfigurationTarget.Global },
      { key: `${settingsSection}.${settingKeys.localModelSelectedModelProfile}`, value: "local-ollama", target: ConfigurationTarget.Global }
    ]);
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModel}`)?.globalValue).toBe("new-ollama-model");
    expect(state.configurationInspect.get(`${settingsSection}.${settingKeys.localModelSelectedModelProfile}`)?.globalValue).toBeUndefined();
    expect(readAfterRestart()).toEqual({
      ok: true,
      settings: expect.objectContaining({ profileId: "local-ollama", modelId: undefined })
    });
  });

  it("preserves the runtime model order without locale-dependent picker sorting", async () => {
    configureGlobal({ [settingKeys.localModelProfile]: "local-ollama" });
    const models = ["z/model:2", "Alpha.model-1", "beta:3/model", "alpha-model.2"];

    expect(await selectLocalModel(runtimeWithModels(models, { listings: 0 }), output())).toEqual({ status: "cancelled" });

    expect((state.quickPicks[0]?.items as { label: string }[]).map((item) => item.label)).toEqual(models);
    const source = readFileSync(new URL("../../vscode-extension/src/commands/local-provider-selection.ts", import.meta.url), "utf8");
    expect(source).not.toContain("localeCompare");
  });

  it("the VS Code double exposes inspect scopes and computes folder > workspace > global > default", () => {
    const key = `${settingsSection}.${settingKeys.localModelSelectedModel}`;
    state.configurationInspect.set(key, {
      defaultValue: "default-model",
      globalValue: "global-model",
      workspaceValue: "workspace-model",
      workspaceFolderValue: "folder-model"
    });
    const configuration = vscodeDouble.workspace.getConfiguration(settingsSection);

    expect(configuration.get(settingKeys.localModelSelectedModel)).toBe("folder-model");
    expect(configuration.inspect(settingKeys.localModelSelectedModel)).toEqual({
      defaultValue: "default-model",
      globalValue: "global-model",
      workspaceValue: "workspace-model",
      workspaceFolderValue: "folder-model"
    });
  });
});
