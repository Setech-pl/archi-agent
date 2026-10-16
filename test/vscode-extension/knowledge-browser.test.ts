import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cp, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createStarterKnowledgePack, createArchiAgentRuntime, KnowledgePackReviewSession } from "../../src/runtime/index.js";
import { KnowledgeBrowser } from "../../vscode-extension/src/knowledge-browser.js";
import { captureActiveSource } from "../../vscode-extension/src/commands/build-knowledge-pack.js";
import { resetDouble, state, workspace, makeDocument, Uri, window, TabInputCustom, configurationChanged, documentSaved } from "../doubles/vscode-module-double.js";
let root:string;let browser:KnowledgeBrowser;
beforeEach(async()=>{resetDouble();root=await realpath(await mkdtemp(path.join(tmpdir(),"fu1-tree-")));});
afterEach(async()=>{browser?.dispose();await rm(root,{recursive:true,force:true});});
it("captures dirty and untitled MD/TXT; custom preview uses its own URI and unsupported tab uses no stale editor",()=>{
  state.activeTextEditor={document:makeDocument("Dirty buffer",{fileName:path.join(root,"dirty.md")})};expect(captureActiveSource()).toMatchObject({kind:"editor-buffer",content:"Dirty buffer",type:"md"});
  state.activeTextEditor={document:makeDocument("Untitled",{languageId:"plaintext"})};expect(captureActiveSource()).toMatchObject({type:"txt",content:"Untitled"});
  const uri=Uri.file(path.join(root,"scan.pdf"));window.tabGroups.activeTabGroup.activeTab={input:new TabInputCustom(uri)};expect(captureActiveSource()).toEqual({path:uri.fsPath});
  window.tabGroups.activeTabGroup.activeTab={input:{diff:true}};expect(captureActiveSource()).toBeUndefined();
  window.tabGroups.activeTabGroup.activeTab={input:new TabInputCustom(Uri.parse("https://example.invalid/a.pdf"))};expect(captureActiveSource()).toBeUndefined();
});
describe("native production knowledge tree",()=>{
  it("uses explicit multi-root context, loader records/lines, nonrecursive relation references, refresh and fail-closed invalid state",async()=>{
    const left=path.join(root,"left"),right=path.join(root,"right");
    await createStarterKnowledgePack(left,{id:"alpha",canonicalName:"Alpha",kind:"service",description:"Alpha"});
    await createStarterKnowledgePack(right,{id:"beta",canonicalName:"Beta",kind:"database",description:"Beta"});
    await writeFile(path.join(left,"aliases.md"),"| alias | target_id |\n| --- | --- |\n| Alpha Service | alpha |\n");
    await writeFile(path.join(left,"relationships.md"),"| from_id | to_id | interface_type | interface_name | mode | purpose |\n| --- | --- | --- | --- | --- | --- |\n| alpha | alpha | INTERNAL | | synchronous | Work |\n");
    const folders=[{name:"Left",uri:Uri.file(path.join(root,"project-left")),index:0},{name:"Right",uri:Uri.file(path.join(root,"project-right")),index:1}];state.workspaceFolders=folders;
    folders.forEach((f,i)=>state.configurationInspect.set("archiAgent.knowledgePackPath@"+f.uri.fsPath,{workspaceFolderValue:i?right:left}));
    browser=new KnowledgeBrowser();const roots=await browser.getChildren();expect(roots.map(r=>r.label)).toEqual(["Left","Right"]);
    const pack=(await browser.getChildren(roots[0]))[0]!;expect(pack.detail).toContain("K1 snapshot");const groups=await browser.getChildren(pack);expect(groups.map(n=>n.label)).toEqual(["Systems (1)","Actors (0)","Relations (1)","Rules (0)","Files (5)"]);
    const system=(await browser.getChildren(groups[0]))[0]!;const refs=await browser.getChildren(system);expect(refs.map(n=>n.label)).toEqual(["Aliases (1)","Outgoing relations (1)","Incoming relations (1)"]);
    expect((await browser.getChildren((await browser.getChildren(refs[1]))[0])).length).toBe(0);
    const opened=vi.spyOn(workspace,"openTextDocument").mockImplementation(async target=>makeDocument("Alpha",{fileName:(target as any).fsPath}));
    const item=browser.getTreeItem(system);await state.registeredCommands.get("archiAgent.openKnowledgeRecord")?.(...item.command!.arguments!);expect(state.shownDocuments.at(-1)?.options).toMatchObject({selection:{startLine:4}});expect(opened.mock.calls[0]?.[0]).toMatchObject({fsPath:path.join(left,"systems.md")});opened.mockRestore();
    expect((await browser.getChildren((await browser.getChildren(roots[1]))[0]))[0]?.label).toBe("Systems (1)");
    const writes=state.configurationUpdates.length;await writeFile(path.join(left,"systems.md"),"Invalid table");documentSaved(makeDocument("Invalid table",{fileName:path.join(left,"systems.md")}));
    const fresh=await browser.getChildren();expect((await browser.getChildren(fresh[0]))[0]?.label).toContain("Knowledge unavailable");expect(await browser.getChildren(pack)).toEqual([]);
    state.configurationInspect.set("archiAgent.knowledgePackPath@"+folders[0]!.uri.fsPath,{workspaceFolderValue:path.join(root,"missing")});configurationChanged();expect((await browser.getChildren((await browser.getChildren())[0]))[0]?.label).toContain("Knowledge unavailable");expect(state.configurationUpdates.length).toBe(writes);
  });
  it("navigates an unchanged source buffer at its verified line, and falls back to details after it changes",async()=>{
    const document=makeDocument("Alpha frozen.");const uri=document.uri.toString();state.activeTextEditor={document};
    const runtime=createArchiAgentRuntime({diagramClientFactory:()=>({clientType:"synthetic",generationMetadata:{modelId:"synthetic",temperature:0,seed:42,attemptCount:1,structuredOutput:true},complete:async r=>{
      const s=JSON.parse(r.messages[1]!.content).sources[0],e=s.evidenceSlices[0];return {source:"content",value:{version:1,candidates:[{table:"systems",row:{id:"alpha",canonical_name:"Alpha",kind:"service",description:"Service"},basis:"explicit",reasoning:null,evidence:[{sourceId:s.sourceId,originalDigest:s.originalDigest,textDigest:s.textDigest,...e}]}]}};
    }})});
    const result=await runtime.extractDocumentCandidates!({documents:[{kind:"editor-buffer",uri,type:"md",content:document.getText()}],generator:{kind:"openai-compatible-local",baseUrl:"http://127.0.0.1:1234/v1",modelId:"synthetic"}});expect(result.status).toBe("success");if(result.status!=="success")return;
    const session=new KnowledgePackReviewSession(result.result);await session.decide([0],"accepted");const preview=await session.prepare(),packPath=path.join(root,"pack");await session.save(preview,packPath);state.configuration.set("archiAgent.knowledgePackPath",packPath);
    browser=new KnowledgeBrowser();const pack=(await browser.getChildren((await browser.getChildren())[0]))[0]!,group=(await browser.getChildren(pack)).find(n=>n.label.startsWith("Sources"))!;
    const source=(await browser.getChildren(group))[0]!,evidence=(await browser.getChildren(source))[0]!;
    const item=browser.getTreeItem(evidence);await state.registeredCommands.get("archiAgent.openKnowledgeRecord")?.(...item.command!.arguments!);expect(state.shownDocuments.at(-1)?.document.getText()).toBe("Alpha frozen.");expect(state.shownDocuments.at(-1)?.options).toMatchObject({selection:{startLine:0}});
    state.activeTextEditor={document:makeDocument("Changed source.")};await state.registeredCommands.get("archiAgent.openKnowledgeRecord")?.(...item.command!.arguments!);expect(state.shownDocuments.at(-1)?.document.getText()).toContain('"excerpt": "Alpha frozen."');expect(state.shownDocuments.at(-1)?.options).toEqual({preview:true});
  });
  it("reports absence without choosing a different project's pack",async()=>{browser=new KnowledgeBrowser();const roots=await browser.getChildren();expect((await browser.getChildren(roots[0]))[0]?.label).toBe("No active Knowledge Pack");expect(state.configurationUpdates).toEqual([]);});
});

it("browses Structurizr field origins, omissions and invalidates stale source navigation",async()=>{
 const fixture=path.join(root,"fixture");await cp("test/fixtures/structurizr/big-bank-plc",fixture,{recursive:true});
 const config={kind:"structurizr-json",sourceId:"big-bank",modelPath:path.join(fixture,"workspace.json"),overlayPath:path.join(fixture,"overlay")};
 state.configuration.set("archiAgent.architectureSource",config);browser=new KnowledgeBrowser();
 const projects=await browser.getChildren(),sources=await browser.getChildren(projects[0]);expect(sources[0]!.label).toContain("Active Structurizr");
 const facts=await browser.getChildren(sources[0]);const systems=await browser.getChildren(facts.find(f=>f.label==="Systems (9)"));expect(systems.some(f=>f.label.includes("Internet Banking System / API Application"))).toBe(true);
 expect(facts.some(f=>f.label==="Omitted source content")).toBe(true);
 await writeFile(config.modelPath,"{}");browser.refresh();const updated=await browser.getChildren();expect((await browser.getChildren(updated[0]))[0]!.label).toContain("unavailable");
});
