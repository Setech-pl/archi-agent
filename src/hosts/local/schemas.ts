import {z}from"zod";
import {digestSchema,nameDecisionSchema,hostResultSchema}from"../../runtime/index.js";
import {nameSchema,fileReferenceSchema}from"./config.js";
export const timeoutSchema=z.number().int().min(1).max(600000);
export const inspectInputSchema=z.strictObject({source:nameSchema,query:z.string().min(1).max(160).optional(),offset:z.number().int().min(0).max(10000).optional(),limit:z.number().int().min(1).max(64).optional(),expectedKnowledgeDigest:digestSchema.optional(),timeoutMs:timeoutSchema.optional()});
const verifyBase=z.strictObject({source:nameSchema,input:fileReferenceSchema,format:z.enum(["plantuml-sequence","prose"]),provider:nameSchema.optional(),language:z.enum(["pl","en"]).optional(),timeoutMs:timeoutSchema.optional()});
export const verifyInputSchema=z.union([
  verifyBase.extend({format:z.literal("plantuml-sequence"),provider:z.never().optional()}),verifyBase.extend({format:z.literal("prose"),provider:nameSchema})
]);
const hashes={expectedInputSha256:digestSchema,expectedInterpretationDigest:digestSchema,expectedSnapshotDigest:digestSchema};
export const verificationDecisionsSchema=z.strictObject({schemaVersion:z.literal(1),...hashes,decisions:z.array(nameDecisionSchema).max(64)});
export const resolveInputSchema=z.strictObject({sessionId:z.string().uuid(),...hashes,decisions:z.array(nameDecisionSchema).min(1).max(64),timeoutMs:timeoutSchema.optional()});
export const generationDecisionsSchema=z.strictObject({schemaVersion:z.literal(1),expectedInputSha256:digestSchema,expectedSnapshotDigest:digestSchema,
  selections:z.record(z.string().min(1).max(256),z.string().min(1).max(64)).refine(v=>Object.keys(v).length<=64),confirmedNewParticipants:z.array(z.string().min(1).max(256)).max(64)});
const generateBase=z.strictObject({source:nameSchema,input:fileReferenceSchema,provider:nameSchema,timeoutMs:timeoutSchema.optional()});
export const generateInputSchema=z.union([
  generateBase.extend({diagramType:z.enum(["sequence","component"]),decisionsFile:fileReferenceSchema.optional()}),
  generateBase.extend({diagramType:z.enum(["c4-context","c4-container"]),c4Selection:z.strictObject({systemId:z.string().min(1).max(64),expectedKnowledgeDigest:digestSchema})})
]);
const continuation=z.strictObject({sessionId:z.string().uuid(),expiresAt:z.string().datetime()});
export const mcpResultSchema=z.union([
  ...hostResultSchema.options.filter(s=>s.shape.operation.value!=="flow.verify"),
  hostResultSchema.options[1].extend({continuation:continuation.optional()}).superRefine((v,c)=>{if(v.continuation&&v.outcome.status!=="needs-resolution")c.addIssue({code:"custom",message:"continuation-invalid"});})
]);
export const toolSchemas={inspect_knowledge:inspectInputSchema,verify_flow:verifyInputSchema,resolve_flow_names:resolveInputSchema,generate_diagram:generateInputSchema};
