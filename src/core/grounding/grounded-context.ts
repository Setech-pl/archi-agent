import type { FlowLanguage } from "../knowledge-pack/front-matter.js";
import type { KnowledgePackFileName } from "../knowledge-pack/knowledge-pack-source.js";
import type {
  ActorKind,
  InteractionMode,
  InterfaceType,
  RuleType,
  SystemKind
} from "../knowledge-pack/knowledge-pack.schema.js";
import { stableCompare } from "../util/ordering.js";
import { stableDigest, type CanonicalValue } from "../util/stable-digest.js";
import type { ValidationIssue } from "../validation/validation-issue.js";

/**
 * Read-only model of a grounded context: the minimal, deterministic slice of a knowledge pack that a
 * flow document refers to. Known participants are identified by knowledge-pack identifiers and carry
 * the canonical names of the pack; confirmed new participants have no knowledge-pack identifier.
 */

export const groundedContextSchemaVersion = 1 as const;

/** Resolution precedence, highest first. */
export const groundingMatchKinds = [
  "exact-id",
  "exact-canonical",
  "exact-alias",
  "normalized-id",
  "normalized-canonical",
  "normalized-alias"
] as const;

export type GroundingMatchKind = (typeof groundingMatchKinds)[number];

/** direct: the mention resolved to one element; selected: an explicit selection resolved an ambiguity. */
export const participantResolutions = ["direct", "selected"] as const;
export type ParticipantResolution = (typeof participantResolutions)[number];

export const newParticipantLimits = Object.freeze({ maxNameChars: 64 });

/** Position of a mention in the flow document: one-based line and column (UTF-16 code units) and length. */
export interface FlowReference {
  readonly line: number;
  readonly column: number;
  readonly length: number;
}

/** Declaration of an element, relationship or rule in the pack. */
export interface PackSourceReference {
  readonly file: KnowledgePackFileName;
  readonly line: number;
}

export interface GroundedFlowMetadata {
  readonly diagramName: string;
  readonly flowName: string;
  readonly author: string;
  readonly language: FlowLanguage;
}

interface GroundedKnownParticipant {
  readonly id: string;
  /** Canonical name from the pack, never the spelling used in the flow. */
  readonly canonicalName: string;
  readonly description: string;
  readonly source: PackSourceReference;
  readonly matchKinds: readonly GroundingMatchKind[];
  readonly resolution: ParticipantResolution;
  readonly mentions: readonly FlowReference[];
}

export interface GroundedActor extends GroundedKnownParticipant {
  readonly participantType: "actor";
  readonly actorKind: ActorKind;
}

export interface GroundedSystem extends GroundedKnownParticipant {
  readonly participantType: "system";
  readonly systemKind: SystemKind;
}

/** A participant outside the pack, declared as [NEW: Name] and confirmed by the caller. It has no pack identifier. */
export interface ConfirmedNewParticipant {
  readonly participantType: "new";
  /** Normalized name used for de-duplication and confirmation. */
  readonly key: string;
  readonly displayName: string;
  readonly confirmed: true;
  readonly mentions: readonly FlowReference[];
}

export type GroundedParticipant = GroundedActor | GroundedSystem | ConfirmedNewParticipant;

export interface GroundedRelationship {
  readonly fromId: string;
  readonly toId: string;
  readonly interfaceType: InterfaceType;
  /** Declared interface name or null; never invented. */
  readonly interfaceName: string | null;
  readonly mode: InteractionMode;
  readonly purpose: string;
  readonly source: PackSourceReference;
}

export interface GroundedRule {
  readonly rule: RuleType;
  readonly fromId: string;
  readonly toId: string;
  readonly reason: string;
  readonly source: PackSourceReference;
}

export interface GroundedContext {
  readonly schemaVersion: typeof groundedContextSchemaVersion;
  readonly metadata: GroundedFlowMetadata;
  readonly actors: readonly GroundedActor[];
  readonly systems: readonly GroundedSystem[];
  readonly newParticipants: readonly ConfirmedNewParticipant[];
  readonly relationships: readonly GroundedRelationship[];
  readonly rules: readonly GroundedRule[];
}

export type GroundingWarning = ValidationIssue & { readonly severity: "warning" };

export interface ContextDigest {
  readonly algorithm: "sha256";
  /** Lower-case hexadecimal SHA-256 of the canonical digest input. */
  readonly value: string;
}

export interface AmbiguityCandidate {
  readonly id: string;
  readonly participantType: "actor" | "system";
  readonly elementKind: SystemKind | ActorKind;
  readonly canonicalName: string;
  readonly source: PackSourceReference;
}

export interface AmbiguityEntry {
  /** Normalized text of the mention; it always equals a normalized pack term. */
  readonly mention: string;
  readonly matchKinds: readonly GroundingMatchKind[];
  readonly locations: readonly FlowReference[];
  /** Candidates sorted by identifier. */
  readonly candidates: readonly AmbiguityCandidate[];
  /** Identifier chosen by an explicit, valid selection, otherwise null. */
  readonly selectedId: string | null;
}

export interface AmbiguityReport {
  readonly entries: readonly AmbiguityEntry[];
}

export interface GroundingSuccess {
  readonly status: "grounded";
  readonly context: GroundedContext;
  readonly digest: ContextDigest;
  readonly warnings: readonly GroundingWarning[];
  readonly ambiguityReport: AmbiguityReport;
}

export interface GroundingBlocked {
  readonly status: "blocked";
  readonly issues: readonly ValidationIssue[];
  readonly truncated: boolean;
  readonly ambiguityReport: AmbiguityReport;
}

export type GroundingOutcome = GroundingSuccess | GroundingBlocked;

export function compareFlowReferences(left: FlowReference, right: FlowReference): number {
  return left.line - right.line || left.column - right.column || left.length - right.length;
}

export function compareMatchKinds(left: GroundingMatchKind, right: GroundingMatchKind): number {
  return groundingMatchKinds.indexOf(left) - groundingMatchKinds.indexOf(right);
}

/** Identity order of relationships: source, target, interface type, interface name, mode. */
export function compareGroundedRelationships(left: GroundedRelationship, right: GroundedRelationship): number {
  return (
    stableCompare(left.fromId, right.fromId) ||
    stableCompare(left.toId, right.toId) ||
    stableCompare(left.interfaceType, right.interfaceType) ||
    stableCompare(left.interfaceName ?? "", right.interfaceName ?? "") ||
    stableCompare(left.mode, right.mode)
  );
}

/** Identity order of rules: source, target, rule type. */
export function compareGroundedRules(left: GroundedRule, right: GroundedRule): number {
  return (
    stableCompare(left.fromId, right.fromId) ||
    stableCompare(left.toId, right.toId) ||
    stableCompare(left.rule, right.rule)
  );
}

export const contextDigestVersion = "archground-grounded-context/1";

/**
 * The semantic content covered by the digest. It excludes mention positions, pack line numbers and
 * the author, so the digest depends only on what the context means, not on where it was written.
 * Arrays are sorted here, so insertion order never changes the digest.
 */
export function contextDigestInput(context: GroundedContext): CanonicalValue {
  return {
    version: contextDigestVersion,
    metadata: {
      diagramName: context.metadata.diagramName,
      flowName: context.metadata.flowName,
      language: context.metadata.language
    },
    actors: [...context.actors]
      .sort((left, right) => stableCompare(left.id, right.id))
      .map((actor) => ({
        id: actor.id,
        canonicalName: actor.canonicalName,
        actorKind: actor.actorKind,
        description: actor.description
      })),
    systems: [...context.systems]
      .sort((left, right) => stableCompare(left.id, right.id))
      .map((system) => ({
        id: system.id,
        canonicalName: system.canonicalName,
        systemKind: system.systemKind,
        description: system.description
      })),
    newParticipants: [...context.newParticipants]
      .sort((left, right) => stableCompare(left.key, right.key))
      .map((participant) => ({ key: participant.key, displayName: participant.displayName })),
    relationships: [...context.relationships].sort(compareGroundedRelationships).map((relationship) => ({
      fromId: relationship.fromId,
      toId: relationship.toId,
      interfaceType: relationship.interfaceType,
      interfaceName: relationship.interfaceName,
      mode: relationship.mode,
      purpose: relationship.purpose
    })),
    rules: [...context.rules].sort(compareGroundedRules).map((rule) => ({
      rule: rule.rule,
      fromId: rule.fromId,
      toId: rule.toId,
      reason: rule.reason
    }))
  };
}

export function computeContextDigest(context: GroundedContext): ContextDigest {
  return Object.freeze({ algorithm: "sha256", value: stableDigest(contextDigestInput(context)) });
}
