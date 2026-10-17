import type { KnowledgePack, RecordProvenance } from "../knowledge-pack/knowledge-pack.schema.js";
import type { KnowledgeSnapshot, SelectedKnowledgeContext } from "../knowledge-pack/knowledge-snapshot.js";
import { selectKnowledgeContext } from "../knowledge-pack/knowledge-snapshot.js";
import { stableDigest, type CanonicalValue } from "../util/stable-digest.js";
import { freezeVerification } from "../verification/flow-interpretation.js";
import { displayTextProblem } from "../render/plantuml-escape.js";
export interface C4Element {readonly id:string;readonly name:string;readonly kind:"person"|"software-system"|"container";readonly parentId?:string;readonly description:string;readonly technology?:string;readonly provenance:readonly RecordProvenance[]}
export interface C4Relationship {readonly factId:string;readonly fromId:string;readonly toId:string;readonly purpose:string;readonly interfaceType:string;readonly interfaceName:string|null;readonly mode:string;readonly provenance:readonly RecordProvenance[]}
interface C4Slice {readonly systemId:string;readonly elements:readonly C4Element[];readonly relationships:readonly C4Relationship[];readonly knowledge:SelectedKnowledgeContext;readonly limitations:readonly string[];readonly omittedRelationships:number;readonly digest:string}
export interface ContextSnapshot extends C4Slice {readonly domain:"archi-agent-c4-context/1"}
export interface ContainerSnapshot extends C4Slice {readonly domain:"archi-agent-c4-container/1";readonly containerIds:readonly string[];readonly externalIds:readonly string[]}
export type C4Snapshot=ContextSnapshot|ContainerSnapshot;
export class C4SourceError extends Error {constructor(readonly code:string){super(code);}}
function sourceElements(pack:KnowledgePack):C4Element[] {
  const rows=[...pack.actors,...pack.systems];
  if(!rows.length||rows.some(e=>!e.architecture))throw new C4SourceError("c4-hierarchy-unavailable");
  const result=rows.map(e=>({id:e.id,name:e.canonicalName,kind:e.architecture!.kind,description:e.description,
    ...(e.architecture!.parentId?{parentId:e.architecture!.parentId}:{}),...(e.architecture!.technology?{technology:e.architecture!.technology}:{}),provenance:e.provenance??[]}));
  for(const e of result)if(!e.provenance.length||displayTextProblem(e.name)!==undefined||displayTextProblem(e.description,{maxChars:1000})!==undefined||e.technology&&displayTextProblem(e.technology,{maxChars:256})!==undefined||
    e.kind==="container"&&!result.some(p=>p.id===e.parentId&&p.kind==="software-system"))throw new C4SourceError("c4-source-data-invalid");
  return result;
}
function relations(knowledge:KnowledgeSnapshot):C4Relationship[] {return knowledge.facts.flatMap(f=>f.table==="relationships"?[{factId:f.id,...f.value,interfaceName:f.value.interfaceName??null,provenance:f.provenance}]:[]);}
function bounded<T extends C4Snapshot>(payload:Omit<T,"digest">):T {
  if(payload.elements.length>64||payload.relationships.length>256||JSON.stringify(payload).length>65_536)throw new C4SourceError("c4-context-limit");
  return freezeVerification({...payload,digest:stableDigest(payload as unknown as CanonicalValue)}) as unknown as T;
}
export function listC4Systems(pack:KnowledgePack) {return sourceElements(pack).filter(e=>e.kind==="software-system").sort((a,b)=>a.name.localeCompare(b.name,"en")||a.id.localeCompare(b.id,"en"));}
export function buildContextSnapshot(pack:KnowledgePack,knowledge:KnowledgeSnapshot,systemId:string):ContextSnapshot {
  const all=sourceElements(pack),system=all.find(e=>e.id===systemId&&e.kind==="software-system");if(!system)throw new C4SourceError("c4-subject-invalid");
  const high=new Set(all.filter(e=>e.kind!=="container").map(e=>e.id)),allR=relations(knowledge);
  const incident=allR.filter(r=>(r.fromId===systemId||r.toId===systemId)&&high.has(r.fromId)&&high.has(r.toId));
  const ids=new Set([systemId,...incident.flatMap(r=>[r.fromId,r.toId])]);
  return bounded<ContextSnapshot>({domain:"archi-agent-c4-context/1",systemId,elements:all.filter(e=>ids.has(e.id)),relationships:incident,
    knowledge:selectKnowledgeContext(knowledge,[...ids]),omittedRelationships:allR.length-incident.length,
    limitations:["Context shows direct source relationships to the selected software system. Container/component edges are never rolled up.",
      "Source component, deployment and view omissions remain in knowledge.sources.",...(!incident.length?["The source declares no supported relationships for this system: isolated view."]:[])]});
}
export function buildContainerSnapshot(pack:KnowledgePack,knowledge:KnowledgeSnapshot,systemId:string):ContainerSnapshot {
  const all=sourceElements(pack),system=all.find(e=>e.id===systemId&&e.kind==="software-system");if(!system)throw new C4SourceError("c4-subject-invalid");
  const containers=all.filter(e=>e.kind==="container"&&e.parentId===systemId),inner=new Set(containers.map(e=>e.id));
  if(!inner.size)throw new C4SourceError("c4-containers-unavailable");
  const outer=new Set(all.filter(e=>e.kind!=="container"&&e.id!==systemId).map(e=>e.id)),allR=relations(knowledge);
  const selected=allR.filter(r=>(inner.has(r.fromId)||inner.has(r.toId))&&(inner.has(r.fromId)||outer.has(r.fromId))&&(inner.has(r.toId)||outer.has(r.toId)));
  const externalIds=[...new Set(selected.flatMap(r=>[r.fromId,r.toId]).filter(id=>outer.has(id)))].sort();
  const ids=new Set([systemId,...inner,...externalIds]);
  return bounded<ContainerSnapshot>({domain:"archi-agent-c4-container/1",systemId,elements:all.filter(e=>ids.has(e.id)),relationships:selected,containerIds:[...inner].sort(),externalIds,
    knowledge:selectKnowledgeContext(knowledge,[...ids]),omittedRelationships:allR.length-selected.length,
    limitations:["Container membership comes only from the source parent ID. Only direct container/person/external-system relationships are shown.",
      "Foreign containers and component/deployment/view scope are omitted; no inferred edges or collapsed relationships.",...(!selected.length?["No supported relationships: containers are shown without invented dependencies."]:[])]});
}
