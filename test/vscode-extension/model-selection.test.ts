import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import { ConfigurationWorkbench } from "../../vscode-extension/src/workbench/configuration.js";
import { configurationHtml } from "../../vscode-extension/src/workbench/configuration-ui.js";
import { resetDouble, state, panels, window, secretStorage } from "../doubles/vscode-module-double.js";
beforeEach(resetDouble);
afterEach(() => { resetDouble(); vi.restoreAllMocks(); });
const ollama = { profile: "local-ollama", endpoint: "http://127.0.0.1:1234/v1", timeout: 120, model: "" };
async function setup() {
  const runtime = createArchiAgentRuntime(), workbench = new ConfigurationWorkbench(runtime, window.createOutputChannel("test") as never, secretStorage as never);
  workbench.open(); await vi.waitFor(() => expect(panels[0]?.webview.messages.some(m => m.type === "state")).toBe(true));
  const panel = panels[0]!, latest = () => panel.webview.messages.filter(m => m.type === "state").at(-1);
  const send = (op: string, extra = {}) => panel.receive({ op, revision: latest().revision, ...extra });
  return { runtime, workbench, panel, latest, send };
}
function client() {
  const html = configurationHtml(), elements = new Map<string, any>(), messages: any[] = [];
  for (const m of html.matchAll(/id="([^"]+)"/g)) elements.set(m[1]!, { value: "", disabled: false, textContent: "", options: [], addEventListener(e: string, f: any) { this[e] = f; }, setAttribute() {}, replaceChildren() { this.options = []; }, append(o: any) { this.options.push(o); }, focus() {} });
  let receive!: (event: any) => void, saved: any;
  runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)![1]!, { acquireVsCodeApi: () => ({ getState: () => saved, setState: (v: any) => { saved = v; }, postMessage: (v: any) => messages.push(v) }), document: { getElementById: (id: string) => elements.get(id), createElement: () => ({}) }, window: { addEventListener: (_: string, f: any) => { receive = f; } } });
  return { elements, messages, receive: (data: any) => receive({ data }) };
}
describe("FU2 model-list host/webview boundary", () => {
  it("lists the unsaved visible profile without writing settings", async () => {
    const s = await setup(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["gemma3:27b", "qwen3:30b"] });
    await s.send("draft-changed", { dirty: true, form: ollama }); await s.send("models", { form: ollama });
    expect(list.mock.calls[0]?.[0]).toMatchObject({ profileId: "local-ollama", timeoutMs: 120000 });
    expect(list.mock.calls[0]?.[0]).not.toHaveProperty("baseUrl"); // Runtime pins Ollama to its fixed loopback endpoint.
    expect(s.latest().form.profile).toBe("local-lm-studio"); expect(s.latest().models).toEqual(["gemma3:27b", "qwen3:30b"]); expect(s.latest().busy).toBe(""); expect(state.configurationUpdates).toEqual([]);
  });
  it("uses the visible LM Studio URL and timeout, preserving endpoint validation", async () => {
    const s = await setup(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: [] });
    const form = { ...ollama, profile: "local-lm-studio", endpoint: "http://127.0.0.1:4321/v1", timeout: 42 };
    await s.send("models", { form }); expect(list.mock.calls[0]?.[0]).toMatchObject({ baseUrl: form.endpoint, timeoutMs: 42000 });
    await s.send("models", { form: { ...form, endpoint: "https://example.invalid/v1" } }); expect(list).toHaveBeenCalledTimes(1); expect(s.latest().error).toContain("loopback"); expect(s.latest().busy).toBe("");
  });
  it("renders selectable exact IDs and saves a selection only through Apply", async () => {
    const s = await setup(), c = client(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["gemma3:27b", "qwen3:30b"] });
    c.receive(s.latest()); c.elements.get("profile").value = "local-ollama"; c.elements.get("profile").input();
    expect(c.elements.get("models-refresh").disabled).toBe(false); await s.panel.receive(c.messages.at(-1));
    c.elements.get("models-refresh").onclick(); await s.panel.receive(c.messages.at(-1)); c.receive(s.latest());
    const select = c.elements.get("models"); expect(select.disabled).toBe(false); expect(select.options.map((o: any) => [o.value, o.textContent])).toEqual([["", "Choose a model / Wybierz model"], ["gemma3:27b", "gemma3:27b"], ["qwen3:30b", "qwen3:30b"]]);
    expect(c.elements.get("model").value).toBe(""); select.value = "qwen3:30b"; select.onchange(); await s.panel.receive(c.messages.at(-1));
    expect(state.configurationUpdates).toEqual([]); await s.send("ready"); c.receive(s.latest()); expect(c.elements.get("model").value).toBe("qwen3:30b"); expect(c.elements.get("models").disabled).toBe(false);
    c.elements.get("apply").onclick(); await s.panel.receive(c.messages.at(-1)); c.receive(s.latest()); c.receive({ type: "apply-finished" });
    expect(list).toHaveBeenCalledTimes(1); expect(state.configuration.get("archiAgent.localModel.selectedModel")).toBe("qwen3:30b"); expect(state.configuration.get("archiAgent.localModel.selectedModelProfile")).toBe("local-ollama");
    s.workbench.dispose(); s.workbench.open(); await vi.waitFor(() => expect(panels[1]?.webview.messages.filter(m => m.type === "state").at(-1)?.form.model).toBe("qwen3:30b"));
  });
  it.each([
    [{ ok: true, models: [] }, "empty model list", "pustą listę"],
    [{ ok: false, code: "invalid-model-list" }, "invalid model list", "niepoprawną listę"],
    [{ ok: false, code: "connection-failed" }, "Could not read models", "Nie udało się"]
  ])("separates empty/invalid/error, clears loading and permits retry (%s)", async (result, en, pl) => {
    const s = await setup(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValueOnce(result as never).mockResolvedValueOnce({ ok: true, models: ["recovered"] });
    await s.send("models", { form: ollama }); const failure = s.latest(); expect(failure.modelMessage).toContain(en); expect(failure.modelMessage).toContain(pl); expect(failure.modelMessage).toContain("Refresh Models"); expect(failure.busy).toBe(""); expect(failure.models).toEqual([]);
    await s.send("models", { form: ollama }); expect(s.latest().models).toEqual(["recovered"]); expect(s.latest().busy).toBe(""); expect(list).toHaveBeenCalledTimes(2);
  });
  it.each(["profile", "endpoint"])("rejects a late reply after the draft %s changes", async field => {
    const s = await setup(); let release!: (r: any) => void;
    const list = vi.spyOn(s.runtime, "listProviderModels").mockImplementation(() => new Promise(r => { release = r; }));
    const original = { ...ollama, profile: "local-lm-studio" }, pending = s.send("models", { form: original }); await vi.waitFor(() => expect(list).toHaveBeenCalled());
    const next = { ...original, [field]: field === "profile" ? "local-ollama" : "http://127.0.0.1:4321/v1" };
    await s.send("draft-changed", { dirty: true, form: next }); expect(list.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    release({ ok: true, models: ["wrong-profile"] }); await pending; expect(s.latest().models).toEqual([]); expect(s.latest().diagnostic).toBe(""); expect(s.latest().busy).toBe("");
  });
  it.each(["profile", "endpoint", "timeout", "discard"])("does not send a superseded request during initial state publication (%s)", async change => {
    const s = await setup(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["unexpected"] });
    let release!: () => void;
    const get = vi.spyOn(secretStorage, "get").mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(undefined); }));
    const original = { ...ollama, profile: "local-lm-studio" }, pending = s.send("models", { form: original });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    if (change === "discard") await s.send("discard");
    else await s.send("draft-changed", { dirty: true, form: { ...original, [change]: change === "profile" ? "local-ollama" : change === "endpoint" ? "http://127.0.0.1:4321/v1" : 42 } });
    release(); await pending;
    expect(list).not.toHaveBeenCalled(); expect(s.latest().busy).toBe(""); expect(s.latest().models).toEqual([]); expect(s.latest().diagnostic).toBe("");
    get.mockRestore(); await s.send("models", { form: ollama }); expect(list).toHaveBeenCalledTimes(1); expect(s.latest().models).toEqual(["unexpected"]);
  });
  it("a current reply survives an unrelated state publication", async () => {
    const s = await setup(); let release!: (r: any) => void; const list = vi.spyOn(s.runtime, "listProviderModels").mockImplementation(() => new Promise(r => { release = r; }));
    const pending = s.send("models", { form: ollama }); await vi.waitFor(() => expect(list).toHaveBeenCalled()); await s.send("ready"); release({ ok: true, models: ["current"] }); await pending; expect(s.latest().models).toEqual(["current"]); expect(s.latest().busy).toBe("");
  });
  it("a model-only edit keeps its valid catalog and Discard restores saved settings", async () => {
    const s = await setup(); vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: ["current"] });
    await s.send("models", { form: ollama }); await s.send("draft-changed", { dirty: true, form: { ...ollama, model: "current" } }); await s.send("ready"); expect(s.latest().models).toEqual(["current"]);
    await s.send("discard"); expect(s.latest().form.profile).toBe("local-lm-studio"); expect(s.latest().form.model).toBe(""); expect(s.latest().models).toEqual([]); expect(state.configurationUpdates).toEqual([]);
  });
});
