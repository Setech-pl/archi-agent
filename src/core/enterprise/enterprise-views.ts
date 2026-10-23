import {z} from "zod";
import {EnterpriseError,deepFreeze,enterpriseCatalogV3Schema,type EnterpriseSnapshot} from "./enterprise-catalog.js";
import {stableDigest,type CanonicalValue} from "../util/stable-digest.js";
import {assertSafeDisplayText} from "../render/plantuml-escape.js";
import {enterpriseTransportV3Schema} from "./capability-map-report.js";
const id=z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const base={language:z.enum(["pl","en"]),expectedCatalogDigest:digest};
export const valueStreamSelectionSchema=z.strictObject({...base,streamId:id,stageIds:z.array(id).max(100)});
export const landscapeSelectionSchema=z.strictObject({...base,domainIds:z.array(id).max(1000),applicationIds:z.array(id).max(1000),colorBy:z.union([z.strictObject({kind:z.literal("none")}),z.strictObject({kind:z.literal("rating"),scaleId:id})])});
export type ValueStreamSelection=z.infer<typeof valueStreamSelectionSchema>;
export type LandscapeSelection=z.infer<typeof landscapeSelectionSchema>;
export type EnterpriseViewType="value-stream"|"application-landscape";
export const enterpriseViewLimits=Object.freeze({nodes:120,edges:240,plantUmlBytes:256*1024,reportBytes:1024*1024});
const locator=z.strictObject({pointer:z.string().max(256),location:z.strictObject({file:z.string().max(256),line:z.number().int().positive()}).optional()});
const located=<T extends z.ZodType>(record:T)=>z.strictObject({record,locator,renderLine:z.number().int().positive()});
const common={modelCalls:z.literal(0),generationPath:z.literal("deterministic-catalog-projection"),rendererVersion:z.literal(1),
 source:z.strictObject({contract:z.literal("archi-agent-enterprise/3"),identity:enterpriseCatalogV3Schema.shape.source,evidence:z.union([z.strictObject({file:z.string().max(256),sourceBytesSha256:digest}),enterpriseTransportV3Schema])}),
 snapshot:z.strictObject({id:z.string(),catalogDigest:digest}),projectionDigest:digest,
 excluded:z.array(z.strictObject({kind:z.enum(["stream","stage","capability","application","domain"]),id:z.string().max(160),reason:z.literal("outside-selected-scope")})).max(13000),limitations:z.array(z.string().max(512)).max(16)};
export const valueStreamReportSchema=z.strictObject({...common,format:z.literal("archi-agent-value-stream-report/1"),diagramType:z.literal("value-stream"),selection:valueStreamSelectionSchema,
 scope:enterpriseCatalogV3Schema.shape.valueStreamScope,stream:located(enterpriseCatalogV3Schema.shape.valueStreams.element),
 stages:z.array(located(enterpriseCatalogV3Schema.shape.valueStreams.element.shape.stages.element).extend({ordinal:z.number().int().positive()})).max(100),
 capabilities:z.array(z.strictObject({record:enterpriseCatalogV3Schema.shape.capabilities.element,locator:z.strictObject({pointer:z.string(),fields:z.record(z.string(),z.union([locator,z.strictObject({file:z.string(),line:z.number().int().positive()})]))}),renderLine:z.number().int().positive()})).max(120)});
export const landscapeReportSchema=z.strictObject({...common,format:z.literal("archi-agent-application-landscape-report/1"),diagramType:z.literal("application-landscape"),selection:landscapeSelectionSchema,
 scope:enterpriseCatalogV3Schema.shape.landscapeScope,supportScope:enterpriseCatalogV3Schema.shape.supportScope,
 applications:z.array(located(enterpriseCatalogV3Schema.shape.applications.element)).max(120),domains:z.array(located(enterpriseCatalogV3Schema.shape.domains.element)).max(120),
 scales:enterpriseCatalogV3Schema.shape.scales});
export const enterpriseViewReportSchema=z.discriminatedUnion("diagramType",[valueStreamReportSchema,landscapeReportSchema]);
export type EnterpriseViewReport=z.infer<typeof enterpriseViewReportSchema>;
const colors=["#FDE0DD","#FEE8C8","#FFF7BC","#D9F0A3","#ADDD8E","#78C679","#41AB5D"];
const quoted=(s:string)=>{assertSafeDisplayText(s,{maxChars:600});return `"${s}"`;};
/** Closed generated grammar; every source label is checked before emitting a statement. */
export function validateEnterpriseViewRender(text:string){
 if(new TextEncoder().encode(text).byteLength>enterpriseViewLimits.plantUmlBytes)throw new EnterpriseError("map-too-large");
 const lines=text.split("\n");if(lines[0]!=="@startuml"||lines.at(-2)!=="@enduml"||lines.at(-1)!=="")throw new EnterpriseError("render-invalid");
 const aliases=new Set<string>();let group=false;
 for(const line of lines.slice(1,-2)){
  if(["left to right direction","skinparam shadowing false","title Value Stream","title Strumień wartości","title Application Landscape","title Krajobraz aplikacji"].includes(line))continue;
  if(line==="}"){if(!group)throw new EnterpriseError("render-invalid");group=false;continue;}
  if(line.startsWith("title Value Stream - ")||line.startsWith("title Strumień wartości - ")){assertSafeDisplayText(line.slice(6),{maxChars:600});continue;}
  const node=line.match(/^(package|rectangle|component) "([^"\n]+)" as ([dsca]_\d+)(?: (#[A-F0-9]{6}))?( \{)?$/);
  if(node){assertSafeDisplayText(node[2]!,{maxChars:600});if(aliases.has(node[3]!)||node[1]==="package"&&group||!!node[5]!== (node[1]==="package"))throw new EnterpriseError("render-invalid");aliases.add(node[3]!);if(node[1]==="package")group=true;continue;}
  const edge=line.match(/^([sc]_\d+) --> ([sc]_\d+) : (next|requires)$/);if(!edge||!aliases.has(edge[1]!)||!aliases.has(edge[2]!))throw new EnterpriseError("render-invalid");
 }
 if(group)throw new EnterpriseError("render-invalid");
}
export function projectEnterpriseView(snapshot:EnterpriseSnapshot,type:EnterpriseViewType,raw:ValueStreamSelection|LandscapeSelection){
 const parsed=(type==="value-stream"?valueStreamSelectionSchema:landscapeSelectionSchema).safeParse(raw);if(!parsed.success)throw new EnterpriseError("invalid-selection");
 const selection=parsed.data,c=snapshot.catalog;if(selection.expectedCatalogDigest!==snapshot.catalogDigest)throw new EnterpriseError("stale-source");if(c.schemaVersion!==3)throw new EnterpriseError("enterprise-version-unsupported");
 const lines=["@startuml","left to right direction","skinparam shadowing false",`title ${type==="value-stream"?(selection.language==="pl"?"Strumień wartości":"Value Stream"):(selection.language==="pl"?"Krajobraz aplikacji":"Application Landscape")}`],positions:Record<string,number>={};
 const excluded:{kind:"stream"|"stage"|"capability"|"application"|"domain";id:string;reason:"outside-selected-scope"}[]=[];
 const omit=(kind:typeof excluded[number]["kind"],ids:string[])=>ids.forEach(id=>excluded.push({kind,id,reason:"outside-selected-scope"}));
 let nodes=0,edges=0;
 const emit=(key:string,line:string)=>{positions[key]=lines.length+1;lines.push(line);nodes++;};
 if(type==="value-stream"){
  const s=selection as ValueStreamSelection,v=c.valueStreams.find(v=>v.id===s.streamId);if(!v)throw new EnterpriseError("invalid-selection");
  if(new Set(s.stageIds).size!==s.stageIds.length||s.stageIds.some(id=>!v.stages.some(st=>st.id===id)))throw new EnterpriseError("invalid-selection");s.stageIds.sort();
  const stages=v.stages.filter(st=>!s.stageIds.length||s.stageIds.includes(st.id)),ids=new Set(stages.flatMap(st=>st.capabilityIds)),caps=c.capabilities.filter(cap=>ids.has(cap.id));
  lines[3]=`title ${s.language==="pl"?"Strumień wartości":"Value Stream"} - ${v.name} (${v.id})`;assertSafeDisplayText(lines[3].slice(6),{maxChars:600});positions.stream=4;
  stages.forEach((st,i)=>emit(`stage:${st.id}`,`rectangle ${quoted(`${v.stages.indexOf(st)+1}. ${st.name} (${st.id})`)} as s_${i}`));
  caps.forEach((cap,i)=>emit(`capability:${cap.id}`,`rectangle ${quoted(`${cap.name} (${cap.id})`)} as c_${i}`));
  stages.forEach((st,i)=>{const next=v.stages[v.stages.indexOf(st)+1],j=stages.findIndex(x=>x.id===next?.id);if(j>=0){lines.push(`s_${i} --> s_${j} : next`);edges++;}st.capabilityIds.forEach(id=>{lines.push(`s_${i} --> c_${caps.findIndex(cap=>cap.id===id)} : requires`);edges++;});});
  omit("stream",c.valueStreams.filter(x=>x.id!==v.id).map(x=>x.id));omit("stage",v.stages.filter(x=>!stages.includes(x)).map(x=>`${v.id}/${x.id}`));omit("capability",c.capabilities.filter(x=>!ids.has(x.id)).map(x=>x.id));
 }else{
  const s=selection as LandscapeSelection;
  for(const [ids,records] of [[s.domainIds,c.domains],[s.applicationIds,c.applications]] as const){if(new Set(ids).size!==ids.length||ids.some(id=>!records.some(r=>r.id===id)))throw new EnterpriseError("invalid-selection");ids.sort();}
  const scale=s.colorBy.kind==="rating"?c.scales.find(v=>v.id===(s.colorBy as {scaleId:string}).scaleId):undefined;if(s.colorBy.kind==="rating"&&!scale)throw new EnterpriseError("invalid-selection");
  const apps=c.applications.filter(a=>(!s.domainIds.length||!!a.domainId&&s.domainIds.includes(a.domainId))&&(!s.applicationIds.length||s.applicationIds.includes(a.id)));
  if(!apps.length)throw new EnterpriseError("empty-scope");
  const domains=c.domains.filter(d=>apps.some(a=>a.domainId===d.id)),groups:[string|undefined,string][]=[...domains.map(d=>[d.id,d.name] as [string,string]),[undefined,s.language==="pl"?"Domena nieznana":"Unknown domain"]];
  for(const [di,name] of groups){const members=apps.filter(a=>a.domainId===di);if(!members.length)continue;const index=groups.findIndex(g=>g[0]===di);emit(`domain:${di??""}`,`package ${quoted(di?`${name} (${di})`:name)} as d_${index} {`);
   for(const a of members){const rating=scale?a.ratings?.[scale.id]:undefined,color=scale?(rating===undefined?"#E5E7EB":colors[scale.levels.findIndex(l=>l.value===rating)]):undefined;
    const label=`${a.name} (${a.id})${a.lifecycle?` - ${a.lifecycle}`:""}${a.owner?` - ${a.owner}`:""}${scale?` - ${rating===undefined?(s.language==="pl"?"ocena nieznana":"rating unknown"):String(rating)}`:""}`;
    emit(`application:${a.id}`,`component ${quoted(label)} as a_${apps.indexOf(a)}${color?` ${color}`:""}`);
   }lines.push("}");
  }
  omit("application",c.applications.filter(x=>!apps.includes(x)).map(x=>x.id));omit("domain",c.domains.filter(x=>!domains.includes(x)).map(x=>x.id));
 }
 if(nodes>enterpriseViewLimits.nodes||edges>enterpriseViewLimits.edges)throw new EnterpriseError("map-too-large",[],nodes);
 lines.push("@enduml");const plantUml=lines.join("\n")+"\n";validateEnterpriseViewRender(plantUml);
 return deepFreeze({selection,positions,excluded,plantUml,projectionDigest:stableDigest({domain:`archi-agent-${type}/1`,catalogDigest:snapshot.catalogDigest,selection,rendererVersion:1} as unknown as CanonicalValue)});
}
