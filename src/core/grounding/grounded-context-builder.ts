import { parseFrontMatter, type FlowMetadata } from "../knowledge-pack/front-matter.js";
import type { KnowledgePackIndexes } from "../knowledge-pack/knowledge-pack-loader.js";
import { validateRelativePath } from "../knowledge-pack/knowledge-pack-source.js";
import type { KnowledgePack } from "../knowledge-pack/knowledge-pack.schema.js";
import { countUnicodeCharacters, knowledgePackLimits } from "../knowledge-pack/source-limits.js";
import { stableCompare } from "../util/ordering.js";
import {
  createValidationIssue,
  fromExternalIssue,
  hasErrors,
  isSafeDetailText,
  sortValidationIssues,
  validationIssueLimits,
  type ValidationIssue,
  type ValidationLocation
} from "../validation/validation-issue.js";
import { applyAmbiguitySelections, buildAmbiguityReport, packSourceReference, type AmbiguitySelections } from "./ambiguity-report.js";
import {
  compareFlowReferences,
  compareGroundedRelationships,
  compareGroundedRules,
  compareMatchKinds,
  computeContextDigest,
  groundedContextSchemaVersion,
  type AmbiguityReport,
  type ConfirmedNewParticipant,
  type FlowReference,
  type GroundedActor,
  type GroundedContext,
  type GroundedRelationship,
  type GroundedRule,
  type GroundedSystem,
  type GroundingBlocked,
  type GroundingMatchKind,
  type GroundingOutcome,
  type GroundingWarning
} from "./grounded-context.js";
import { parseGroundedContext } from "./grounded-context.schema.js";
import {
  normalizeReferenceText,
  ParticipantDictionary,
  type AmbiguousMention,
  type NewMarkerProblem,
  type ParticipantTarget
} from "./participant-resolver.js";

/**
 * Builds the minimal grounded context of one flow document against one loaded knowledge pack.
 *
 * The builder is deterministic and side-effect free. It never calls a model, never renders, never
 * reads files and never guesses: ambiguity needs an explicit valid selection, new participants need
 * the [NEW: Name] marker and an explicit confirmation, and unknown text is ignored. The context
 * contains only the referenced participants, the relationships between them and the rules that apply
 * to them.
 */

export interface FlowDocument {
  /** Logical relative file name used in issue locations; never an absolute path. */
  readonly file?: string;
  readonly metadata: FlowMetadata;
  readonly body: string;
  /** Document line number of the first body line. */
  readonly bodyStartLine: number;
}

export type FlowDocumentResult =
  | { readonly ok: true; readonly flow: FlowDocument }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export interface ParseFlowDocumentOptions {
  readonly file?: string;
}

function assertSafeFile(file: string | undefined): void {
  if (file !== undefined && !validateRelativePath(file).ok) {
    throw new Error("A flow file name must be a safe relative path.");
  }
}

/** Parses the restricted front matter of a flow document and maps its issues into the validation contract. */
export function parseFlowDocument(text: string, options: ParseFlowDocumentOptions = {}): FlowDocumentResult {
  assertSafeFile(options.file);
  const result = parseFrontMatter(text, options.file === undefined ? {} : { file: options.file });

  if (!result.ok || result.metadata === undefined) {
    const issues = result.issues.map((issue) => fromExternalIssue("front-matter", issue));
    return Object.freeze({ ok: false, issues: sortValidationIssues(issues).issues });
  }

  return Object.freeze({
    ok: true,
    flow: Object.freeze({
      ...(options.file === undefined ? {} : { file: options.file }),
      metadata: result.metadata,
      body: result.body,
      bodyStartLine: result.bodyStartLine
    })
  });
}

/** A successfully loaded pack with its indexes, as returned by the loader. */
export interface GroundingKnowledgePack {
  readonly pack: KnowledgePack;
  readonly indexes: KnowledgePackIndexes;
}

export interface GroundingRequest {
  readonly flow: FlowDocument;
  readonly knowledgePack: GroundingKnowledgePack;
  /** Explicit selections for ambiguous mentions. */
  readonly selections?: AmbiguitySelections;
  /** Names of [NEW: Name] participants the caller confirmed; compared in normalized form. */
  readonly confirmedNewParticipants?: readonly string[];
  readonly maxIssues?: number;
}

const markerProblemCodes = Object.freeze({
  malformed: "new-participant-malformed",
  empty: "new-participant-empty",
  "too-long": "new-participant-too-long",
  unsafe: "new-participant-unsafe"
} as const satisfies Record<NewMarkerProblem, string>);

const emptyReport: AmbiguityReport = Object.freeze({ entries: Object.freeze([]) });

interface Evidence {
  readonly target: ParticipantTarget;
  readonly matchKinds: Set<GroundingMatchKind>;
  readonly mentions: FlowReference[];
  selected: boolean;
}

function uniqueReferences(references: readonly FlowReference[]): readonly FlowReference[] {
  const sorted = [...references].sort(compareFlowReferences);
  return Object.freeze(
    sorted.filter((reference, index) => {
      const previous = sorted[index - 1];
      return previous === undefined || compareFlowReferences(previous, reference) !== 0;
    })
  );
}

function blocked(issues: readonly ValidationIssue[], report: AmbiguityReport, maxIssues: number): GroundingBlocked {
  const sorted = sortValidationIssues(issues, maxIssues);
  return Object.freeze({ status: "blocked", issues: sorted.issues, truncated: sorted.truncated, ambiguityReport: report });
}

function isWarning(issue: ValidationIssue): issue is GroundingWarning {
  return issue.severity === "warning";
}

export function buildGroundedContext(request: GroundingRequest): GroundingOutcome {
  const { flow } = request;
  const { pack, indexes } = request.knowledgePack;
  const maxIssues = request.maxIssues ?? validationIssueLimits.defaultMaxIssues;
  assertSafeFile(flow.file);
  const fileLocation: ValidationLocation = flow.file === undefined ? {} : { file: flow.file };
  const at = (reference: FlowReference): ValidationLocation => ({
    ...fileLocation,
    line: reference.line,
    column: reference.column,
    length: reference.length
  });
  const issues: ValidationIssue[] = [];

  if (countUnicodeCharacters(flow.body) > knowledgePackLimits.maxFlowSourceChars) {
    issues.push(
      createValidationIssue("flow-too-large", {
        location: fileLocation,
        details: { limit: knowledgePackLimits.maxFlowSourceChars }
      })
    );
    return blocked(issues, emptyReport, maxIssues);
  }

  const dictionary = ParticipantDictionary.fromPack(pack);
  const scan = dictionary.scanFlow(flow.body, flow.bodyStartLine);

  for (const line of scan.controlCharacterLines) {
    issues.push(createValidationIssue("flow-control-character", { location: { ...fileLocation, line } }));
  }

  for (const overlap of scan.overlaps) {
    issues.push(createValidationIssue("overlapping-reference", { location: at(overlap) }));
  }

  const evidence = new Map<string, Evidence>();
  const record = (target: ParticipantTarget, kinds: readonly GroundingMatchKind[], mentions: readonly FlowReference[], selected: boolean) => {
    const item = evidence.get(target.id) ?? { target, matchKinds: new Set<GroundingMatchKind>(), mentions: [], selected: false };
    kinds.forEach((kind) => item.matchKinds.add(kind));
    item.mentions.push(...mentions);
    item.selected = item.selected || selected;
    evidence.set(target.id, item);
  };

  const ambiguous: AmbiguousMention[] = [];

  for (const mention of scan.mentions) {
    if (mention.status === "resolved") {
      record(mention.target, [mention.matchKind], [mention.location], false);
    } else {
      ambiguous.push(mention);
    }
  }

  const selection = applyAmbiguitySelections(buildAmbiguityReport(ambiguous, pack), request.selections ?? {}, flow.file);
  issues.push(...selection.issues);

  for (const entry of selection.report.entries) {
    const target = entry.selectedId === null ? undefined : dictionary.target(entry.selectedId);

    if (target !== undefined) {
      record(target, entry.matchKinds, entry.locations, true);
    }
  }

  const newParticipants = new Map<string, { key: string; displayName: string; mentions: FlowReference[] }>();

  for (const marker of scan.newMarkers) {
    if (marker.status !== "valid") {
      issues.push(createValidationIssue(markerProblemCodes[marker.status], { location: at(marker.location) }));
      continue;
    }

    if (dictionary.impersonatesKnown(marker.displayName)) {
      issues.push(createValidationIssue("new-participant-conflict", { location: at(marker.location) }));
      continue;
    }

    const existing = newParticipants.get(marker.key);

    if (existing === undefined) {
      newParticipants.set(marker.key, { key: marker.key, displayName: marker.displayName, mentions: [marker.location] });
    } else {
      existing.mentions.push(marker.location);
    }
  }

  const confirmations = new Set(
    (request.confirmedNewParticipants ?? [])
      .filter((name): name is string => typeof name === "string")
      .map((name) => normalizeReferenceText(name))
      .filter((key) => key !== "")
  );
  const confirmedNew: ConfirmedNewParticipant[] = [];

  for (const participant of [...newParticipants.values()].sort((left, right) => stableCompare(left.key, right.key))) {
    const mentions = uniqueReferences(participant.mentions);
    const [first] = mentions;

    if (!confirmations.has(participant.key)) {
      issues.push(
        createValidationIssue("new-participant-unconfirmed", {
          location: first === undefined ? fileLocation : at(first),
          details: { newParticipant: participant.key }
        })
      );
      continue;
    }

    confirmedNew.push(
      Object.freeze({
        participantType: "new",
        key: participant.key,
        displayName: participant.displayName,
        confirmed: true,
        mentions
      })
    );
  }

  for (const key of [...confirmations].sort(stableCompare)) {
    if (!newParticipants.has(key)) {
      issues.push(
        createValidationIssue("unused-new-participant-confirmation", {
          location: fileLocation,
          ...(isSafeDetailText(key) ? { details: { newParticipant: key } } : {})
        })
      );
    }
  }

  // A skipped line may have named participants, so "no participants" is reported only when every line was scanned.
  if (
    evidence.size === 0 &&
    newParticipants.size === 0 &&
    selection.report.entries.length === 0 &&
    scan.controlCharacterLines.length === 0
  ) {
    issues.push(createValidationIssue("no-participants", { location: fileLocation }));
  }

  if (hasErrors(issues)) {
    return blocked(issues, selection.report, maxIssues);
  }

  const actors: GroundedActor[] = [];
  const systems: GroundedSystem[] = [];

  for (const id of [...evidence.keys()].sort(stableCompare)) {
    const item = evidence.get(id);

    if (item === undefined) {
      continue;
    }

    const common = {
      id,
      matchKinds: Object.freeze([...item.matchKinds].sort(compareMatchKinds)),
      resolution: item.selected ? ("selected" as const) : ("direct" as const),
      mentions: uniqueReferences(item.mentions)
    };

    if (item.target.participantType === "system") {
      const system = indexes.elements.byId(id);

      if (system === undefined) {
        throw new Error("A resolved system is missing from the element index.");
      }

      systems.push(
        Object.freeze({
          participantType: "system",
          ...common,
          canonicalName: system.canonicalName,
          systemKind: system.kind,
          description: system.description,
          source: packSourceReference(system.location)
        })
      );
    } else {
      const actor = indexes.actors.byId(id);

      if (actor === undefined) {
        throw new Error("A resolved actor is missing from the actor index.");
      }

      actors.push(
        Object.freeze({
          participantType: "actor",
          ...common,
          canonicalName: actor.canonicalName,
          actorKind: actor.kind,
          description: actor.description,
          source: packSourceReference(actor.location)
        })
      );
    }
  }

  const selectedIds = new Set(evidence.keys());
  const relationships: GroundedRelationship[] = indexes.relationships
    .all()
    .filter((relationship) => selectedIds.has(relationship.fromId) && selectedIds.has(relationship.toId))
    .map((relationship) =>
      Object.freeze({
        fromId: relationship.fromId,
        toId: relationship.toId,
        interfaceType: relationship.interfaceType,
        interfaceName: relationship.interfaceName ?? null,
        mode: relationship.mode,
        purpose: relationship.purpose,
        source: packSourceReference(relationship.location)
      })
    )
    .sort(compareGroundedRelationships);
  const rules: GroundedRule[] = indexes.rules
    .all()
    .filter((rule) => selectedIds.has(rule.fromId) && selectedIds.has(rule.toId))
    .map((rule) =>
      Object.freeze({
        rule: rule.rule,
        fromId: rule.fromId,
        toId: rule.toId,
        reason: rule.reason,
        source: packSourceReference(rule.location)
      })
    )
    .sort(compareGroundedRules);

  const context: GroundedContext = Object.freeze({
    schemaVersion: groundedContextSchemaVersion,
    metadata: Object.freeze({
      diagramName: flow.metadata.diagramName,
      flowName: flow.metadata.flowName,
      author: flow.metadata.author,
      language: flow.metadata.language
    }),
    actors: Object.freeze(actors),
    systems: Object.freeze(systems),
    newParticipants: Object.freeze(confirmedNew),
    relationships: Object.freeze(relationships),
    rules: Object.freeze(rules)
  });

  const checked = parseGroundedContext(context, pack);

  if (!checked.ok) {
    issues.push(
      createValidationIssue("invalid-grounded-context", {
        details: { problems: checked.problems.slice(0, validationIssueLimits.maxDetailListItems) }
      })
    );
    return blocked(issues, selection.report, maxIssues);
  }

  return Object.freeze({
    status: "grounded",
    context,
    digest: computeContextDigest(context),
    warnings: Object.freeze(sortValidationIssues(issues, maxIssues).issues.filter(isWarning)),
    ambiguityReport: selection.report
  });
}
