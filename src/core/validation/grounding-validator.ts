import type { GroundedActor, GroundedContext, GroundedSystem } from "../grounding/grounded-context.js";
import type { GeneratedSequenceModel } from "../model/sequence-diagram-model.schema.js";
import { newParticipantPrefix, type ParticipantKind } from "../model/types.js";
import { createModelIssue, sortModelIssues, type ModelIssue } from "./model-validator.js";

/**
 * Validates participants against the grounded context only, never against the whole pack.
 *
 * A known participant must use the element identifier of a context actor or system, the canonical
 * name from the context and the participant kind derived from the grounded element kind. A new
 * participant must use the key of a confirmed new participant and the display name "[NEW] <name>".
 */

/** Participant kind of a grounded element: actors are actors; database and queue systems keep their shape. */
export function participantKindOf(element: GroundedActor | GroundedSystem): ParticipantKind {
  if (element.participantType === "actor") {
    return "actor";
  }

  return element.systemKind === "database" ? "database" : element.systemKind === "queue" ? "queue" : "system";
}

export function validateParticipantGrounding(model: GeneratedSequenceModel, context: GroundedContext): readonly ModelIssue[] {
  const known = new Map<string, GroundedActor | GroundedSystem>();

  for (const element of [...context.actors, ...context.systems]) {
    known.set(element.id, element);
  }

  const confirmed = new Map(context.newParticipants.map((participant) => [participant.key, participant]));
  const issues: ModelIssue[] = [];

  model.participants.forEach((participant, index) => {
    const path = `participants.${index}`;

    if (participant.origin === "knowledge-pack") {
      const element = known.get(participant.elementId);

      if (element === undefined) {
        issues.push(createModelIssue("unknown-participant", { path, details: { elementId: participant.elementId } }));
        return;
      }

      if (participant.canonicalName !== element.canonicalName) {
        issues.push(createModelIssue("canonical-name-mismatch", { path, details: { elementId: element.id } }));
      }

      if (participant.kind !== participantKindOf(element)) {
        issues.push(
          createModelIssue("participant-kind-mismatch", {
            path,
            details: { elementId: element.id, expectedKind: participantKindOf(element) }
          })
        );
      }

      return;
    }

    const grounded = confirmed.get(participant.newName);

    if (grounded === undefined) {
      issues.push(createModelIssue("unknown-new-participant", { path }));
      return;
    }

    if (participant.displayName !== `${newParticipantPrefix} ${grounded.displayName}`) {
      issues.push(createModelIssue("new-participant-display-mismatch", { path }));
    }
  });

  return sortModelIssues(issues);
}
