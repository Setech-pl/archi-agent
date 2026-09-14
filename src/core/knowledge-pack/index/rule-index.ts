import { stableCompare } from "../../util/ordering.js";
import type { RuleRecord, RuleType } from "../knowledge-pack.schema.js";

/**
 * Directional index of forbid and require rules. A rule from A to B says nothing about B to A.
 * Reasons are kept exactly as declared; they are data for the caller, never part of an error message.
 */

const noRules: readonly RuleRecord[] = Object.freeze([]);

function frozenCopy(record: RuleRecord): RuleRecord {
  return Object.freeze({ ...record, location: Object.freeze({ ...record.location }) });
}

function compareRules(left: RuleRecord, right: RuleRecord): number {
  return (
    stableCompare(left.fromId, right.fromId) ||
    stableCompare(left.toId, right.toId) ||
    stableCompare(left.rule, right.rule) ||
    stableCompare(left.location.file, right.location.file) ||
    left.location.line - right.location.line
  );
}

export class RuleIndex {
  readonly #all: readonly RuleRecord[];
  readonly #pairs: ReadonlyMap<string, ReadonlyMap<string, readonly RuleRecord[]>>;
  readonly #forbidden: readonly RuleRecord[];
  readonly #required: readonly RuleRecord[];

  private constructor(records: readonly RuleRecord[]) {
    const sorted = records.map(frozenCopy).sort(compareRules);
    const pairs = new Map<string, Map<string, RuleRecord[]>>();

    for (const record of sorted) {
      const targets = pairs.get(record.fromId) ?? new Map<string, RuleRecord[]>();
      const list = targets.get(record.toId) ?? [];
      list.push(record);
      targets.set(record.toId, list);
      pairs.set(record.fromId, targets);
    }

    const frozenPairs = new Map<string, ReadonlyMap<string, readonly RuleRecord[]>>();

    for (const [fromId, targets] of pairs) {
      const frozenTargets = new Map<string, readonly RuleRecord[]>();

      for (const [toId, list] of targets) {
        frozenTargets.set(toId, Object.freeze([...list]));
      }

      frozenPairs.set(fromId, frozenTargets);
    }

    this.#all = Object.freeze(sorted);
    this.#pairs = frozenPairs;
    this.#forbidden = Object.freeze(sorted.filter((record) => record.rule === "forbid"));
    this.#required = Object.freeze(sorted.filter((record) => record.rule === "require"));
  }

  public static from(rules: readonly RuleRecord[]): RuleIndex {
    return new RuleIndex(rules);
  }

  public get size(): number {
    return this.#all.length;
  }

  public all(): readonly RuleRecord[] {
    return this.#all;
  }

  public forbidden(): readonly RuleRecord[] {
    return this.#forbidden;
  }

  public required(): readonly RuleRecord[] {
    return this.#required;
  }

  /** Rules declared from fromId to toId, ordered by rule type and then by declaration line. */
  public find(fromId: string, toId: string): readonly RuleRecord[] {
    return this.#pairs.get(fromId)?.get(toId) ?? noRules;
  }

  public isForbidden(fromId: string, toId: string): boolean {
    return this.find(fromId, toId).some((record) => record.rule === "forbid");
  }

  public isRequired(fromId: string, toId: string): boolean {
    return this.find(fromId, toId).some((record) => record.rule === "require");
  }

  /** Declared reason of the first rule of the given type for the directed pair, if any. */
  public reason(fromId: string, toId: string, rule: RuleType): string | undefined {
    return this.find(fromId, toId).find((record) => record.rule === rule)?.reason;
  }
}
