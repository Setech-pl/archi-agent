import { knowledgePackFileNames, type KnowledgePackFileName } from "../knowledge-pack/knowledge-pack-source.js";
import type { KnowledgePack, SourceLocation } from "../knowledge-pack/knowledge-pack.schema.js";
import { stableCompare } from "../util/ordering.js";
import { createValidationIssue, isSafeDetailText, type ValidationIssue } from "../validation/validation-issue.js";
import {
  compareFlowReferences,
  compareMatchKinds,
  type AmbiguityCandidate,
  type AmbiguityEntry,
  type AmbiguityReport,
  type FlowReference,
  type GroundingMatchKind,
  type PackSourceReference
} from "./grounded-context.js";
import { normalizeReferenceText, type AmbiguousMention } from "./participant-resolver.js";

/**
 * Deterministic report of ambiguous mentions. Entries are grouped by normalized mention and
 * candidate set, sorted by mention; candidates are sorted by identifier. The report carries only
 * normalized pack terms, positions, identifiers, canonical names and pack source references, never
 * surrounding flow text.
 *
 * A selection maps a mention to one identifier. It is valid only if the identifier is one of the
 * reported candidates; nothing is ever chosen without a valid explicit selection.
 */

/** Caller-supplied selections: mention (any spelling; it is normalized) to a candidate identifier. */
export type AmbiguitySelections = Readonly<Record<string, string>>;

export interface AmbiguitySelectionResult {
  readonly report: AmbiguityReport;
  readonly issues: readonly ValidationIssue[];
}

const maxDetailCandidates = 50;

export function packSourceReference(location: SourceLocation): PackSourceReference {
  if (!(knowledgePackFileNames as readonly string[]).includes(location.file)) {
    throw new Error("A pack record must come from one of the five pack files.");
  }

  return Object.freeze({ file: location.file as KnowledgePackFileName, line: location.line });
}

function candidateCatalog(pack: KnowledgePack): ReadonlyMap<string, AmbiguityCandidate> {
  const catalog = new Map<string, AmbiguityCandidate>();

  for (const system of pack.systems) {
    catalog.set(
      system.id,
      Object.freeze({
        id: system.id,
        participantType: "system",
        elementKind: system.kind,
        canonicalName: system.canonicalName,
        source: packSourceReference(system.location)
      })
    );
  }

  for (const actor of pack.actors) {
    catalog.set(
      actor.id,
      Object.freeze({
        id: actor.id,
        participantType: "actor",
        elementKind: actor.kind,
        canonicalName: actor.canonicalName,
        source: packSourceReference(actor.location)
      })
    );
  }

  return catalog;
}

function candidateIds(entry: AmbiguityEntry): string {
  return entry.candidates.map((candidate) => candidate.id).join(" ");
}

function compareEntries(left: AmbiguityEntry, right: AmbiguityEntry): number {
  return stableCompare(left.mention, right.mention) || stableCompare(candidateIds(left), candidateIds(right));
}

export function buildAmbiguityReport(mentions: readonly AmbiguousMention[], pack: KnowledgePack): AmbiguityReport {
  const catalog = candidateCatalog(pack);
  const groups = new Map<
    string,
    { mention: string; ids: readonly string[]; kinds: Set<GroundingMatchKind>; locations: FlowReference[] }
  >();

  for (const mention of mentions) {
    const ids = mention.candidates.map((candidate) => candidate.id).sort(stableCompare);
    const key = JSON.stringify([mention.mention, ids]);
    const group = groups.get(key) ?? { mention: mention.mention, ids, kinds: new Set<GroundingMatchKind>(), locations: [] };
    group.kinds.add(mention.matchKind);
    group.locations.push(mention.location);
    groups.set(key, group);
  }

  const entries = [...groups.values()].map((group): AmbiguityEntry => {
    const candidates = group.ids.map((id) => {
      const candidate = catalog.get(id);

      if (candidate === undefined) {
        throw new Error("An ambiguity candidate is not declared in the pack.");
      }

      return candidate;
    });

    return Object.freeze({
      mention: group.mention,
      matchKinds: Object.freeze([...group.kinds].sort(compareMatchKinds)),
      locations: Object.freeze([...group.locations].sort(compareFlowReferences)),
      candidates: Object.freeze(candidates),
      selectedId: null
    });
  });

  return Object.freeze({ entries: Object.freeze(entries.sort(compareEntries)) });
}

/**
 * Applies explicit selections. Each entry needs exactly one selection whose identifier is a candidate;
 * a missing selection blocks with ambiguous-reference, an invalid or conflicting one with
 * invalid-ambiguity-selection. Selections for mentions without an entry produce a warning.
 */
export function applyAmbiguitySelections(
  report: AmbiguityReport,
  selections: AmbiguitySelections,
  file?: string
): AmbiguitySelectionResult {
  const chosen = new Map<string, Set<string>>();

  for (const [mention, id] of Object.entries(selections)) {
    if (typeof mention !== "string" || typeof id !== "string") {
      continue;
    }

    const key = normalizeReferenceText(mention);
    const ids = chosen.get(key) ?? new Set<string>();
    ids.add(id);
    chosen.set(key, ids);
  }

  const issues: ValidationIssue[] = [];
  const fileLocation = file === undefined ? {} : { file };
  const used = new Set<string>();

  const entries = report.entries.map((entry): AmbiguityEntry => {
    const first = entry.locations[0];
    const location = first === undefined ? fileLocation : { ...fileLocation, ...first };
    const details = {
      mention: entry.mention,
      candidates: entry.candidates.slice(0, maxDetailCandidates).map((candidate) => candidate.id)
    };
    const ids = chosen.get(entry.mention);

    if (ids === undefined) {
      issues.push(createValidationIssue("ambiguous-reference", { location, details }));
      return entry;
    }

    used.add(entry.mention);
    const [selected] = [...ids];

    if (ids.size !== 1 || selected === undefined || !entry.candidates.some((candidate) => candidate.id === selected)) {
      issues.push(createValidationIssue("invalid-ambiguity-selection", { location, details }));
      return entry;
    }

    return Object.freeze({ ...entry, selectedId: selected });
  });

  for (const key of [...chosen.keys()].sort(stableCompare)) {
    if (!used.has(key)) {
      issues.push(
        createValidationIssue("unused-ambiguity-selection", {
          location: fileLocation,
          ...(isSafeDetailText(key) ? { details: { mention: key } } : {})
        })
      );
    }
  }

  return Object.freeze({
    report: Object.freeze({ entries: Object.freeze(entries) }),
    issues: Object.freeze(issues)
  });
}
