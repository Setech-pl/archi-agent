import { normalizeGroundingReference } from "../../grounding/reference-key.js";
import { stableCompare } from "../../util/ordering.js";
import { InMemoryKnowledgePackSource } from "../in-memory-knowledge-pack-source.js";
import {
  loadKnowledgePack,
  type KnowledgePackIndexes,
  type KnowledgePackLoadIssue,
  type KnowledgePackLoadIssueCode,
  type KnowledgePackLoadSeverity
} from "../knowledge-pack-loader.js";
import type { CancellationSignal } from "../knowledge-pack-source.js";
import { knowledgePackTables, type KnowledgePack, type KnowledgePackTableKind } from "../knowledge-pack.schema.js";
import { containsForbiddenMarkup } from "../markdown-table-parser.js";
import { safeMessageFor, type KnowledgePackErrorCode } from "../source-errors.js";
import { containsControlCharacter, knowledgePackLimits } from "../source-limits.js";
import {
  isIncludedInPack,
  knowledgePackBuilderLimits,
  knowledgePackDraftEntrySchema,
  knowledgePackTableKinds,
  type KnowledgePackDraft,
  type KnowledgePackDraftEntry,
  type KnowledgePackRows
} from "./knowledge-pack-candidate.js";
import { layoutKnowledgePack, type KnowledgePackDocument, type KnowledgePackTableLayout } from "./knowledge-pack-renderer.js";

/**
 * Builds the five pack documents from a reviewed draft without touching any file system:
 *
 * 1. checks the candidate envelopes and that every candidate has an explicit accepted or rejected
 *    review decision — a pending decision blocks the build, regardless of basis, because the LLM
 *    proposes candidates but never decides what becomes part of the trusted architecture catalog;
 * 2. checks that included values can be rendered and that canonical names and aliases do not
 *    collide after the grounding normalization;
 * 3. renders the documents and loads them with the regular loader through an in-memory source, so
 *    record, cross-file and rule semantics are exactly those of the loader;
 * 4. compares the loaded records with the included rows, so nothing is silently changed on the way.
 *
 * Issues identify the draft entry, table and field; they never contain values or evidence.
 */

export const knowledgePackBuildCodes = [
  "invalid-candidate",
  "invalid-evidence",
  "candidate-decision-pending",
  "canonical-name-collision",
  "alias-collision",
  "round-trip-mismatch"
] as const;

export type KnowledgePackBuildCode = (typeof knowledgePackBuildCodes)[number];
export type KnowledgePackBuildIssueCode = KnowledgePackBuildCode | KnowledgePackLoadIssueCode;

export interface KnowledgePackBuildIssue {
  readonly severity: KnowledgePackLoadSeverity;
  readonly code: KnowledgePackBuildIssueCode;
  readonly message: string;
  /** Index of the draft entry the issue belongs to. */
  readonly entry?: number;
  readonly table?: KnowledgePackTableKind;
  /** Schema path or column name; never a value. */
  readonly field?: string;
  readonly limit?: number;
}

export type KnowledgePackBuildResult =
  | {
      readonly ok: true;
      readonly documents: readonly KnowledgePackDocument[];
      readonly pack: KnowledgePack;
      readonly indexes: KnowledgePackIndexes;
      readonly warnings: readonly KnowledgePackBuildIssue[];
    }
  | {
      readonly ok: false;
      readonly issues: readonly KnowledgePackBuildIssue[];
      readonly truncated: boolean;
    };

export interface BuildKnowledgePackOptions {
  readonly signal?: CancellationSignal;
  readonly maxIssues?: number;
}

const buildMessages: Readonly<Record<KnowledgePackBuildCode, string>> = Object.freeze({
  "invalid-candidate": "The candidate or its review decision does not have the expected structure.",
  "invalid-evidence": "The candidate evidence is missing or malformed.",
  "candidate-decision-pending":
    "A candidate must be explicitly accepted or rejected before the build can proceed; basis alone never decides inclusion.",
  "canonical-name-collision": "Two systems or actors have canonical names that are equal after normalization.",
  "alias-collision": "More than one accepted alias record resolves to the same normalized alias.",
  "round-trip-mismatch": "The rendered pack does not load back to the same value."
});

type MutableIssue = {
  severity: KnowledgePackLoadSeverity;
  code: KnowledgePackBuildIssueCode;
  message: string;
  entry?: number;
  table?: KnowledgePackTableKind;
  field?: string;
  limit?: number;
};

interface IssueDetails {
  readonly entry?: number | undefined;
  readonly table?: KnowledgePackTableKind | undefined;
  readonly field?: string | undefined;
  readonly limit?: number | undefined;
}

function buildIssue(
  severity: KnowledgePackLoadSeverity,
  code: KnowledgePackBuildIssueCode,
  message: string,
  details: IssueDetails = {}
): KnowledgePackBuildIssue {
  const result: MutableIssue = { severity, code, message };

  if (details.entry !== undefined) {
    result.entry = details.entry;
  }

  if (details.table !== undefined) {
    result.table = details.table;
  }

  if (details.field !== undefined) {
    result.field = details.field;
  }

  if (details.limit !== undefined) {
    result.limit = details.limit;
  }

  return Object.freeze(result);
}

function builderIssue(code: KnowledgePackBuildCode, details: IssueDetails = {}): KnowledgePackBuildIssue {
  return buildIssue("error", code, buildMessages[code], details);
}

function packIssue(code: KnowledgePackErrorCode, details: IssueDetails = {}): KnowledgePackBuildIssue {
  return buildIssue("error", code, safeMessageFor(code), details);
}

const tableRank = (table: KnowledgePackTableKind | undefined): number =>
  table === undefined ? -1 : knowledgePackTableKinds.indexOf(table);

/** Order: entry (issues without entry first), table order, field, code, limit, severity. */
export function compareBuildIssues(left: KnowledgePackBuildIssue, right: KnowledgePackBuildIssue): number {
  return (
    (left.entry ?? -1) - (right.entry ?? -1) ||
    tableRank(left.table) - tableRank(right.table) ||
    stableCompare(left.field ?? "", right.field ?? "") ||
    stableCompare(left.code, right.code) ||
    (left.limit ?? 0) - (right.limit ?? 0) ||
    stableCompare(left.severity, right.severity)
  );
}

function sortAndCap(issues: readonly KnowledgePackBuildIssue[], maxIssues: number) {
  const sorted = [...issues].sort(compareBuildIssues);

  if (sorted.length <= maxIssues) {
    return { issues: Object.freeze(sorted), truncated: false };
  }

  return {
    issues: Object.freeze([...sorted.slice(0, maxIssues), packIssue("too-many-issues", { limit: maxIssues })]),
    truncated: true
  };
}

function failure(issues: readonly KnowledgePackBuildIssue[], maxIssues: number): KnowledgePackBuildResult {
  const capped = sortAndCap(issues, maxIssues);
  return Object.freeze({ ok: false, issues: capped.issues, truncated: capped.truncated });
}

interface IncludedRow {
  readonly entry: number;
  readonly row: Readonly<Record<string, string>>;
}

type IncludedRows = { readonly [K in KnowledgePackTableKind]: IncludedRow[] };

function schemaPath(path: readonly PropertyKey[]): string {
  return path.map((part) => (typeof part === "symbol" ? "" : String(part))).join(".");
}

/** Envelope, decision and representability checks; collects the rows included in the pack. */
function checkEntries(entries: readonly unknown[], issues: KnowledgePackBuildIssue[]): IncludedRows {
  const included: IncludedRows = { systems: [], actors: [], relationships: [], aliases: [], rules: [] };

  entries.forEach((raw, entry) => {
    const parsed = knowledgePackDraftEntrySchema.safeParse(raw);

    if (!parsed.success) {
      const reported = new Set<string>();

      for (const found of parsed.error.issues) {
        const field = schemaPath(found.path);
        const code = found.path[0] === "candidate" && found.path[1] === "evidence" ? "invalid-evidence" : "invalid-candidate";
        const key = code + " " + field;

        if (!reported.has(key)) {
          reported.add(key);
          issues.push(builderIssue(code, { entry, field }));
        }
      }

      return;
    }

    const draftEntry = parsed.data as unknown as KnowledgePackDraftEntry;
    const { table } = draftEntry.candidate;

    if (draftEntry.decision === "pending") {
      issues.push(builderIssue("candidate-decision-pending", { entry, table, field: "decision" }));
      return;
    }

    if (!isIncludedInPack(draftEntry)) {
      return;
    }

    const row = draftEntry.candidate.row as unknown as Readonly<Record<string, string>>;
    let renderable = true;

    for (const column of knowledgePackTables[table].columns) {
      const value = row[column] ?? "";

      if (containsControlCharacter(value)) {
        issues.push(packIssue("control-character", { entry, table, field: column }));
        renderable = false;
      } else if (containsForbiddenMarkup(value)) {
        issues.push(packIssue("forbidden-markdown", { entry, table, field: column }));
        renderable = false;
      }
    }

    if (renderable) {
      included[table].push({ entry, row });
    }
  });

  return included;
}

/**
 * Collisions a generated pack must not introduce: equal normalized canonical names among systems
 * and actors, and more than one target for one normalized alias. Lookup uses
 * `normalizeGroundingReference`, so the result cannot depend on letter case, hyphens, underscores
 * or spacing: one normalized alias must resolve to exactly one target, whatever its exact spelling
 * and whether the differing rows name the same target or different ones. This is a stricter,
 * builder-only boundary than the loader's own contract, which still accepts the same exact alias
 * spelling declared for several targets as deliberate, hand-authored ambiguity — that stays allowed
 * for hand-written packs loaded directly, just not for what this builder produces. An exact
 * repetition of the same alias row (same spelling, same target) is left to the loader as a
 * duplicate record.
 */
function collisionIssues(included: IncludedRows): KnowledgePackBuildIssue[] {
  const issues: KnowledgePackBuildIssue[] = [];
  const named = [
    ...included.systems.map((item) => ({ ...item, table: "systems" as const })),
    ...included.actors.map((item) => ({ ...item, table: "actors" as const }))
  ].sort((left, right) => left.entry - right.entry);
  const names = new Map<string, string>();

  for (const item of named) {
    const name = item.row.canonical_name ?? "";
    const key = normalizeGroundingReference(name);
    const seenId = names.get(key);

    if (key === "") {
      continue;
    }

    if (seenId === undefined) {
      names.set(key, item.row.id ?? "");
    } else if (seenId !== item.row.id) {
      issues.push(builderIssue("canonical-name-collision", { entry: item.entry, table: item.table, field: "canonical_name" }));
    }
  }

  const aliases = new Map<string, { readonly alias: string; readonly targetId: string }>();

  for (const item of [...included.aliases].sort((left, right) => left.entry - right.entry)) {
    const alias = item.row.alias ?? "";
    const targetId = item.row.target_id ?? "";
    const key = normalizeGroundingReference(alias);

    if (key === "") {
      continue;
    }

    const seen = aliases.get(key);

    if (seen === undefined) {
      aliases.set(key, { alias, targetId });
    } else if (seen.alias !== alias || seen.targetId !== targetId) {
      issues.push(builderIssue("alias-collision", { entry: item.entry, table: "aliases", field: "alias" }));
    }
  }

  return issues;
}

function toRows(included: IncludedRows): KnowledgePackRows {
  const rows = (kind: KnowledgePackTableKind) => included[kind].map((item) => item.row);
  return {
    systems: rows("systems") as unknown as KnowledgePackRows["systems"],
    actors: rows("actors") as unknown as KnowledgePackRows["actors"],
    relationships: rows("relationships") as unknown as KnowledgePackRows["relationships"],
    aliases: rows("aliases") as unknown as KnowledgePackRows["aliases"],
    rules: rows("rules") as unknown as KnowledgePackRows["rules"]
  };
}

function entryAt(layout: KnowledgePackTableLayout, included: IncludedRows, line: number | undefined): number | undefined {
  if (line === undefined) {
    return undefined;
  }

  const inputIndex = layout.rowOrder[line - layout.firstDataLine];
  return inputIndex === undefined ? undefined : included[layout.kind][inputIndex]?.entry;
}

function fromLoadIssue(
  found: KnowledgePackLoadIssue,
  layouts: readonly KnowledgePackTableLayout[],
  included: IncludedRows
): KnowledgePackBuildIssue {
  const layout = layouts.find((candidate) => candidate.file === found.file);
  return buildIssue(found.severity, found.code, found.message, {
    entry: layout === undefined ? undefined : entryAt(layout, included, found.line),
    table: layout?.kind,
    field: found.column,
    limit: found.limit
  });
}

/** Loaded records in the column format of their table, in rendered order. */
function loadedRows(pack: KnowledgePack): { readonly [K in KnowledgePackTableKind]: readonly Readonly<Record<string, string>>[] } {
  return {
    systems: pack.systems.map((record) => ({
      id: record.id,
      canonical_name: record.canonicalName,
      kind: record.kind,
      description: record.description
    })),
    actors: pack.actors.map((record) => ({
      id: record.id,
      canonical_name: record.canonicalName,
      kind: record.kind,
      description: record.description
    })),
    relationships: pack.relationships.map((record) => ({
      from_id: record.fromId,
      to_id: record.toId,
      interface_type: record.interfaceType,
      interface_name: record.interfaceName ?? "",
      mode: record.mode,
      purpose: record.purpose
    })),
    aliases: pack.aliases.map((record) => ({ alias: record.alias, target_id: record.targetId })),
    rules: pack.rules.map((record) => ({
      rule: record.rule,
      from_id: record.fromId,
      to_id: record.toId,
      reason: record.reason
    }))
  };
}

function roundTripIssues(
  pack: KnowledgePack,
  layouts: readonly KnowledgePackTableLayout[],
  included: IncludedRows
): KnowledgePackBuildIssue[] {
  const issues: KnowledgePackBuildIssue[] = [];
  const loaded = loadedRows(pack);

  for (const layout of layouts) {
    const records = loaded[layout.kind];

    if (records.length !== layout.rowOrder.length) {
      issues.push(builderIssue("round-trip-mismatch", { table: layout.kind }));
      continue;
    }

    layout.rowOrder.forEach((inputIndex, position) => {
      const item = included[layout.kind][inputIndex]!;

      for (const column of knowledgePackTables[layout.kind].columns) {
        if (records[position]![column] !== item.row[column]) {
          issues.push(builderIssue("round-trip-mismatch", { entry: item.entry, table: layout.kind, field: column }));
        }
      }
    });
  }

  return issues;
}

export async function buildKnowledgePack(
  draft: KnowledgePackDraft,
  options: BuildKnowledgePackOptions = {}
): Promise<KnowledgePackBuildResult> {
  const maxIssues = options.maxIssues ?? knowledgePackLimits.maxReportedIssues;
  const entries: unknown = (draft as { readonly entries?: unknown } | null | undefined)?.entries;

  if (!Array.isArray(entries)) {
    return failure([builderIssue("invalid-candidate", { field: "entries" })], maxIssues);
  }

  if (entries.length > knowledgePackBuilderLimits.maxDraftEntries) {
    return failure([packIssue("limit-exceeded", { field: "entries", limit: knowledgePackBuilderLimits.maxDraftEntries })], maxIssues);
  }

  const issues: KnowledgePackBuildIssue[] = [];
  const included = checkEntries(entries, issues);

  if (issues.length > 0) {
    return failure(issues, maxIssues);
  }

  issues.push(...collisionIssues(included));
  const layouts = layoutKnowledgePack(toRows(included));
  const source = new InMemoryKnowledgePackSource(layouts.map((layout) => [layout.file, layout.text] as const));
  const loaded = await loadKnowledgePack(source, {
    maxIssues,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });

  if (!loaded.ok) {
    issues.push(...loaded.issues.map((found) => fromLoadIssue(found, layouts, included)));
    return failure(issues, maxIssues);
  }

  issues.push(...roundTripIssues(loaded.pack, layouts, included));

  if (issues.length > 0) {
    return failure(issues, maxIssues);
  }

  return Object.freeze({
    ok: true,
    documents: Object.freeze(layouts.map((layout) => Object.freeze({ file: layout.file, text: layout.text }))),
    pack: loaded.pack,
    indexes: loaded.indexes,
    warnings: sortAndCap(
      loaded.warnings.map((found) => fromLoadIssue(found, layouts, included)),
      maxIssues
    ).issues
  });
}
