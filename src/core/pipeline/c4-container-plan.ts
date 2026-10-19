import {z} from "zod";
import type {JsonSchemaObject} from "../llm/structured-chat-client.js";
import type {ContainerSnapshot} from "./c4-snapshot.js";
const id=z.string().min(1).max(128);
export const containerPlanSchema=z.strictObject({version:z.literal(1),parentId:id,containerIds:z.array(id).min(1).max(64),externalIds:z.array(id).max(64),relationshipIds:z.array(id).max(256)});
export type ContainerPlan=z.infer<typeof containerPlanSchema> & {readonly snapshotDigest:string};
const {$schema:_,...wire}=z.toJSONSchema(containerPlanSchema,{target:"draft-2020-12",io:"input"});export const containerPlanResponseSchema=wire as JsonSchemaObject;
export function validateContainerPlan(raw:unknown,snapshot:ContainerSnapshot):ContainerPlan|undefined {
  const p=containerPlanSchema.safeParse(raw);if(!p.success)return;
  const v=p.data,exact=(a:readonly string[],b:readonly string[])=>a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
  if(v.parentId!==snapshot.systemId||!exact(v.containerIds,snapshot.containerIds)||!exact(v.externalIds,snapshot.externalIds)||!exact(v.relationshipIds,snapshot.relationships.map(r=>r.factId))||snapshot.elements.some(e=>v.containerIds.includes(e.id)&&e.parentId!==snapshot.systemId))return;
  return Object.freeze({...v,containerIds:Object.freeze(v.containerIds.sort()) as unknown as string[],externalIds:Object.freeze(v.externalIds.sort()) as unknown as string[],relationshipIds:Object.freeze(v.relationshipIds.sort()) as unknown as string[],snapshotDigest:snapshot.digest});
}
