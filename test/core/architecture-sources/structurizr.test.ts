import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeStructurizrKnowledge, structurizrElementId } from "../../../src/core/architecture-sources/structurizr-json.js";
import { parseLocatedJson } from "../../../src/core/architecture-sources/json-with-locations.js";
import type { OverlayTexts } from "../../../src/core/architecture-sources/knowledge-overlay.js";
const base = "test/fixtures/structurizr/big-bank-plc/";
const model = readFileSync(base + "workspace.json", "utf8");
const overlay = Object.fromEntries(["aliases.md", "rules.md", "relationships.md"].map(f => [f,readFileSync(base+"overlay/"+f,"utf8")])) as unknown as OverlayTexts;
const compose = (m = model, o = overlay) => composeStructurizrKnowledge(m,o,"big-bank");
function modified(fn: (m: any) => void) { const m = JSON.parse(model); fn(m); return JSON.stringify(m,null,2); }
describe("SRC1 source", () => {
 it("imports official bytes, qualified containers, omissions and field provenance", () => {
  const r=compose(); expect(r.pack.systems).toHaveLength(9);expect(r.pack.actors).toHaveLength(3);expect(r.pack.relationships).toHaveLength(18);
  expect(r.pack.systems.some(e=>e.canonicalName==="Internet Banking System / API Application")).toBe(true);
  expect(r.knowledge.sources[0]!.omissions).toContainEqual({kind:"components",count:6});
  expect(r.knowledge.facts.find(f=>f.table==="relationships")!.provenance.some(p=>p.sourceId==="big-bank-overlay")).toBe(true);
  expect(r.knowledge.conflicts).toEqual([]);
 });
 it("preserves IDs and overlay links across element and parent rename", () => {
  const r=compose(modified(m=>{m.model.softwareSystems.find((e:any)=>e.id==="7").name="Renamed";}));
  expect(r.pack.systems.find(e=>e.id===structurizrElementId("big-bank","11"))!.canonicalName).toBe("Renamed / API Application");
  expect(r.pack.aliases.find(a=>a.alias==="Banking API")!.targetId).toBe(structurizrElementId("big-bank","11"));
 });
 for (const field of ["sourceId","destinationId"]) it(`rejects reused relationship ID with changed ${field}`, () => {
  const change=modified(m=>{const sys=m.model.softwareSystems.find((e:any)=>e.id==="7");const api=sys.containers.find((e:any)=>e.id==="11");const r=api.relationships.find((e:any)=>e.id==="45");
    if(field==="sourceId") { api.relationships=api.relationships.filter((e:any)=>e!==r); const owner=sys.containers.find((e:any)=>e.id==="9");owner.relationships.push(r);r.sourceId="9"; } else r.destinationId="4";
  });
  expect(()=>compose(change)).toThrow("overlay-relationship-endpoints-mismatch");
 });
 it("uses explicit model mode without requiring overlay repetition",()=>{
  const changed=modified(m=>{m.model.people[0].relationships[0].interactionStyle="Synchronous";});
  const o={...overlay,"relationships.md":overlay["relationships.md"].replace(/(\| big-bank \| 19 .*\|) synchronous \|/,"$1  |")};
  const r=compose(changed,o),rel=r.pack.relationships.find(r=>r.provenance?.some(p=>p.externalId==="19"))!;
  expect(rel.mode).toBe("synchronous");expect(rel.provenance!.filter(p=>p.fields?.includes("mode")).map(p=>p.sourceId)).toEqual(["big-bank"]);
 });
 it("rejects model/overlay mode conflict",()=>expect(()=>compose(modified(m=>{m.model.people[0].relationships[0].interactionStyle="Asynchronous";}))).toThrow("relationship-mode-conflict"));
 it("rejects missing metadata and orphan references",()=>{
  expect(()=>compose(model,{...overlay,"relationships.md":overlay["relationships.md"].split("\n").filter(l=>!l.includes("| 45 |")).join("\n")})).toThrow("relationship-metadata-missing");
  expect(()=>compose(model,{...overlay,"aliases.md":overlay["aliases.md"].replace("| 18 |","| 999 | ")})).toThrow("overlay-reference-missing");
 });
 it("rejects removed relationship target",()=>expect(()=>compose(modified(m=>{const s=m.model.softwareSystems.find((e:any)=>e.id==="7");s.containers=s.containers.filter((e:any)=>e.id!=="18");}))).toThrow("relationship-endpoint-missing"));
 it("qualifies equal container names in different parents",()=>{
  const m=modified(m=>{m.model.softwareSystems.push({id:"new-parent",name:"Other Bank",description:"Other",containers:[{id:"new-api",name:"API Application",description:"Other API"}]});});
  expect(compose(m).pack.systems.filter(e=>e.canonicalName.endsWith(" / API Application")).map(e=>e.canonicalName).sort()).toEqual(["Internet Banking System / API Application","Other Bank / API Application"]);
 });
 it("rejects duplicate aliases and rules while preserving real alias ambiguity",()=>{
  for(const file of ["aliases.md","rules.md"] as const){const lines=overlay[file].trimEnd().split("\n");expect(()=>compose(model,{...overlay,[file]:lines.join("\n")+"\n"+lines.at(-1)+"\n"})).toThrow("overlay-record-duplicate");}
  const ambiguous={...overlay,"aliases.md":overlay["aliases.md"]+"| Banking API | big-bank | 18 |\n"};
  expect(compose(model,ambiguous).knowledge.ambiguities.length).toBe(1);
 });
 it("does not overwrite object locations with property lines",()=>{
  const text='{\n"model": {\n"softwareSystems": [\n{\n"id":"x",\n"name":"X",\n"description":"D"}\n]}}';
  const r=parseLocatedJson(text,"workspace.json");expect(r.at(["model","softwareSystems",0]).line).toBe(4);expect(r.at(["model","softwareSystems",0,"name"]).line).toBe(6);
 });
 it("rejects missing mode in both sources",()=>{
  expect(()=>compose(model,{...overlay,"relationships.md":overlay["relationships.md"].replace(/(\| big-bank \| 19 .*\|) synchronous \|/,"$1  |")})).toThrow("relationship-mode-missing");
 });
 it("rejects duplicate keys, comments, trailing comma and depth; preserves real CRLF lines",()=>{
  for(const s of ['{"model":{},"model":{}}','{/*x*/"model":{}}','{"model":{},}',"[".repeat(65)+"]".repeat(65)])expect(()=>parseLocatedJson(s,"workspace.json")).toThrow();
  expect(parseLocatedJson('{\r\n"model": {\r\n"name":"x"}}',"workspace.json").at(["model","name"]).line).toBe(3);
 });
});
