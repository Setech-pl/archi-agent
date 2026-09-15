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
 * - A message from a participant to itself is internal processing: it must use INTERNAL (checked by
 *   the structural stage) and needs no relationship. INTERNAL always means the same participant as
 *   source and target; an INTERNAL message between two different participants is an error, even
 *   when the pack declares an INTERNAL relationship between them.
 * - A response must be synchronous, needs a synchronous grounded relationship from its target to its
 *   source, and must follow a matching request.
 * - An interaction with a confirmed new participant cannot be verified: it is accepted with a warning
 *   and is never labelled as grounded.
 * - A forbid rule of the context blocks its interaction; a require rule between two participants of
 *   the diagram without that interaction gives a warning.
 */

export type RelationshipVerification = "grounded" | "internal" | "unverified-new";

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
    candidate.isResponse !== true &&
    participantRefKey(candidate.from) === participantRefKey(response.to) &&
    participantRefKey(candidate.to) === participantRefKey(response.from) &&
    candidate.interfaceType === response.interfaceType
  );
}

export function validateRelationships(model: GeneratedSequenceModel, context: GroundedContext): RelationshipValidationResult {
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

    if (response && !model.messages.slice(0, index).some((candidate) => isRequestFor(candidate, message))) {
      issues.push(createModelIssue("response-without-request", { path, details }));
    }

    if (participantRefKey(message.from) === participantRefKey(message.to)) {
      record("internal");
      return;
    }

    if (message.interfaceType === "INTERNAL") {
      issues.push(createModelIssue("internal-endpoint-mismatch", { path, details }));
      record("internal");
      return;
    }

    const fromId = message.from.elementId;
    const toId = message.to.elementId;

    if (fromId === undefined || toId === undefined) {
      issues.push(createModelIssue("unverified-new-participant-interaction", { path, details }));
      record("unverified-new");
      return;
    }

    const [sourceId, targetId] = response ? [toId, fromId] : [fromId, toId];
    const candidates = between(sourceId, targetId);

    if (candidates.length === 0) {
      const code = between(targetId, sourceId).length > 0 ? "relationship-direction" : "missing-relationship";
      issues.push(createModelIssue(code, { path, details: { ...details, fromId: sourceId, toId: targetId } }));
      record("grounded");
      return;
    }

    const byType = candidates.filter((relationship) => relationship.interfaceType === packInterfaceType(message.interfaceType));

    if (byType.length === 0) {
      issues.push(createModelIssue("interface-type-mismatch", { path, details: { ...details, fromId: sourceId, toId: targetId } }));
      record("grounded");
      return;
    }

    const mode = response || message.async !== true ? "synchronous" : "asynchronous";
    const byMode = byType.filter((relationship) => relationship.mode === mode);

    if (byMode.length === 0) {
      issues.push(createModelIssue("interaction-mode-mismatch", { path, details: { ...details, fromId: sourceId, toId: targetId } }));
    }

    if (context.rules.some((rule) => rule.rule === "forbid" && rule.fromId === sourceId && rule.toId === targetId)) {
      issues.push(createModelIssue("forbidden-interaction", { path, details: { ...details, fromId: sourceId, toId: targetId } }));
    }

    record("grounded", byMode);
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
