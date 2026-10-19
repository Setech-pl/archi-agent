import {describe,it,expect,afterAll} from "vitest";
import {mkdtempSync,realpathSync,cpSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";import {tmpdir} from "node:os";
import {createArchiAgentRuntime,inspectC4Source,planDiagramBundle,saveDiagramBundle} from "../../src/runtime/index.js";
import type {StructuredChatClient,StructuredChatRequest} from "../../src/core/llm/structured-chat-client.js";
const root=realpathSync(mkdtempSync(path.join(tmpdir(),"c4-tests-")));afterAll(()=>rmSync(root,{recursive:true,force:true}));
function setup(){const dir=path.join(root,String(Math.random()));cpSync("test/fixtures/structurizr/big-bank-plc",dir,{recursive:true});return {kind:"structurizr-json",sourceId:"big-bank",modelPath:path.join(dir,"workspace.json"),overlayPath:path.join(dir,"overlay")} as const;}
const generator={kind:"openai-compatible-local",baseUrl:"http://127.0.0.1:1234/v1",modelId:"synthetic"} as const;
function controlled(hook?:(r:StructuredChatRequest)=>Record<string,unknown>|undefined) {
 const calls:StructuredChatRequest[]=[];const client:StructuredChatClient={clientType:"openai-compatible-local",generationMetadata:{modelId:"synthetic",temperature:0,seed:42,attemptCount:1,structuredOutput:true},async complete(r){calls.push(r);const custom=hook?.(r);if(custom)return {source:"content",value:custom};const s=JSON.parse(r.messages[1]!.content).snapshot;
 return {source:"content",value:r.schemaName.endsWith("verdict")?{accepted:true,violations:[]}:r.schemaName==="c4_context_plan"?{version:1,systemId:s.systemId,elementIds:s.elements.map((e:any)=>e.id),relationshipIds:s.relationships.map((e:any)=>e.factId)}:{version:1,parentId:s.systemId,containerIds:s.containerIds,externalIds:s.externalIds,relationshipIds:s.relationships.map((e:any)=>e.factId)}};}};
 return {app:createArchiAgentRuntime({diagramClientFactory:()=>client}),calls};
}
async function selection(config:ReturnType<typeof setup>,name="Internet Banking System") {const source=await inspectC4Source(config);if(!source.ok)throw Error(source.code);return {systemId:source.systems.find(s=>s.name===name)!.id,expectedKnowledgeDigest:source.knowledgeDigest};}
const flow={kind:"description",flowName:"C4 bank",description:"Show the source-confirmed bank architecture."} as const;
describe("D3/D4 reviewed source-bound diagrams",()=>{
 for(const diagramType of ["c4-context","c4-container"] as const)it(`${diagramType}: exact source slice, same snapshot, provenance and original ART1`,async()=>{
   const config=setup(),c=controlled(),request={diagramType,knowledgePack:config,generator,flow,c4Selection:await selection(config)};
   const r=await c.app.generateDiagram!(request);expect(r.status,JSON.stringify(r)).toBe("success");if(r.status!=="success")return;
   expect(c.calls).toHaveLength(2);const a=JSON.parse(c.calls[0]!.messages[1]!.content).snapshot,b=JSON.parse(c.calls[1]!.messages[1]!.content).snapshot;expect(a).toEqual(b);expect(a.digest).toBe(r.digest);
   expect(r.plantUml).not.toContain("!include");expect(r.plantUml).not.toContain("Sign In Controller");expect(JSON.stringify(a)).not.toContain(root);
   if(diagramType==="c4-context"){expect(a.elements.map((e:any)=>e.name)).toEqual(expect.arrayContaining(["Internet Banking System","Personal Banking Customer","Mainframe Banking System","E-mail System"]));expect(a.elements).toHaveLength(4);expect(a.relationships).toHaveLength(3);expect(a.elements.every((e:any)=>e.kind!=="container")).toBe(true);}
   else {expect(a.containerIds).toHaveLength(5);expect(r.plantUml).toContain("[Software System Boundary]");expect(r.plantUml).toContain("Java");for(const e of a.elements.filter((e:any)=>e.kind==="container"))expect(e.parentId).toBe(a.systemId);}
   const report=JSON.parse(r.groundingReport);expect(report.sourceProvenance.digest).toBe(a.knowledge.digest);expect(report.c4.limitations.length).toBeGreaterThan(0);expect(report.c4.elements.some((e:any)=>e.provenance.some((p:any)=>p.fields.includes("architecture")))).toBe(true);
   const dir=await saveDiagramBundle(path.dirname(config.modelPath),r.artifact!,planDiagramBundle());const saved=JSON.parse(readFileSync(path.join(dir.directory,"report.json"),"utf8"));expect(saved.generationReport.c4).toEqual(report.c4);expect(readFileSync(path.join(dir.directory,"diagram.puml"),"utf8")).toBe(r.plantUml);expect(c.calls).toHaveLength(2);
 });
 it("rejects stale selection, absent hierarchy/children and cancellation with zero calls",async()=>{
   const config=setup(),c=controlled(),chosen=await selection(config,"ATM");
   const r=await c.app.generateDiagram!({diagramType:"c4-container",knowledgePack:config,generator,flow,c4Selection:chosen});expect(r.status).toBe("failed");if(r.status==="failed")expect(r.issues[0]!.code).toBe("c4-containers-unavailable");
   writeFileSync(config.modelPath,readFileSync(config.modelPath,"utf8")+"\n");const stale=await c.app.generateDiagram!({diagramType:"c4-context",knowledgePack:config,generator,flow,c4Selection:chosen});expect(stale.status).toBe("failed");
   const cancelled=await c.app.generateDiagram!({diagramType:"c4-context",knowledgePack:config,generator,flow,c4Selection:chosen,signal:{aborted:true}});expect(cancelled.status).toBe("failed");if(cancelled.status==="failed")expect(cancelled.issues[0]!.code).toBe("generation-cancelled");expect(c.calls).toHaveLength(0);
   const pack=path.join(root,"standalone");cpSync("test/fixtures/space-mission/architecture",pack,{recursive:true});expect(await inspectC4Source({kind:"local-directory",path:pack})).toMatchObject({ok:false,code:"c4-hierarchy-unavailable"});
 });
 it("keeps original snapshot through a concurrent source rename; next selection sees stable ID",async()=>{
   const config=setup(),chosen=await selection(config);let renamed=false;
   const c=controlled(r=>{if(!renamed){renamed=true;const m=JSON.parse(readFileSync(config.modelPath,"utf8"));m.model.softwareSystems.find((s:any)=>s.id==="7").name="Renamed Bank";writeFileSync(config.modelPath,JSON.stringify(m));}return undefined;});
   const r=await c.app.generateDiagram!({diagramType:"c4-container",knowledgePack:config,generator,flow,c4Selection:chosen});expect(r.status).toBe("success");if(r.status==="success")expect(r.plantUml).not.toContain("Renamed Bank");expect(JSON.parse(c.calls[0]!.messages[1]!.content).snapshot).toEqual(JSON.parse(c.calls[1]!.messages[1]!.content).snapshot);
   const next=await selection(config,"Renamed Bank");expect(next.systemId).toBe(chosen.systemId);expect(next.expectedKnowledgeDigest).not.toBe(chosen.expectedKnowledgeDigest);
 });
 it("rejects invented plan IDs after one call; invalid reviewer stays unverified",async()=>{
   const config=setup(),chosen=await selection(config),c=controlled(()=>({version:1,systemId:chosen.systemId,elementIds:["invented"],relationshipIds:[]}));
   expect((await c.app.generateDiagram!({diagramType:"c4-context",knowledgePack:config,generator,flow,c4Selection:chosen})).status).toBe("failed");expect(c.calls).toHaveLength(1);
   const bad=controlled(r=>r.schemaName.endsWith("verdict")?{accepted:true,violations:[{code:"direction-mismatch",factId:null}]}:undefined);
   expect((await bad.app.generateDiagram!({diagramType:"c4-context",knowledgePack:config,generator,flow,c4Selection:chosen})).status).toBe("unverified");expect(bad.calls).toHaveLength(2);
 });
 it("preserves duplicate system names for explicit ID selection",async()=>{const config=setup(),m=JSON.parse(readFileSync(config.modelPath,"utf8"));m.model.softwareSystems.push({id:"other",name:"Internet Banking System",description:"Other source system"});writeFileSync(config.modelPath,JSON.stringify(m));const source=await inspectC4Source(config);expect(source.ok).toBe(true);if(source.ok){expect(source.systems.filter(s=>s.name==="Internet Banking System")).toHaveLength(2);expect(new Set(source.systems.map(s=>s.id)).size).toBe(source.systems.length);}});
 it("supports isolated Context without synthesizing a relation",async()=>{const config=setup(),m=JSON.parse(readFileSync(config.modelPath,"utf8"));m.model.softwareSystems.push({id:"isolated",name:"Isolated",description:"No declared interactions"});writeFileSync(config.modelPath,JSON.stringify(m));const c=controlled(),r=await c.app.generateDiagram!({diagramType:"c4-context",knowledgePack:config,generator,flow,c4Selection:await selection(config,"Isolated")});expect(r.status).toBe("success");if(r.status==="success"){expect(r.summary.messageCount).toBe(0);expect(r.plantUml).not.toContain(" --> ");expect(JSON.parse(r.groundingReport).c4.limitations.join(" ")).toContain("isolated");}expect(c.calls).toHaveLength(2);});
 it("cancellation after plan prevents the reviewer",async()=>{const config=setup(),controller=new AbortController(),c=controlled(()=>{controller.abort();return undefined;});const r=await c.app.generateDiagram!({diagramType:"c4-container",knowledgePack:config,generator,flow,c4Selection:await selection(config),signal:controller.signal});expect(r.status).toBe("failed");expect(c.calls).toHaveLength(1);});
 it("does not persist unknown selection fields in ART1",async()=>{const config=setup(),chosen=await selection(config),c=controlled();const r=await c.app.generateDiagram!({diagramType:"c4-context",knowledgePack:config,generator,flow,c4Selection:{...chosen,apiKey:"synthetic-secret"} as typeof chosen});expect(r.status).toBe("success");if(r.status==="success"){expect(JSON.stringify(r.artifact)).not.toContain("synthetic-secret");expect((r.artifact!.metadata.configuration as any).projection.c4Selection).toEqual(chosen);}});

});
