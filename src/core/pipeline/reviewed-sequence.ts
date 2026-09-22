import { buildGroundedContext, type FlowDocument, type GroundingKnowledgePack, type GroundingRequest } from "../grounding/grounded-context-builder.js";
import type { GroundedContext, GroundingOutcome } from "../grounding/grounded-context.js";
import { allocateAliases } from "../render/alias-allocator.js";
import { stableDigest } from "../util/stable-digest.js";
import { stableCompare } from "../util/ordering.js";
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
