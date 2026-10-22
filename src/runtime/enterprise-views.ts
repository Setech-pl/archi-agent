import {loadEnterpriseSource,type EnterpriseSourceConfig} from "./enterprise-source.js";
import {EnterpriseError,deepFreeze} from "../core/enterprise/enterprise-catalog.js";
import {projectEnterpriseView,enterpriseViewReportSchema,enterpriseViewLimits,type ValueStreamSelection,type LandscapeSelection,type EnterpriseViewType} from "../core/enterprise/enterprise-views.js";
import {captureEnterpriseViewArtifact} from "./diagram-artifact.js";
import type {CancellationSignal} from "./runtime-types.js";
import type {LocalReadPolicy} from "../node/local-read-policy.js";
type View<T>=Omit<T,"expectedCatalogDigest">&{expectedCatalogDigest?:string};
async function generate(type:EnterpriseViewType,request:{source:EnterpriseSourceConfig;selection:View<ValueStreamSelection>|View<LandscapeSelection>},signal?:CancellationSignal,policy?:LocalReadPolicy){
 const deadline=Date.now()+30000,check=()=>{if(signal?.aborted)throw new EnterpriseError("cancelled");if(Date.now()>=deadline)throw new EnterpriseError("deadline-exceeded");};
 try{
  check();const source=request.source.kind==="mcp"?{...request.source,contractVersion:3 as const}:request.source;
  const snapshot=await loadEnterpriseSource(source,{get aborted(){return !!signal?.aborted||Date.now()>=deadline;}},policy,deadline);check();
  const c=snapshot.catalog,e=snapshot.evidence;if(c.schemaVersion!==3)throw new EnterpriseError("enterprise-version-unsupported");
  const p=projectEnterpriseView(snapshot,type,{...request.selection,expectedCatalogDigest:request.selection.expectedCatalogDigest??snapshot.catalogDigest} as ValueStreamSelection|LandscapeSelection);
  const common={diagramType:type,modelCalls:0,generationPath:"deterministic-catalog-projection",rendererVersion:1,
   source:{contract:c.format,identity:c.source,evidence:"kind"in e?{kind:"mcp",sourceId:e.sourceId,sourceVersion:e.sourceVersion,responseFingerprint:e.responseFingerprint,tool:e.tool,contractVersion:e.contractVersion}:{file:e.file,sourceBytesSha256:e.sourceBytesSha256}},
   snapshot:{id:`enterprise-${snapshot.catalogDigest}`,catalogDigest:snapshot.catalogDigest},projectionDigest:p.projectionDigest,selection:p.selection,excluded:p.excluded,
   limitations:["Coverage applies only to the declared scope; missing relationships never prove absence.","Stage order is declared source information or an explicit user decision, never inferred from record order.","Missing application ratings, owners and lifecycle remain unknown. Explicit zero is a supplied rating.","Multiple applications in a domain do not imply redundancy; missing capability links do not imply uselessness.",...(source.kind==="enterprise-text"?["Evidence identifies captured editor text, including unsaved changes, not disk bytes."]:[])]};
  const locate=(record:{id:string},kind:"application"|"domain")=>({record,locator:kind==="application"?e.applications?.[record.id]:e.domains?.[record.id],renderLine:p.positions[`${kind}:${record.id}`]});
  let data:unknown;
  if(type==="value-stream"){
   const v=c.valueStreams.find(v=>v.id===(p.selection as ValueStreamSelection).streamId)!;
   data={...common,format:"archi-agent-value-stream-report/1",scope:c.valueStreamScope,stream:{record:v,locator:e.valueStreams?.[v.id],renderLine:p.positions.stream},
    stages:v.stages.flatMap((record,i)=>p.positions[`stage:${record.id}`]?[{record,locator:e.stages?.[JSON.stringify([v.id,record.id])],renderLine:p.positions[`stage:${record.id}`],ordinal:i+1}]:[]),
    capabilities:c.capabilities.filter(record=>p.positions[`capability:${record.id}`]).map(record=>({record,locator:e.capabilities[record.id],renderLine:p.positions[`capability:${record.id}`]}))};
  }else data={...common,format:"archi-agent-application-landscape-report/1",scope:c.landscapeScope,supportScope:c.supportScope,
   applications:c.applications.filter(a=>p.positions[`application:${a.id}`]).map(a=>locate(a,"application")),domains:c.domains.filter(d=>p.positions[`domain:${d.id}`]).map(d=>locate(d,"domain")),scales:c.scales};
  const report=deepFreeze(enterpriseViewReportSchema.parse(data));if(Buffer.byteLength(JSON.stringify(report))>enterpriseViewLimits.reportBytes)throw new EnterpriseError("map-too-large");check();
  return {status:"success" as const,diagramType:type,plantUml:p.plantUml,report,artifact:captureEnterpriseViewArtifact(p.plantUml,report,source.kind==="enterprise-json"?source.path:source.kind==="enterprise-text"?null:undefined)};
 }catch(e){return {status:"failed" as const,diagramType:type,code:signal?.aborted?"cancelled":Date.now()>=deadline?"deadline-exceeded":e instanceof EnterpriseError?e.code:"invalid-source",issues:e instanceof EnterpriseError?e.issues:[],...(e instanceof EnterpriseError&&e.count!==undefined?{count:e.count}:{})};}
}
export const generateValueStream=(request:{source:EnterpriseSourceConfig;selection:View<ValueStreamSelection>},signal?:CancellationSignal,policy?:LocalReadPolicy)=>generate("value-stream",request,signal,policy);
export const generateApplicationLandscape=(request:{source:EnterpriseSourceConfig;selection:View<LandscapeSelection>},signal?:CancellationSignal,policy?:LocalReadPolicy)=>generate("application-landscape",request,signal,policy);
