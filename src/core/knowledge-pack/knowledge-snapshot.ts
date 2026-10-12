import type { DocumentProvenance } from "./document-provenance.js";
import {
  actorRowSchema, aliasRowSchema, knowledgePackTables, relationshipRowSchema, ruleRowSchema, systemRowSchema,
  type KnowledgePack, type KnowledgePackTableKind, type RecordByTable, type SourceLocation
} from "./knowledge-pack.schema.js";
import { validateRelativePath } from "./knowledge-pack-source.js";
import { containsControlCharacter, knowledgePackLimits } from "./source-limits.js";
import { normalizeReferenceText } from "../grounding/participant-resolver.js";
import { canonicalSerialize, stableDigest, type CanonicalValue } from "../util/stable-digest.js";
import { stableCompare } from "../util/ordering.js";

/** Reuses the existing pack's semantics; a source need not have physical file positions. */
export type KnowledgeRecord<K extends KnowledgePackTableKind> = Omit<RecordByTable[K], "location"> & {
  readonly location?: SourceLocation;
};
export interface KnowledgeSource {
  /** Stable logical identity, never an endpoint, credential or absolute path. */
  readonly id: string;
  readonly kind: string;
  /** Omitted categories are not provided. Complete describes this source's scope, not the world. */
  readonly scope: Readonly<Partial<Record<KnowledgePackTableKind, "partial" | "complete">>>;
}
export type KnowledgeContribution = {
  readonly source: KnowledgeSource;
  readonly records: { readonly [K in KnowledgePackTableKind]?: readonly KnowledgeRecord<K>[] };
};
export interface KnowledgeProvenance {
  readonly sourceId: string;
  /** Only present when supplied by the source. Absence never creates a synthetic file/line. */
  readonly location?: SourceLocation;
}
export type KnowledgeFact = { [K in KnowledgePackTableKind]: {
  readonly id: string;
  readonly table: K;
  readonly value: Omit<RecordByTable[K], "location">;
  readonly provenance: readonly KnowledgeProvenance[];
} }[KnowledgePackTableKind];
export interface KnowledgeGap {
  readonly code: "scope-not-provided" | "scope-partial" | "locator-unavailable" | "missing-reference" | "required-relationship-missing";
  readonly sourceId?: string;
  readonly table?: KnowledgePackTableKind;
  readonly factId?: string;
  readonly targetId?: string;
}
export interface KnowledgeConflict {
  readonly code: "incompatible-records" | "identifier-collision" | "conflicting-rules" | "forbidden-relationship";
  readonly factIds: readonly string[];
}
export interface KnowledgeSnapshot {
  readonly documentProvenance?: readonly DocumentProvenance[];
  readonly domain: "archi-agent-knowledge/1";
  readonly id: string;
  readonly digest: string;
  readonly sources: readonly KnowledgeSource[];
  readonly facts: readonly KnowledgeFact[];
  readonly gaps: readonly KnowledgeGap[];
  readonly conflicts: readonly KnowledgeConflict[];
  readonly ambiguities: readonly { readonly alias: string; readonly targetIds: readonly string[] }[];
}
const tables = Object.keys(knowledgePackTables) as KnowledgePackTableKind[];
const canonical = (value: unknown) => canonicalSerialize(value as CanonicalValue);
const hash = (value: unknown) => stableDigest(value as CanonicalValue);
function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
function sortedUnique<T>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [canonical(value), value])).entries()]
    .sort(([a], [b]) => stableCompare(a, b)).map(([, value]) => value);
}

/** Apply the original row validators without introducing a second set of semantic rules. */
function semanticRecord(table: KnowledgePackTableKind, record: KnowledgeRecord<KnowledgePackTableKind>) {
  const { location: _location, ...value } = record;
  const columns: Record<string, string> = { canonicalName: "canonical_name", fromId: "from_id", toId: "to_id",
    interfaceType: "interface_type", interfaceName: "interface_name", targetId: "target_id" };
  const row = Object.fromEntries(Object.entries(value).map(([key, entry]) => [columns[key] ?? key, entry]));
  if (table === "relationships" && row["interface_name"] === undefined) row["interface_name"] = "";
  const schemas = { systems: systemRowSchema, actors: actorRowSchema, relationships: relationshipRowSchema,
    aliases: aliasRowSchema, rules: ruleRowSchema };
  const parsed = schemas[table].safeParse(row);
  if (!parsed.success || Object.values(value).some((entry) => typeof entry === "string" && containsControlCharacter(entry)))
    throw new Error("knowledge-record-invalid");
  const names = Object.fromEntries(Object.entries(columns).map(([key, name]) => [name, key]));
  return Object.fromEntries(Object.entries(parsed.data).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [names[key] ?? key, entry]));
}
function identity(fact: KnowledgeFact): string {
  const value = fact.value;
  switch (fact.table) {
    case "systems": case "actors": return canonical([fact.table, (value as RecordByTable["systems"]).id]);
    case "aliases": return canonical([fact.table, (value as RecordByTable["aliases"]).alias, (value as RecordByTable["aliases"]).targetId]);
    case "relationships": {
      const row = value as RecordByTable["relationships"];
      return canonical([fact.table, row.fromId, row.toId, row.interfaceType, row.interfaceName ?? "", row.mode]);
    }
    case "rules": {
      const row = value as RecordByTable["rules"];
      return canonical([fact.table, row.rule, row.fromId, row.toId]);
    }
  }
}

/** Pure, deterministic assembly. Conflicting claims survive; no source is assigned precedence. */
export function createKnowledgeSnapshot(contributions: readonly KnowledgeContribution[]): KnowledgeSnapshot {
  if (!Array.isArray(contributions) || contributions.length === 0 || contributions.length > 64) throw new Error("knowledge-source-limit");
  const sources: KnowledgeSource[] = [];
  const claims = new Map<string, { id: string; table: KnowledgePackTableKind; value: unknown; provenance: KnowledgeProvenance[] }>();
  const gaps: KnowledgeGap[] = [];
  const counts = new Map<KnowledgePackTableKind, number>();
  for (const contribution of contributions) {
    const { source: suppliedSource, records } = contribution;
    if (suppliedSource === null || typeof suppliedSource !== "object" || suppliedSource.scope === null ||
        typeof suppliedSource.scope !== "object" || Array.isArray(suppliedSource.scope) ||
        records === null || typeof records !== "object" || Array.isArray(records)) throw new Error("knowledge-source-invalid");
    const source = { id: suppliedSource.id, kind: suppliedSource.kind, scope: { ...suppliedSource.scope } };
    if (typeof source.id !== "string" || typeof source.kind !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,63}$/.test(source.id) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(source.kind) ||
        sources.some((entry) => entry.id === source.id) || Object.keys(source.scope).some((key) => !tables.includes(key as KnowledgePackTableKind)) ||
        Object.keys(records).some((key) => !tables.includes(key as KnowledgePackTableKind))) throw new Error("knowledge-source-invalid");
    sources.push({ id: source.id, kind: source.kind, scope: Object.fromEntries(tables.flatMap((table) =>
      source.scope[table] === undefined ? [] : [[table, source.scope[table]]])) });
    for (const table of tables) {
      const scope = source.scope[table];
      if (scope !== undefined && scope !== "partial" && scope !== "complete") throw new Error("knowledge-scope-invalid");
      if (scope !== "complete") gaps.push({ code: scope === undefined ? "scope-not-provided" : "scope-partial", sourceId: source.id, table });
      const rows = records[table] === undefined ? [] : records[table];
      if (!Array.isArray(rows)) throw new Error("knowledge-records-invalid");
      if (scope === undefined && rows.length !== 0) throw new Error("knowledge-outside-declared-scope");
      counts.set(table, (counts.get(table) ?? 0) + rows.length);
      if (counts.get(table)! > knowledgePackLimits.maxTableRows) throw new Error("knowledge-record-limit");
      for (const record of rows) {
        const value = semanticRecord(table, record);
        const id = `fact-${hash({ table, value })}`;
        const suppliedLocation = record.location;
        const location = suppliedLocation === undefined ? undefined : { file: suppliedLocation.file, line: suppliedLocation.line };
        if (location !== undefined && (!validateRelativePath(location.file).ok || !Number.isSafeInteger(location.line) || location.line < 1))
          throw new Error("knowledge-provenance-invalid");
        const provenance = { sourceId: source.id, ...(location === undefined ? {} : { location: { file: location.file, line: location.line } }) };
        const existing = claims.get(id);
        if (existing === undefined) claims.set(id, { id, table, value, provenance: [provenance] });
        else existing.provenance.push(provenance);
        if (location === undefined) gaps.push({ code: "locator-unavailable", sourceId: source.id, factId: id });
      }
    }
  }
  const facts = [...claims.values()].map((entry) => ({ ...entry, provenance: sortedUnique(entry.provenance)
    .sort((a, b) => stableCompare(a.sourceId, b.sourceId) || stableCompare(canonical(a), canonical(b))) })) as KnowledgeFact[];
  facts.sort((a, b) => stableCompare(a.id, b.id));
  const conflicts: KnowledgeConflict[] = [];
  const conflict = (code: KnowledgeConflict["code"], entries: readonly KnowledgeFact[]) => {
    conflicts.push({ code, factIds: entries.map((entry) => entry.id).sort(stableCompare) });
  };
  const identities = new Map<string, KnowledgeFact[]>();
  for (const fact of facts) {
    const key = identity(fact);
    identities.set(key, [...(identities.get(key) ?? []), fact]);
  }
  for (const entries of identities.values()) if (entries.length > 1) conflict("incompatible-records", entries);
  const entities = new Map<string, KnowledgeFact[]>();
  const aliases = new Map<string, string[]>();
  for (const fact of facts) {
    if (fact.table === "systems" || fact.table === "actors") entities.set(fact.value.id, [...(entities.get(fact.value.id) ?? []), fact]);
    if (fact.table === "aliases") {
      const key = normalizeReferenceText(fact.value.alias);
      if (!key) throw new Error("knowledge-alias-invalid");
      aliases.set(key, [...(aliases.get(key) ?? []), fact.value.targetId]);
    }
  }
  for (const entries of entities.values()) if (new Set(entries.map((entry) => entry.table)).size > 1) conflict("identifier-collision", entries);
  const relationships = facts.filter((fact) => fact.table === "relationships");
  const rules = facts.filter((fact) => fact.table === "rules");
  for (const fact of facts) {
    const references = fact.table === "aliases" ? [fact.value.targetId] : fact.table === "relationships" || fact.table === "rules" ? [fact.value.fromId, fact.value.toId] : [];
    for (const targetId of references) if (!entities.has(targetId)) gaps.push({ code: "missing-reference", factId: fact.id, targetId });
  }
  for (const rule of rules) {
    const pair = relationships.filter((fact) => fact.value.fromId === rule.value.fromId && fact.value.toId === rule.value.toId);
    if (rule.value.rule === "forbid") {
      for (const required of rules.filter((fact) => fact.value.rule === "require" && fact.value.fromId === rule.value.fromId && fact.value.toId === rule.value.toId))
        conflict("conflicting-rules", [rule, required]);
      for (const relationship of pair) conflict("forbidden-relationship", [rule, relationship]);
    } else if (pair.length === 0) gaps.push({ code: "required-relationship-missing", factId: rule.id });
  }
  const ambiguities = [...aliases].flatMap(([alias, ids]) => {
    const targetIds = [...new Set(ids)].sort(stableCompare);
    return targetIds.length > 1 ? [{ alias, targetIds }] : [];
  }).sort((a, b) => stableCompare(a.alias, b.alias));
  const payload = { domain: "archi-agent-knowledge/1" as const, sources: sources.sort((a, b) => stableCompare(a.id, b.id)),
    facts, gaps: sortedUnique(gaps), conflicts: sortedUnique(conflicts), ambiguities };
  if (canonical(payload).length > 64 * 1024 * 1024) throw new Error("knowledge-snapshot-limit");
  const digest = hash(payload);
  return freezeTree({ ...payload, id: `knowledge-${digest}`, digest });
}

/** Adapter of the validated five-file format, without rereading or changing any Markdown. */
export function knowledgeSnapshotFromPack(pack: KnowledgePack, sourceId = "knowledge-pack"): KnowledgeSnapshot {
  const { documentProvenance: _documentProvenance, ...records } = pack;
  const snapshot = createKnowledgeSnapshot([{ source: { id: sourceId, kind: "markdown-pack", scope: {
    systems: pack.documentProvenance ? "partial" : "complete", actors: pack.documentProvenance ? "partial" : "complete", relationships: pack.documentProvenance ? "partial" : "complete", aliases: pack.documentProvenance ? "partial" : "complete", rules: pack.documentProvenance ? "partial" : "complete"
  } }, records }]);
  if (!pack.documentProvenance) return snapshot;
  const payload = { ...snapshot, documentProvenance: pack.documentProvenance };
  const digest = hash({ digest: snapshot.digest, documentProvenance: pack.documentProvenance });
  return freezeTree({ ...payload, digest, id: `knowledge-${digest}` });
}

/** Only provenance relevant to locally selected elements; full unrelated knowledge stays local. */
export type SelectedKnowledgeContext = Pick<KnowledgeSnapshot, "id" | "digest" | "sources" | "gaps" | "conflicts" | "ambiguities" | "documentProvenance"> & {
  readonly provenance: readonly { readonly factId: string; readonly recordKey: string; readonly provenance: readonly KnowledgeProvenance[] }[];
};
export function selectKnowledgeContext(snapshot: KnowledgeSnapshot, selectedIds: readonly string[]): SelectedKnowledgeContext {
  if (snapshot.conflicts.length !== 0) throw new Error("knowledge-conflicts-unresolved");
  const selected = new Set(selectedIds);
  const facts = snapshot.facts.filter((fact) => fact.table === "systems" || fact.table === "actors" ? selected.has(fact.value.id) :
    fact.table === "aliases" ? selected.has(fact.value.targetId) : selected.has(fact.value.fromId) && selected.has(fact.value.toId));
  const factIds = new Set(facts.map((fact) => fact.id));
  const sourceIds = new Set(facts.flatMap((fact) => fact.provenance.map((entry) => entry.sourceId)));
  return freezeTree({ id: snapshot.id, digest: snapshot.digest, sources: snapshot.sources.filter((entry) => sourceIds.has(entry.id)),
    provenance: facts.map((fact) => ({ factId: fact.id, recordKey: identity(fact), provenance: fact.provenance })),
    gaps: snapshot.gaps.filter((gap) => gap.factId !== undefined ? factIds.has(gap.factId) : gap.sourceId !== undefined && sourceIds.has(gap.sourceId)),
    ...(snapshot.documentProvenance ? { documentProvenance: snapshot.documentProvenance.map((m) => {
      const entries = m.entries.filter((e) => e.candidate.table === "systems" || e.candidate.table === "actors" ? selected.has(e.candidate.row.id) :
        e.candidate.table === "aliases" ? selected.has(e.candidate.row.target_id) : selected.has(e.candidate.row.from_id) && selected.has(e.candidate.row.to_id));
      const sources = m.sources.filter((s) => entries.some((e) => e.evidence.some((v) => v.sourceId === s.sourceId)))
        .map(({ editorUri: _localEditorIdentity, ...source }) => source);
      return { ...m, entries, sources };
    }).filter((m) => m.entries.length) } : {}),
    conflicts: snapshot.conflicts,
    ambiguities: snapshot.ambiguities.filter((entry) => entry.targetIds.some((id) => selected.has(id))) });
}
