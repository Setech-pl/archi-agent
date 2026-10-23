import {z} from "zod";
import {enterpriseResponseSchema, enterpriseInputSchema, enterpriseStateSchema, enterpriseTransferLimits} from "./enterprise-transfer.js";
import {enterpriseCatalogV2Schema, validateEnterpriseCatalog, createEnterpriseSnapshot, EnterpriseError, type EnterpriseCatalog, type McpEnterpriseEvidence} from "./enterprise-catalog.js";
import {parseLocatedJson} from "../architecture-sources/json-with-locations.js";
import {stableDigest,type CanonicalValue} from "../util/stable-digest.js";
export const enterpriseToolV2="get_enterprise_snapshot_v2" as const;
export const enterpriseInputV2Schema=enterpriseInputSchema.extend({contractVersion:z.literal(2)});
export const enterpriseResponseV2Schema=enterpriseResponseSchema.extend({schemaVersion:z.literal(2),format:z.literal("archi-agent-enterprise-snapshot/2"),catalog:enterpriseCatalogV2Schema});
export const enterpriseOutputV2Schema=z.union([enterpriseResponseV2Schema,enterpriseStateSchema]);
function bound(raw:unknown){if(Buffer.byteLength(JSON.stringify(raw))>enterpriseTransferLimits.structuredBytes)throw new EnterpriseError("mcp-knowledge-result-too-large");}
const version=(catalog:EnterpriseCatalog)=>stableDigest({domain:"archi-agent-enterprise-source-version/2",catalog:catalog as CanonicalValue});
function evidence(catalog:z.infer<typeof enterpriseCatalogV2Schema>,v:string,fingerprint:string):McpEnterpriseEvidence{
 const pointer=(p:string)=>({pointer:p});
 return {kind:"mcp",sourceId:catalog.source.id,sourceVersion:v,responseFingerprint:fingerprint,tool:enterpriseToolV2,contractVersion:2,
 capabilities:Object.fromEntries(catalog.capabilities.map((c,i)=>[c.id,{pointer:`/catalog/capabilities/${i}`,fields:Object.fromEntries(["id","name","description",...(c.parentId?["parentId"]:[]),...Object.keys(c.ratings??{}).map(k=>`ratings/${k}`)].map(f=>[`/${f}`,pointer(`/catalog/capabilities/${i}/${f}`)]))}])),
 scales:Object.fromEntries(catalog.scales.map((s,i)=>[s.id,pointer(`/catalog/scales/${i}`)])),applications:Object.fromEntries(catalog.applications.map((a,i)=>[a.id,pointer(`/catalog/applications/${i}`)])),supports:Object.fromEntries(catalog.supports.map((r,i)=>[JSON.stringify([r.applicationId,r.capabilityId]),pointer(`/catalog/supports/${i}`)]))};
}
function catalog(raw:unknown){parseLocatedJson(JSON.stringify(raw),"enterprise-response.json");const c=validateEnterpriseCatalog(raw);if(c.schemaVersion!==2)throw new EnterpriseError("enterprise-version-unsupported");return c;}
export function createEnterpriseResponseV2(id:string,raw:EnterpriseCatalog){
 const c=catalog(raw);if(c.source.id!==id)throw new EnterpriseError("enterprise-response-invalid");const v=version(c),s=createEnterpriseSnapshot(c,evidence(c,v,""));
 const result=enterpriseResponseV2Schema.parse({schemaVersion:2,format:"archi-agent-enterprise-snapshot/2",source:{id,version:v},snapshot:{id:`enterprise-${s.catalogDigest}`,digest:s.catalogDigest},catalog:c});bound(result);return result;
}
export function validateEnterpriseResponseV2(raw:unknown,id:string){
 bound(raw);const parsed=enterpriseResponseV2Schema.safeParse(raw);if(!parsed.success||parsed.data.source.id!==id||parsed.data.catalog.source.id!==id)throw new EnterpriseError("enterprise-response-invalid");
 const r=parsed.data,c=catalog(r.catalog),v=version(c),s=createEnterpriseSnapshot(c,evidence(c,v,stableDigest(r as CanonicalValue)));
 if(r.source.version!==v||r.snapshot.digest!==s.catalogDigest||r.snapshot.id!==`enterprise-${s.catalogDigest}`)throw new EnterpriseError("enterprise-response-digest-mismatch");return s;
}
