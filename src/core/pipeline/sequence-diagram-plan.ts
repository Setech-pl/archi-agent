import { z } from "zod";
import type { JsonSchemaObject } from "../llm/structured-chat-client.js";
import { participantDeclarationKeywords, type ParticipantKind } from "../model/types.js";
import { displayTextProblem, messageLabelTextOptions, quotedName } from "../render/plantuml-escape.js";
import { modelInterfaceTypeFromPack } from "../validation/relationship-validator.js";
import type { InterfaceType as PackInterfaceType } from "../knowledge-pack/knowledge-pack.schema.js";
import type { ArchitectureSnapshot } from "./reviewed-sequence.js";

export const sequencePlanLimits = Object.freeze({ maxParticipants: 64, maxMessages: 512, maxIdChars: 128 });
const id = z.string().min(1).max(sequencePlanLimits.maxIdChars).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const order = z.number().int().min(1).max(sequencePlanLimits.maxMessages);
const groundedStep = z.strictObject({ order, operationId: id, label: z.string().min(1).max(320) });
const userStatedStep = z.strictObject({ order, fromId: id, toId: id,
  interactionKind: z.enum(["request", "asynchronous"]),
  interfaceType: z.enum(["REST API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"]),
  interfaceName: z.string().max(160).nullable(), flowEvidenceId: id, label: z.string().min(1).max(320) });
export const sequenceDiagramPlanSchema = z.strictObject({ version: z.literal(3),
  groundedSteps: z.array(groundedStep).max(sequencePlanLimits.maxMessages),
  userStatedSteps: z.array(userStatedStep).max(sequencePlanLimits.maxMessages) });
export type SequenceDiagramPlan = z.infer<typeof sequenceDiagramPlanSchema>;
const { $schema: _schema, ...wire } = z.toJSONSchema(sequenceDiagramPlanSchema, { target: "draft-2020-12", io: "input" });
export const sequencePlanResponseSchema = Object.freeze(wire as JsonSchemaObject);

export interface AllowedOperation {
  readonly operationId: string; readonly kind: "request" | "response" | "asynchronous";
  readonly fromId: string; readonly toId: string; readonly relationshipEvidenceId: string;
  readonly interfaceType: string; readonly interfaceName: string | null; readonly mode: "synchronous" | "asynchronous";
  readonly requestOperationId: string | null; readonly source: { readonly file: string; readonly line: number };
  readonly purpose: string;
}
export function createOperationCatalog(snapshot: ArchitectureSnapshot): readonly AllowedOperation[] {
  const result: AllowedOperation[] = [];
  for (const relation of snapshot.relationships) {
    const nextId = () => `op-${String(result.length + 1).padStart(4, "0")}`;
    const common = { relationshipEvidenceId: relation.evidenceId,
      interfaceType: modelInterfaceTypeFromPack(relation.interfaceType as PackInterfaceType),
      interfaceName: relation.interfaceName, source: relation.source, purpose: relation.purpose };
    if (relation.mode === "asynchronous") {
      result.push({ ...common, operationId: nextId(), kind: "asynchronous", fromId: relation.fromId, toId: relation.toId,
        mode: "asynchronous", requestOperationId: null });
    } else {
      const requestOperationId = nextId();
      result.push({ ...common, operationId: requestOperationId, kind: "request", fromId: relation.fromId, toId: relation.toId,
        mode: "synchronous", requestOperationId: null });
      result.push({ ...common, operationId: nextId(), kind: "response", fromId: relation.toId, toId: relation.fromId,
        mode: "synchronous", requestOperationId });
    }
  }
  return result;
}

export interface ResolvedSequenceFact {
  readonly factId: string; readonly label: string; readonly kind: "request" | "response" | "asynchronous";
  readonly requestFactId: string | null; readonly operationId: string | null; readonly flowEvidenceId: string | null;
  readonly evidenceId: string; readonly evidenceClass: "source-confirmed" | "user-stated";
  readonly interfaceType: string; readonly interfaceName: string | null; readonly mode: "synchronous" | "asynchronous";
  readonly fromId: string; readonly toId: string; readonly source: { readonly file: string; readonly line: number };
}
export interface ResolvedSequencePlan {
  readonly version: 3; readonly snapshotDigest: string; readonly participantIds: readonly string[];
  readonly facts: readonly ResolvedSequenceFact[];
}
export type PlanValidation = { readonly ok: true; readonly value: ResolvedSequencePlan } |
  { readonly ok: false; readonly code: string; readonly stepIndex?: number; readonly list?: "groundedSteps" | "userStatedSteps";
    readonly order?: number; readonly operationId?: string; readonly flowEvidenceId?: string };
function safeLabel(value: string): boolean {
  return displayTextProblem(value, messageLabelTextOptions) === undefined;
}
export function validateSequencePlan(raw: unknown, snapshot: ArchitectureSnapshot): PlanValidation {
  const parsed = sequenceDiagramPlanSchema.safeParse(raw);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path;
    const list = path?.[0];
    return { ok: false, code: "schema-violation",
      ...(list === "groundedSteps" || list === "userStatedSteps" ? { list } : {}),
      ...(typeof path?.[1] === "number" ? { stepIndex: path[1] } : {}) };
  }
  const combined = [
    ...parsed.data.groundedSteps.map((item, stepIndex) => ({ list: "groundedSteps" as const, stepIndex, item })),
    ...parsed.data.userStatedSteps.map((item, stepIndex) => ({ list: "userStatedSteps" as const, stepIndex, item }))
  ];
  if (combined.length === 0) return { ok: false, code: "empty-plan" };
  if (combined.length > sequencePlanLimits.maxMessages) return { ok: false, code: "step-limit" };
  const seenOrders = new Set<number>();
  for (const entry of combined) {
    if (seenOrders.has(entry.item.order)) return { ok: false, code: "duplicate-order", list: entry.list,
      stepIndex: entry.stepIndex, order: entry.item.order };
    seenOrders.add(entry.item.order);
  }
  combined.sort((left, right) => left.item.order - right.item.order);
  for (const [index, entry] of combined.entries()) {
    if (entry.item.order !== index + 1) return { ok: false, code: "order-gap", list: entry.list,
      stepIndex: entry.stepIndex, order: entry.item.order };
  }
  const elements = new Map(snapshot.elements.map((entry) => [entry.id, entry]));
  const operations = new Map(createOperationCatalog(snapshot).map((entry) => [entry.operationId, entry]));
  const flow = new Map(snapshot.flowEvidence.map((entry) => [entry.flowEvidenceId, entry]));
  const selected = new Map<string, ResolvedSequenceFact>();
  const facts: ResolvedSequenceFact[] = [];
  const participants = new Set<string>();
  for (const [mergedIndex, entry] of combined.entries()) {
    const { item, list, stepIndex } = entry;
    const reject = (code: string): PlanValidation => ({ ok: false, code, list, stepIndex, order: item.order,
      ...(list === "groundedSteps" && operations.has(item.operationId) ? { operationId: item.operationId } : {}),
      ...(list === "userStatedSteps" && flow.has(item.flowEvidenceId) ? { flowEvidenceId: item.flowEvidenceId } : {}) });
    if (!safeLabel(item.label)) return reject("label-invalid");
    const localId = `fact-${String(mergedIndex + 1).padStart(4, "0")}`;
    let fact: ResolvedSequenceFact;
    if (list === "groundedSteps") {
      const operation = operations.get(item.operationId);
      if (operation === undefined) return reject("unknown-operation-id");
      if (selected.has(operation.operationId)) return reject("duplicate-operation-id");
      const request = operation.requestOperationId === null ? undefined : selected.get(operation.requestOperationId);
      if (operation.kind === "response" && request === undefined) return reject("response-before-request");
      fact = { factId: localId, label: item.label, kind: operation.kind, requestFactId: request?.factId ?? null,
        operationId: operation.operationId, flowEvidenceId: null, evidenceId: operation.relationshipEvidenceId,
        evidenceClass: "source-confirmed", interfaceType: operation.interfaceType, interfaceName: operation.interfaceName,
        mode: operation.mode, fromId: operation.fromId, toId: operation.toId, source: operation.source };
      selected.set(operation.operationId, fact);
    } else {
      const evidence = flow.get(item.flowEvidenceId);
      if (evidence === undefined) return reject("unknown-flow-evidence-id");
      if (!elements.has(item.fromId) || !elements.has(item.toId) || elements.get(item.fromId)?.kind === "new" ||
          elements.get(item.toId)?.kind === "new") return reject("unknown-endpoint");
      if (item.interfaceName !== null && displayTextProblem(item.interfaceName, { maxChars: 160 }) !== undefined) return reject("interface-name-invalid");
      if (snapshot.relationships.some((entry) => entry.fromId === item.fromId && entry.toId === item.toId)) return reject("source-confirmed-conflict");
      if (snapshot.relationships.some((entry) => entry.fromId === item.toId && entry.toId === item.fromId &&
          modelInterfaceTypeFromPack(entry.interfaceType as PackInterfaceType) === item.interfaceType &&
          (item.interfaceName === null || (entry.interfaceName !== null &&
            entry.interfaceName.toLowerCase() === item.interfaceName.toLowerCase())))) return reject("interaction-direction-mismatch");
      const mode = item.interactionKind === "request" ? "synchronous" : "asynchronous";
      fact = { factId: localId, label: item.label, kind: item.interactionKind, requestFactId: null, operationId: null,
        flowEvidenceId: evidence.flowEvidenceId, evidenceId: evidence.flowEvidenceId, evidenceClass: "user-stated",
        interfaceType: item.interfaceType, interfaceName: item.interfaceName, mode, fromId: item.fromId, toId: item.toId,
        source: { file: snapshot.flowFile, line: evidence.line } };
    }
    const ruleFrom = fact.kind === "response" ? fact.toId : fact.fromId;
    const ruleTo = fact.kind === "response" ? fact.fromId : fact.toId;
    if (snapshot.rules.some((rule) => rule.rule === "forbid" && rule.fromId === ruleFrom && rule.toId === ruleTo)) return reject("forbidden-interaction");
    participants.add(fact.fromId); participants.add(fact.toId);
    if (participants.size > sequencePlanLimits.maxParticipants) return reject("participant-limit");
    facts.push(fact);
  }
  return { ok: true, value: { version: 3, snapshotDigest: snapshot.digest, participantIds: [...participants], facts } };
}

export interface RenderedSequence { readonly plantUml: string; readonly lines: ReadonlyMap<string, number> }
export function renderSequencePlan(plan: ResolvedSequencePlan, snapshot: ArchitectureSnapshot): RenderedSequence {
  if (plan.version !== 3 || plan.snapshotDigest !== snapshot.digest || !Array.isArray(plan.facts)) throw new Error("resolved-plan-required");
  const elements = new Map(snapshot.elements.map((entry) => [entry.id, entry]));
  const lines = ["@startuml"];
  for (const key of plan.participantIds) {
    const element = elements.get(key)!;
    lines.push(`${participantDeclarationKeywords[element.kind as ParticipantKind]} ${quotedName(element.canonicalName)} as ${element.alias}`);
  }
  const positions = new Map<string, number>();
  for (const fact of plan.facts) {
    const arrow = fact.kind === "response" ? "-->" : fact.mode === "asynchronous" ? "->>" : "->";
    const suffix = fact.interfaceName === null ? fact.interfaceType : `${fact.interfaceType}: ${fact.interfaceName}`;
    const label = fact.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    lines.push(`${elements.get(fact.fromId)!.alias} ${arrow} ${elements.get(fact.toId)!.alias} : ${label} (${suffix})`);
    positions.set(fact.factId, lines.length);
  }
  lines.push("@enduml");
  return { plantUml: `${lines.join("\n")}\n`, lines: positions };
}

export const sequenceReviewViolationCodes = ["unsupported-user-stated-evidence", "sequence-inconsistency", "participant-inconsistency", "candidate-semantics-invalid"] as const;
export type SequenceReviewViolationCode = typeof sequenceReviewViolationCodes[number];
export const sequenceReviewLimits = Object.freeze({ maxConfirmations: sequencePlanLimits.maxMessages, maxViolations: 32, maxFactIdChars: 9, maxTokens: 8192 });
const reviewFactId = z.string().max(sequenceReviewLimits.maxFactIdChars).regex(/^fact-[0-9]{4}$/);
const reviewIssue = z.strictObject({ code: z.enum(sequenceReviewViolationCodes), factId: reviewFactId.nullable() });
const reviewSchema = z.strictObject({ accepted: z.boolean(),
  confirmedUserStatedFactIds: z.array(reviewFactId).max(sequenceReviewLimits.maxConfirmations),
  violations: z.array(reviewIssue).max(sequenceReviewLimits.maxViolations) });
const { $schema: _reviewSchema, ...reviewWire } = z.toJSONSchema(reviewSchema, { target: "draft-2020-12", io: "input" });
export const sequenceReviewResponseSchema = Object.freeze(reviewWire as JsonSchemaObject);
export type SequenceReviewFailureCode = "schema-invalid" | "unsupported-violation-code" | "accepted-with-violations" |
  "accepted-confirmations-mismatch" | "rejected-with-confirmations" | "rejected-without-violations" |
  "unknown-confirmed-fact" | "unknown-violation-fact" | "duplicate-fact-reference";
export function validateSequenceReview(raw: unknown, plan: ResolvedSequencePlan):
  { readonly ok: true; readonly accepted: boolean; readonly violationCodes: readonly SequenceReviewViolationCode[] } |
  { readonly ok: false; readonly code: SequenceReviewFailureCode; readonly accepted?: boolean;
    readonly confirmationCount?: number; readonly violationCount?: number } {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    const rawViolations = raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)["violations"] : undefined;
    const unsupportedCode = parsed.error.issues.some((issue) => {
      if (issue.path[0] !== "violations" || typeof issue.path[1] !== "number" || issue.path[2] !== "code" || !Array.isArray(rawViolations)) return false;
      const item: unknown = rawViolations[issue.path[1]];
      const code = item !== null && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>)["code"] : undefined;
      return typeof code === "string" && !sequenceReviewViolationCodes.includes(code as SequenceReviewViolationCode);
    });
    return { ok: false, code: unsupportedCode ? "unsupported-violation-code" : "schema-invalid" };
  }
  const { accepted, violations, confirmedUserStatedFactIds: confirmations } = parsed.data;
  const fail = (code: SequenceReviewFailureCode) => ({ ok: false as const, code, accepted,
    confirmationCount: confirmations.length, violationCount: violations.length });
  if (accepted && violations.length > 0) return fail("accepted-with-violations");
  if (!accepted && violations.length === 0) return fail("rejected-without-violations");
  if (!accepted && confirmations.length > 0) return fail("rejected-with-confirmations");
  const facts = new Map(plan.facts.map((entry) => [entry.factId, entry]));
  const violationKeys = new Set<string>();
  for (const issue of violations) {
    if (issue.factId !== null && !facts.has(issue.factId)) return fail("unknown-violation-fact");
    const key = `${issue.code}:${issue.factId ?? "none"}`;
    if (violationKeys.has(key)) return fail("duplicate-fact-reference");
    violationKeys.add(key);
  }
  if (accepted) {
    const pending = plan.facts.filter((entry) => entry.evidenceClass === "user-stated");
    if (confirmations.some((entry) => !facts.has(entry))) return fail("unknown-confirmed-fact");
    if (new Set(confirmations).size !== confirmations.length) return fail("duplicate-fact-reference");
    if (confirmations.length !== pending.length || confirmations.some((entry) => facts.get(entry)?.evidenceClass !== "user-stated"))
      return fail("accepted-confirmations-mismatch");
  }
  return { ok: true, accepted, violationCodes: [...new Set(violations.map((entry) => entry.code))] };
}
