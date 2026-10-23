import {loadEnterpriseSource,type EnterpriseSourceConfig} from "./enterprise-source.js";
import {EnterpriseError,deepFreeze} from "../core/enterprise/enterprise-catalog.js";
import {projectApplicationMap,renderApplicationMap,applicationMapLimits,type ApplicationMapSelection} from "../core/enterprise/capability-application-map.js";
import {applicationMapReportSchema} from "../core/enterprise/capability-application-report.js";
import {captureApplicationMapArtifact} from "./diagram-artifact.js";
import type {CancellationSignal} from "./runtime-types.js";
import type {LocalReadPolicy} from "../node/local-read-policy.js";
export type ApplicationMapView=Omit<ApplicationMapSelection,"expectedCatalogDigest">&{expectedCatalogDigest?:string};
export async function generateApplicationMap(request:{source:EnterpriseSourceConfig;selection:ApplicationMapView},signal?:CancellationSignal,policy?:LocalReadPolicy){
 const deadline=Date.now()+30000,check=()=>{if(signal?.aborted)throw new EnterpriseError("cancelled");if(Date.now()>=deadline)throw new EnterpriseError("deadline-exceeded");};
 try{
  check();const source=request.source.kind==="mcp"?{...request.source,contractVersion:request.source.contractVersion??2 as const}:request.source;
  const snapshot=await loadEnterpriseSource(source,{get aborted(){return !!signal?.aborted||Date.now()>=deadline;}},policy,deadline);check();
  const p=projectApplicationMap(snapshot,{...request.selection,expectedCatalogDigest:request.selection.expectedCatalogDigest??snapshot.catalogDigest}),render=renderApplicationMap(p),e=snapshot.evidence,c=snapshot.catalog;
  if(c.schemaVersion===1)throw new EnterpriseError("support-data-unavailable");
  const report=deepFreeze(applicationMapReportSchema.parse({format:`archi-agent-capability-application-map-report/${c.schemaVersion===3?2:1}`,diagramType:"capability-application-map",modelCalls:0,generationPath:"deterministic-catalog-projection",rendererVersion:1,
   source:{contract:c.format,identity:c.source,evidence:"kind"in e?{kind:"mcp",sourceId:e.sourceId,sourceVersion:e.sourceVersion,responseFingerprint:e.responseFingerprint,tool:e.tool,contractVersion:e.contractVersion}:{file:e.file,sourceBytesSha256:e.sourceBytesSha256}},
   snapshot:{id:`enterprise-${snapshot.catalogDigest}`,catalogDigest:snapshot.catalogDigest},projectionDigest:p.projectionDigest,selection:p.selection,supportScope:c.supportScope,
   capabilities:p.capabilities.map(record=>({record,locator:e.capabilities[record.id],renderLine:render.lines[`capability:${record.id}`],documentedSupportCount:p.supports.filter(r=>r.capabilityId===record.id).length})),
   applications:p.applications.map(record=>({record,locator:e.applications?.[record.id],renderLine:render.lines[`application:${record.id}`]})),
   supports:p.supports.map(record=>({record,locator:e.supports?.[JSON.stringify([record.applicationId,record.capabilityId])],renderLine:render.lines[`support:${JSON.stringify([record.applicationId,record.capabilityId])}`]})),excluded:p.excluded,
   limitations:["Coverage applies only to the declared scope; partial sources never prove absence of a system.","Missing links mean no documented support, not absence of support.","Only explicit direct links; no inheritance or assessment aggregation.","Multiple applications do not prove redundancy or justify investment or retirement recommendations.",...(source.kind==="enterprise-text"?["Evidence identifies captured editor text, including unsaved changes, not disk bytes."]:[])]}));
  if(Buffer.byteLength(JSON.stringify(report))>applicationMapLimits.reportBytes)throw new EnterpriseError("map-too-large");check();
  return {status:"success" as const,diagramType:"capability-application-map" as const,plantUml:render.plantUml,report,artifact:captureApplicationMapArtifact(render.plantUml,report,source.kind==="enterprise-json"?source.path:source.kind==="enterprise-text"?null:undefined)};
 }catch(e){return {status:"failed" as const,diagramType:"capability-application-map" as const,code:signal?.aborted?"cancelled":Date.now()>=deadline?"deadline-exceeded":e&&typeof e==="object"&&"code"in e&&typeof e.code==="string"?e.code:"invalid-source",issues:e instanceof EnterpriseError?e.issues:[],...(e instanceof EnterpriseError&&e.count!==undefined?{count:e.count}:{})};}
}
