import {mkdtemp,readFile,writeFile,readdir,rm,realpath} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {generateDiagramCommand} from "../../vscode-extension/src/commands/generate-sequence-diagram.js";
import {OpenDiagramResults,saveDiagramAndReportCommand,saveDiagramAction} from "../../vscode-extension/src/commands/save-diagram-and-report.js";
import {createArchiAgentRuntime} from "../../src/runtime/index.js";
import {resetDouble,state,Uri,window,workspace,secretStorage,makeDocument,TabInputText,TabInputCustom} from "../doubles/vscode-module-double.js";
import {captureActiveEnterpriseSource} from "../../vscode-extension/src/commands/generate-capability-map.js";
const roots:string[]=[];
beforeEach(resetDouble);
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){const root=await realpath(await mkdtemp(path.join(tmpdir(),"ea1-host-test-")));roots.push(root);const file=path.join(root,"enterprise.json");await writeFile(file,await readFile("examples/retail-checkout/architecture/enterprise.json"));return {root,file};}
const by=(key:string,value:unknown)=>(items:readonly any[])=>items.find(i=>i[key]===value);
function dependencies(){const runtime=createArchiAgentRuntime();
 const providerSpies=[vi.spyOn(runtime,"listProviderProfiles"),vi.spyOn(runtime,"listProviderModels"),vi.spyOn(runtime,"generateDiagram")];
 return {deps:{runtime,output:window.createOutputChannel("EA1") as never,secrets:secretStorage as never,results:new OpenDiagramResults()},providerSpies};}
function choose(file:string){state.quickPickAnswers.push(by("id","capability-map"),by("id","sales"),by("value",3),by("id","maturity"));state.openDialogAnswers.push([Uri.file(file)]);}
it("routes before all knowledge/provider settings, secrets, model listing and generator calls",async()=>{
 const f=await fixture();state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];choose(f.file);
 const {deps,providerSpies}=dependencies();const config=vi.spyOn(workspace,"getConfiguration");
 await generateDiagramCommand(deps);expect(state.openedDocuments).toHaveLength(2);expect(deps.results.results()).toHaveLength(1);
 const report=JSON.parse(state.openedDocuments[1]!.getText());expect(report.modelCalls).toBe(0);expect(report.selection.rootIds).toEqual(["sales"]);
 providerSpies.forEach(s=>expect(s).not.toHaveBeenCalled());expect(config).toHaveBeenCalledTimes(1);expect(state.secretReads).toEqual([]);expect(state.configurationUpdates).toEqual([]);
 expect(await readdir(f.root)).toEqual(["enterprise.json"]);
});
it.each(["type","project","file","scope","detail","colors","progress"])("Cancel %s leaves no previews, registry entries or files",async step=>{
 const f=await fixture();state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];const {deps,providerSpies}=dependencies();
 state.quickPickAnswers.push(step==="type"?()=>undefined:by("id","capability-map"));
 if(step==="project"){state.workspaceFolders.push({name:"other",uri:Uri.file(f.root),index:1});state.quickPickAnswers.push(()=>undefined);}
 state.openDialogAnswers.push(step==="file"?undefined:[Uri.file(f.file)]);
 state.quickPickAnswers.push(step==="scope"?()=>undefined:by("id",null),step==="detail"?()=>undefined:by("value",2),step==="colors"?()=>undefined:by("id",null));
 if(step==="progress")state.progressCancelOnStart=true;
 await generateDiagramCommand(deps);expect(state.openedDocuments).toHaveLength(0);expect(deps.results.results()).toHaveLength(0);
 providerSpies.forEach(s=>expect(s).not.toHaveBeenCalled());expect(state.secretReads).toEqual([]);expect(await readdir(f.root)).toEqual(["enterprise.json"]);
});
it("multi-root source and ART1 save choose their explicit project; Cancel save then save original",async()=>{
 const a=await fixture(),b=await fixture();state.workspaceFolders=[a,b].map((f,i)=>({name:`project-${i}`,uri:Uri.file(f.root),index:i}));
 const dialog=vi.spyOn(window,"showOpenDialog");const {deps}=dependencies();state.quickPickAnswers.push(by("id","capability-map"),items=>items[1],by("id",null),by("value",2),by("id",null));
 state.openDialogAnswers.push([Uri.file(b.file)]);await generateDiagramCommand(deps);
 expect((dialog.mock.calls as unknown as [unknown][])[0]?.[0]).toMatchObject({defaultUri:{fsPath:path.join(b.root,"architecture","enterprise.json")}});
 const artifact=deps.results.results()[0]!;expect(artifact.diagramType).toBe("capability-map");
 state.quickPickAnswers.push(items=>items[0]);state.messageAnswers.push(undefined);await saveDiagramAndReportCommand(deps.results,artifact);
 expect(await readdir(a.root)).toEqual(["enterprise.json"]);
 state.quickPickAnswers.push(items=>items[1]);state.messageAnswers.push(saveDiagramAction);await saveDiagramAndReportCommand(deps.results,artifact);
 const bundles=await readdir(path.join(b.root,"archi-agent-results"));expect(bundles).toHaveLength(1);
 expect(await readFile(path.join(b.root,"archi-agent-results",bundles[0]!,"diagram.puml"),"utf8")).toBe(artifact.plantUml);
 expect(await readdir(a.root)).toEqual(["enterprise.json"]);
});
it("explains invalid or unavailable enterprise data rather than succeeding with an empty map",async()=>{
 const f=await fixture();state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];const {deps}=dependencies();
 for(const raw of [{}, {...JSON.parse(await readFile(f.file,"utf8")),capabilities:[]}]){
  await writeFile(f.file,JSON.stringify(raw));choose(f.file);await generateDiagramCommand(deps);state.quickPickAnswers=[];
  expect(state.messages.at(-1)?.text).toContain("enterprise.json");expect(state.openedDocuments).toHaveLength(0);
 }
});
it.each([false,true])("uses the captured active document (untitled=%s), even after the editor and disk change",async untitled=>{
 const f=await fixture(),text=await readFile(f.file,"utf8");
 state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];
 const document={...makeDocument(text,{...(untitled?{}:{fileName:f.file}),languageId:"plaintext"}),isDirty:true};
 state.activeTextEditor={document};window.tabGroups.activeTabGroup.activeTab={input:new TabInputText(document.uri)};
 const {deps,providerSpies}=dependencies(),config=vi.spyOn(workspace,"getConfiguration"),dialog=vi.spyOn(window,"showOpenDialog");
 state.quickPickAnswers.push(items=>{
  state.activeTextEditor={document:makeDocument("a different editor")};
  return by("id","capability-map")(items);
 },by("id","active-document"),by("id","sales"),by("value",3),by("id","maturity"));
 await writeFile(f.file,"not the captured text");
 await generateDiagramCommand(deps);
 expect(state.openedDocuments).toHaveLength(2);expect(deps.results.results()).toHaveLength(1);
 const report=JSON.parse(state.openedDocuments[1]!.getText());
 expect(report.source.file).toBe(`editor-buffer:${untitled?"Untitled-1":"enterprise.json"}`);expect(report.modelCalls).toBe(0);
 expect(report.visible).toHaveLength(5);expect(report.limitations.join(" ")).toContain("editor buffer");
 expect(config).not.toHaveBeenCalled();expect(dialog).not.toHaveBeenCalled();expect(state.secretReads).toEqual([]);
 providerSpies.forEach(s=>expect(s).not.toHaveBeenCalled());
 state.messageAnswers.push(saveDiagramAction);await saveDiagramAndReportCommand(deps.results,deps.results.results()[0]!);
 const base=path.join(f.root,"archi-agent-results"),saved=JSON.parse(await readFile(path.join(base,(await readdir(base))[0]!,"report.json"),"utf8"));
 expect(saved.sourceReferences.enterpriseCatalog).toEqual({reference:null,availability:"in-memory-input"});expect(saved.generationReport).toEqual(report);
 expect(await readFile(f.file,"utf8")).toBe("not the captured text");
});
it("retains explicit file and MCP choices when an active document is available",async()=>{
 const f=await fixture();state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];
 state.activeTextEditor={document:makeDocument("invalid active input")};
 state.quickPickAnswers.push(by("id","capability-map"),by("id","local"),by("id","sales"),by("value",3),by("id","maturity"));
 state.openDialogAnswers.push([Uri.file(f.file)]);
 const {deps}=dependencies();await generateDiagramCommand(deps);
 const picker=state.quickPicks.find(p=>(p.options as any).title==="Archi Agent: capability source")!;
 expect((picker.items as any[]).map(i=>i.id)).toEqual(["active-document","local","mcp"]);
 expect(JSON.parse(state.openedDocuments[1]!.getText()).source.file).toBe("enterprise.json");
});
it("does not capture a stale text editor behind custom, diff or remote tabs",()=>{
 const document=makeDocument("{}");state.activeTextEditor={document};
 window.tabGroups.activeTabGroup.activeTab={input:new TabInputCustom(Uri.file("/synthetic/model.pdf"))};expect(captureActiveEnterpriseSource()).toBeUndefined();
 window.tabGroups.activeTabGroup.activeTab={input:{diff:true}};expect(captureActiveEnterpriseSource()).toBeUndefined();
 window.tabGroups.activeTabGroup.activeTab={input:new TabInputText(Uri.file("/synthetic/other.json"))};expect(captureActiveEnterpriseSource()).toBeUndefined();
 window.tabGroups.activeTabGroup.activeTab=undefined;state.activeTextEditor={document:{...document,uri:Uri.parse("https://example.invalid/model.json")}};
 expect(captureActiveEnterpriseSource()).toBeUndefined();
});
it("cancels active-source selection without reading settings or opening a file",async()=>{
 const f=await fixture();state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];state.activeTextEditor={document:makeDocument("{}")};
 state.quickPickAnswers.push(by("id","capability-map"),()=>undefined);
 const {deps}=dependencies(),config=vi.spyOn(workspace,"getConfiguration"),dialog=vi.spyOn(window,"showOpenDialog");
 await generateDiagramCommand(deps);expect(config).not.toHaveBeenCalled();expect(dialog).not.toHaveBeenCalled();expect(state.openedDocuments).toHaveLength(0);
});
it("does not replace invalid captured text or an unconfigured MCP choice with a disk source",async()=>{
 const f=await fixture();state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];state.activeTextEditor={document:makeDocument("not JSON")};
 const {deps}=dependencies(),dialog=vi.spyOn(window,"showOpenDialog");
 state.quickPickAnswers.push(by("id","capability-map"),by("id","active-document"));await generateDiagramCommand(deps);
 expect(state.messages.at(-1)?.text).toContain("Correct the active document");
 state.quickPickAnswers.push(by("id","capability-map"),by("id","mcp"));await generateDiagramCommand(deps);
 expect(state.messages.at(-1)?.text).toContain("configure enterpriseSource");
 expect(dialog).not.toHaveBeenCalled();expect(state.openedDocuments).toHaveLength(0);expect(deps.results.results()).toHaveLength(0);
});

it("EA2 routes the common diagram picker to shared deterministic runtime without provider or credentials",async()=>{
 const f=await fixture();await writeFile(f.file,await readFile("examples/retail-checkout/architecture/enterprise-applications.json"));state.workspaceFolders=[{name:"retail",uri:Uri.file(f.root),index:0}];
 state.quickPickAnswers.push(by("id","capability-application-map"),by("id",null));state.openDialogAnswers.push([Uri.file(f.file)]);const {deps,providerSpies}=dependencies();
 await generateDiagramCommand(deps);expect(state.openedDocuments).toHaveLength(2);expect(deps.results.results()[0]?.diagramType).toBe("capability-application-map");
 const report=JSON.parse(state.openedDocuments[1]!.getText());expect(report.modelCalls).toBe(0);expect(report.supports).toHaveLength(3);expect(report.applications).toHaveLength(3);expect(state.secretReads).toEqual([]);providerSpies.forEach(s=>expect(s).not.toHaveBeenCalled());
 expect(state.quickPicks.some(p=>(p.options as any).title==="Archi Agent: capability detail")).toBe(false);
 state.messageAnswers.push(saveDiagramAction);await saveDiagramAndReportCommand(deps.results,deps.results.results()[0]);const base=path.join(f.root,"archi-agent-results"),saved=JSON.parse(await readFile(path.join(base,(await readdir(base))[0]!,"report.json"),"utf8"));expect(saved.generationReport).toEqual(report);
});
