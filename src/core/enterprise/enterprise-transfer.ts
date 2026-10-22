import {z} from "zod";
import {parseLocatedJson} from "../architecture-sources/json-with-locations.js";
import {stableDigest, utf8Encode, type CanonicalValue} from "../util/stable-digest.js";
import {createEnterpriseSnapshot, enterpriseCatalogSchema, enterpriseLimits, EnterpriseError,
  validateEnterpriseCatalog, type EnterpriseCatalog, type McpEnterpriseEvidence} from "./enterprise-catalog.js";

const sourceId = z.string().regex(/^[a-z][a-z0-9-]{0,55}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const enterpriseTool = "get_enterprise_snapshot" as const;
export const enterpriseInputSchema = z.strictObject({sourceId, contractVersion:z.literal(1)});
export const enterpriseResponseSchema = z.strictObject({schemaVersion:z.literal(1),format:z.literal("archi-agent-enterprise-snapshot/1"),
  source:z.strictObject({id:sourceId,version:digest}),snapshot:z.strictObject({id:z.string().regex(/^enterprise-[0-9a-f]{64}$/),digest}),catalog:enterpriseCatalogSchema});
export const enterpriseStateSchema = z.union([
  z.strictObject({schemaVersion:z.literal(1),status:z.literal("unsupported"),code:z.enum(["enterprise-unsupported","enterprise-version-unsupported"])}),
  z.strictObject({schemaVersion:z.literal(1),status:z.literal("failed"),code:z.enum(["arguments-invalid","source-unknown","source-failed","invalid-source","result-too-large","busy","cancelled","deadline-exceeded"])})
]);
export const enterpriseOutputSchema = z.union([enterpriseResponseSchema,enterpriseStateSchema]);
export type EnterpriseResponseV1 = z.infer<typeof enterpriseResponseSchema>;
export const enterpriseTransferLimits = Object.freeze({structuredBytes:2*1024*1024,frameBytes:64*1024*1024});

function boundedCatalog(raw:unknown):EnterpriseCatalog {
  // Reuse EA1 JSON byte/token/depth bounds. Transport objects have no physical file/line.
  try {parseLocatedJson(JSON.stringify(raw),"enterprise-response.json");}
  catch {throw new EnterpriseError("enterprise-response-invalid");}
  return validateEnterpriseCatalog(raw);
}
const sourceVersion = (catalog:EnterpriseCatalog) => stableDigest({domain:"archi-agent-enterprise-source-version/1",catalog:catalog as CanonicalValue});
function evidence(catalog:EnterpriseCatalog,version:string,responseFingerprint:string):McpEnterpriseEvidence {
  return {kind:"mcp",sourceId:catalog.source.id,sourceVersion:version,responseFingerprint,tool:enterpriseTool,contractVersion:1,
    capabilities:Object.fromEntries(catalog.capabilities.map((c,i)=>[c.id,{pointer:`/catalog/capabilities/${i}`,
      fields:Object.fromEntries(["id","name","description",...(c.parentId?["parentId"]:[]),...Object.keys(c.ratings??{}).map(k=>`ratings/${k}`)]
        .map(f=>[`/${f}`,{pointer:`/catalog/capabilities/${i}/${f}`}]))}])),
    scales:Object.fromEntries(catalog.scales.map((s,i)=>[s.id,{pointer:`/catalog/scales/${i}`}]))};
}
function boundedResponse(raw:unknown) {
  if(utf8Encode(JSON.stringify(raw)).length>enterpriseTransferLimits.structuredBytes)throw new EnterpriseError("mcp-knowledge-result-too-large");
}
export function createEnterpriseResponse(id:string,raw:EnterpriseCatalog):EnterpriseResponseV1 {
  const catalog=boundedCatalog(raw);
  if(catalog.schemaVersion!==1)throw new EnterpriseError("enterprise-version-unsupported");
  if(!sourceId.safeParse(id).success||catalog.source.id!==id)throw new EnterpriseError("enterprise-response-invalid");
  const version=sourceVersion(catalog),snapshot=createEnterpriseSnapshot(catalog,evidence(catalog,version,""));
  const result=enterpriseResponseSchema.parse({schemaVersion:1,format:"archi-agent-enterprise-snapshot/1",source:{id,version},
    snapshot:{id:`enterprise-${snapshot.catalogDigest}`,digest:snapshot.catalogDigest},catalog});
  boundedResponse(result);return result;
}
export function validateEnterpriseResponse(raw:unknown,id:string) {
  boundedResponse(raw);
  if(raw&&typeof raw==="object"&&"schemaVersion"in raw&&"format"in raw){
    if(typeof raw.schemaVersion!=="number"||!Number.isSafeInteger(raw.schemaVersion)||raw.schemaVersion<1||
      typeof raw.format!=="string"||!/^archi-agent-enterprise-snapshot\/[1-9][0-9]*$/.test(raw.format))throw new EnterpriseError("enterprise-response-invalid");
    if(raw.schemaVersion!==1||raw.format!=="archi-agent-enterprise-snapshot/1")throw new EnterpriseError("enterprise-version-unsupported");
  }
  const parsed=enterpriseResponseSchema.safeParse(raw);
  if(!parsed.success||parsed.data.source.id!==id||parsed.data.catalog.source.id!==id)throw new EnterpriseError("enterprise-response-invalid");
  const value=parsed.data,catalog=boundedCatalog(value.catalog),version=sourceVersion(catalog);
  const snapshot=createEnterpriseSnapshot(catalog,evidence(catalog,version,stableDigest(value as CanonicalValue)));
  if(version!==value.source.version||value.snapshot.digest!==snapshot.catalogDigest||value.snapshot.id!==`enterprise-${snapshot.catalogDigest}`)
    throw new EnterpriseError("enterprise-response-digest-mismatch");
  return snapshot;
}
