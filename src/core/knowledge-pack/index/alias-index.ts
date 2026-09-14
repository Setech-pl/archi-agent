import { normalizeGroundingReference } from "../../grounding/reference-key.js";
import { stableCompare, uniqueSorted } from "../../util/ordering.js";
import type { AliasRecord } from "../knowledge-pack.schema.js";
import { lookupStatusFor, type LookupStatus } from "./element-index.js";

/**
 * Alias lookup with normalized keys. One alias may point to several targets; such an alias is
 * reported as ambiguous with every target, and no target is ever preferred. There is no fuzzy,
 * partial or prefix matching. The index works on parsed records only and never reads files.
 */

export type AliasTargetKind = "system" | "actor";

export interface AliasTarget {
  readonly targetId: string;
  readonly targetKind: AliasTargetKind;
}

export interface AliasLookup {
  readonly status: LookupStatus;
  /** Targets sorted by identifier. */
  readonly targets: readonly AliasTarget[];
}

/** Declared identifiers used to tell system targets from actor targets. */
export interface AliasTargetCatalog {
  readonly systemIds: Iterable<string>;
  readonly actorIds: Iterable<string>;
}

const noTargets: readonly AliasTarget[] = Object.freeze([]);
const noStrings: readonly string[] = Object.freeze([]);

export class AliasIndex {
  readonly #byKey: ReadonlyMap<string, readonly AliasTarget[]>;
  readonly #aliasesByTarget: ReadonlyMap<string, readonly string[]>;
  readonly #keys: readonly string[];

  private constructor(
    byKey: ReadonlyMap<string, readonly AliasTarget[]>,
    aliasesByTarget: ReadonlyMap<string, readonly string[]>
  ) {
    this.#byKey = byKey;
    this.#aliasesByTarget = aliasesByTarget;
    this.#keys = Object.freeze([...byKey.keys()].sort(stableCompare));
  }

  /**
   * Builds the index. Every target must be exactly one declared system or actor; the loader checks
   * this before building, so a violation here is a programming error. Aliases whose normalized key is
   * empty cannot be looked up and are left out; the loader reports them as invalid.
   */
  public static from(aliases: readonly AliasRecord[], catalog: AliasTargetCatalog): AliasIndex {
    const systems = new Set(catalog.systemIds);
    const actors = new Set(catalog.actorIds);
    const byKey = new Map<string, Map<string, AliasTarget>>();
    const byTarget = new Map<string, string[]>();

    for (const alias of aliases) {
      const isSystem = systems.has(alias.targetId);
      const isActor = actors.has(alias.targetId);

      if (isSystem === isActor) {
        throw new Error("Alias target must be exactly one declared system or actor.");
      }

      const key = normalizeGroundingReference(alias.alias);

      if (key === "") {
        continue;
      }

      const targets = byKey.get(key) ?? new Map<string, AliasTarget>();
      targets.set(alias.targetId, Object.freeze({ targetId: alias.targetId, targetKind: isSystem ? "system" : "actor" }));
      byKey.set(key, targets);
      const declared = byTarget.get(alias.targetId) ?? [];
      declared.push(alias.alias);
      byTarget.set(alias.targetId, declared);
    }

    const frozenByKey = new Map<string, readonly AliasTarget[]>();

    for (const [key, targets] of byKey) {
      frozenByKey.set(
        key,
        Object.freeze([...targets.values()].sort((left, right) => stableCompare(left.targetId, right.targetId)))
      );
    }

    const frozenByTarget = new Map<string, readonly string[]>();

    for (const [targetId, declared] of byTarget) {
      frozenByTarget.set(targetId, Object.freeze(uniqueSorted(declared)));
    }

    return new AliasIndex(frozenByKey, frozenByTarget);
  }

  /** Explicit missing, unique or ambiguous result; an ambiguous alias returns every target. */
  public lookup(raw: string): AliasLookup {
    const key = normalizeGroundingReference(raw);
    const targets = key === "" ? noTargets : (this.#byKey.get(key) ?? noTargets);
    return Object.freeze({ status: lookupStatusFor(targets.length), targets });
  }

  public targetIds(raw: string): readonly string[] {
    return Object.freeze(this.lookup(raw).targets.map((target) => target.targetId));
  }

  public isAmbiguous(raw: string): boolean {
    return this.lookup(raw).status === "ambiguous";
  }

  /** Normalized alias keys, sorted. */
  public keys(): readonly string[] {
    return this.#keys;
  }

  /** Normalized keys that point to more than one target, sorted. */
  public ambiguousKeys(): readonly string[] {
    return Object.freeze(this.#keys.filter((key) => (this.#byKey.get(key)?.length ?? 0) > 1));
  }

  /** Declared alias texts for one target, unique and sorted. */
  public aliasesFor(targetId: string): readonly string[] {
    return this.#aliasesByTarget.get(targetId) ?? noStrings;
  }
}
