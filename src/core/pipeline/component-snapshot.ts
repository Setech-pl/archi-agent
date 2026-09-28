import type { FlowDocument } from "../grounding/grounded-context-builder.js";
import type { GroundedContext } from "../grounding/grounded-context.js";
import { validateRelativePath } from "../knowledge-pack/knowledge-pack-source.js";
import { allocateAliases } from "../render/alias-allocator.js";
import { stableCompare } from "../util/ordering.js";
import { canonicalSerialize, stableDigest, type CanonicalValue } from "../util/stable-digest.js";

export const componentSnapshotLimits = Object.freeze({ maxElements: 64, maxRelationships: 256, maxRules: 256, maxFlowLines: 256, maxJsonChars: 65_536 });
export interface ComponentSnapshot {
  readonly domain: "archi-agent-component-snapshot/1";
  readonly digest: string;
  readonly flowFile: string;
  readonly taskDescription: string;
  readonly metadata: GroundedContext["metadata"];
  readonly elements: readonly { readonly id: string; readonly canonicalName: string; readonly alias: string; readonly kind: "actor" | "system" | "new"; readonly elementKind: string; readonly ownership: "source-owned" | "external" | "user-stated"; readonly description: string; readonly source: { readonly file: string; readonly line: number }; readonly mentions: readonly { readonly line: number; readonly column: number; readonly length: number; readonly spelling: string }[]; readonly mentionLines: readonly number[] }[];
  readonly relationships: readonly { readonly evidenceId: string; readonly fromId: string; readonly toId: string; readonly interfaceType: string; readonly interfaceName: string | null; readonly mode: string; readonly purpose: string; readonly source: { readonly file: string; readonly line: number } }[];
  readonly rules: readonly { readonly evidenceId: string; readonly rule: string; readonly fromId: string; readonly toId: string; readonly reason: string; readonly source: { readonly file: string; readonly line: number } }[];
  readonly flowEvidence: readonly { readonly flowEvidenceId: string; readonly line: number; readonly text: string }[];
}

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

/** Build only the locally resolved component slice. No Sequence operation catalog or digest participates. */
export function buildComponentSnapshot(context: GroundedContext, flow: FlowDocument): ComponentSnapshot {
  const flowFile = flow.file ?? "flow";
  if (!validateRelativePath(flowFile).ok) throw new Error("component-snapshot-invalid-path");
  const known = [...context.actors, ...context.systems];
  const bodyLines = flow.body.split("\n");
  const selectedMentions = (entries: readonly { readonly line: number; readonly column: number; readonly length: number }[]) =>
    entries.map((entry) => {
      const text = bodyLines[entry.line - flow.bodyStartLine];
      if (text === undefined || entry.column < 1 || entry.length < 1 || entry.column - 1 + entry.length > text.length)
        throw new Error("component-snapshot-invalid-mention");
      return { ...entry, spelling: text.slice(entry.column - 1, entry.column - 1 + entry.length) };
    }).sort((a, b) => a.line - b.line || a.column - b.column || a.length - b.length);
  const aliases = allocateAliases([...known.map((entry) => ({ elementId: entry.id })), ...context.newParticipants.map((entry) => ({ newName: entry.key }))]);
  const elements = [
    ...known.map((entry) => ({ id: entry.id, canonicalName: entry.canonicalName, alias: aliases.get(`kp:${entry.id}`)!,
      kind: entry.participantType, elementKind: entry.participantType === "actor" ? entry.actorKind : entry.systemKind,
      ownership: (entry.participantType === "actor" ? entry.actorKind : entry.systemKind) === "external" ? "external" as const : "source-owned" as const,
      description: entry.description, source: { ...entry.source }, mentions: selectedMentions(entry.mentions),
      mentionLines: [...new Set(entry.mentions.map((mention) => mention.line))].sort((a, b) => a - b) })),
    ...context.newParticipants.map((entry) => ({ id: `new:${entry.key}`, canonicalName: `[NEW] ${entry.displayName}`, alias: aliases.get(`new:${entry.key}`)!,
      kind: "new" as const, elementKind: "new", ownership: "user-stated" as const, description: "",
      source: { file: flowFile, line: entry.mentions[0]?.line ?? 1 }, mentions: selectedMentions(entry.mentions),
      mentionLines: [...new Set(entry.mentions.map((mention) => mention.line))].sort((a, b) => a - b) }))
  ].sort((a, b) => stableCompare(a.id, b.id));
  const selected = new Set(elements.map((entry) => entry.id));
  const relationships = [...context.relationships].filter((entry) => selected.has(entry.fromId) && selected.has(entry.toId))
    .sort((a, b) => stableCompare(canonicalSerialize(a as unknown as CanonicalValue), canonicalSerialize(b as unknown as CanonicalValue)))
    .map((entry, index) => ({ evidenceId: `relationship-${String(index + 1).padStart(4, "0")}`, ...entry, source: { ...entry.source } }));
  const rules = [...context.rules].filter((entry) => selected.has(entry.fromId) && selected.has(entry.toId))
    .sort((a, b) => stableCompare(canonicalSerialize(a as unknown as CanonicalValue), canonicalSerialize(b as unknown as CanonicalValue)))
    .map((entry, index) => ({ evidenceId: `rule-${String(index + 1).padStart(4, "0")}`, ...entry, source: { ...entry.source } }));
  // Every nonempty task line can constrain the diagram, including lines without element names.
  // Keep them bounded and digest-covered; user-stated facts still need both endpoint mentions.
  const flowEvidence = flow.body.split("\n").flatMap((text, index) => {
    const line = flow.bodyStartLine + index;
    return text.trim() ? [{ flowEvidenceId: `flow-${String(line).padStart(4, "0")}`, line, text: text.trim() }] : [];
  });
  if (elements.length === 0 || elements.length > componentSnapshotLimits.maxElements ||
      relationships.length > componentSnapshotLimits.maxRelationships || rules.length > componentSnapshotLimits.maxRules ||
      flowEvidence.length > componentSnapshotLimits.maxFlowLines ||
      (relationships.length === 0 && !flowEvidence.some((line) => {
        const mentions = [...known, ...context.newParticipants].filter((entry) => entry.mentions.some((mention) => mention.line === line.line));
        return mentions.length >= 2;
      }))) throw new Error("component-snapshot-empty-or-over-limit");
  for (const source of [...elements, ...relationships, ...rules]) {
    if (!validateRelativePath(source.source.file).ok || !Number.isSafeInteger(source.source.line) || source.source.line < 1)
      throw new Error("component-snapshot-invalid-path");
  }
  const payload = { domain: "archi-agent-component-snapshot/1" as const, flowFile, taskDescription: flow.body, metadata: { ...context.metadata },
    elements, relationships, rules, flowEvidence };
  if (JSON.stringify(payload).length > componentSnapshotLimits.maxJsonChars) throw new Error("component-snapshot-over-limit");
  return freezeTree({ ...payload, digest: stableDigest(payload as unknown as CanonicalValue) });
}
