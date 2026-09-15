import {
  participantKey,
  participantRefKey,
  type GeneratedSequenceModel,
  type SequenceFragment
} from "../model/sequence-diagram-model.schema.js";
import type { NewParticipant, SequenceMessage, SequenceParticipant } from "../model/types.js";
import { stableCompare } from "../util/ordering.js";

/**
 * Deterministic, semantic normalization of a schema-valid generated model.
 *
 * It trims display strings and applies Unicode NFC, turns empty optional strings into absent values,
 * orders messages by their explicit order numbers and orders participants by their first appearance
 * in that sequence (participants in no message follow, sorted by reference). Fragments, whose list
 * order carries no meaning, are ordered by range (outer before inner) and their else branches by
 * position. It never invents or removes participants, messages or fragments, never changes
 * identifiers, interface types, modes, response flags or fragment ranges, and never repairs text:
 * whatever is still invalid afterwards is rejected by validation. Line breaks cannot occur here
 * because the schema already rejects them, so no line-ending conversion is needed.
 */

function text(value: string): string {
  return value.normalize("NFC").trim();
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = text(value);
  return normalized === "" ? undefined : normalized;
}

function normalizeParticipant(participant: SequenceParticipant): SequenceParticipant {
  if (participant.origin === "knowledge-pack") {
    return Object.freeze({ ...participant, canonicalName: text(participant.canonicalName) });
  }

  return Object.freeze({
    ...participant,
    displayName: text(participant.displayName) as NewParticipant["displayName"]
  });
}

function normalizeMessage(message: SequenceMessage): SequenceMessage {
  const result: SequenceMessage = {
    from: Object.freeze({ ...message.from }),
    to: Object.freeze({ ...message.to }),
    label: text(message.label),
    interfaceType: message.interfaceType,
    order: message.order
  };
  const interfaceName = optionalText(message.interfaceName);
  const businessDescription = optionalText(message.businessDescription);

  if (interfaceName !== undefined) {
    result.interfaceName = interfaceName;
  }

  if (businessDescription !== undefined) {
    result.businessDescription = businessDescription;
  }

  if (message.async !== undefined) {
    result.async = message.async;
  }

  if (message.isResponse !== undefined) {
    result.isResponse = message.isResponse;
  }

  return Object.freeze(result);
}

function normalizeFragment(fragment: SequenceFragment): SequenceFragment {
  return Object.freeze({
    kind: fragment.kind,
    condition: text(fragment.condition),
    firstOrder: fragment.firstOrder,
    lastOrder: fragment.lastOrder,
    elseBranches: Object.freeze(
      fragment.elseBranches
        .map((branch) => Object.freeze({ condition: text(branch.condition), firstOrder: branch.firstOrder }))
        .sort((left, right) => left.firstOrder - right.firstOrder)
    )
  });
}

function compareFragments(left: SequenceFragment, right: SequenceFragment): number {
  return (
    left.firstOrder - right.firstOrder ||
    right.lastOrder - left.lastOrder ||
    stableCompare(left.kind, right.kind) ||
    stableCompare(left.condition, right.condition)
  );
}

export function normalizeGeneratedModel(model: GeneratedSequenceModel): GeneratedSequenceModel {
  const messages = model.messages.map(normalizeMessage).sort((left, right) => left.order - right.order);
  const firstUse = new Map<string, number>();

  for (const message of messages) {
    for (const key of [participantRefKey(message.from), participantRefKey(message.to)]) {
      if (!firstUse.has(key)) {
        firstUse.set(key, firstUse.size);
      }
    }
  }

  const rank = (participant: SequenceParticipant): number => firstUse.get(participantKey(participant)) ?? Number.MAX_SAFE_INTEGER;
  const participants = model.participants
    .map(normalizeParticipant)
    .sort((left, right) => rank(left) - rank(right) || stableCompare(participantKey(left), participantKey(right)));

  const fragments = model.fragments.map(normalizeFragment).sort(compareFragments);
  return Object.freeze({ participants, messages, fragments: Object.freeze(fragments) });
}
