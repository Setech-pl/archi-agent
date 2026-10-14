import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import { buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { generateDiagramCommand } from "../../vscode-extension/src/commands/generate-sequence-diagram.js";
import { buildKnowledgePackCommand } from "../../vscode-extension/src/commands/build-knowledge-pack.js";
import { selectModel, selectProviderProfile } from "../../vscode-extension/src/commands/local-provider-selection.js";
import { ConfigurationWorkbench } from "../../vscode-extension/src/workbench/configuration.js";
import { readLocalModelSettings } from "../../vscode-extension/src/settings.js";
import { secretIdForProfile } from "../../vscode-extension/src/api-key-storage.js";
import { settingKeys as k, settingsSection } from "../../vscode-extension/src/contributions.js";
import { state, resetDouble, window, workspace, secretStorage, panels, Uri, webviewDrivers, configurationChanged } from "../doubles/vscode-module-double.js";
import type { RemoteJsonRequest } from "../../src/node/llm/remote-json-transport.js";
import * as providerConfiguration from "../../vscode-extension/src/provider-configuration.js";

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-audit-config-")));
const pack = path.join(root, "pack"); mkdirSync(pack);
for (const [name, content] of Object.entries(buildPackFiles())) writeFileSync(path.join(pack, name), content);
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => { resetDouble(); put(k.knowledgePackPath, pack); });
afterEach(() => { vi.restoreAllMocks(); resetDouble(); });
function put(key: string, value: unknown) {
  const full = `${settingsSection}.${key}`; state.configuration.set(full, value);
  state.configurationInspect.set(full, { ...state.configurationInspect.get(full), globalValue: value });
}
function chosen(profile = "local-lm-studio", model = "initial-model") {
  put(k.localModelProfile, profile); put(k.localModelSelectedModel, model); put(k.localModelSelectedModelProfile, profile);
}
const output = () => window.createOutputChannel("test");
const clouds = ["cloud-anthropic", "cloud-openai", "cloud-openrouter"];
const profiles = ["local-lm-studio", "local-ollama", ...clouds];
const marker = (profile: string) => `synthetic-${profile}-audit-key`;
function keys() { for (const profile of clouds) state.secrets.set(secretIdForProfile(profile)!, marker(profile)); }
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function listingRuntime() {
  const runtime = createArchiAgentRuntime();
  vi.spyOn(runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["picked-model"] });
  return runtime;
}
function notifyingUpdates() {
  const original = workspace.getConfiguration;
  vi.spyOn(workspace, "getConfiguration").mockImplementation((...args) => {
    const config = original(...args);
    return { ...config, async update(key, value, target) {
      const previous = config.inspect(key)?.globalValue;
      await config.update(key, value, target);
      if (!Object.is(previous, value)) configurationChanged({ affectsConfiguration: section => section === `${args[0]}.${key}` });
    } };
  });
}
async function workbench(runtime = listingRuntime()) {
  const controller = new ConfigurationWorkbench(runtime, output() as never, secretStorage as never); controller.open();
  await vi.waitFor(() => expect(panels.at(-1)?.webview.messages.some(m => m.type === "state")).toBe(true));
  const panel = panels.at(-1)!, latest = () => panel.webview.messages.filter(m => m.type === "state").at(-1);
  const apply = (profile = "cloud-openai", model = "newer-model") => panel.receive({ op: "apply", revision: latest().revision, baseRevision: latest().revision,
    form: { profile, model, endpoint: "http://127.0.0.1:1234/v1", timeout: 120 } });
  return { controller, latest, apply };
}
// Remote client adapters and runtime are production code; only their last transport is controlled.
describe("AUD-001 coherent operation configuration", () => {
  it.each(profiles.flatMap(from => clouds.flatMap(to => ["sequence", "component"].map(type => ({ from, to, type })))))
   ("$type $from -> $to binds listing, generator and reviewer to the final profile", async ({ from, to, type }) => {
      keys(); chosen(from, ""); const requests: RemoteJsonRequest[] = [];
      const runtime = createArchiAgentRuntime({ remoteTransport: { async exchange(request) {
        requests.push(request);
        if (request.endpoint.endsWith("models")) return JSON.stringify({ data: [{ id: "final-model", type: "model", capabilities: { structured_outputs: { supported: true } }, supported_parameters: ["response_format"] }], has_more: false });
        const body = JSON.parse(request.body!), input = JSON.parse(body.messages[to === "cloud-anthropic" ? 0 : 1].content);
        const review = requests.filter(r => !r.endpoint.endsWith("models")).length === 2;
        if (!review) chosen(from, "concurrent-newer-model"); // Reviewer must keep the established operation snapshot.
        const plan = review ? undefined : type === "sequence" ? { version: 3, groundedSteps: [{ order: 1, operationId: "op-0001", label: "Registers frames" }], userStatedSteps: [] } :
          { version: 1, elementIds: input.snapshot.elements.map((e: { id: string }) => e.id), groundedDependencies: input.relationshipCatalog.map((d: { dependencyId: string }) => d.dependencyId), userStatedDependencies: [] };
        const content = JSON.stringify(review ? { accepted: true, confirmedUserStatedFactIds: [], violations: [] } : plan);
        return to === "cloud-anthropic" ? JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] }) :
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] });
      } } });
      state.quickPickAnswers.push(items => items.find((i: any) => i.id === type), items => {
        chosen(to, ""); return items.find((i: any) => i.source === "description");
      }, items => items[0]);
      state.inputBoxAnswers.push("Audit", "Telescope Scheduler registers frames in Image Archive.");
      await generateDiagramCommand({ runtime, output: output() as never, secrets: secretStorage as never });
      const prefix = to.replace("cloud-", ""), endpoint = to === "cloud-anthropic" ? "anthropic-messages" : `${prefix}-chat-completions`;
      expect(requests.map(r => r.endpoint)).toEqual([`${prefix}-models`, endpoint, endpoint]);
      for (const request of requests) {
        expect(to === "cloud-anthropic" ? request.headers["x-api-key"] : request.headers.Authorization).toBe(to === "cloud-anthropic" ? marker(to) : `Bearer ${marker(to)}`);
        expect(request.body ?? "").not.toContain(marker(to));
      }
      expect(requests.slice(1).map(r => JSON.parse(r.body!).model)).toEqual(["final-model", "final-model"]);
      expect(state.openedDocuments.length, state.outputLines.join("\n")).toBe(2);
      expect(state.outputLines.join("\n")).not.toContain(marker(to));
    });
  it.each(["flow-cancel", "picker-cancel", "listing-stale", "picker-stale"])("%s produces no generation or review (listing counted separately)", async scenario => {
    keys(); chosen("cloud-anthropic", ""); const runtime = listingRuntime(), generate = vi.spyOn(runtime, "generateDiagram");
    if (scenario === "listing-stale") vi.mocked(runtime.listProviderModels).mockImplementation(async () => { chosen("cloud-openai", "newer"); return { ok: true, models: ["late"] }; });
    state.quickPickAnswers.push(items => items[0], items => scenario === "flow-cancel" ? undefined : items.find((i: any) => i.source === "description"), items => {
      if (scenario === "picker-stale") chosen("cloud-openai", "newer"); return scenario === "picker-cancel" ? undefined : items[0];
    });
    state.inputBoxAnswers.push("Audit", "Telescope Scheduler registers frames in Image Archive.");
    await generateDiagramCommand({ runtime, output: output() as never, secrets: secretStorage as never });
    expect(runtime.listProviderModels).toHaveBeenCalledTimes(scenario === "flow-cancel" ? 0 : 1);
    expect(generate).not.toHaveBeenCalled(); expect(state.configurationUpdates).toEqual([]);
  });
  it("uses an established snapshot if settings change while its credential is read", async () => {
    keys(); chosen("cloud-anthropic", "frozen-model"); const runtime = listingRuntime(), generate = vi.spyOn(runtime, "generateDiagram").mockResolvedValue({ status: "failed", stage: "invalid-generator-output", issues: [], ambiguities: [], unconfirmedNewParticipants: [] });
    vi.spyOn(secretStorage, "get").mockImplementation(async id => { chosen("cloud-openai", "newer"); return id === secretIdForProfile("cloud-anthropic") ? marker("cloud-anthropic") : marker("cloud-openai"); });
    state.quickPickAnswers.push(items => items[0], items => items.find((i: any) => i.source === "description"));
    state.inputBoxAnswers.push("Audit", "Telescope Scheduler registers frames in Image Archive.");
    await generateDiagramCommand({ runtime, output: output() as never, secrets: secretStorage as never });
    expect(generate.mock.calls[0]?.[0].generator).toMatchObject({ profileId: "cloud-anthropic", modelId: "frozen-model", credential: { value: marker("cloud-anthropic") } });
  });
  it.each(clouds)("document extraction freezes %s with its matching credential", async profile => {
    keys(); chosen(profile, "extraction-model"); const requests: RemoteJsonRequest[] = [];
    const runtime = createArchiAgentRuntime({ remoteTransport: { async exchange(request) {
      requests.push(request); chosen("cloud-openai", "concurrent-newer-model");
      const body = JSON.parse(request.body!), source = JSON.parse(body.messages[profile === "cloud-anthropic" ? 0 : 1].content).sources[0];
      const content = JSON.stringify({ version: 1, candidates: [{ table: "systems", row: { id: "alpha", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null,
        evidence: [{ sourceId: source.sourceId, originalDigest: source.originalDigest, textDigest: source.textDigest, excerpt: source.text, startOffset: 0, endOffset: source.text.length }] }] });
      return profile === "cloud-anthropic" ? JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] }) : JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] });
    } } });
    webviewDrivers.push((panel, view) => panel.receive({ op: "cancel", revision: view.revision }));
    await buildKnowledgePackCommand({ runtime, output: output() as never, secrets: secretStorage as never }, { folder: undefined }, { kind: "editor-buffer", uri: "untitled:audit.md", type: "md", content: "Alpha service." });
    expect(requests).toHaveLength(1); expect(JSON.parse(requests[0]!.body!).model).toBe("extraction-model");
    expect(requests[0]!.endpoint).toBe(profile === "cloud-anthropic" ? "anthropic-messages" : `${profile.replace("cloud-", "")}-chat-completions`);
    expect(profile === "cloud-anthropic" ? requests[0]!.headers["x-api-key"] : requests[0]!.headers.Authorization).toBe(profile === "cloud-anthropic" ? marker(profile) : `Bearer ${marker(profile)}`);
    expect(panels).toHaveLength(1); expect(state.configurationUpdates).toEqual([]);
  });
  it("scoped document extraction keeps the project endpoint after model selection", async () => {
    chosen("local-lm-studio", ""); const uri = Uri.file(root); state.workspaceFolders = [{ name: "Project", index: 0, uri }];
    state.configurationInspect.set(`${settingsSection}.${k.localModelBaseUrl}@${root}`, { workspaceFolderValue: "http://127.0.0.1:6789/v1" });
    const configs: unknown[] = [], runtime = createArchiAgentRuntime({ diagramClientFactory: config => {
      configs.push(config); return { clientType: "synthetic", generationMetadata: { modelId: "picked-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true }, async complete() { return { source: "content", value: {} }; } };
    } });
    vi.spyOn(runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["picked-model"] }); state.quickPickAnswers.push(items => items[0]);
    await buildKnowledgePackCommand({ runtime, output: output() as never }, { folder: state.workspaceFolders[0] as never }, { kind: "editor-buffer", uri: "untitled:audit.md", type: "md", content: "Alpha service." });
    expect(configs).toEqual([expect.objectContaining({ baseUrl: "http://127.0.0.1:6789/v1", modelId: "picked-model" })]);
  });
  it("invalidated document model picker performs one listing and zero extraction calls", async () => {
    chosen("local-lm-studio", ""); const complete = vi.fn(), runtime = createArchiAgentRuntime({ diagramClientFactory: () => { complete(); throw new Error("must not generate"); } });
    const list = vi.spyOn(runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["late"] });
    state.quickPickAnswers.push(items => { chosen("cloud-openai", "newer-model"); return items[0]; });
    await buildKnowledgePackCommand({ runtime, output: output() as never }, { folder: undefined }, { kind: "editor-buffer", uri: "untitled:audit.md", type: "md", content: "Alpha service." });
    expect(list).toHaveBeenCalledTimes(1); expect(complete).not.toHaveBeenCalled(); expect(state.configurationUpdates).toEqual([]);
  });
});

describe("AUD-002 stale picker publication", () => {
  it.each(["listing", "picker"])("external ABA during %s never revives the stale picker", async phase => {
    chosen("local-lm-studio", "intent-A-model"); const runtime = listingRuntime();
    const externalABA = async () => {
      for (const [profile, model] of [["cloud-openai", "intent-B-model"], ["local-lm-studio", "intent-A-model"]]) {
        for (const [key, value] of [[k.localModelProfile, profile], [k.localModelSelectedModel, model], [k.localModelSelectedModelProfile, profile]]) {
          await workspace.getConfiguration(settingsSection).update(key!, value, 1);
          configurationChanged({ affectsConfiguration: section => section === `${settingsSection}.${key}` });
        }
      }
    };
    if (phase === "listing") vi.mocked(runtime.listProviderModels).mockImplementation(async () => { await externalABA(); return { ok: true, models: ["stale-picker-model"] }; });
    state.quickPickAnswers.push(async items => { if (phase === "picker") await externalABA(); return items[0]; });
    expect((await selectModel(runtime, output() as never)).status).toBe("cancelled");
    expect(state.configurationUpdates).toHaveLength(6); // External writes only; zero stale writes.
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { profileId: "local-lm-studio", modelId: "intent-A-model" } });
    expect(state.configuration.get(`${settingsSection}.${k.localModelSelectedModelProfile}`)).toBe("local-lm-studio");
  });
  it.each(["unchanged", "unrelated-setting", "other-resource", "own-notifications", "legacy-own-notifications"])
    ("allows publication with %s", async scenario => {
      if (scenario !== "legacy-own-notifications") chosen();
      notifyingUpdates(); const runtime = listingRuntime(), uri = Uri.file(root);
      state.quickPickAnswers.push(items => {
        if (scenario === "unrelated-setting") configurationChanged({ affectsConfiguration: section => section === "editor.fontSize" });
        if (scenario === "other-resource") {
          state.configurationInspect.set(`${settingsSection}.${k.localModelBaseUrl}@${root}/other`, { workspaceFolderValue: "http://127.0.0.1:7890/v1" });
          configurationChanged({ affectsConfiguration: (section, scope) => section === `${settingsSection}.${k.localModelBaseUrl}` && scope !== undefined && "fsPath" in scope && scope.fsPath === `${root}/other` });
        }
        return items[0];
      });
      const result = await selectModel(runtime, output() as never, undefined, undefined, scenario === "other-resource" ? uri as never : undefined);
      expect(result).toMatchObject({ status: "selected", settings: { profileId: "local-lm-studio", modelId: "picked-model" } });
      expect(state.configurationUpdates).toHaveLength(3);
      expect(state.configuration.get(`${settingsSection}.${k.localModelSelectedModelProfile}`)).toBe("local-lm-studio");
    });
  it.each([1, 2, 3])("external ABA after publication write %s stops remaining writes", async write => {
    chosen(); const runtime = listingRuntime(), original = workspace.getConfiguration;
    let ownWrites = 0;
    vi.spyOn(workspace, "getConfiguration").mockImplementation((...args) => {
      const config = original(...args);
      return { ...config, async update(key, value, target) {
        await config.update(key, value, target);
        configurationChanged({ affectsConfiguration: section => section === `${settingsSection}.${key}` });
        if (++ownWrites === write) {
          for (const [profile, model] of [["cloud-openai", "intent-B-model"], ["local-lm-studio", "initial-model"]]) {
            for (const [changedKey, changedValue] of [[k.localModelProfile, profile], [k.localModelSelectedModel, model], [k.localModelSelectedModelProfile, profile]]) {
              await config.update(changedKey!, changedValue, 1);
              configurationChanged({ affectsConfiguration: section => section === `${settingsSection}.${changedKey}` });
            }
          }
        }
      } };
    });
    state.quickPickAnswers.push(items => items[0]);
    expect((await selectModel(runtime, output() as never)).status).toBe("cancelled");
    expect(state.configurationUpdates).toHaveLength(write + 6);
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { profileId: "local-lm-studio", modelId: "initial-model" } });
    expect(state.configuration.get(`${settingsSection}.${k.localModelSelectedModelProfile}`)).toBe("local-lm-studio");
  });
  it("observes ABA already during the first SecretStorage await", async () => {
    chosen("cloud-anthropic", ""); keys(); const runtime = listingRuntime();
    vi.spyOn(secretStorage, "get").mockImplementation(async () => {
      chosen("cloud-openai", "newer"); configurationChanged();
      chosen("cloud-anthropic", ""); configurationChanged();
      return marker("cloud-anthropic");
    });
    expect((await selectModel(runtime, output() as never, secretStorage as never)).status).toBe("cancelled");
    expect(runtime.listProviderModels).not.toHaveBeenCalled(); expect(state.configurationUpdates).toEqual([]);
  });
  it("checks the original revision again after the publication await", async () => {
    chosen(); notifyingUpdates(); const publish = providerConfiguration.publishProviderConfiguration;
    vi.spyOn(providerConfiguration, "publishProviderConfiguration").mockImplementation(async (...args) => {
      const published = await publish(...args);
      chosen("cloud-openai", "newer"); configurationChanged();
      chosen(); configurationChanged();
      return published;
    });
    state.quickPickAnswers.push(items => items[0]);
    expect((await selectModel(listingRuntime(), output() as never)).status).toBe("cancelled");
    expect(state.configurationUpdates).toHaveLength(3); // All preceded the external changes.
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { profileId: "local-lm-studio", modelId: "initial-model" } });
  });
  it("a no-op write cannot consume a relevant external event with unchanged final values", async () => {
    chosen(); const snapshot = providerConfiguration.captureProviderConfiguration();
    const original = workspace.getConfiguration;
    vi.spyOn(workspace, "getConfiguration").mockImplementation((...args) => {
      const config = original(...args);
      return { ...config, async update(...updates) {
        await config.update(...updates);
        configurationChanged({ affectsConfiguration: section => section === `${settingsSection}.${k.localModelProfile}` });
      } };
    });
    try {
      await expect(providerConfiguration.publishProviderConfiguration(snapshot, [[k.localModelProfile, "local-lm-studio"]]))
        .rejects.toBeInstanceOf(providerConfiguration.ProviderConfigurationConflict);
    } finally { snapshot.dispose(); }
  });
  it.each(["selected", "cancelled", "failed", "throw", "provider", "apply", "closed-apply"])("disposes configuration observation after %s", async outcome => {
    chosen(); let active = 0;
    const host = workspace as typeof workspace & { onDidChangeConfiguration: (listener: unknown) => { dispose(): void } };
    const subscribe = host.onDidChangeConfiguration;
    vi.spyOn(host, "onDidChangeConfiguration").mockImplementation(listener => {
      active++; const subscription = subscribe(listener);
      return { dispose() { active--; subscription.dispose(); } };
    });
    const runtime = listingRuntime();
    if (outcome === "apply" || outcome === "closed-apply") {
      const s = await workbench(runtime);
      if (outcome === "closed-apply") vi.spyOn(secretStorage, "get").mockImplementationOnce(async () => { s.controller.dispose(); return undefined; });
      await s.apply(); s.controller.dispose();
    } else {
      if (outcome === "failed") state.configurationUpdateFailureCalls.add(1);
      if (outcome === "throw") vi.mocked(runtime.listProviderModels).mockRejectedValue(new Error("synthetic failure"));
      state.quickPickAnswers.push(items => outcome === "cancelled" ? undefined : items[0]);
      if (outcome === "throw") await expect(selectModel(runtime, output() as never)).rejects.toThrow("synthetic failure");
      else if (outcome === "provider") await selectProviderProfile(runtime, output() as never);
      else await selectModel(runtime, output() as never);
    }
    expect(active).toBe(0);
  });
  it.each(["legacy", "profile"].flatMap(mode => ["listing", "picker"].flatMap(phase => ["profile", "endpoint", "model", "timeout"].map(change => ({ mode, phase, change })))))
   ("$mode $phase rejects newer $change without any writes", async ({ mode, phase, change }) => {
      if (mode === "profile") chosen(); else put(k.localModelId, "legacy-model");
      const runtime = listingRuntime(); const mutate = () => {
        if (change === "profile") chosen("cloud-openai", "newer-model");
        else if (change === "endpoint") put(k.localModelBaseUrl, "http://127.0.0.1:4567/v1");
        else if (change === "timeout") put(k.localModelTimeoutSeconds, 42);
        else put(mode === "profile" ? k.localModelSelectedModel : k.localModelId, "newer-model");
      };
      if (phase === "listing") vi.mocked(runtime.listProviderModels).mockImplementation(async () => { mutate(); return { ok: true, models: ["late"] }; });
      state.quickPickAnswers.push(items => { if (phase === "picker") mutate(); return items[0]; });
      const result = await selectModel(runtime, output() as never);
      expect(result.status).toBe("cancelled"); expect(state.configurationUpdates).toEqual([]);
      const actual = readLocalModelSettings(workspace.getConfiguration(settingsSection)); expect(actual.ok).toBe(true);
      if (actual.ok) {
        if (change === "profile") expect(actual.settings).toMatchObject({ profileId: "cloud-openai", modelId: "newer-model" });
        if (change === "endpoint") expect(actual.settings.baseUrl).toBe("http://127.0.0.1:4567/v1");
        if (change === "model") expect(actual.settings.modelId).toBe("newer-model");
      }
    });
  it.each(["legacy", "profile"].flatMap(mode => ["listing", "picker"].map(phase => ({ mode, phase }))))
   ("$mode late $phase preserves a completed Configuration Apply", async ({ mode, phase }) => {
      if (mode === "profile") chosen(); keys(); const runtime = listingRuntime(), s = await workbench(runtime);
      if (phase === "listing") vi.mocked(runtime.listProviderModels).mockImplementationOnce(async () => { await s.apply(); return { ok: true, models: ["late"] }; });
      state.quickPickAnswers.push(async items => { if (phase === "picker") await s.apply(); return items[0]; });
      expect((await selectModel(runtime, output() as never)).status).toBe("cancelled");
      expect(s.latest().applied).toBe(true); const settings = readLocalModelSettings(workspace.getConfiguration(settingsSection));
      expect(settings).toMatchObject({ ok: true, settings: { profileId: "cloud-openai", modelId: "newer-model" } }); s.controller.dispose();
    });
  it("legacy picker preserves a newer explicit null profile rather than restoring LM Studio", async () => {
    const runtime = listingRuntime(); vi.mocked(runtime.listProviderModels).mockImplementation(async () => {
      put(k.localModelProfile, null); return { ok: true, models: ["late"] };
    });
    state.quickPickAnswers.push(items => items[0]);
    expect((await selectModel(runtime, output() as never)).status).toBe("cancelled");
    expect(state.configurationUpdates).toEqual([]); expect(state.configuration.get(`${settingsSection}.${k.localModelProfile}`)).toBeNull();
  });
  it("a provider change during SecretStorage read prevents even listing", async () => {
    keys(); chosen("cloud-anthropic", ""); const runtime = listingRuntime();
    vi.spyOn(secretStorage, "get").mockImplementation(async () => { chosen("cloud-openai", "newer-model"); return marker("cloud-anthropic"); });
    expect((await selectModel(runtime, output() as never, secretStorage as never)).status).toBe("cancelled");
    expect(runtime.listProviderModels).not.toHaveBeenCalled(); expect(state.configurationUpdates).toEqual([]);
  });
  it("a second picker commits first, including an ABA publication of the same model", async () => {
    chosen("local-lm-studio", "picked-model"); const runtime = listingRuntime(), gate = deferred<any>();
    vi.mocked(runtime.listProviderModels).mockImplementationOnce(() => gate.promise);
    const first = selectModel(runtime, output() as never); await vi.waitFor(() => expect(runtime.listProviderModels).toHaveBeenCalledTimes(1));
    state.quickPickAnswers.push(items => items[0]); expect((await selectModel(runtime, output() as never)).status).toBe("selected");
    const count = state.configurationUpdates.length; gate.resolve({ ok: true, models: ["old-picker"] });
    expect((await first).status).toBe("cancelled"); expect(state.configurationUpdates).toHaveLength(count);
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { modelId: "picked-model" } });
  });
  it.each(["legacy", "profile"].flatMap(mode => [1, 2, 3].map(write => ({ mode, write }))))
   ("$mode rejects external changes after write $write, without rollback", async ({ mode, write }) => {
      if (mode === "profile") chosen(); const runtime = listingRuntime(); const original = workspace.getConfiguration;
      vi.spyOn(workspace, "getConfiguration").mockImplementation((...args) => { const config = original(...args); return { ...config, async update(...updateArgs) {
        await config.update(...updateArgs); if (state.configurationUpdates.length === write) {
          await config.update(k.localModelProfile, "cloud-openai", 1); await config.update(k.localModelSelectedModel, "newer-model", 1); await config.update(k.localModelSelectedModelProfile, "cloud-openai", 1);
        }
      } }; });
      state.quickPickAnswers.push(items => items[0]); expect((await selectModel(runtime, output() as never)).status).toBe("cancelled");
      expect(state.configurationUpdates).toHaveLength(write + 3);
      expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { profileId: "cloud-openai", modelId: "newer-model" } });
    });
  it.each(["legacy", "profile"].flatMap(mode => [1, 2, 3].map(write => ({ mode, write }))))
   ("$mode write error $write never reports selected or restores stale values", async ({ mode, write }) => {
      if (mode === "profile") chosen(); const runtime = listingRuntime(); state.configurationUpdateFailureCalls.add(write);
      state.configurationUpdateHook = () => { if (state.configurationUpdates.length === write) chosen("cloud-openai", "newer-model"); };
      state.quickPickAnswers.push(items => items[0]); expect((await selectModel(runtime, output() as never)).status).toBe("failed");
      expect(state.configurationUpdates).toHaveLength(write);
      expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { profileId: "cloud-openai", modelId: "newer-model" } });
    });
  it.each(["picker", "apply"])("a %s publication cannot interleave a pending picker write", async contender => {
    chosen(); keys(); const runtime = listingRuntime(), s = await workbench(runtime), gate = deferred<void>(), entered = deferred<void>(), original = workspace.getConfiguration;
    let pause = true;
    vi.spyOn(workspace, "getConfiguration").mockImplementation((...args) => { const config = original(...args); return { ...config, async update(...updateArgs) {
      await config.update(...updateArgs); if (pause) { pause = false; entered.resolve(); await gate.promise; }
    } }; });
    state.quickPickAnswers.push(items => items[0]); const first = selectModel(runtime, output() as never); await entered.promise;
    if (contender === "apply") { await s.apply(); expect(s.latest().applied).toBe(false); expect(s.latest().error).toBeTruthy(); }
    else { expect((await selectModel(runtime, output() as never)).status).toBe("cancelled"); }
    expect(state.configurationUpdates).toHaveLength(1); gate.resolve(); expect((await first).status).toBe("selected");
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { modelId: "picked-model" } }); s.controller.dispose();
  });
  it.each([1, 2, 3, 4, 5, 6, 7])("Apply checks a newer external configuration after write %i", async write => {
    chosen(); const s = await workbench(), original = workspace.getConfiguration;
    vi.spyOn(workspace, "getConfiguration").mockImplementation((...args) => { const config = original(...args); return { ...config, async update(...updateArgs) {
      await config.update(...updateArgs); if (state.configurationUpdates.length === write) {
        await config.update(k.localModelProfile, "cloud-openrouter", 1); await config.update(k.localModelSelectedModel, "external-model", 1); await config.update(k.localModelSelectedModelProfile, "cloud-openrouter", 1);
      }
    } }; });
    await s.apply("local-lm-studio"); expect(s.latest().applied).toBe(false); expect(s.latest().error).toBeTruthy(); expect(state.configurationUpdates).toHaveLength(write + 3);
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { profileId: "cloud-openrouter", modelId: "external-model" } }); s.controller.dispose();
  });
  it("Apply pending during initial publication cannot supersede a newer picker", async () => {
    chosen(); const runtime = listingRuntime(), s = await workbench(runtime), gate = deferred<string | undefined>();
    const get = vi.spyOn(secretStorage, "get").mockImplementationOnce(() => gate.promise);
    const apply = s.apply(); await vi.waitFor(() => expect(get).toHaveBeenCalled());
    state.quickPickAnswers.push(items => items[0]); expect((await selectModel(runtime, output() as never)).status).toBe("selected");
    gate.resolve(undefined); await apply; expect(s.latest().applied).toBe(false);
    expect(readLocalModelSettings(workspace.getConfiguration(settingsSection))).toMatchObject({ ok: true, settings: { modelId: "picked-model" } }); s.controller.dispose();
  });
  it.each(["listing", "picker", "write"])("parent cancellation during %s never reports selected", async phase => {
    chosen(); const runtime = listingRuntime(), token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
    if (phase === "listing") vi.mocked(runtime.listProviderModels).mockImplementation(async () => { token.isCancellationRequested = true; return { ok: true, models: ["late"] }; });
    state.quickPickAnswers.push(items => { if (phase === "picker") token.isCancellationRequested = true; return items[0]; });
    if (phase === "write") state.configurationUpdateHook = () => { token.isCancellationRequested = true; };
    expect((await selectModel(runtime, output() as never, undefined, token as never)).status).toBe("cancelled");
    expect(state.configurationUpdates).toHaveLength(phase === "write" ? 1 : 0);
  });
  it("keeps scoped endpoint and timeout while writing only global model bindings", async () => {
    chosen(); const uri = Uri.file(root); state.workspaceFolders = [{ name: "Project", index: 0, uri }];
    state.configurationInspect.set(`${settingsSection}.${k.localModelBaseUrl}@${root}`, { workspaceFolderValue: "http://127.0.0.1:6789/v1" });
    state.configurationInspect.set(`${settingsSection}.${k.localModelTimeoutSeconds}@${root}`, { workspaceFolderValue: 42 });
    const runtime = listingRuntime(); state.quickPickAnswers.push(items => items[0]);
    expect(await selectModel(runtime, output() as never, undefined, undefined, uri as never)).toMatchObject({ status: "selected", settings: { baseUrl: "http://127.0.0.1:6789/v1", timeoutMs: 42000, modelId: "picked-model" } });
    expect(runtime.listProviderModels).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: "http://127.0.0.1:6789/v1", timeoutMs: 42000 }), expect.anything());
    expect(state.configurationUpdates.every(u => u.target === 1)).toBe(true);
  });
  it("workspace removal during a picker invalidates publication", async () => {
    chosen(); state.workspaceFolders = [{ name: "Project", index: 0, uri: Uri.file(root) }]; const runtime = listingRuntime();
    state.quickPickAnswers.push(items => { state.workspaceFolders = []; return items[0]; });
    expect((await selectModel(runtime, output() as never)).status).toBe("cancelled"); expect(state.configurationUpdates).toEqual([]);
  });
});
