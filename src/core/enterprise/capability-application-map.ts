import {z} from "zod";
import {EnterpriseError,deepFreeze,type EnterpriseSnapshot} from "./enterprise-catalog.js";
import {stableCompare} from "../util/ordering.js";
import {stableDigest,type CanonicalValue} from "../util/stable-digest.js";
import {assertSafeDisplayText} from "../render/plantuml-escape.js";
export const applicationMapLimits=Object.freeze({nodes:120,edges:240,plantUmlBytes:256*1024,reportBytes:1024*1024});
export const applicationMapSelectionSchema=z.strictObject({capabilityIds:z.array(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)).max(1000),includeDescendants:z.boolean(),language:z.enum(["pl","en"]),expectedCatalogDigest:z.string().regex(/^[a-f0-9]{64}$/)});
export type ApplicationMapSelection=z.infer<typeof applicationMapSelectionSchema>;
export function projectApplicationMap(snapshot:EnterpriseSnapshot,raw:ApplicationMapSelection){
 const p=applicationMapSelectionSchema.safeParse(raw);if(!p.success)throw new EnterpriseError("invalid-selection");const selection=p.data,c=snapshot.catalog;
 if(selection.expectedCatalogDigest!==snapshot.catalogDigest)throw new EnterpriseError("stale-source");
 if(c.schemaVersion===1||c.supportScope.applications==="not-provided"||c.supportScope.relationships==="not-provided")throw new EnterpriseError("support-data-unavailable");
 if(new Set(selection.capabilityIds).size!==selection.capabilityIds.length||selection.capabilityIds.some(id=>!c.capabilities.some(v=>v.id===id)))throw new EnterpriseError("invalid-selection");selection.capabilityIds.sort(stableCompare);
 const selected=new Set(selection.capabilityIds.length?selection.capabilityIds:c.capabilities.map(v=>v.id));
 if(selection.includeDescendants)for(let i=0;i<3;i++)for(const cap of c.capabilities)if(cap.parentId&&selected.has(cap.parentId))selected.add(cap.id);
 const capabilities=c.capabilities.filter(v=>selected.has(v.id)),supports=c.supports.filter(v=>selected.has(v.capabilityId));
 const applications=c.applications.filter(a=>!selection.capabilityIds.length||supports.some(s=>s.applicationId===a.id));
 if(!capabilities.length)throw new EnterpriseError("empty-scope");
 if(capabilities.length+applications.length>applicationMapLimits.nodes||supports.length>applicationMapLimits.edges)throw new EnterpriseError("map-too-large",[],capabilities.length+applications.length);
 const excluded=[...c.capabilities.filter(v=>!selected.has(v.id)).map(v=>({kind:"capability" as const,id:v.id,reason:"outside-selected-scope" as const})),
 ...c.applications.filter(v=>!applications.includes(v)).map(v=>({kind:"application" as const,id:v.id,reason:"no-direct-link-in-selected-scope" as const})),
 ...c.supports.filter(v=>!supports.includes(v)).map(v=>({kind:"support" as const,id:JSON.stringify([v.applicationId,v.capabilityId]),reason:"outside-selected-scope" as const}))];
 const {expectedCatalogDigest:_d,...settings}=selection;
 return deepFreeze({snapshot,selection,capabilities,applications,supports,excluded,projectionDigest:stableDigest({domain:"archi-agent-capability-application-map/1",catalogDigest:snapshot.catalogDigest,selection:settings,capabilities,applications,supports,excluded,rendererVersion:1} as unknown as CanonicalValue)});
}
export function renderApplicationMap(p:ReturnType<typeof projectApplicationMap>){
 const pl=p.selection.language==="pl",lines=["@startuml","left to right direction","skinparam shadowing false",`title ${pl?"Mapa zdolności i aplikacji":"Capability Application Map"}`],positions:Record<string,number>={};
 const ca=new Map(p.capabilities.map((c,i)=>[c.id,`cap_${i}`])),aa=new Map(p.applications.map((a,i)=>[a.id,`app_${i}`]));
 for(const [kind,records,aliases] of [["capability",p.capabilities,ca],["application",p.applications,aa]] as const)for(const r of records){
   assertSafeDisplayText(r.name,{maxChars:160});positions[`${kind}:${r.id}`]=lines.length+1;
   lines.push(`${kind==="capability"?"rectangle":"component"} "${r.name} (${r.id})" as ${aliases.get(r.id)}`);
 }
 p.supports.forEach(r=>{positions[`support:${JSON.stringify([r.applicationId,r.capabilityId])}`]=lines.length+1;lines.push(`${aa.get(r.applicationId)} --> ${ca.get(r.capabilityId)} : supports`);});
 lines.push("legend",pl?"Tylko jawne bezpośrednie powiązania. Brak relacji oznacza nieznane wsparcie.":"Explicit direct links only. Missing links mean unknown support.",
 pl?"Wiele powiązań nie dowodzi redundancji. Bez dziedziczenia i agregacji.":"Multiple links do not prove redundancy. No inheritance or aggregation.","LLM: 0","endlegend","@enduml");
 const plantUml=lines.join("\n")+"\n";validateApplicationMapRender(plantUml,p.capabilities.length+p.applications.length,p.supports.length);return {plantUml,lines:positions};
}
/** Closed grammar; source labels cannot supply directives, links, includes or aliases. */
export function validateApplicationMapRender(text:string,nodes:number,edges:number){
 if(Buffer.byteLength(text)>applicationMapLimits.plantUmlBytes)throw new EnterpriseError("map-too-large");
 const lines=text.trimEnd().split("\n");if(lines[0]!=="@startuml"||lines[1]!=="left to right direction"||lines[2]!=="skinparam shadowing false"||!["title Capability Application Map","title Mapa zdolności i aplikacji"].includes(lines[3]!)||lines.at(-1)!=="@enduml")throw new EnterpriseError("render-invalid");
 const aliases=new Set<string>();let n=0,e=0,legend=false,ended=false;
 for(const line of lines.slice(4,-1)){
   if(line==="legend"&&!legend&&!ended){legend=true;continue;}if(line==="endlegend"&&legend){legend=false;ended=true;continue;}if(ended)throw new EnterpriseError("render-invalid");
   if(legend){assertSafeDisplayText(line,{maxChars:256});continue;}
   const node=line.match(/^(rectangle|component) "([^"\n]+)" as ((cap|app)_\d+)$/);if(node){assertSafeDisplayText(node[2]!,{maxChars:256});if(aliases.has(node[3]!))throw new EnterpriseError("render-invalid");aliases.add(node[3]!);n++;continue;}
   const edge=line.match(/^(app_\d+) --> (cap_\d+) : supports$/);if(!edge||!aliases.has(edge[1]!)||!aliases.has(edge[2]!))throw new EnterpriseError("render-invalid");e++;
 }
 if(n!==nodes||e!==edges||legend||!ended)throw new EnterpriseError("render-invalid");
}
