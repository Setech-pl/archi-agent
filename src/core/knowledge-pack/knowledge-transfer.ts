import{z}from"zod";
import{sourceReferenceSchema}from"./source-reference.js";
import{systemRowSchema,actorRowSchema,relationshipRowSchema,aliasRowSchema,ruleRowSchema,type KnowledgePack,type RecordByTable,type RecordProvenance}from"./knowledge-pack.schema.js";
import{createKnowledgeSnapshot,type KnowledgeContribution}from"./knowledge-snapshot.js";
import{crossFileIssues,buildKnowledgePackIndexes}from"./knowledge-pack-loader.js";
import{canonicalSerialize,stableDigest,type CanonicalValue}from"../util/stable-digest.js";
const id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),text=z.string().max(256),count=z.number().int().min(0).max(100000);
const location=z.strictObject({file:z.string().min(1).max(256),line:z.number().int().positive()});
export const recordProvenanceSchema=z.strictObject({sourceId:id,location:location.optional(),reference:sourceReferenceSchema.optional(),fields:z.array(text).max(32).optional(),externalId:text.optional(),originalName:text.optional(),externalKind:text.optional(),parentId:text.optional()});
export const knowledgeSourceSchema=z.strictObject({id,kind:id,reference:sourceReferenceSchema.optional(),scope:z.strictObject(Object.fromEntries(["systems","actors","relationships","aliases","rules"].map(k=>[k,z.enum(["partial","complete"]).optional()]))),
 files:z.array(z.strictObject({file:z.string().min(1).max(256),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(16).optional(),omissions:z.array(z.strictObject({kind:z.string().regex(/^[a-z-]{1,64}$/),count})).max(32).optional()});
const meta={location:location.optional(),provenance:z.array(recordProvenanceSchema).min(1).max(10000).optional()};
const architecture=z.strictObject({kind:z.enum(["person","software-system","container"]),parentId:text.optional(),technology:z.string().max(1000).optional()});
const system=z.strictObject({id:systemRowSchema.shape.id,canonicalName:systemRowSchema.shape.canonical_name,kind:systemRowSchema.shape.kind,description:systemRowSchema.shape.description,architecture:architecture.optional(),...meta});
const actor=z.strictObject({id:actorRowSchema.shape.id,canonicalName:actorRowSchema.shape.canonical_name,kind:actorRowSchema.shape.kind,description:actorRowSchema.shape.description,architecture:architecture.optional(),...meta});
const relationship=z.strictObject({fromId:relationshipRowSchema.shape.from_id,toId:relationshipRowSchema.shape.to_id,interfaceType:relationshipRowSchema.shape.interface_type,interfaceName:z.string().min(1).max(512).refine(v=>[...v].length<=256).optional(),mode:relationshipRowSchema.shape.mode,purpose:relationshipRowSchema.shape.purpose,...meta});
const alias=z.strictObject({alias:aliasRowSchema.shape.alias,targetId:aliasRowSchema.shape.target_id,...meta});
const rule=z.strictObject({rule:ruleRowSchema.shape.rule,fromId:ruleRowSchema.shape.from_id,toId:ruleRowSchema.shape.to_id,reason:ruleRowSchema.shape.reason,...meta});
export const contributionsSchema=z.array(z.strictObject({source:knowledgeSourceSchema,records:z.strictObject({systems:z.array(system).max(10000).optional(),actors:z.array(actor).max(10000).optional(),relationships:z.array(relationship).max(10000).optional(),aliases:z.array(alias).max(10000).optional(),rules:z.array(rule).max(10000).optional()})})).min(1).max(64);
export const knowledgeResponseSchema=z.strictObject({schemaVersion:z.literal(1),source:z.strictObject({id:z.string().regex(/^[a-z][a-z0-9-]{0,55}$/),version:z.string().regex(/^[a-f0-9]{64}$/)}),format:z.literal("archi-agent-knowledge-contributions/1"),snapshot:z.strictObject({id:z.string().regex(/^knowledge-[a-f0-9]{64}$/),digest:z.string().regex(/^[a-f0-9]{64}$/)}),contributions:contributionsSchema});
export type KnowledgeResponseV1=z.infer<typeof knowledgeResponseSchema>;
export class KnowledgeTransferError extends Error{constructor(readonly code:string){super(code);}}
export const contributionsVersion=(contributions:readonly KnowledgeContribution[])=>stableDigest(JSON.parse(JSON.stringify(contributions)) as CanonicalValue);
/** Typed projection, preserving actual record locations instead of guessing from field provenance. */
export function knowledgeFromContributions(contributions:readonly KnowledgeContribution[]){
 contributions=contributionsSchema.parse(JSON.parse(JSON.stringify(contributions))) as readonly KnowledgeContribution[];
 const snapshot=createKnowledgeSnapshot(contributions);
 if(snapshot.conflicts.length)throw new KnowledgeTransferError("knowledge-conflicts-unresolved");
 const records={systems:[],actors:[],relationships:[],aliases:[],rules:[]} as unknown as {[K in keyof RecordByTable]:RecordByTable[K][]};
 const elementIds=new Set<string>();
 for(const contribution of contributions)for(const [table,rows]of Object.entries(contribution.records))for(const record of rows as readonly RecordByTable[keyof RecordByTable][]){
  if(table==="systems"||table==="actors"){
    const id=(record as RecordByTable["systems"]).id;if(elementIds.has(id))throw new KnowledgeTransferError("identifier-collision");elementIds.add(id);
  }
  // Pack declarations remain distinct, in adapter order. K1 alone coalesces semantic facts.
  (records[table as keyof RecordByTable]as unknown[]).push({...record,provenance:record.provenance??[{sourceId:contribution.source.id,...(record.location?{location:record.location}:{})}]});
 }
 const pack:KnowledgePack=records;
 const issues=crossFileIssues(pack);if(issues.some(i=>i.severity==="error"))throw new KnowledgeTransferError(issues.find(i=>i.severity==="error")!.code);
 return{pack,snapshot,indexes:buildKnowledgePackIndexes(pack),version:contributionsVersion(contributions),contributions};
}
export function createKnowledgeResponse(sourceId:string,contributions:readonly KnowledgeContribution[]):KnowledgeResponseV1{
 const value=knowledgeFromContributions(contributions);
 return knowledgeResponseSchema.parse({schemaVersion:1,source:{id:sourceId,version:value.version},format:"archi-agent-knowledge-contributions/1",snapshot:{id:value.snapshot.id,digest:value.snapshot.digest},contributions});
}
export function validateKnowledgeResponse(raw:unknown,sourceId:string){
 const parsed=knowledgeResponseSchema.safeParse(raw);if(!parsed.success||parsed.data.source.id!==sourceId)throw new KnowledgeTransferError("knowledge-response-invalid");
 const result=knowledgeFromContributions(parsed.data.contributions as readonly KnowledgeContribution[]);
 if(parsed.data.source.version!==result.version||parsed.data.snapshot.id!==result.snapshot.id||parsed.data.snapshot.digest!==result.snapshot.digest)throw new KnowledgeTransferError("knowledge-response-digest-mismatch");
 return result;
}
