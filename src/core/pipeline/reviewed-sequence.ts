import { z } from "zod";
import { buildGroundedContext, type FlowDocument, type GroundingKnowledgePack, type GroundingRequest } from "../grounding/grounded-context-builder.js";
import type { GroundedContext, GroundingOutcome } from "../grounding/grounded-context.js";
import { groundedContextSchemaVersion } from "../grounding/grounded-context.js";
import type { JsonSchemaObject } from "../llm/structured-chat-client.js";
import { parseGeneratedSequenceModel, sequenceModelLimits, type GeneratedSequenceModel } from "../model/sequence-diagram-model.schema.js";
import { allowedInterfaceTypes, newParticipantPrefix, participantDeclarationKeywords, type ParticipantKind } from "../model/types.js";
import { allocateAliases } from "../render/alias-allocator.js";
import { assertSafeDisplayText, displayTextProblem, messageLabelTextOptions, quotedName } from "../render/plantuml-escape.js";
import { modelInterfaceTypeFromPack } from "../validation/relationship-validator.js";
import type { InterfaceType as PackInterfaceType } from "../knowledge-pack/knowledge-pack.schema.js";
import { stableDigest } from "../util/stable-digest.js";
import { stableCompare } from "../util/ordering.js";
import { createModelIssue, type ModelIssue } from "../validation/model-validator.js";
import { participantKindOf } from "../validation/grounding-validator.js";

export interface ArchitectureSnapshot {
  readonly snapshotId: string;
  readonly digest: string;
  readonly flowFile: string;
  readonly metadata: GroundedContext["metadata"];
  readonly elements: readonly { readonly id: string; readonly canonicalName: string; readonly alias: string; readonly kind: string; readonly elementKind: string; readonly names: readonly string[]; readonly description: string; readonly source: { readonly file: string; readonly line: number } }[];
  readonly relationships: readonly { readonly evidenceId: string; readonly evidenceClass: "source-confirmed"; readonly fromId: string; readonly toId: string; readonly interfaceType: string; readonly interfaceName: string | null; readonly mode: string; readonly purpose: string; readonly source: { readonly file: string; readonly line: number } }[];
  readonly rules: readonly { readonly evidenceId: string; readonly rule: string; readonly fromId: string; readonly toId: string; readonly reason: string; readonly source: { readonly file: string; readonly line: number } }[];
  readonly flowEvidence: readonly { readonly flowEvidenceId: string; readonly evidenceClass: "user-stated"; readonly line: number; readonly text: string }[];
  readonly sources: readonly { readonly id: string; readonly file: string; readonly line: number; readonly evidenceClass: "source-confirmed" | "user-stated" }[];
}

/** The D1.1 provider wraps already validated Knowledge Pack grounding; no new source I/O. */
export interface ArchitectureContextProvider {
  resolve(request: GroundingRequest): GroundingOutcome & { readonly snapshot?: ArchitectureSnapshot };
}

export const knowledgePackArchitectureProvider: ArchitectureContextProvider = Object.freeze({
  resolve(request: GroundingRequest) {
    const grounded = buildGroundedContext(request);
    return grounded.status === "blocked" ? grounded : { ...grounded, snapshot: buildArchitectureSnapshot(grounded.context, request.knowledgePack, request.flow) };
  }
});

export function buildArchitectureSnapshot(context: GroundedContext, pack: GroundingKnowledgePack, flow: FlowDocument): ArchitectureSnapshot {
  const known = [...context.actors, ...context.systems];
  const refs = [...known.map((entry) => ({ elementId: entry.id })), ...context.newParticipants.map((entry) => ({ newName: entry.key }))];
  const aliases = allocateAliases(refs);
  const elements = [
    ...known.map((entry) => ({ id: entry.id, canonicalName: entry.canonicalName, alias: aliases.get(`kp:${entry.id}`)!, kind: participantKindOf(entry), elementKind: entry.participantType === "actor" ? entry.actorKind : entry.systemKind, description: entry.description,
      names: Object.freeze([entry.canonicalName, ...pack.pack.aliases.filter((alias) => alias.targetId === entry.id).map((alias) => alias.alias).sort(stableCompare)]), source: entry.source })),
    ...context.newParticipants.map((entry) => ({ id: `new:${entry.key}`, canonicalName: `[NEW] ${entry.displayName}`, alias: aliases.get(`new:${entry.key}`)!, kind: "new", elementKind: "new", names: Object.freeze([entry.displayName]), description: "", source: { file: flow.file ?? "flow", line: entry.mentions[0]?.line ?? 1 } }))
  ].sort((a, b) => stableCompare(a.id, b.id));
  const relationships = context.relationships.map((entry, index) => ({ evidenceId: `relationship:${index + 1}`, evidenceClass: "source-confirmed" as const, fromId: entry.fromId, toId: entry.toId,
    interfaceType: entry.interfaceType, interfaceName: entry.interfaceName, mode: entry.mode, purpose: entry.purpose, source: entry.source }));
  const rules = context.rules.map((entry, index) => ({ evidenceId: `rule:${index + 1}`, rule: entry.rule, fromId: entry.fromId, toId: entry.toId, reason: entry.reason, source: entry.source }));
  const flowEvidence = flow.body.split("\n").flatMap((text, index) => text.trim() === "" ? [] : [{ flowEvidenceId: `flow:${flow.bodyStartLine + index}`, evidenceClass: "user-stated" as const, line: flow.bodyStartLine + index, text: text.trim() }]);
  const sources = [...elements.map((entry) => ({ id: entry.id, file: entry.source.file, line: entry.source.line,
      evidenceClass: entry.kind === "new" ? "user-stated" as const : "source-confirmed" as const })),
    ...relationships.map((entry) => ({ id: entry.evidenceId, file: entry.source.file, line: entry.source.line, evidenceClass: "source-confirmed" as const })),
    ...rules.map((entry) => ({ id: entry.evidenceId, file: entry.source.file, line: entry.source.line, evidenceClass: "source-confirmed" as const })),
    ...flowEvidence.map((entry) => ({ id: entry.flowEvidenceId, file: flow.file ?? "flow", line: entry.line, evidenceClass: "user-stated" as const }))];
  const payload = { flowFile: flow.file ?? "flow", metadata: { ...context.metadata },
    elements: Object.freeze(elements.map((entry) => Object.freeze({ ...entry, source: Object.freeze({ ...entry.source }) }))),
    relationships: Object.freeze(relationships.map((entry) => Object.freeze({ ...entry, source: Object.freeze({ ...entry.source }) }))),
    rules: Object.freeze(rules.map((entry) => Object.freeze({ ...entry, source: Object.freeze({ ...entry.source }) }))),
    flowEvidence: Object.freeze(flowEvidence.map((entry) => Object.freeze(entry))),
    sources: Object.freeze(sources.map((entry) => Object.freeze(entry))) };
  const digest = stableDigest(payload);
  return Object.freeze({ snapshotId: `snapshot-${digest.slice(0, 16)}`, digest, ...payload });
}

/** Rebuild the narrow legacy-validator input exclusively from the selected snapshot. */
export function validationContextFromSnapshot(snapshot: ArchitectureSnapshot): GroundedContext {
  const known = snapshot.elements.filter((entry) => entry.kind !== "new");
  const participant = (entry: typeof known[number]) => ({ id: entry.id, canonicalName: entry.canonicalName,
    description: entry.description, source: entry.source, matchKinds: [], resolution: "direct", mentions: [] });
  return {
    schemaVersion: groundedContextSchemaVersion, metadata: snapshot.metadata,
    actors: known.filter((entry) => entry.kind === "actor").map((entry) => ({ ...participant(entry), participantType: "actor", actorKind: entry.elementKind })),
    systems: known.filter((entry) => entry.kind !== "actor").map((entry) => ({ ...participant(entry), participantType: "system", systemKind: entry.elementKind })),
    newParticipants: snapshot.elements.filter((entry) => entry.kind === "new").map((entry) => ({ participantType: "new", key: entry.id.slice(4),
      displayName: entry.canonicalName.slice(6), confirmed: true, mentions: [{ line: entry.source.line, column: 1, length: 1 }] })),
    relationships: snapshot.relationships.map((entry) => ({ ...entry, source: entry.source })),
    rules: snapshot.rules.map((entry) => ({ ...entry, source: entry.source }))
  } as unknown as GroundedContext;
}

const generatorSchema = z.strictObject({ plantUml: z.string().max(256 * 1024) });
const reviewerCodes = ["coverage-gap", "meaning-mismatch", "abstraction-level", "unsupported-inference", "diagram-type-fit"] as const;
const violationSchema = z.strictObject({ code: z.enum(reviewerCodes), diagramLine: z.number().int().min(1).max(2000).nullable(),
  factId: z.string().max(32).nullable(), evidenceIds: z.array(z.string().max(128)).max(16), explanation: z.string().min(1).max(500) });
const confirmationSchema = z.strictObject({ factId: z.string().max(32), flowEvidenceIds: z.array(z.string().max(128)).min(1).max(16) });
const reviewerSchema = z.strictObject({ verdict: z.enum(["accept", "reject"]), violations: z.array(violationSchema).max(32), confirmations: z.array(confirmationSchema).max(512) });
function wire(schema: typeof generatorSchema | typeof reviewerSchema): JsonSchemaObject {
  const { $schema: _uri, ...value } = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
  return Object.freeze(value as JsonSchemaObject);
}
export const generatorResponseSchema = wire(generatorSchema);
export const reviewerResponseSchema = wire(reviewerSchema);
export const parseGeneratorResponse = (value: unknown) => generatorSchema.safeParse(value);

export interface DiagramFact { readonly factId: string; readonly lineNumber: number; readonly kind: "element" | "relationship" | "annotation"; readonly elementId?: string; readonly order?: number; readonly fromId?: string; readonly toId?: string; readonly arrow?: string; readonly label?: string; readonly async?: boolean; readonly isResponse?: boolean; readonly interfaceType?: string; readonly interfaceName?: string | null; readonly fragmentKind?: string; readonly condition?: string }
export interface DiagramFacts { readonly elements: readonly DiagramFact[]; readonly relationships: readonly DiagramFact[]; readonly annotations: readonly DiagramFact[]; readonly model: GeneratedSequenceModel }

const declaration = /^(actor|participant|database|queue) (?:"([^"]+)" as ([A-Za-z][A-Za-z0-9_]*)|([A-Za-z][A-Za-z0-9_]*) as "([^"]+)")$/;
const arrow = /^([A-Za-z][A-Za-z0-9_]*) (->>|-->|->) ([A-Za-z][A-Za-z0-9_]*) *: *(.*)$/;
const label = /^(.*?) +\((REST API|SOAP|EVENT|FILE|DB|INTERNAL)(?:: (.+))?\) *$/;
const fragment = /^(alt|opt|loop|group) (.+)$/;
const branch = /^else (.+)$/;
const kinds = { actor: "actor", participant: "system", database: "database", queue: "queue" } as const;

export type FactsParseResult = { readonly ok: true; readonly facts: DiagramFacts } | { readonly ok: false; readonly issue: ModelIssue };
function structure(line: number): FactsParseResult { return { ok: false, issue: createModelIssue("plantuml-structure", { details: { line } }) }; }

/** Only the physical source is parsed; no model-authored ledger or line references exist. */
export function parseSequenceFacts(text: string, snapshot: ArchitectureSnapshot): FactsParseResult {
  const candidates = new Map(snapshot.elements.map((entry) => [entry.alias, entry]));
  const declared = new Map<string, ArchitectureSnapshot["elements"][number]>();
  const participants: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const elements: DiagramFact[] = [];
  const relationships: DiagramFact[] = [];
  const annotations: DiagramFact[] = [];
  const fragments: { kind: string; condition: string; firstOrder: number; lastOrder: number; elseBranches: { condition: string; firstOrder: number }[] }[] = [];
  const stack: typeof fragments = [];
  let bodyStarted = false;
  const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
  for (let index = 1; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    if (line === "") continue;
    const participant = declaration.exec(line);
    if (participant) {
      const alias = (participant[3] ?? participant[4])!;
      const canonicalName = participant[2] ?? participant[5];
      const candidate = candidates.get(alias);
      if (bodyStarted || !candidate || declared.has(alias) || candidate.canonicalName !== canonicalName ||
          (candidate.kind !== "new" && candidate.kind !== kinds[participant[1] as keyof typeof kinds])) return structure(lineNumber);
      declared.set(alias, candidate);
      participants.push(candidate.kind === "new"
        ? { origin: "new", newName: candidate.id.slice(4), displayName: candidate.canonicalName, kind: kinds[participant[1] as keyof typeof kinds], confirmedByUser: true }
        : { origin: "knowledge-pack", elementId: candidate.id, canonicalName: candidate.canonicalName, kind: candidate.kind });
      elements.push(Object.freeze({ factId: `e${elements.length + 1}`, lineNumber, kind: "element", elementId: candidate.id }));
      continue;
    }
    const open = fragment.exec(line);
    if (open) {
      if (stack.length >= 4 || displayTextProblem(open[2], { rejectStatementKeywords: true }) !== undefined) return structure(lineNumber);
      bodyStarted = true;
      stack.push({ kind: open[1]!, condition: open[2]!, firstOrder: messages.length + 1, lastOrder: 0, elseBranches: [] });
      annotations.push(Object.freeze({ factId: `a${annotations.length + 1}`, lineNumber, kind: "annotation", fragmentKind: open[1], condition: open[2] }));
      continue;
    }
    const alternative = branch.exec(line);
    if (alternative) {
      const top = stack.at(-1);
      if (!top || top.kind !== "alt" || top.firstOrder > messages.length || displayTextProblem(alternative[1], { rejectStatementKeywords: true }) !== undefined) return structure(lineNumber);
      top.elseBranches.push({ condition: alternative[1]!, firstOrder: messages.length + 1 });
      annotations.push(Object.freeze({ factId: `a${annotations.length + 1}`, lineNumber, kind: "annotation", fragmentKind: "else", condition: alternative[1] }));
      continue;
    }
    if (line === "end") {
      const top = stack.pop();
      if (!top || top.firstOrder > messages.length || top.elseBranches.some((entry) => entry.firstOrder > messages.length)) return structure(lineNumber);
      top.lastOrder = messages.length;
      fragments.push(top);
      annotations.push(Object.freeze({ factId: `a${annotations.length + 1}`, lineNumber, kind: "annotation", fragmentKind: "end" }));
      continue;
    }
    const interaction = arrow.exec(line);
    if (!interaction) return structure(lineNumber);
    const parts = label.exec(interaction[4]!);
    const rawLabel = parts?.[1] ?? "";
    const quotedLabel = rawLabel.startsWith('"') ? /^"([^"\\]+)"$/.exec(rawLabel) : null;
    const messageLabel = quotedLabel?.[1] ?? rawLabel;
    const from = declared.get(interaction[1]!);
    const to = declared.get(interaction[3]!);
    if (!parts || !from || !to || (rawLabel.startsWith('"') && !quotedLabel) ||
        displayTextProblem(messageLabel, messageLabelTextOptions) !== undefined ||
        (parts[3] !== undefined && displayTextProblem(parts[3]) !== undefined) ||
        !allowedInterfaceTypes.includes(parts[2] as typeof allowedInterfaceTypes[number]) || messages.length >= sequenceModelLimits.maxMessages) return structure(lineNumber);
    bodyStarted = true;
    const ref = (entry: typeof from) => entry.kind === "new" ? { newName: entry.id.slice(4) } : { elementId: entry.id };
    messages.push({ from: ref(from), to: ref(to), label: messageLabel, interfaceType: parts[2],
      ...(parts[3] === undefined ? {} : { interfaceName: parts[3] }), async: interaction[2] === "->>", isResponse: interaction[2] === "-->", order: messages.length + 1 });
    relationships.push(Object.freeze({ factId: `m${messages.length}`, lineNumber, kind: "relationship", order: messages.length,
      fromId: from.id, toId: to.id, arrow: interaction[2], label: messageLabel, async: interaction[2] === "->>",
      isResponse: interaction[2] === "-->", interfaceType: parts[2], interfaceName: parts[3] ?? null }));
  }
  if (stack.length || !messages.length || !participants.length) return structure(lines.length);
  const parsed = parseGeneratedSequenceModel({ participants, messages, fragments });
  if (!parsed.ok) return structure(lines.length);
  return { ok: true, facts: Object.freeze({ elements: Object.freeze(elements), relationships: Object.freeze(relationships),
    annotations: Object.freeze(annotations), model: parsed.model }) };
}

export function buildGeneratorRequest(flow: FlowDocument, snapshot: ArchitectureSnapshot): string {
  const aliasById = new Map(snapshot.elements.map((element) => [element.id, element.alias]));
  const participantDeclarations = snapshot.elements.map((element) => {
    const kind = element.kind === "new" ? "system" : element.kind as ParticipantKind;
    const name = element.kind === "new"
      ? `"${newParticipantPrefix} ${assertSafeDisplayText(element.canonicalName.slice(newParticipantPrefix.length + 1))}"`
      : quotedName(element.canonicalName);
    return `${participantDeclarationKeywords[kind]} ${name} as ${element.alias}`;
  });
  const sourceConfirmedRequestSignatures: { prefix: string; suffix: string }[] = [];
  const sourceConfirmedResponseSignatures: { prefix: string; suffix: string }[] = [];
  for (const relationship of snapshot.relationships) {
    const from = aliasById.get(relationship.fromId);
    const to = aliasById.get(relationship.toId);
    if (from === undefined || to === undefined) throw new Error("Snapshot relationship endpoint missing.");
    const type = modelInterfaceTypeFromPack(relationship.interfaceType as PackInterfaceType);
    const name = relationship.interfaceName === null ? "" : `: ${assertSafeDisplayText(relationship.interfaceName, { maxChars: sequenceModelLimits.maxInterfaceNameChars })}`;
    const suffix = ` (${type}${name})`;
    sourceConfirmedRequestSignatures.push({ prefix: `${from} ${relationship.mode === "asynchronous" ? "->>" : "->"} ${to} : `, suffix });
    if (relationship.mode === "synchronous") sourceConfirmedResponseSignatures.push({ prefix: `${to} --> ${from} : `, suffix });
  }
  const allowedPlantUml = { participantDeclarations, sourceConfirmedRequestSignatures, sourceConfirmedResponseSignatures };
  const user = JSON.stringify({ task: { name: flow.metadata.flowName, language: flow.metadata.language, description: flow.body }, snapshot, allowedPlantUml });
  if (user.length > 65_536) throw Object.assign(new Error("Prompt rejected"), { code: "prompt-too-large" });
  return user;
}

export function buildReviewerRequest(flow: FlowDocument, snapshot: ArchitectureSnapshot, plantUml: string, facts: DiagramFacts, pendingFactIds: readonly string[]): string {
  const user = JSON.stringify({ task: { name: flow.metadata.flowName, language: flow.metadata.language, description: flow.body }, snapshot,
    plantUml, facts: { elements: facts.elements, relationships: facts.relationships, annotations: facts.annotations }, pendingFactIds, deterministicValidation: "passed" });
  if (user.length > 400_000) throw Object.assign(new Error("Review prompt rejected"), { code: "prompt-too-large" });
  return user;
}

export function parseReviewerResponse(value: unknown, snapshot: ArchitectureSnapshot, facts: DiagramFacts, pendingFactIds: readonly string[]): { readonly ok: true; readonly verdict: "accept" | "reject"; readonly violations: readonly z.infer<typeof violationSchema>[]; readonly confirmations: readonly z.infer<typeof confirmationSchema>[] } | { readonly ok: false } {
  const parsed = reviewerSchema.safeParse(value);
  if (!parsed.success) return { ok: false };
  const { verdict, violations, confirmations } = parsed.data;
  if ((verdict === "accept" && violations.length !== 0) || (verdict === "reject" && violations.length === 0)) return { ok: false };
  if (verdict === "reject" && confirmations.length !== 0) return { ok: false };
  const allFacts = [...facts.elements, ...facts.relationships, ...facts.annotations];
  const evidence = new Set([...snapshot.elements.map((entry) => entry.id), ...snapshot.relationships.map((entry) => entry.evidenceId), ...snapshot.rules.map((entry) => entry.evidenceId), ...snapshot.flowEvidence.map((entry) => entry.flowEvidenceId)]);
  const flowEvidence = new Set(snapshot.flowEvidence.map((entry) => entry.flowEvidenceId));
  for (const violation of violations) {
    if (violation.factId !== null) {
      const fact = allFacts.find((entry) => entry.factId === violation.factId);
      if (!fact || fact.lineNumber !== violation.diagramLine) return { ok: false };
    } else if (violation.diagramLine !== null) return { ok: false };
    if (violation.evidenceIds.some((id) => !evidence.has(id))) return { ok: false };
    if (new Set(violation.evidenceIds).size !== violation.evidenceIds.length) return { ok: false };
  }
  if (verdict === "accept") {
    if (confirmations.length !== pendingFactIds.length || new Set(confirmations.map((entry) => entry.factId)).size !== confirmations.length) return { ok: false };
    if (confirmations.some((entry) => !pendingFactIds.includes(entry.factId) || new Set(entry.flowEvidenceIds).size !== entry.flowEvidenceIds.length ||
        entry.flowEvidenceIds.some((id) => !flowEvidence.has(id)))) return { ok: false };
  }
  return { ok: true, verdict, violations, confirmations };
}
