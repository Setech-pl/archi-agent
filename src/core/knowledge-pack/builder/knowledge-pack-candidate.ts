import { z } from "zod";
import {
  knowledgePackTables,
  type ActorRowInput,
  type AliasRowInput,
  type KnowledgePackTableKind,
  type RelationshipRowInput,
  type RuleRowInput,
  type SystemRowInput
} from "../knowledge-pack.schema.js";
import { containsControlCharacter, countUnicodeCharacters, knowledgePackLimits } from "../source-limits.js";

/**
 * Candidates for a knowledge pack extracted from source material, and the reviewed draft built from
 * them. A candidate proposes one row of one of the five pack tables in the exact column format of
 * that table and carries evidence that is kept for review only; evidence never reaches the rendered
 * pack files.
 *
 * Values of a proposed row are untrusted text. They are validated by the regular pack schemas and
 * the loader after rendering, not by rules repeated here. The schemas in this module check only the
 * candidate envelope: table, basis, evidence and review decision.
 */

/** Table kinds in the fixed order of the five pack files. */
export const knowledgePackTableKinds = Object.freeze([
  "systems",
  "actors",
  "relationships",
  "aliases",
  "rules"
] as const satisfies readonly KnowledgePackTableKind[]);

/**
 * explicit: the proposed row is stated in the source.
 * inferred: the proposed row is derived from the source and needs an explicit acceptance.
 */
export const evidenceBases = ["explicit", "inferred"] as const;
export type EvidenceBasis = (typeof evidenceBases)[number];

/**
 * pending: not reviewed; blocks the build with a deterministic issue, regardless of basis.
 * accepted: included in the pack. rejected: left out of the pack.
 *
 * basis (explicit/inferred) never decides inclusion by itself; it is presentation and review
 * information only. The LLM proposes candidates, it does not decide what becomes part of the
 * trusted architecture catalog — only an explicit accepted/rejected decision does.
 */
export const candidateDecisions = ["pending", "accepted", "rejected"] as const;
export type CandidateDecision = (typeof candidateDecisions)[number];

export const knowledgePackBuilderLimits = Object.freeze({
  maxDraftEntries: knowledgePackLimits.maxTableRows * knowledgePackTableKinds.length,
  maxEvidencePerCandidate: 16,
  maxSourceIdChars: knowledgePackLimits.maxRelativePathChars,
  maxExcerptChars: knowledgePackLimits.maxCellChars
} as const);

/** Optional line range inside the source; lines start at 1. */
export interface CandidateEvidenceLocation {
  readonly startLine: number;
  readonly endLine?: number;
}

export interface CandidateEvidence {
  /** Identifier of the source document within the source bundle, never an absolute path. */
  readonly sourceId: string;
  /** Short quotation from the source supporting the candidate. */
  readonly excerpt: string;
  readonly location?: CandidateEvidenceLocation;
}

/** Proposed rows use the column names and string values of the pack tables. */
export interface KnowledgePackRowByTable {
  readonly systems: SystemRowInput;
  readonly actors: ActorRowInput;
  readonly relationships: RelationshipRowInput;
  readonly aliases: AliasRowInput;
  readonly rules: RuleRowInput;
}

export type KnowledgePackRows = {
  readonly [K in KnowledgePackTableKind]: readonly KnowledgePackRowByTable[K][];
};

interface CandidateFor<K extends KnowledgePackTableKind> {
  readonly table: K;
  readonly row: KnowledgePackRowByTable[K];
  readonly basis: EvidenceBasis;
  /** At least one piece of evidence. */
  readonly evidence: readonly CandidateEvidence[];
}

export type KnowledgePackCandidate = { readonly [K in KnowledgePackTableKind]: CandidateFor<K> }[KnowledgePackTableKind];

export interface KnowledgePackDraftEntry {
  readonly candidate: KnowledgePackCandidate;
  readonly decision: CandidateDecision;
}

export interface KnowledgePackDraft {
  readonly entries: readonly KnowledgePackDraftEntry[];
}

const nonBlankWithin = (limit: number) =>
  z.string().refine((value) => value.trim().length > 0 && countUnicodeCharacters(value) <= limit);

export const candidateEvidenceSchema = z.strictObject({
  sourceId: nonBlankWithin(knowledgePackBuilderLimits.maxSourceIdChars).refine(
    (value) => !containsControlCharacter(value)
  ),
  excerpt: nonBlankWithin(knowledgePackBuilderLimits.maxExcerptChars),
  location: z
    .strictObject({
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive().optional()
    })
    .refine((location) => location.endLine === undefined || location.endLine >= location.startLine)
    .optional()
});

function rowSchema(kind: KnowledgePackTableKind) {
  const shape: Record<string, z.ZodString> = {};

  for (const column of knowledgePackTables[kind].columns) {
    shape[column] = z.string();
  }

  return z.strictObject(shape);
}

function candidateSchemaFor<K extends KnowledgePackTableKind>(kind: K) {
  return z.strictObject({
    table: z.literal(kind),
    row: rowSchema(kind),
    basis: z.enum(evidenceBases),
    evidence: z.array(candidateEvidenceSchema).min(1).max(knowledgePackBuilderLimits.maxEvidencePerCandidate)
  });
}

/** Envelope check of a candidate: known table, exactly the table columns as strings, basis, evidence. */
export const knowledgePackCandidateSchema = z.discriminatedUnion("table", [
  candidateSchemaFor("systems"),
  candidateSchemaFor("actors"),
  candidateSchemaFor("relationships"),
  candidateSchemaFor("aliases"),
  candidateSchemaFor("rules")
]);

export const knowledgePackDraftEntrySchema = z.strictObject({
  candidate: knowledgePackCandidateSchema,
  decision: z.enum(candidateDecisions)
});

/**
 * Whether a reviewed candidate becomes part of the pack. Only an explicit "accepted" decision
 * includes a candidate, regardless of basis; "pending" never includes it silently — the builder
 * reports it as a blocking issue instead (see `checkEntries` in `knowledge-pack-builder.ts`).
 */
export function isIncludedInPack(entry: KnowledgePackDraftEntry): boolean {
  return entry.decision === "accepted";
}
