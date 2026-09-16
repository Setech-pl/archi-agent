import { participantRefKey } from "../model/sequence-diagram-model.schema.js";
import type { ParticipantRef } from "../model/types.js";
import { stableCompare } from "../util/ordering.js";

/**
 * Deterministic PlantUML aliases.
 *
 * Aliases are derived from stable participant references, never from display names: a known
 * participant becomes kp_<element id> and a confirmed new participant new_<grounding key>, with every
 * character outside A-Z, a-z, 0-9 turned into an underscore. The prefix guarantees a leading letter and
 * keeps element identifiers traceable. References are processed in sorted order and collisions (also
 * letter-case collisions) receive the suffixes _2, _3 and so on, so the result does not depend on the
 * order in which references were supplied.
 */

export const aliasLimits = Object.freeze({ maxBaseChars: 48, maxSuffix: 9999 });

const aliasPattern = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isSafeAlias(value: string): boolean {
  return value.length <= aliasLimits.maxBaseChars + 6 && aliasPattern.test(value);
}

function sanitize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function baseAlias(ref: ParticipantRef): string {
  const [prefix, raw] = ref.elementId !== undefined ? ["kp_", ref.elementId] : ["new_", ref.newName ?? ""];
  const body = sanitize(raw) || "participant";
  return `${prefix}${body}`.slice(0, aliasLimits.maxBaseChars).replace(/_+$/, "");
}

/** Maps each participant reference key to its alias. */
export function allocateAliases(refs: readonly ParticipantRef[]): ReadonlyMap<string, string> {
  const unique = new Map<string, ParticipantRef>();

  for (const ref of refs) {
    unique.set(participantRefKey(ref), ref);
  }

  const taken = new Set<string>();
  const aliases = new Map<string, string>();

  for (const key of [...unique.keys()].sort(stableCompare)) {
    const ref = unique.get(key);

    if (ref === undefined) {
      continue;
    }

    const base = baseAlias(ref);
    let alias = base;

    for (let suffix = 2; taken.has(alias.toLowerCase()); suffix += 1) {
      if (suffix > aliasLimits.maxSuffix) {
        throw new Error("Alias allocation exceeded its collision limit.");
      }

      alias = `${base}_${suffix}`;
    }

    taken.add(alias.toLowerCase());
    aliases.set(key, alias);
  }

  return aliases;
}
