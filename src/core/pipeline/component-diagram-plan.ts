import { z } from "zod";
import type { JsonSchemaObject } from "../llm/structured-chat-client.js";
import { interfaceTypes, interactionModes } from "../knowledge-pack/knowledge-pack.schema.js";
import { isSafeAlias } from "../render/alias-allocator.js";
import { displayTextProblem } from "../render/plantuml-escape.js";
import { stableCompare } from "../util/ordering.js";
import type { ComponentSnapshot } from "./component-snapshot.js";

export const componentPlanLimits = Object.freeze({ maxElements: 64, maxDependencies: 256, maxIdChars: 128 });
const id = z.string().min(1).max(componentPlanLimits.maxIdChars);
const userDependency = z.strictObject({ fromId: id, toId: id, interfaceType: z.enum(interfaceTypes),
  interfaceName: z.string().max(160).nullable(), mode: z.enum(interactionModes), flowEvidenceId: id });
export const componentPlanSchema = z.strictObject({ version: z.literal(1), elementIds: z.array(id).max(componentPlanLimits.maxElements),
  groundedDependencies: z.array(id).max(componentPlanLimits.maxDependencies),
  userStatedDependencies: z.array(userDependency).max(componentPlanLimits.maxDependencies) });
const { $schema: _wireSchema, ...wireSchema } = z.toJSONSchema(componentPlanSchema, { target: "draft-2020-12", io: "input" });
export const componentPlanResponseSchema = Object.freeze(wireSchema as JsonSchemaObject);
export function createComponentDependencyCatalog(snapshot: ComponentSnapshot) {
  return snapshot.relationships.map((entry, index) => ({ dependencyId: `dep-${String(index + 1).padStart(4, "0")}`,
    fromId: entry.fromId, toId: entry.toId, interfaceType: entry.interfaceType, interfaceName: entry.interfaceName,
    mode: entry.mode, purpose: entry.purpose, source: entry.source }));
}

export interface ComponentFact {
  readonly factId: string; readonly evidenceId: string; readonly evidenceClass: "source-confirmed" | "user-stated";
  readonly fromId: string; readonly toId: string; readonly interfaceType: string; readonly interfaceName: string | null;
  readonly mode: string; readonly source: { readonly file: string; readonly line: number };
}
export interface ResolvedComponentPlan { readonly version: 1; readonly snapshotDigest: string;
  readonly elementIds: readonly string[]; readonly facts: readonly ComponentFact[] }
export type ComponentPlanValidation = { readonly ok: true; readonly value: ResolvedComponentPlan } |
  { readonly ok: false; readonly code: string };

export function validateComponentPlan(raw: unknown, snapshot: ComponentSnapshot): ComponentPlanValidation {
  const parsed = componentPlanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "schema-violation" };
  const plan = parsed.data;
  if (plan.elementIds.length === 0 || plan.groundedDependencies.length + plan.userStatedDependencies.length === 0 ||
      plan.groundedDependencies.length + plan.userStatedDependencies.length > componentPlanLimits.maxDependencies)
    return { ok: false, code: "empty-or-over-limit-plan" };
  const elements = new Map(snapshot.elements.map((entry) => [entry.id, entry]));
  const selected = new Set(plan.elementIds);
  if (selected.size !== plan.elementIds.length || plan.elementIds.some((entry) => !elements.has(entry))) return { ok: false, code: "invalid-element-id" };
  for (const elementId of selected) {
    const element = elements.get(elementId)!;
    const name = element.kind === "new" ? element.canonicalName.slice(6) : element.canonicalName;
    if (displayTextProblem(name) !== undefined || !isSafeAlias(element.alias)) return { ok: false, code: "unsafe-element" };
  }
  const relationships = new Map(createComponentDependencyCatalog(snapshot).map((entry, index) => [entry.dependencyId, snapshot.relationships[index]!]));
  const flow = new Map(snapshot.flowEvidence.map((entry) => [entry.flowEvidenceId, entry]));
  const facts: ComponentFact[] = [];
  const used = new Set<string>();
  const add = (fact: Omit<ComponentFact, "factId">) => facts.push({ ...fact, factId: `fact-${String(facts.length + 1).padStart(4, "0")}` });
  for (const relationshipId of plan.groundedDependencies) {
    const relation = relationships.get(relationshipId);
    if (relation === undefined || used.has(relationshipId)) return { ok: false, code: "unknown-or-duplicate-relationship" };
    used.add(relationshipId);
    if (!selected.has(relation.fromId) || !selected.has(relation.toId)) return { ok: false, code: "unselected-endpoint" };
    if (!interfaceTypes.includes(relation.interfaceType as typeof interfaceTypes[number]) ||
        !interactionModes.includes(relation.mode as typeof interactionModes[number]) ||
        (relation.interfaceName !== null && displayTextProblem(relation.interfaceName, { maxChars: 160 }) !== undefined))
      return { ok: false, code: "unsupported-relationship" };
    add({ evidenceId: relation.evidenceId, evidenceClass: "source-confirmed", fromId: relation.fromId, toId: relation.toId,
      interfaceType: relation.interfaceType, interfaceName: relation.interfaceName, mode: relation.mode, source: relation.source });
  }
  for (const item of plan.userStatedDependencies) {
    const evidence = flow.get(item.flowEvidenceId);
    if (!selected.has(item.fromId) || !selected.has(item.toId) || evidence === undefined) return { ok: false, code: "unknown-endpoint-or-evidence" };
    if (!elements.get(item.fromId)?.mentionLines.includes(evidence.line) || !elements.get(item.toId)?.mentionLines.includes(evidence.line))
      return { ok: false, code: "unrelated-flow-evidence" };
    if (item.interfaceName !== null && displayTextProblem(item.interfaceName, { maxChars: 160 }) !== undefined)
      return { ok: false, code: "unsafe-interface-name" };
    if (snapshot.relationships.some((relation) => relation.fromId === item.fromId && relation.toId === item.toId &&
        relation.interfaceType === item.interfaceType && relation.interfaceName === item.interfaceName))
      return { ok: false, code: "source-confirmed-conflict" };
    if (snapshot.relationships.some((relation) => relation.fromId === item.toId && relation.toId === item.fromId &&
        relation.interfaceType === item.interfaceType && relation.interfaceName === item.interfaceName))
      return { ok: false, code: "dependency-direction-mismatch" };
    if (facts.some((fact) => fact.evidenceClass === "user-stated" && fact.fromId === item.fromId && fact.toId === item.toId &&
        fact.interfaceType === item.interfaceType && fact.interfaceName === item.interfaceName && fact.mode === item.mode))
      return { ok: false, code: "duplicate-dependency" };
    add({ evidenceId: item.flowEvidenceId, evidenceClass: "user-stated", fromId: item.fromId, toId: item.toId,
      interfaceType: item.interfaceType, interfaceName: item.interfaceName, mode: item.mode,
      source: { file: snapshot.flowFile, line: evidence.line } });
  }
  if (facts.some((fact) => snapshot.rules.some((rule) => rule.rule === "forbid" && rule.fromId === fact.fromId && rule.toId === fact.toId)))
    return { ok: false, code: "forbidden-dependency" };
  return { ok: true, value: Object.freeze({ version: 1, snapshotDigest: snapshot.digest,
    elementIds: Object.freeze([...selected].sort(stableCompare)), facts: Object.freeze(facts) }) };
}

export interface RenderedComponent { readonly plantUml: string; readonly lines: ReadonlyMap<string, number> }
function safeName(value: string, isNew: boolean): string {
  const name = isNew ? value.slice(6) : value;
  if (displayTextProblem(name) !== undefined) throw new Error("unsafe-name");
  return isNew ? `[NEW] ${name}` : name;
}
function label(fact: ComponentFact): string {
  const value = `${fact.interfaceType}${fact.interfaceName === null ? "" : ` - ${fact.interfaceName}`} (${fact.mode})`;
  if (displayTextProblem(value, { maxChars: 320 }) !== undefined) throw new Error("unsafe-label");
  return value;
}
export function renderComponentPlan(plan: ResolvedComponentPlan, snapshot: ComponentSnapshot): RenderedComponent {
  if (plan.version !== 1 || plan.snapshotDigest !== snapshot.digest) throw new Error("resolved-plan-required");
  const elements = new Map(snapshot.elements.map((entry) => [entry.id, entry]));
  const lines = ["@startuml"];
  for (const id of plan.elementIds) {
    const element = elements.get(id)!;
    const declaration = element.kind === "actor" ? "actor" : element.elementKind === "database" ? "database" :
      element.elementKind === "queue" ? "queue" : "component";
    if (element.kind !== "new" && !["person", "role", "external", "system", "service", "database", "queue"].includes(element.elementKind))
      throw new Error("unsupported-element-kind");
    lines.push(`${declaration} "${safeName(element.canonicalName, element.kind === "new")}" as ${element.alias}`);
  }
  const groups = new Map<string, Set<string>>();
  for (const fact of plan.facts) {
    if ((fact.interfaceType === "REST_API" || fact.interfaceType === "SOAP") && fact.interfaceName !== null && fact.interfaceName !== "") {
      const key = `${fact.toId}\u0000${fact.interfaceType}\u0000${fact.interfaceName}`;
      const consumers = groups.get(key) ?? new Set<string>(); consumers.add(fact.fromId); groups.set(key, consumers);
    }
  }
  const shared = [...groups].filter(([, consumers]) => consumers.size >= 2).map(([key]) => key).sort(stableCompare);
  const aliases = new Map(shared.map((key, index) => [key, `api_${String(index + 1).padStart(4, "0")}`]));
  for (const key of shared) lines.push(`interface "${key.split("\u0000")[2]}" as ${aliases.get(key)}`);
  const positions = new Map<string, number>();
  for (const fact of plan.facts) {
    const key = `${fact.toId}\u0000${fact.interfaceType}\u0000${fact.interfaceName ?? ""}`;
    const target = aliases.get(key) ?? elements.get(fact.toId)!.alias;
    lines.push(`${elements.get(fact.fromId)!.alias} --> ${target} : ${label(fact)}`);
    positions.set(fact.factId, lines.length);
  }
  for (const key of shared) lines.push(`${aliases.get(key)} --> ${elements.get(key.split("\u0000")[0]!)!.alias}`);
  lines.push("@enduml");
  return { plantUml: `${lines.join("\n")}\n`, lines: positions };
}

export const componentReviewViolationCodes = ["missing-component", "ownership-mismatch", "direction-mismatch", "interface-mismatch", "unsupported-inference", "abstraction-mismatch", "unsupported-user-stated-evidence", "candidate-semantics-invalid"] as const;
export type ComponentReviewViolationCode = typeof componentReviewViolationCodes[number];
const reviewFactId = z.string().regex(/^fact-[0-9]{4}$/);
const reviewSchema = z.strictObject({ accepted: z.boolean(), confirmedUserStatedFactIds: z.array(reviewFactId).max(componentPlanLimits.maxDependencies),
  violations: z.array(z.strictObject({ code: z.enum(componentReviewViolationCodes), factId: reviewFactId.nullable() })).max(32) });
const { $schema: _reviewSchema, ...reviewWire } = z.toJSONSchema(reviewSchema, { target: "draft-2020-12", io: "input" });
export const componentReviewResponseSchema = Object.freeze(reviewWire as JsonSchemaObject);
export function validateComponentReview(raw: unknown, plan: ResolvedComponentPlan):
  { readonly ok: true; readonly accepted: boolean; readonly violationCodes: readonly ComponentReviewViolationCode[] } |
  { readonly ok: false; readonly code: string } {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "schema-invalid" };
  const { accepted, confirmedUserStatedFactIds: confirmations, violations } = parsed.data;
  if (accepted !== (violations.length === 0) || (!accepted && confirmations.length > 0)) return { ok: false, code: "verdict-inconsistent" };
  const facts = new Map(plan.facts.map((fact) => [fact.factId, fact]));
  if (violations.some((item) => item.factId !== null && !facts.has(item.factId)) ||
      new Set(violations.map((item) => `${item.code}:${item.factId}`)).size !== violations.length)
    return { ok: false, code: "invalid-violation-reference" };
  const pending = new Set(plan.facts.filter((fact) => fact.evidenceClass === "user-stated").map((fact) => fact.factId));
  if (accepted && (confirmations.length !== pending.size || new Set(confirmations).size !== confirmations.length ||
      confirmations.some((id) => !pending.has(id)))) return { ok: false, code: "invalid-confirmations" };
  return { ok: true, accepted, violationCodes: violations.map((item) => item.code) };
}
