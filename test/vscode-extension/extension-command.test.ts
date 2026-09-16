import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime, type ArchiAgentRuntime, type GenerateSequenceDiagramRequest } from "../../src/runtime/index.js";
import { generateSequenceDiagramCommand } from "../../vscode-extension/src/commands/generate-sequence-diagram.js";
import { commandIds, settingKeys, settingsSection } from "../../vscode-extension/src/contributions.js";
import { activate, deactivate } from "../../vscode-extension/src/extension.js";
import { ContextEchoGenerator } from "../doubles/context-echo-generator.js";
import { basePackRows, buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import * as vscodeDouble from "../doubles/vscode-module-double.js";

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

function echoRuntime(): ArchiAgentRuntime {
  return createArchiAgentRuntime({ generatorFactory: () => new ContextEchoGenerator() });
}

function output(): ReturnType<typeof vscodeDouble.window.createOutputChannel> {
  return vscodeDouble.window.createOutputChannel("Archi Agent");
}

function pickByLabel(fragment: string): (items: readonly unknown[]) => unknown {
  return (items) => items.find((item) => typeof item === "object" && item !== null && String((item as { label: unknown }).label).includes(fragment));
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

    expect([...state.registeredCommands.keys()]).toEqual([commandIds.generateSequenceDiagram]);
    expect(manifest.contributes.commands.map((entry) => entry.command)).toEqual([commandIds.generateSequenceDiagram]);
    expect(manifest.activationEvents).toEqual([`onCommand:${commandIds.generateSequenceDiagram}`]);
    expect(Object.keys(manifest.contributes.configuration.properties).sort()).toEqual(
      Object.values(settingKeys)
        .map((key) => `${settingsSection}.${key}`)
        .sort()
    );
    expect(context.subscriptions.length).toBe(2);
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
});

describe("generate command", () => {
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
      async listLocalModels() {
        return { ok: true, models: ["model-a", "model-b"] };
      },
      async generateSequenceDiagram(request) {
        requests.push(request);
        return inner.generateSequenceDiagram(request);
      }
    };

    await generateSequenceDiagramCommand({ runtime, output: output() });

    expect(state.quickPicks[1]?.items).toEqual(["model-a", "model-b"]);
    expect(state.configurationUpdates).toEqual([{ key: `${settingsSection}.${settingKeys.localModelId}`, value: "model-b", target: ConfigurationTarget.Global }]);
    expect(requests[0]?.generator.modelId).toBe("model-b");
    expect(state.openedDocuments).toHaveLength(2);
  });

  it("explains an unreachable local server with the loopback endpoint and offers the settings", async () => {
    configure({ [settingKeys.knowledgePackPath]: packDirectory });
    state.activeTextEditor = { document: makeDocument(flowDocument(groundedLines)) };
    state.quickPickAnswers.push(pickByLabel("active editor"));
    const runtime: ArchiAgentRuntime = {
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
