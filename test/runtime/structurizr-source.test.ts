import { describe,it,expect,afterAll } from "vitest";
import { mkdtempSync,realpathSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createArchiAgentRuntime,inspectArchitectureSource,planDiagramBundle,saveDiagramBundle } from "../../src/runtime/index.js";
import type { StructuredChatClient,StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
const root=realpathSync(mkdtempSync(path.join(tmpdir(),"archi-src1-")));
afterAll(()=>rmSync(root,{recursive:true,force:true}));
function setup(){const dir=path.join(root,String(Math.random()));cpSync("test/fixtures/structurizr/big-bank-plc",dir,{recursive:true});return {kind:"structurizr-json",sourceId:"big-bank",modelPath:path.join(dir,"workspace.json"),overlayPath:path.join(dir,"overlay")} as const;}
const generator={kind:"openai-compatible-local",baseUrl:"http://127.0.0.1:1234/v1",modelId:"synthetic"} as const;
const flow={kind:"description",flowName:"Banking",description:"SPA calls Banking API. Banking API reads Banking Database."} as const;
function controlled(type:"sequence"|"component",onFirst?:()=>void){const calls:StructuredChatRequest[]=[];const client:StructuredChatClient={clientType:"openai-compatible-local",generationMetadata:{modelId:"synthetic",temperature:0,seed:42,attemptCount:1,structuredOutput:true},async complete(r){calls.push(r);const i=JSON.parse(r.messages[1]!.content);if(calls.length%2===0)return {source:"content",value:{accepted:true,violations:[],confirmedUserStatedFactIds:[]}};
 onFirst?.();return {source:"content",value:type==="sequence"?{version:3,groundedSteps:[{order:1,operationId:i.operationCatalog.find((o:any)=>o.kind==="request").operationId,label:"Call API"}],userStatedSteps:[]}:{version:1,elementIds:i.snapshot.elements.map((e:any)=>e.id),groundedDependencies:i.relationshipCatalog.map((d:any)=>d.dependencyId),userStatedDependencies:[]}};}};return {app:createArchiAgentRuntime({diagramClientFactory:()=>client}),calls};}
describe("SRC1 production runtime",()=>{
 for(const diagramType of ["sequence","component"] as const)it(`${diagramType}: one snapshot in generator/reviewer/report/saved original; rereads next operation`,async()=>{
  const config=setup();const original=readFileSync(config.modelPath,"utf8");
  const c=controlled(diagramType,()=>{const d=JSON.parse(original);d.model.softwareSystems.find((s:any)=>s.id==="7").name="Renamed Bank";writeFileSync(config.modelPath,JSON.stringify(d));});
  const request={diagramType,knowledgePack:config,generator,flow};const result=await c.app.generateDiagram!(request);
  expect(result.status).toBe("success");if(result.status!=="success")return;
  expect(c.calls).toHaveLength(2);
  const first=JSON.parse(c.calls[0]!.messages[1]!.content).snapshot,review=JSON.parse(c.calls[1]!.messages[1]!.content).snapshot;
  expect(first).toEqual(review);expect(JSON.stringify(first)).not.toContain("Renamed Bank");expect(JSON.stringify(first)).not.toContain(root);expect(JSON.stringify(first)).not.toContain("Sign In Controller");
  const report=JSON.parse(result.groundingReport);expect(report.sourceProvenance.digest).toBe(first.knowledge.digest);expect(report.sourceProvenance.facts).toEqual(first.knowledge.provenance);
  const project=path.dirname(config.modelPath);const saved=await saveDiagramBundle(project,result.artifact!,planDiagramBundle());
  const savedReport=JSON.parse(readFileSync(path.join(saved.directory,"report.json"),"utf8"));expect(savedReport.generationReport.sourceProvenance).toEqual(report.sourceProvenance);expect(JSON.stringify(savedReport)).not.toContain(root);
  const next=await c.app.generateDiagram!(request);expect(next.status).toBe("success");const nextSnapshot=JSON.parse(c.calls[2]!.messages[1]!.content).snapshot;
  expect(nextSnapshot.knowledge.digest).not.toBe(first.knowledge.digest);expect(JSON.stringify(nextSnapshot)).toContain("Renamed Bank");
 });
 it("invalid endpoint binding uses zero model calls",async()=>{
  const config=setup(),file=path.join(config.overlayPath,"relationships.md");writeFileSync(file,readFileSync(file,"utf8").replace("| 45 | 11 | 18 |","| 45 | 11 | 4 |"));
  const c=controlled("sequence"),r=await c.app.generateDiagram!({diagramType:"sequence",knowledgePack:config,generator,flow});expect(r.status).toBe("failed");expect(c.calls).toHaveLength(0);
  if(r.status==="failed")expect(r.issues[0]!.code).toBe("overlay-relationship-endpoints-mismatch");
 });
 it("honours cancellation and detects missing source data",async()=>{const config=setup();expect((await inspectArchitectureSource(config,{aborted:true})).ok).toBe(false);writeFileSync(config.modelPath,'{}');expect((await inspectArchitectureSource(config)).ok).toBe(false);});
});

it("AUD-003 NEW stays user-confirmed, frozen and outside Structurizr facts", async () => {
 const config=setup(), original=readFileSync(config.modelPath,"utf8"), calls:StructuredChatRequest[]=[];
 const client:StructuredChatClient={clientType:"openai-compatible-local",generationMetadata:{modelId:"synthetic",temperature:0,seed:42,attemptCount:1,structuredOutput:true},async complete(r){
  calls.push(r);const i=JSON.parse(r.messages[1]!.content);
  if(calls.length===2)return {source:"content",value:{accepted:true,confirmedUserStatedFactIds:["fact-0001"],violations:[]}};
  const known=i.snapshot.elements.find((e:any)=>e.kind!=="new"), added=i.snapshot.elements.find((e:any)=>e.kind==="new");
  expect(added.origin).toBe("user-confirmed");expect(i.snapshot.knowledge.provenance.some((f:any)=>JSON.stringify(f).includes(added.id))).toBe(false);
  return {source:"content",value:{version:3,groundedSteps:[],userStatedSteps:[{order:1,fromId:known.id,toId:added.id,interactionKind:"request",interfaceType:"INTERNAL",interfaceName:null,flowEvidenceId:i.snapshot.flowEvidence[0].flowEvidenceId,label:"Notify"}]}};
 }};
 const r=await createArchiAgentRuntime({diagramClientFactory:()=>client}).generateDiagram!({diagramType:"sequence",knowledgePack:config,generator,flow:{kind:"description",flowName:"New relay",description:"SPA notifies [NEW: Relay One]."},confirmedNewParticipants:["Relay One"]});
 expect(r.status).toBe("success");expect(calls).toHaveLength(2);expect(readFileSync(config.modelPath,"utf8")).toBe(original);
 expect(JSON.parse(calls[0]!.messages[1]!.content).snapshot).toEqual(JSON.parse(calls[1]!.messages[1]!.content).snapshot);
 if(r.status==="success"){expect(r.plantUml).toContain('participant "[NEW] Relay One"');expect(JSON.parse(r.groundingReport).facts[0].evidenceClass).toBe("user-stated");}
});
