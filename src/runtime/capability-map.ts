import { loadEnterpriseJson, type EnterpriseSourceConfig } from "../node/enterprise-json-source.js";
import type { LocalReadPolicy } from "../node/local-read-policy.js";
import { BoundedReadError } from "../node/bounded-file-reader.js";
import { LocalPathError } from "../node/local-file-path.js";
import { ArchitectureSourceError } from "../core/architecture-sources/json-with-locations.js";
import { KnowledgePackError } from "../core/knowledge-pack/source-errors.js";
import type { CancellationSignal } from "../core/knowledge-pack/knowledge-pack-source.js";
import { EnterpriseError, deepFreeze, enterpriseLimits } from "../core/enterprise/enterprise-catalog.js";
import { projectCapabilityMap, renderCapabilityMap, type CapabilityMapSelection } from "../core/enterprise/capability-map.js";
import { capabilityMapReportSchema } from "../core/enterprise/capability-map-report.js";
import { captureCapabilityMapArtifact } from "./diagram-artifact.js";

function failure(error:unknown, signal?:CancellationSignal) {
  const code = signal?.aborted ? "cancelled" : error instanceof EnterpriseError || error instanceof BoundedReadError || error instanceof LocalPathError ||
    error instanceof KnowledgePackError || error instanceof ArchitectureSourceError ? error.code : "invalid-source";
  return {status:"failed" as const,code:code === "structurizr-json-invalid" ? "enterprise-json-invalid" : code,
    issues:error instanceof EnterpriseError ? error.issues : error instanceof ArchitectureSourceError && error.location ? [{code,path:[],location:error.location}] : [],
    ...(error instanceof EnterpriseError && error.count !== undefined ? {count:error.count}:{})};
}
export async function inspectEnterpriseSource(source:EnterpriseSourceConfig, signal?:CancellationSignal, localReadPolicy?:LocalReadPolicy) {
  try {
    const snapshot = await loadEnterpriseJson(source,signal,localReadPolicy);
    if(signal?.aborted) throw new EnterpriseError("cancelled");
    return {status:"success" as const,snapshot};
  } catch(e) {return failure(e,signal);}
}
/** EA1 has no provider, generator, credentials or flow fields. A single read supplies every later stage. */
export async function generateCapabilityMap(request:{source:EnterpriseSourceConfig;selection:CapabilityMapSelection}, signal?:CancellationSignal, localReadPolicy?:LocalReadPolicy) {
  const deadline = Date.now()+30_000;
  const check=()=>{if(signal?.aborted)throw new EnterpriseError("cancelled");if(Date.now()>=deadline)throw new EnterpriseError("deadline-exceeded");};
  try {
    check();
    const snapshot=await loadEnterpriseJson(request.source,{get aborted(){return !!signal?.aborted||Date.now()>=deadline;}},localReadPolicy);
    check();
    const projection=projectCapabilityMap(snapshot,request.selection), rendered=renderCapabilityMap(projection);
    check();
    const report=deepFreeze(capabilityMapReportSchema.parse({
      format:"archi-agent-capability-map-report",formatVersion:1,diagramType:"capability-map",generationPath:"deterministic-catalog-projection",modelCalls:0,
      deterministicValidation:{verdict:"passed"},semanticReview:{status:"not-applicable",reason:"deterministic-projection"},
      source:{contract:snapshot.catalog.format,schemaVersion:1,identity:snapshot.catalog.source,file:snapshot.evidence.file,sourceBytesSha256:snapshot.evidence.sourceBytesSha256},
      snapshot:{id:`enterprise-${snapshot.catalogDigest}`,catalogDigest:snapshot.catalogDigest},projectionDigest:projection.projectionDigest,rendererVersion:1,
      selection:projection.selection,hierarchy:snapshot.hierarchy,
      visible:projection.visible.map(h=>({capability:snapshot.catalog.capabilities.find(c=>c.id===h.id),hierarchy:h,locator:snapshot.evidence.capabilities[h.id],renderLine:rendered.lines[h.id]})),
      scales:snapshot.catalog.scales.map(s=>({definition:s,locator:snapshot.evidence.scales[s.id]})),excluded:projection.excluded,duplicateNames:snapshot.duplicateNames,
      limitations:["Coverage describes only the declared source scope.","Missing ratings are unknown; parent ratings are never aggregated or inherited.",
        "Tile size reflects layout, not maturity or business importance.","This deterministic projection is not semantic review or Verify Flow."]
    }));
    const serialized=JSON.stringify(report,null,2)+"\n";
    if(Buffer.byteLength(serialized,"utf8")>enterpriseLimits.reportBytes)throw new EnterpriseError("map-too-large");
    check();
    return {status:"success" as const,diagramType:"capability-map" as const,plantUml:rendered.plantUml,report,
      artifact:captureCapabilityMapArtifact(rendered.plantUml,report,request.source.path)};
  } catch(e) {return failure(e,signal);}
}
