import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync, readdirSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { KnowledgePackReviewSession, StarterPackCreateError, createArchiAgentRuntime } from "../../src/runtime/index.js";
import { selectModel } from "../../vscode-extension/src/commands/local-provider-selection.js";
import { buildKnowledgePackCommand } from "../../vscode-extension/src/commands/build-knowledge-pack.js";
import { resetDouble, state, Uri, window, ConfigurationTarget } from "../doubles/vscode-module-double.js";
const pick = (label: string) => (items: readonly unknown[]) => items.find((i) => i === label);
const roots: string[] = [];
beforeEach(resetDouble);
afterEach(() => { vi.restoreAllMocks(); roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })); });
function setup() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "k3-adapter-"))); roots.push(root);
  const doc = path.join(root, "source.md"); writeFileSync(doc, "Alpha service.");
  state.configuration.set("archiAgent.localModel.model", "synthetic");
  let calls = 0;
  const runtime = createArchiAgentRuntime({ diagramClientFactory: () => ({ clientType: "synthetic", generationMetadata: { modelId: "synthetic", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true }, complete: async (request) => {
    calls++; const source = JSON.parse(request.messages[1]!.content).sources[0];
    const evidence = [{ sourceId: source.sourceId, originalDigest: source.originalDigest, textDigest: source.textDigest, excerpt: source.text, startOffset: 0, endOffset: source.text.length }];
    return { source: "content" as const, value: { version: 1, candidates: [{ table: "systems", row: { id: "a", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null, evidence }] } };
  } }) });
  state.openDialogAnswers.push([Uri.file(doc)], [Uri.file(root)]);
  state.inputBoxAnswers.push("pack");
  return { root, doc, runtime, run: () => buildKnowledgePackCommand({ runtime, output: window.createOutputChannel("test") }), calls: () => calls };
}
describe("K3 editor adapter (controlled answers, not native UI evidence)", () => {
  it("production K2 without existing pack, group acceptance, preview and Save use one generation", async () => {
    const s = setup(); state.quickPickAnswers.push(pick("Accept all pending"), pick("Validate and preview"), pick("Show summary and additions"), pick("systems.md"), pick("Save"));
    await s.run(); expect(s.calls()).toBe(1); expect(readdirSync(path.join(s.root, "pack"))).toHaveLength(5);
    expect(state.configurationUpdates).toEqual([]); expect(state.openedDocuments).toHaveLength(2);
    expect(state.messages.at(-1)?.text).toContain("saved:");
  });
  for (const mode of ["global", "single", "multi"]) it(`Save and use picks correct ${mode} scope`, async () => {
    const s = setup();
    if (mode !== "global") state.workspaceFolders = [{ name: "left", uri: Uri.file(s.root), index: 0 }];
    if (mode === "multi") state.workspaceFolders!.push({ name: "right", uri: Uri.file(path.join(s.root, "right")), index: 1 });
    state.quickPickAnswers.push(pick("Accept all pending"), pick("Validate and preview"), pick("Save and use"));
    if (mode === "multi") state.quickPickAnswers.push((items: readonly unknown[]) => items[1]);
    await s.run(); expect(s.calls()).toBe(1);
    expect(state.configurationUpdates[0]).toMatchObject({ value: path.join(s.root, "pack"), target: mode === "global" ? ConfigurationTarget.Global : ConfigurationTarget.WorkspaceFolder });
    expect(state.messages.at(-1)?.text).toContain("saved and activated");
  });
  for (const action of ["Save", "Save and use"]) for (const populated of [false, true]) it(`${action} collision preserves ${populated ? "populated" : "empty"} target and offers a new location without extraction`, async () => {
    const s = setup(), directory = path.join(s.root, "pack");
    const locations = vi.spyOn(window, "showOpenDialog");
    mkdirSync(directory);
    if (populated) writeFileSync(path.join(directory, "keep.txt"), "Existing owner data.");
    const extract = vi.spyOn(s.runtime, "extractDocumentCandidates");
    state.openDialogAnswers.push([Uri.file(s.root)]); state.inputBoxAnswers.push("retry-pack");
    state.quickPickAnswers.push(pick("Accept all pending"), pick("Validate and preview"), pick(action), pick("Validate and preview"), pick(action));
    await s.run();
    const failure = state.messages.find((m) => m.text.includes("save failed"));
    expect(failure?.text).toBe(`Archi Agent: save failed [location-exists]. ${directory}. Choose another new folder.`);
    expect(readdirSync(directory)).toEqual(populated ? ["keep.txt"] : []);
    if (populated) expect(readFileSync(path.join(directory, "keep.txt"), "utf8")).toBe("Existing owner data.");
    expect(readdirSync(path.join(s.root, "retry-pack"))).toHaveLength(5);
    expect(extract).toHaveBeenCalledTimes(1); expect(s.calls()).toBe(1);
    expect(locations).toHaveBeenCalledTimes(3);
    if (action === "Save") expect(state.configurationUpdates).toEqual([]);
    else expect(state.configurationUpdates).toEqual([expect.objectContaining({ value: path.join(s.root, "retry-pack"), target: ConfigurationTarget.Global })]);
  });
  for (const action of ["Save", "Save and use"]) for (const incomplete of [false, true]) it(`${action} preserves ${incomplete ? "incomplete cleanup recovery" : "fallback when recovery is absent"}`, async () => {
    const s = setup();
    const error = incomplete ? new StarterPackCreateError("write-failed", true) : { code: "write-failed" };
    const save = vi.spyOn(KnowledgePackReviewSession.prototype, "save").mockRejectedValueOnce(error);
    const extract = vi.spyOn(s.runtime, "extractDocumentCandidates");
    state.quickPickAnswers.push(pick("Accept all pending"), pick("Validate and preview"), pick(action), pick("Cancel"));
    await s.run();
    expect(state.messages.find((m) => m.text.includes("save failed"))?.text).toBe(`Archi Agent: save failed [write-failed]. ${path.join(s.root, "pack")}. ${incomplete ? (error as StarterPackCreateError).recovery : "Choose another new folder."}`);
    expect(save).toHaveBeenCalledTimes(1); expect(extract).toHaveBeenCalledTimes(1); expect(s.calls()).toBe(1);
    expect(existsSync(path.join(s.root, "pack"))).toBe(false); expect(state.configurationUpdates).toEqual([]);
  });
  it("activation failure preserves committed pack and concurrent setting", async () => {
    const s = setup(); state.configurationUpdateFailures.add("archiAgent.knowledgePackPath");
    state.configurationUpdateHook = (key) => state.configuration.set(key, "parallel-change");
    state.quickPickAnswers.push(pick("Accept all pending"), pick("Validate and preview"), pick("Save and use")); await s.run();
    expect(readdirSync(path.join(s.root, "pack"))).toHaveLength(5);
    expect(state.configuration.get("archiAgent.knowledgePackPath")).toBe("parallel-change");
    expect(state.messages.at(-1)?.text).toContain("saved, not activated"); expect(state.configurationUpdates).toHaveLength(1);
  });
  it("completed save releases session before success notification is dismissed", async () => {
    const s = setup(); state.quickPickAnswers.push(pick("Accept all pending"), pick("Validate and preview"), pick("Save"));
    vi.spyOn(window, "showInformationMessage").mockImplementation(() => new Promise(() => {}));
    await s.run();
    state.openDialogAnswers.push([Uri.file(s.doc)]); state.quickPickAnswers.push(pick("Cancel"));
    await s.run(); expect(s.calls()).toBe(2);
  });
  it("pending, review cancel, and extraction cancel never create a pack", async () => {
    const s = setup(); state.quickPickAnswers.push(pick("Validate and preview"), pick("Cancel")); await s.run();
    expect(s.calls()).toBe(1); expect(existsSync(path.join(s.root, "pack"))).toBe(false); expect(state.configurationUpdates).toEqual([]);
  });
  it("invalid/undecodable document precedes model selection and generation", async () => {
    const s = setup(); state.configuration.delete("archiAgent.localModel.model"); writeFileSync(s.doc, Buffer.from([0xff]));
    await s.run(); expect(s.calls()).toBe(0); expect(state.quickPicks).toEqual([]); expect(state.secretReads).toEqual([]);
  });
  it("Cancel extraction is zero generation and no writes", async () => {
    const s = setup(); state.progressCancelOnStart = true; await s.run(); expect(s.calls()).toBe(0); expect(existsSync(path.join(s.root, "pack"))).toBe(false);
  });
});

it("parent cancellation closes model selection and a late picker answer cannot change settings", async () => {
  setup();
  let stop!: () => void, release!: (item: unknown) => void, entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const parent = { isCancellationRequested: false, onCancellationRequested: (listener: (event: unknown) => void) => { stop = () => listener(undefined); return { dispose() {} }; } };
  const runtime = createArchiAgentRuntime();
  vi.spyOn(runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["synthetic"] });
  vi.spyOn(window, "showQuickPick").mockImplementation(async (items: any, _options: any, received?: any) => {
    expect(received).toBe(parent); entered(); return await new Promise((resolve) => { release = () => resolve(items[0]); });
  });
  const operation = selectModel(runtime, window.createOutputChannel("test"), undefined, parent);
  await ready; parent.isCancellationRequested = true; release(undefined); await operation;
  expect(state.configurationUpdates).toHaveLength(0);
});
it("parent cancellation reaches pending model listing", async () => {
  setup();
  let stop!: () => void, entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const parent = { isCancellationRequested: false, onCancellationRequested: (listener: (event: unknown) => void) => { stop = () => listener(undefined); return { dispose() {} }; } };
  const runtime = createArchiAgentRuntime();
  vi.spyOn(runtime, "listProviderModels").mockImplementation(async (_selection, options) => {
    entered(); return await new Promise((resolve) => (options!.signal! as AbortSignal).addEventListener("abort", () => resolve({ ok: false, code: "cancelled" }), { once: true }));
  });
  const operation = selectModel(runtime, window.createOutputChannel("test"), undefined, parent);
  await ready; parent.isCancellationRequested = true; stop();
  expect(await operation).toEqual({ status: "cancelled" }); expect(state.configurationUpdates).toHaveLength(0);
});
