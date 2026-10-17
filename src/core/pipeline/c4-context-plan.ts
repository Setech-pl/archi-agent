import {z} from "zod";
import type {JsonSchemaObject} from "../llm/structured-chat-client.js";
import type {ContextSnapshot} from "./c4-snapshot.js";
const id=z.string().min(1).max(128);
export const contextPlanSchema=z.strictObject({version:z.literal(1),systemId:id,elementIds:z.array(id).min(1).max(64),relationshipIds:z.array(id).max(256)});
export type ContextPlan=z.infer<typeof contextPlanSchema> & {readonly snapshotDigest:string};
const {$schema:_,...wire}=z.toJSONSchema(contextPlanSchema,{target:"draft-2020-12",io:"input"});export const contextPlanResponseSchema=wire as JsonSchemaObject;
export function validateContextPlan(raw:unknown,snapshot:ContextSnapshot):ContextPlan|undefined {
  const p=contextPlanSchema.safeParse(raw);if(!p.success)return;
  const v=p.data,exact=(a:readonly string[],b:readonly string[])=>a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
  if(v.systemId!==snapshot.systemId||!exact(v.elementIds,snapshot.elements.map(e=>e.id))||!exact(v.relationshipIds,snapshot.relationships.map(r=>r.factId))||snapshot.elements.some(e=>e.kind==="container"))return;
  return Object.freeze({...v,elementIds:Object.freeze(v.elementIds.sort()) as unknown as string[],relationshipIds:Object.freeze(v.relationshipIds.sort()) as unknown as string[],snapshotDigest:snapshot.digest});
}
