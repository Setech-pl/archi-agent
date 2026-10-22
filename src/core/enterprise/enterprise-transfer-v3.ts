import {z} from "zod";
import {enterpriseResponseSchema, enterpriseInputSchema, enterpriseStateSchema, enterpriseTransferLimits} from "./enterprise-transfer.js";
import {enterpriseCatalogV3Schema, validateEnterpriseCatalog, createEnterpriseSnapshot, EnterpriseError, type EnterpriseCatalog, type McpEnterpriseEvidence} from "./enterprise-catalog.js";
import {parseLocatedJson} from "../architecture-sources/json-with-locations.js";
import {stableDigest,type CanonicalValue} from "../util/stable-digest.js";
export const enterpriseToolV3="get_enterprise_snapshot_v3" as const;
export const enterpriseInputV3Schema=enterpriseInputSchema.extend({contractVersion:z.literal(3)});
export const enterpriseResponseV3Schema=enterpriseResponseSchema.extend({schemaVersion:z.literal(3),format:z.literal("archi-agent-enterprise-snapshot/3"),catalog:enterpriseCatalogV3Schema});
export const enterpriseOutputV3Schema=z.union([enterpriseResponseV3Schema,enterpriseStateSchema]);
function bound(raw:unknown){if(new TextEncoder().encode(JSON.stringify(raw)).byteLength>enterpriseTransferLimits.structuredBytes)throw new EnterpriseError("mcp-knowledge-result-too-large");}
const version=(catalog:EnterpriseCatalog)=>stableDigest({domain:"archi-agent-enterprise-source-version/3",catalog:catalog as CanonicalValue});
function evidence(catalog:z.infer<typeof enterpriseCatalogV3Schema>,v:string,fingerprint:string):McpEnterpriseEvidence{
 const pointer=(p:string)=>({pointer:p});
 return {kind:"mcp",sourceId:catalog.source.id,sourceVersion:v,responseFingerprint:fingerprint,tool:enterpriseToolV3,contractVersion:3,
 capabilities:Object.fromEntries(catalog.capabilities.map((c,i)=>[c.id,{pointer:`/catalog/capabilities/${i}`,fields:Object.fromEntries(["id","name","description",...(c.parentId?["parentId"]:[]),...Object.keys(c.ratings??{}).map(k=>`ratings/${k}`)].map(f=>[`/${f}`,pointer(`/catalog/capabilities/${i}/${f}`)]))}])),
 domains:Object.fromEntries(catalog.domains.map((d,i)=>[d.id,pointer(`/catalog/domains/${i}`)])),
 valueStreams:Object.fromEntries(catalog.valueStreams.map((v,i)=>[v.id,pointer(`/catalog/valueStreams/${i}`)])),
 stages:Object.fromEntries(catalog.valueStreams.flatMap((v,i)=>v.stages.map((s,j)=>[JSON.stringify([v.id,s.id]),pointer(`/catalog/valueStreams/${i}/stages/${j}`)]))),
 scales:Object.fromEntries(catalog.scales.map((s,i)=>[s.id,pointer(`/catalog/scales/${i}`)])),applications:Object.fromEntries(catalog.applications.map((a,i)=>[a.id,pointer(`/catalog/applications/${i}`)])),supports:Object.fromEntries(catalog.supports.map((r,i)=>[JSON.stringify([r.applicationId,r.capabilityId]),pointer(`/catalog/supports/${i}`)]))};
}
function catalog(raw:unknown){parseLocatedJson(JSON.stringify(raw),"enterprise-response.json");const c=validateEnterpriseCatalog(raw);if(c.schemaVersion!==3)throw new EnterpriseError("enterprise-version-unsupported");return c;}
export function createEnterpriseResponseV3(id:string,raw:EnterpriseCatalog){
 const c=catalog(raw);if(c.source.id!==id)throw new EnterpriseError("enterprise-response-invalid");const v=version(c),s=createEnterpriseSnapshot(c,evidence(c,v,""));
 const result=enterpriseResponseV3Schema.parse({schemaVersion:3,format:"archi-agent-enterprise-snapshot/3",source:{id,version:v},snapshot:{id:`enterprise-${s.catalogDigest}`,digest:s.catalogDigest},catalog:c});bound(result);return result;
}
export function validateEnterpriseResponseV3(raw:unknown,id:string){
 bound(raw);const parsed=enterpriseResponseV3Schema.safeParse(raw);if(!parsed.success||parsed.data.source.id!==id||parsed.data.catalog.source.id!==id)throw new EnterpriseError("enterprise-response-invalid");
 const r=parsed.data,c=catalog(r.catalog),v=version(c),s=createEnterpriseSnapshot(c,evidence(c,v,stableDigest(r as CanonicalValue)));
 if(r.source.version!==v||r.snapshot.digest!==s.catalogDigest||r.snapshot.id!==`enterprise-${s.catalogDigest}`)throw new EnterpriseError("enterprise-response-digest-mismatch");return s;
}
