import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { configurationHtml } from "../../vscode-extension/src/workbench/configuration-ui.js";
import { createArchiAgentRuntime, createStarterKnowledgePack } from "../../src/runtime/index.js";
import { ConfigurationWorkbench } from "../../vscode-extension/src/workbench/configuration.js";
import { generateDiagramCommand } from "../../vscode-extension/src/commands/generate-sequence-diagram.js";
import { secretIdForProfile } from "../../vscode-extension/src/api-key-storage.js";
import { resetDouble, state, panels, configurationChanged, workspaceChanged, secretStorage, window, Uri } from "../doubles/vscode-module-double.js";
const roots: string[] = [];
beforeEach(resetDouble);
afterEach(() => { resetDouble(); vi.restoreAllMocks(); roots.splice(0).forEach((r) => rmSync(r,{recursive:true,force:true})); });
async function setup() {
  const runtime = createArchiAgentRuntime();
  const workbench = new ConfigurationWorkbench(runtime, window.createOutputChannel("test") as never, secretStorage as never);
  workbench.open();
  await vi.waitFor(() => expect(panels[0]?.webview.messages.some((m) => m.type === "state")).toBe(true));
  const panel = panels[0]!;
  const latest = () => panel.webview.messages.filter((m) => m.type === "state").at(-1);
  const send = async (op: string, extra = {}) => { await panel.receive({op,revision:latest().revision,...(op==="models"?{form:latest().form}:{}),...extra}); };
  return {runtime,workbench,panel,latest,send};
}
const form = { profile: "local-lm-studio", endpoint: "http://127.0.0.1:1234/v1", timeout: 120, model: "synthetic" };
describe("UX4 configuration host", () => {
  it.each(["success", "error", "stale-revision"])("locks the actual UI immediately until Apply completion (%s)", async outcome => {
    const s = await setup(), html = configurationHtml(), messages: any[] = [], elements = new Map<string, any>();
    for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1]!, { value: "", disabled: false, textContent: "", addEventListener(event: string, fn: any) { this[event] = fn; }, setAttribute() {}, options: [] as any[], replaceChildren() { this.options=[]; }, append(o: any) { this.options.push(o); }, focus() {} });
    let saved: any, receive!: (event: any) => void;
    runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)![1]!, {
      acquireVsCodeApi: () => ({ getState: () => saved, setState: (v: any) => { saved = v; }, postMessage: (v: any) => messages.push(v) }),
      document: { getElementById: (id: string) => elements.get(id), createElement: () => ({}) },
      window: { addEventListener: (_: string, fn: any) => { receive = fn; } }
    });
    const host = s.latest(); receive({ data: host });
    const model = elements.get("model"); model.value = "submitted"; model.input();
    elements.get("apply").onclick();
    const locked = () => ["profile", "endpoint", "timeout", "model", "apply", "discard"].every(id => elements.get(id).disabled);
    expect(locked()).toBe(true); expect(messages.at(-1).form.model).toBe("submitted");
    receive({ data: { ...host, notice: "Intermediate external state" } }); expect(locked()).toBe(true);
    receive({ data: { ...host, busy: "Applying settings…" } }); expect(locked()).toBe(true);
    receive({ data: { ...host, error: outcome === "success" ? "" : "Apply failed", applied: outcome === "success", form: { ...host.form, model: outcome === "success" ? "submitted" : "effective-old" } } });
    expect(locked()).toBe(true);
    receive({ data: { type: "apply-finished" } }); expect(model.disabled).toBe(false);
    expect(model.value).toBe("submitted"); expect(saved.dirty).toBe(outcome !== "success");
  });
  it("creates one editor panel and reveals existing tabs, with restrictive resources and CSP", async () => {
    const s=await setup(); s.workbench.open("provider");s.workbench.open();expect(panels).toHaveLength(1);expect(s.panel.revealed).toBe(2);
    expect(s.panel.options).toMatchObject({enableScripts:true,localResourceRoots:[]});expect(s.panel.webview.html).toContain("default-src 'none'");
    expect(s.panel.webview.html).toContain('role="tablist"');expect(s.panel.webview.html).toContain("ArrowLeft");expect(s.panel.webview.html).not.toContain("https://cdn");
  });
  it("applies validated global profile/model binding, clears old diagnosis and never lists implicitly", async () => {
    const s=await setup(),list=vi.spyOn(s.runtime,"listProviderModels");
    await s.send("apply",{form,baseRevision:s.latest().revision});
    expect(state.configuration.get("archiAgent.localModel.selectedModel")).toBe("synthetic");
    expect(state.configuration.get("archiAgent.localModel.selectedModelProfile")).toBe("local-lm-studio");
    expect(s.latest().form.model).toBe("synthetic");expect(s.latest().applied).toBe(true);expect(list).not.toHaveBeenCalled();
    expect(s.panel.webview.messages.at(-1)).toEqual({type:"apply-finished"});
  });
  it.each([{...form,endpoint:"https://evil.example/v1"},{...form,timeout:0},{...form,profile:"unknown"},{...form,model:"bad\nmodel"}])("blocks invalid form at host with zero writes",async bad=>{
    const s=await setup();await s.send("apply",{form:bad,baseRevision:s.latest().revision});expect(state.configurationUpdates).toEqual([]);expect(s.latest().error).toBeTruthy();expect(s.panel.webview.messages.at(-1)).toEqual({type:"apply-finished"});
  });
  it("dirty drafts block applied diagnostics but listing uses the submitted form; Discard restores effective state", async()=>{
    const s=await setup(),list=vi.spyOn(s.runtime,"listProviderModels").mockResolvedValue({ok:true,models:["synthetic"]});
    await s.send("draft-changed",{dirty:true});await s.send("diagnose");expect(list).not.toHaveBeenCalled();expect(s.latest().error).toContain("Apply or Discard");await s.send("models");expect(list).toHaveBeenCalledTimes(1);
    await s.send("discard");await s.send("models");expect(list).toHaveBeenCalledTimes(2);expect(s.latest().models).toEqual(["synthetic"]);expect(s.latest().form.model).toBe("");
  });
  it("external settings changes preserve draft conflict and re-read actual effective settings",async()=>{
    const s=await setup(),revision=s.latest().revision;
    state.configuration.set("archiAgent.localModel.timeoutSeconds",42);configurationChanged();await vi.waitFor(()=>expect(s.latest().revision).toBeGreaterThan(revision));
    await s.send("apply",{form,baseRevision:revision});expect(state.configurationUpdates).toEqual([]);expect(s.latest().error).toContain("Discard");expect(s.latest().effective).toContain("42s");
  });
  it("rejects a stale Apply message and releases its client lock without writes", async () => {
    const s = await setup(), revision = s.latest().revision;
    configurationChanged(); await vi.waitFor(() => expect(s.latest().revision).toBeGreaterThan(revision));
    await s.panel.receive({ op: "apply", revision, baseRevision: revision, form });
    expect(state.configurationUpdates).toEqual([]); expect(s.latest().notice).toContain("retry");
    expect(s.panel.webview.messages.at(-1)).toEqual({ type: "apply-finished" });
  });
  it.each([1,2,3,4,5,6,7])("partial write %i re-reads actual state without false success",async call=>{
    const s=await setup();state.configurationUpdateFailureCalls.add(call);await s.send("apply",{form,baseRevision:s.latest().revision});
    expect(s.latest().error).toContain("Current settings have been re-read");expect(s.latest().applied).toBe(false);
    const p=state.configuration.get("archiAgent.localModel.profile"),binding=state.configuration.get("archiAgent.localModel.selectedModelProfile");
    if(binding!==p)expect(s.latest().effective).toContain("none selected");
  });
  it("OBS1 check lists once and distinguishes listing from generation readiness",async()=>{
    const s=await setup(),list=vi.spyOn(s.runtime,"listProviderModels").mockResolvedValue({ok:true,models:["synthetic"]}),gen=vi.spyOn(s.runtime,"generateDiagram");
    await s.send("diagnose");expect(list).toHaveBeenCalledTimes(1);expect(gen).not.toHaveBeenCalled();expect(state.configurationUpdates).toEqual([]);
    expect(s.latest().diagnostic).toContain("Generation: unchecked");expect(s.latest().diagnostic).toContain("listing");
  });
  it.each(["connection-failed","timeout","authentication-failed","rate-limited"])("reports %s through OBS1",async code=>{
    const s=await setup();vi.spyOn(s.runtime,"listProviderModels").mockResolvedValue({ok:false,code:code as never});await s.send("diagnose");expect(s.latest().diagnostic).toContain(code);
  });
  it("profile/config change suppresses a delayed model response",async()=>{
    const s=await setup();let release!: (v:any)=>void;
    const list=vi.spyOn(s.runtime,"listProviderModels").mockImplementation(()=>new Promise(r=>{release=r;}));
    const pending=s.send("models");await vi.waitFor(()=>expect(list).toHaveBeenCalled());
    await s.send("draft-changed",{dirty:true});release({ok:true,models:["stale-model"]});await pending;
    expect(s.latest().models).toEqual([]);expect(s.latest().diagnostic).toBe("");
  });
  it.each(["models", "choose"])("closing during initial SecretStorage read prevents starting %s", async op => {
    state.configuration.set("archiAgent.localModel.profile", "cloud-openai");
    state.secrets.set(secretIdForProfile("cloud-openai")!, "synthetic-disposal-key");
    const s = await setup(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: [] }), open = vi.spyOn(window, "showOpenDialog");
    let release!: (value: string) => void;
    const read = vi.spyOn(secretStorage, "get").mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = s.send(op); await vi.waitFor(() => expect(read).toHaveBeenCalled());
    s.panel.dispose(); release("synthetic-disposal-key"); await pending;
    expect(list).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });
  it("closing while reading listing credentials prevents provider I/O", async () => {
    state.configuration.set("archiAgent.localModel.profile", "cloud-openai");
    state.secrets.set(secretIdForProfile("cloud-openai")!, "synthetic-disposal-key");
    const s = await setup(), list = vi.spyOn(s.runtime, "listProviderModels").mockResolvedValue({ ok: true, models: [] }), open = vi.spyOn(window, "showOpenDialog");
    let release!: (value: string) => void;
    const read = vi.spyOn(secretStorage, "get").mockResolvedValueOnce("synthetic-disposal-key").mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = s.send("models"); await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    s.panel.dispose(); release("synthetic-disposal-key"); await pending;
    expect(list).not.toHaveBeenCalled();
  });
  it("multi-root requires explicit project and shows effective scope and loader counts",async()=>{
    const root=realpathSync(mkdtempSync(path.join(tmpdir(),"ux4-settings-")));roots.push(root);
    const pack=path.join(root,"pack");await createStarterKnowledgePack(pack,{id:"a",canonicalName:"Alpha",kind:"service",description:"Service"});
    state.workspaceFolders=[{name:"Left",uri:Uri.file(root),index:0},{name:"Right",uri:Uri.file(path.join(root,"right")),index:1}];
    state.configurationInspect.set("archiAgent.knowledgePackPath@"+path.join(root,"right"),{workspaceFolderValue:pack});
    const s=await setup();expect(s.latest().projectSelected).toBe(false);await s.send("choose");expect(state.configurationUpdates).toEqual([]);
    await s.send("project",{project:"1"});expect(s.latest().scope).toContain("Workspace Folder: Right");expect(s.latest().counts.systems).toBe(1);expect(s.latest().files).toHaveLength(5);
    await s.send("project", {project: ""}); expect(s.latest().projectSelected).toBe(false); expect(s.latest().packPath).toBe(""); expect(s.latest().scope).toContain("operations are disabled");
    const open = vi.spyOn(window, "showOpenDialog"); await s.send("choose"); expect(open).not.toHaveBeenCalled(); expect(state.configurationUpdates).toEqual([]);
    await s.send("project", {project: "1"}); expect(s.latest().counts.systems).toBe(1);
    state.workspaceFolders.pop();workspaceChanged();await vi.waitFor(()=>expect(s.latest().projectSelected).toBe(false));
  });
  it("choose uses scoped UX3 activation and preserves other project settings",async()=>{
    const root=realpathSync(mkdtempSync(path.join(tmpdir(),"ux4-choose-")));roots.push(root);const pack=path.join(root,"pack");
    await createStarterKnowledgePack(pack,{id:"a",canonicalName:"Alpha",kind:"service",description:"Service"});
    state.workspaceFolders=[{name:"Left",uri:Uri.file(root),index:0},{name:"Right",uri:Uri.file(path.join(root,"right")),index:1}];
    const s=await setup();await s.send("project",{project:"1"});state.openDialogAnswers.push([Uri.file(pack)]);await s.send("choose");
    expect(state.configurationUpdates).toEqual([expect.objectContaining({value:pack,target:3})]);expect(s.latest().packPath).toBe(pack);
  });
  it("public state contains only presence of a secret, native masked input has no saved value",async()=>{
    state.configuration.set("archiAgent.localModel.profile","cloud-openai");const id=secretIdForProfile("cloud-openai")!;state.secrets.set(id,"synthetic-secret-sentinel");
    const s=await setup();expect(s.latest().keyPresent).toBe(true);expect(JSON.stringify(s.panel.webview.messages)).not.toContain("synthetic-secret-sentinel");
    state.inputBoxAnswers.push("synthetic-replacement");await s.send("set-key", {profile:"cloud-openai"});expect(state.inputBoxes.at(-1)).toMatchObject({password:true});expect(state.inputBoxes.at(-1)).not.toHaveProperty("value");
    expect(JSON.stringify(s.panel.webview.messages)).not.toContain("synthetic-replacement");state.messageAnswers.push("Delete API Key");await s.send("delete-key", {profile:"cloud-openai"});expect(s.latest().keyPresent).toBe(false);
  });
  it("missing cloud key performs zero network calls and exposes recovery",async()=>{
    state.configuration.set("archiAgent.localModel.profile","cloud-openai");const s=await setup(),list=vi.spyOn(s.runtime,"listProviderModels");await s.send("diagnose");expect(list).not.toHaveBeenCalled();expect(s.latest().diagnostic).toContain("credential-required");
  });
  it("invalid operations and arbitrary paths cannot invoke commands or writes",async()=>{
    const s=await setup();await s.send("execute-command",{command:"evil"});await s.send("open-file",{file:"../../secret"});await s.panel.receive({op:"apply",revision:"0",form});
    expect(state.executedCommands).toEqual([]);expect(state.configurationUpdates).toEqual([]);expect(state.openedDocuments).toEqual([]);
  });
  it.each(["local-lm-studio","local-ollama","cloud-anthropic","cloud-openai","cloud-openrouter"])("applies %s, clears previous model, and restores after reopening",async profile=>{
    state.configuration.set("archiAgent.localModel.profile","local-ollama");state.configuration.set("archiAgent.localModel.selectedModel","old-ollama-model");state.configuration.set("archiAgent.localModel.selectedModelProfile","local-ollama");
    const s=await setup();await s.send("apply",{form:{...form,profile,model:""},baseRevision:s.latest().revision});
    expect(state.configuration.get("archiAgent.localModel.profile")).toBe(profile);expect(s.latest().form.model).toBe("");
    s.workbench.dispose();s.workbench.open();await vi.waitFor(()=>expect(panels[1]?.webview.messages.some(m=>m.type==="state")).toBe(true));
    expect(panels[1]?.webview.messages.filter(m=>m.type==="state").at(-1)?.form.profile).toBe(profile);
  });
  it.each(["cloud-anthropic","cloud-openai","cloud-openrouter"])("draft key for %s stays bound while profile changes and Cancel writes nothing",async profile=>{
    state.configuration.set("archiAgent.localModel.profile","local-ollama");const s=await setup();await s.send("draft-changed",{dirty:true});
    state.inputBoxAnswers.push(undefined);await s.send("set-key",{profile});expect(state.secretWrites).toEqual([]);
    let release!:(v:string)=>void;const input=vi.spyOn(window,"showInputBox").mockImplementationOnce(()=>new Promise(r=>{release=r;}));
    const operation=s.send("set-key",{profile});await vi.waitFor(()=>expect(input).toHaveBeenCalled());await s.send("draft-changed",{dirty:true});
    state.configuration.set("archiAgent.localModel.profile","cloud-openrouter");release("synthetic-profile-key");await operation;
    expect(state.secretWrites).toEqual([{key:secretIdForProfile(profile),value:"synthetic-profile-key"}]);expect(s.latest().profileKeys[profile]).toBe(true);
    expect(JSON.stringify(s.panel.webview.messages)).not.toContain("synthetic-profile-key");
  });
  it("Create Diagram type Cancel precedes onboarding, secrets and provider calls",async()=>{
    const runtime=createArchiAgentRuntime(),gen=vi.spyOn(runtime,"generateDiagram"),list=vi.spyOn(runtime,"listProviderModels");
    await generateDiagramCommand({runtime,output:window.createOutputChannel("test") as never,secrets:secretStorage as never});
    expect(state.quickPicks[0]?.items).toMatchObject([{label:"Sequence"},{label:"Component"},{label:"C4 Context"},{label:"C4 Container"},{kind:-1},{description:"capability-map"},{description:"capability-application-map"}]);expect(state.quickPicks).toHaveLength(1);expect(gen).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();expect(state.secretReads).toEqual([]);expect(state.configurationUpdates).toEqual([]);
  });
});
