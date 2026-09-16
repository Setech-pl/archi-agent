import type { GeneratedSequenceModel } from "../model/sequence-diagram-model.schema.js";
import type { SequenceMessage } from "../model/types.js";
import { createModelIssue, sortModelIssues, type ModelIssue } from "./model-validator.js";
import type { MessageRelationshipMatch } from "./relationship-validator.js";

/**
 * Interface-name policy (owner decision for version 0.1).
 *
 * - A supplied interface name is kept only when it equals the declared interface name of a grounded
 *   relationship that matched the message (same endpoints, interface type and mode).
 * - An absent interface name stays absent; nothing is filled in.
 * - Any other supplied name is removed with a deterministic warning. The model is not rejected for
 *   this alone, no replacement is guessed, and the removed text never appears in the warning.
 *
 * Interactions with new participants and internal self-messages have no grounded relationship, so a
 * supplied interface name is always removed there.
 */

export interface InterfaceNamePolicyResult {
  readonly model: GeneratedSequenceModel;
  readonly issues: readonly ModelIssue[];
}

export function applyInterfaceNamePolicy(
  model: GeneratedSequenceModel,
  matches: readonly MessageRelationshipMatch[]
): InterfaceNamePolicyResult {
  const byOrder = new Map(matches.map((match) => [match.order, match]));
  const issues: ModelIssue[] = [];

  const messages = model.messages.map((message, index): SequenceMessage => {
    if (message.interfaceName === undefined) {
      return message;
    }

    const match = byOrder.get(message.order);
    const grounded =
      match?.verification === "grounded" &&
      match.relationships.some((relationship) => relationship.interfaceName === message.interfaceName);

    if (grounded) {
      return message;
    }

    issues.push(
      createModelIssue("interface-name-removed", {
        path: `messages.${index}.interfaceName`,
        details: { order: message.order }
      })
    );
    const { interfaceName: _removed, ...rest } = message;
    return Object.freeze(rest);
  });

  return Object.freeze({
    model: Object.freeze({ participants: model.participants, messages, fragments: model.fragments }),
    issues: sortModelIssues(issues)
  });
}
