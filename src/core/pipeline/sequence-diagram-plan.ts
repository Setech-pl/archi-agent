import { z } from "zod";
import type { JsonSchemaObject } from "../llm/structured-chat-client.js";
import { participantDeclarationKeywords, type ParticipantKind } from "../model/types.js";
import { allocateAliases } from "../render/alias-allocator.js";
import { displayTextProblem, messageLabelTextOptions, quotedName } from "../render/plantuml-escape.js";
import { modelInterfaceTypeFromPack } from "../validation/relationship-validator.js";
import type { InterfaceType as PackInterfaceType } from "../knowledge-pack/knowledge-pack.schema.js";
import type { ArchitectureSnapshot } from "./reviewed-sequence.js";

export const sequencePlanLimits = Object.freeze({ maxParticipants: 64, maxMessages: 512, maxIdChars: 128 });

const id = z.string().min(1).max(sequencePlanLimits.maxIdChars).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const factId = z.string().min(1).max(32).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const proposed = z.strictObject({ interfaceType: z.enum(["REST API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"]), interfaceName: z.string().max(160).nullable(), mode: z.enum(["synchronous", "asynchronous"]) });
const message = z.strictObject({ factId, fromId: id, toId: id, kind: z.enum(["request", "interaction", "response"]), requestFactId: factId.nullable(), label: z.string().min(1).max(320), evidenceClass: z.enum(["source-confirmed", "user-stated"]), evidenceId: id.nullable(), flowEvidenceId: id.nullable(), proposed: proposed.nullable() });
export const sequenceDiagramPlanSchema = z.strictObject({ planVersion: z.literal(1), participantIds: z.array(id).min(1).max(sequencePlanLimits.maxParticipants), messages: z.array(message).min(1).max(sequencePlanLimits.maxMessages) });
export type SequenceDiagramPlan = z.infer<typeof sequenceDiagramPlanSchema>;

const { $schema: _schema, ...wire } = z.toJSONSchema(sequenceDiagramPlanSchema, { target: "draft-2020-12", io: "input" });
export const sequencePlanResponseSchema = Object.freeze(wire as JsonSchemaObject);

export interface ValidatedSequenceFact {
  readonly fact: SequenceDiagramPlan["messages"][number];
  readonly evidenceId: string;
  readonly evidenceClass: "source-confirmed" | "user-stated";
  readonly interfaceType: string;
  readonly interfaceName: string | null;
  readonly mode: "synchronous" | "asynchronous";
  readonly fromId: string;
  readonly toId: string;
  readonly source: { readonly file: string; readonly line: number };
}
export interface ValidatedSequencePlan { readonly plan: SequenceDiagramPlan; readonly facts: readonly ValidatedSequenceFact[] }
export type PlanValidation = { readonly ok: true; readonly value: ValidatedSequencePlan } | { readonly ok: false; readonly code: string };

function safeLabel(value: string): boolean {
  return displayTextProblem(value.replace(/["\\]/g, "x"), messageLabelTextOptions) === undefined;
}

/** Validate every semantic choice before notation is built. */
export function validateSequencePlan(raw: unknown, snapshot: ArchitectureSnapshot): PlanValidation {
  const parsed = sequenceDiagramPlanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "schema-violation" };
  const plan = parsed.data;
  const elements = new Map(snapshot.elements.map((entry) => [entry.id, entry]));
  const relationships = new Map(snapshot.relationships.map((entry) => [entry.evidenceId, entry]));
  const flow = new Map(snapshot.flowEvidence.map((entry) => [entry.flowEvidenceId, entry]));
  const used = new Set(plan.participantIds);
  if (used.size !== plan.participantIds.length || plan.participantIds.some((key) => !elements.has(key) || elements.get(key)?.kind === "new")) return { ok: false, code: "participant-reference" };
  const seen = new Map<string, ValidatedSequenceFact>();
  const facts: ValidatedSequenceFact[] = [];
  const referenced = new Set<string>();
  for (const fact of plan.messages) {
    if (seen.has(fact.factId) || !used.has(fact.fromId) || !used.has(fact.toId) ||
        !safeLabel(fact.label)) return { ok: false, code: "fact-reference" };
    const response = fact.kind === "response";
    const relationshipFrom = response ? fact.toId : fact.fromId;
    const relationshipTo = response ? fact.fromId : fact.toId;
    if (snapshot.rules.some((rule) => rule.rule === "forbid" && rule.fromId === relationshipFrom && rule.toId === relationshipTo)) return { ok: false, code: "forbidden-interaction" };
    let selected: ValidatedSequenceFact;
    if (fact.evidenceClass === "source-confirmed") {
      const evidence = fact.evidenceId === null ? undefined : relationships.get(fact.evidenceId);
      if (!evidence || fact.flowEvidenceId !== null || fact.proposed !== null || evidence.fromId !== relationshipFrom || evidence.toId !== relationshipTo) return { ok: false, code: "evidence-conflict" };
      selected = { fact, evidenceId: evidence.evidenceId, evidenceClass: "source-confirmed", interfaceType: modelInterfaceTypeFromPack(evidence.interfaceType as PackInterfaceType), interfaceName: evidence.interfaceName,
        mode: evidence.mode as "synchronous" | "asynchronous", fromId: fact.fromId, toId: fact.toId, source: evidence.source };
    } else {
      const evidence = fact.flowEvidenceId === null ? undefined : flow.get(fact.flowEvidenceId);
      if (!evidence || fact.evidenceId !== null || fact.proposed === null || elements.get(fact.fromId)?.kind === "new" || elements.get(fact.toId)?.kind === "new" ||
          snapshot.relationships.some((entry) => (entry.fromId === relationshipFrom && entry.toId === relationshipTo) || (entry.fromId === relationshipTo && entry.toId === relationshipFrom)) ||
          (fact.proposed.interfaceName !== null && displayTextProblem(fact.proposed.interfaceName, { maxChars: 160 }) !== undefined)) return { ok: false, code: "evidence-conflict" };
      selected = { fact, evidenceId: evidence.flowEvidenceId, evidenceClass: "user-stated", interfaceType: fact.proposed.interfaceType, interfaceName: fact.proposed.interfaceName,
        mode: fact.proposed.mode, fromId: fact.fromId, toId: fact.toId, source: { file: snapshot.flowFile, line: evidence.line } };
    }
    if (response) {
      const request = fact.requestFactId === null ? undefined : seen.get(fact.requestFactId);
      if (!request || request.fact.kind !== "request" || request.mode !== "synchronous" || selected.mode !== "synchronous" ||
          request.fromId !== fact.toId || request.toId !== fact.fromId || request.evidenceClass !== selected.evidenceClass ||
          (selected.evidenceClass === "source-confirmed" && request.evidenceId !== selected.evidenceId) ||
          request.interfaceType !== selected.interfaceType || request.interfaceName !== selected.interfaceName) return { ok: false, code: "response-without-request" };
    } else if (fact.requestFactId !== null || (fact.kind === "request" && selected.mode !== "synchronous")) return { ok: false, code: "interaction-mode-mismatch" };
    seen.set(fact.factId, selected);
    referenced.add(fact.fromId);
    referenced.add(fact.toId);
    facts.push(selected);
  }
  if (referenced.size !== used.size) return { ok: false, code: "participant-reference" };
  return { ok: true, value: { plan, facts } };
}

export interface RenderedSequence { readonly plantUml: string; readonly lines: ReadonlyMap<string, number> }

/** The renderer uses only validated IDs and snapshot-derived notation facts. */
export function renderSequencePlan(validated: ValidatedSequencePlan, snapshot: ArchitectureSnapshot): RenderedSequence {
  const aliases = allocateAliases(snapshot.elements.map((entry) => entry.kind === "new" ? { newName: entry.id.slice(4) } : { elementId: entry.id }));
  const elements = new Map(snapshot.elements.map((entry) => [entry.id, entry]));
  const alias = (key: string): string => aliases.get(key.startsWith("new:") ? key : `kp:${key}`)!;
  const lines = ["@startuml"];
  for (const key of validated.plan.participantIds) {
    const element = elements.get(key)!;
    const kind = element.kind === "new" ? "system" : element.kind as ParticipantKind;
    lines.push(`${participantDeclarationKeywords[kind]} ${quotedName(element.canonicalName)} as ${alias(key)}`);
  }
  const positions = new Map<string, number>();
  for (const entry of validated.facts) {
    const arrow = entry.fact.kind === "response" ? "-->" : entry.mode === "asynchronous" ? "->>" : "->";
    const suffix = entry.interfaceName === null ? entry.interfaceType : `${entry.interfaceType}: ${entry.interfaceName}`;
    const label = entry.fact.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(`${alias(entry.fromId)} ${arrow} ${alias(entry.toId)} : ${label} (${suffix})`);
    positions.set(entry.fact.factId, lines.length);
  }
  lines.push("@enduml");
  return { plantUml: `${lines.join("\n")}\n`, lines: positions };
}

const reviewIssue = z.strictObject({ code: z.enum(["coverage-gap", "meaning-mismatch", "abstraction-level", "unsupported-inference", "diagram-type-fit"]), factId: factId.nullable(), diagramLine: z.number().int().min(1).max(2000).nullable(), evidenceIds: z.array(id).max(16), explanation: z.string().min(1).max(500) });
const confirmation = z.strictObject({ factId, flowEvidenceId: id });
const reviewSchema = z.strictObject({ verdict: z.enum(["accept", "reject"]), violations: z.array(reviewIssue).max(32), confirmations: z.array(confirmation).max(sequencePlanLimits.maxMessages) });
const { $schema: _reviewSchema, ...reviewWire } = z.toJSONSchema(reviewSchema, { target: "draft-2020-12", io: "input" });
export const sequenceReviewResponseSchema = Object.freeze(reviewWire as JsonSchemaObject);

export function validateSequenceReview(raw: unknown, validated: ValidatedSequencePlan, rendered: RenderedSequence, snapshot: ArchitectureSnapshot): { readonly ok: true; readonly verdict: "accept" | "reject"; readonly violations: number } | { readonly ok: false } {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const { verdict, violations, confirmations } = parsed.data;
  if ((verdict === "accept" && violations.length > 0) || (verdict === "reject" && (violations.length === 0 || confirmations.length > 0))) return { ok: false };
  const facts = new Map(validated.facts.map((entry) => [entry.fact.factId, entry]));
  const evidenceIds = new Set([...snapshot.elements.map((entry) => entry.id), ...snapshot.relationships.map((entry) => entry.evidenceId), ...snapshot.rules.map((entry) => entry.evidenceId), ...snapshot.flowEvidence.map((entry) => entry.flowEvidenceId)]);
  const violationKeys = new Set<string>();
  for (const issue of violations) {
    if (issue.factId === null ? issue.diagramLine !== null : !facts.has(issue.factId) || rendered.lines.get(issue.factId) !== issue.diagramLine) return { ok: false };
    if (issue.evidenceIds.length === 0 || issue.evidenceIds.some((key) => !evidenceIds.has(key)) || new Set(issue.evidenceIds).size !== issue.evidenceIds.length) return { ok: false };
    const key = `${issue.code}:${issue.factId ?? "none"}`;
    if (violationKeys.has(key)) return { ok: false };
    violationKeys.add(key);
  }
  if (verdict === "accept") {
    const pending = validated.facts.filter((entry) => entry.evidenceClass === "user-stated");
    if (confirmations.length !== pending.length || new Set(confirmations.map((entry) => entry.factId)).size !== confirmations.length) return { ok: false };
    if (confirmations.some((entry) => facts.get(entry.factId)?.evidenceClass !== "user-stated" || facts.get(entry.factId)?.evidenceId !== entry.flowEvidenceId)) return { ok: false };
  }
  return { ok: true, verdict, violations: violations.length };
}
