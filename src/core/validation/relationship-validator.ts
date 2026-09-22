import type { GroundedContext, GroundedRelationship } from "../grounding/grounded-context.js";
import type { InterfaceType as PackInterfaceType } from "../knowledge-pack/knowledge-pack.schema.js";
import { participantRefKey, type GeneratedSequenceModel } from "../model/sequence-diagram-model.schema.js";
import type { InterfaceType as ModelInterfaceType, SequenceMessage } from "../model/types.js";
import { createModelIssue, sortModelIssues, type ModelIssue } from "./model-validator.js";

/**
 * Validates every message against the relationships and rules of the grounded context.
 *
 * - Between two different known participants a message needs a grounded relationship in the same
 *   direction (the opposite direction for a response), with the same interface type and a matching
 *   mode. Only the grounded context is searched; nothing is inferred from similar names.
 * - A self-message is decided only by equal sender and receiver references. It must use INTERNAL
 *   (checked by the structural stage), needs no relationship and never stands in for one.
 * - INTERNAL is an interface classification, not a self-message marker. Between two different
 *   participants it is valid only as an explicit grounded INTERNAL relationship with the same
 *   direction and mode, exactly like every other interface type; INTERNAL towards or from a
 *   confirmed new participant can never be grounded and is an error.
 * - A response must be synchronous, needs a synchronous grounded relationship from its target to its
 *   source, and must follow a matching request.
 * - An interaction with a confirmed new participant cannot be verified: it is accepted with a warning
 *   and is never labelled as grounded.
 * - A forbid rule of the context blocks its interaction; a require rule between two participants of
 *   the diagram without that interaction gives a warning.
 */

export type RelationshipVerification = "grounded" | "self-message" | "unverified-new" | "user-stated-review";

export interface MessageRelationshipMatch {
  readonly order: number;
  readonly verification: RelationshipVerification;
  /** Grounded relationships with the same endpoints, interface type and mode; empty unless grounded. */
  readonly relationships: readonly GroundedRelationship[];
}

export interface RelationshipValidationResult {
  readonly issues: readonly ModelIssue[];
  readonly matches: readonly MessageRelationshipMatch[];
}

const packInterfaceTypes: Readonly<Record<ModelInterfaceType, PackInterfaceType>> = Object.freeze({
  "REST API": "REST_API",
  SOAP: "SOAP",
  EVENT: "EVENT",
  FILE: "FILE",
  DB: "DB",
  INTERNAL: "INTERNAL"
});

export function packInterfaceType(type: ModelInterfaceType): PackInterfaceType {
  return packInterfaceTypes[type];
}

function isRequestFor(candidate: SequenceMessage, response: SequenceMessage): boolean {
  return (
    candidate.isResponse === false &&
    candidate.async === false &&
    participantRefKey(candidate.from) === participantRefKey(response.to) &&
    participantRefKey(candidate.to) === participantRefKey(response.from) &&
    candidate.interfaceType === response.interfaceType &&
    (candidate.interfaceName ?? null) === (response.interfaceName ?? null)
  );
}

const modelInterfaceTypes = new Map(
  (Object.entries(packInterfaceTypes) as [ModelInterfaceType, PackInterfaceType][]).map(([model, pack]) => [pack, model] as const)
);

export function modelInterfaceTypeFromPack(type: PackInterfaceType): ModelInterfaceType {
  const result = modelInterfaceTypes.get(type);
  if (result === undefined) throw new Error("Unknown validated interface type.");
  return result;
}

/** Sorted distinct values joined with "or", used only as a diagnostic detail. */
function choices(values: readonly string[]): string {
  return [...new Set(values)].sort().join(" or ");
}

export function validateRelationships(model: GeneratedSequenceModel, context: GroundedContext, allowUserStatedReview = false): RelationshipValidationResult {
  const issues: ModelIssue[] = [];
  const matches: MessageRelationshipMatch[] = [];
  const between = (fromId: string, toId: string): GroundedRelationship[] =>
    context.relationships.filter((relationship) => relationship.fromId === fromId && relationship.toId === toId);

  model.messages.forEach((message, index) => {
    const path = `messages.${index}`;
    const details = { order: message.order };
    const response = message.isResponse === true;
    const record = (verification: RelationshipVerification, relationships: readonly GroundedRelationship[] = []): void => {
      matches.push(Object.freeze({ order: message.order, verification, relationships: Object.freeze([...relationships]) }));
    };

    const responseWithoutRequest = response && !model.messages.slice(0, index).some((candidate) => isRequestFor(candidate, message));
    if (responseWithoutRequest) {
      issues.push(createModelIssue("response-without-request", { path, details }));
    }

    const ruleFrom = response ? message.to.elementId : message.from.elementId;
    const ruleTo = response ? message.from.elementId : message.to.elementId;
    if (allowUserStatedReview && ruleFrom !== undefined && ruleTo !== undefined && context.rules.some((rule) =>
      rule.rule === "forbid" && rule.fromId === ruleFrom && rule.toId === ruleTo)) {
      issues.push(createModelIssue("forbidden-interaction", { path, details: { ...details, fromId: ruleFrom, toId: ruleTo } }));
    }

    if (participantRefKey(message.from) === participantRefKey(message.to)) {
      record(allowUserStatedReview ? "user-stated-review" : "self-message");
      return;
    }

    const internal = message.interfaceType === "INTERNAL";
    const fromId = message.from.elementId;
    const toId = message.to.elementId;

    if (fromId === undefined || toId === undefined) {
      if (internal && !allowUserStatedReview) {
        issues.push(createModelIssue("internal-endpoint-mismatch", { path, details }));
        record("grounded");
        return;
      }

      if (!internal) issues.push(createModelIssue("unverified-new-participant-interaction", { path, details }));
      record(allowUserStatedReview ? "user-stated-review" : "unverified-new");
      return;
    }

    const [sourceId, targetId] = response ? [toId, fromId] : [fromId, toId];
    const candidates = between(sourceId, targetId);

    if (candidates.length === 0) {
      const reverse = between(targetId, sourceId).length > 0;
      if (allowUserStatedReview && !reverse) { record("user-stated-review"); return; }
      const code = reverse || (!allowUserStatedReview && between(targetId, sourceId).length > 0)
        ? "relationship-direction" : internal ? "internal-endpoint-mismatch" : "missing-relationship";
      issues.push(createModelIssue(code, { path, details: { ...details, fromId: sourceId, toId: targetId } }));
      record("grounded");
      return;
    }

    const byType = candidates.filter((relationship) => relationship.interfaceType === packInterfaceType(message.interfaceType));

    if (byType.length === 0) {
      const typeDetails: Readonly<Record<string, string>> = internal
        ? {}
        : {
            expected: choices(candidates.map((relationship) => modelInterfaceTypes.get(relationship.interfaceType) ?? relationship.interfaceType)),
            actual: message.interfaceType
          };
      issues.push(
        createModelIssue(internal ? "internal-endpoint-mismatch" : "interface-type-mismatch", {
          path,
          details: { ...details, fromId: sourceId, toId: targetId, ...typeDetails }
        })
      );
      record("grounded");
      return;
    }

    const mode = response || message.async !== true ? "synchronous" : "asynchronous";
    const byMode = byType.filter((relationship) => relationship.mode === mode);

    if (byMode.length === 0) {
      issues.push(
        createModelIssue("interaction-mode-mismatch", {
          path,
          details: { ...details, fromId: sourceId, toId: targetId, expected: choices(byType.map((relationship) => relationship.mode)), actual: mode }
        })
      );
    }

    const byName = allowUserStatedReview && byMode.length > 0
      ? byMode.filter((relationship) => relationship.interfaceName === (message.interfaceName ?? null))
      : byMode;
    if (allowUserStatedReview && byMode.length > 0 && byName.length === 0 && !responseWithoutRequest) {
      issues.push(createModelIssue("interface-name-mismatch", { path, details: { ...details, fromId: sourceId, toId: targetId } }));
    }

    if (!allowUserStatedReview && context.rules.some((rule) => rule.rule === "forbid" && rule.fromId === sourceId && rule.toId === targetId)) {
      issues.push(createModelIssue("forbidden-interaction", { path, details: { ...details, fromId: sourceId, toId: targetId } }));
    }
    record("grounded", byName);
  });

  const inDiagram = new Set(model.participants.flatMap((participant) => (participant.origin === "knowledge-pack" ? [participant.elementId] : [])));

  for (const rule of context.rules) {
    if (rule.rule !== "require" || !inDiagram.has(rule.fromId) || !inDiagram.has(rule.toId)) {
      continue;
    }

    const present = model.messages.some(
      (message) => message.isResponse !== true && message.from.elementId === rule.fromId && message.to.elementId === rule.toId
    );

    if (!present) {
      issues.push(createModelIssue("required-interaction-missing", { details: { fromId: rule.fromId, toId: rule.toId } }));
    }
  }

  return Object.freeze({ issues: sortModelIssues(issues), matches: Object.freeze(matches) });
}
