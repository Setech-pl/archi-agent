import { stableCompare, uniqueSorted } from "../../util/ordering.js";
import type { RelationshipRecord } from "../knowledge-pack.schema.js";

/**
 * Directional index of declared relationships. A relationship from A to B never implies one from
 * B to A. Pairs are stored in nested maps, so no string concatenation can make two pairs collide.
 * Declared interface names are the only interface names the index knows; none are invented.
 */

const noRelationships: readonly RelationshipRecord[] = Object.freeze([]);
const noStrings: readonly string[] = Object.freeze([]);

function frozenCopy(record: RelationshipRecord): RelationshipRecord {
  return Object.freeze({ ...record, location: Object.freeze({ ...record.location }) });
}

export function compareRelationships(left: RelationshipRecord, right: RelationshipRecord): number {
  return (
    stableCompare(left.fromId, right.fromId) ||
    stableCompare(left.toId, right.toId) ||
    stableCompare(left.interfaceType, right.interfaceType) ||
    stableCompare(left.interfaceName ?? "", right.interfaceName ?? "") ||
    stableCompare(left.mode, right.mode) ||
    stableCompare(left.location.file, right.location.file) ||
    left.location.line - right.location.line
  );
}

function namesOf(records: readonly RelationshipRecord[]): readonly string[] {
  return Object.freeze(
    uniqueSorted(records.flatMap((record) => (record.interfaceName === undefined ? [] : [record.interfaceName])))
  );
}

export class RelationshipIndex {
  readonly #all: readonly RelationshipRecord[];
  readonly #pairs: ReadonlyMap<string, ReadonlyMap<string, readonly RelationshipRecord[]>>;
  readonly #outgoing: ReadonlyMap<string, readonly RelationshipRecord[]>;
  readonly #names: readonly string[];

  private constructor(records: readonly RelationshipRecord[]) {
    const sorted = records.map(frozenCopy).sort(compareRelationships);
    const pairs = new Map<string, Map<string, RelationshipRecord[]>>();

    for (const record of sorted) {
      const targets = pairs.get(record.fromId) ?? new Map<string, RelationshipRecord[]>();
      const list = targets.get(record.toId) ?? [];
      list.push(record);
      targets.set(record.toId, list);
      pairs.set(record.fromId, targets);
    }

    const frozenPairs = new Map<string, ReadonlyMap<string, readonly RelationshipRecord[]>>();
    const outgoing = new Map<string, readonly RelationshipRecord[]>();

    for (const [fromId, targets] of pairs) {
      const frozenTargets = new Map<string, readonly RelationshipRecord[]>();

      for (const [toId, list] of targets) {
        frozenTargets.set(toId, Object.freeze([...list]));
      }

      frozenPairs.set(fromId, frozenTargets);
      outgoing.set(fromId, Object.freeze(sorted.filter((record) => record.fromId === fromId)));
    }

    this.#all = Object.freeze(sorted);
    this.#pairs = frozenPairs;
    this.#outgoing = outgoing;
    this.#names = namesOf(sorted);
  }

  public static from(relationships: readonly RelationshipRecord[]): RelationshipIndex {
    return new RelationshipIndex(relationships);
  }

  public get size(): number {
    return this.#all.length;
  }

  /** All relationships in deterministic order. */
  public all(): readonly RelationshipRecord[] {
    return this.#all;
  }

  /** Every relationship declared from fromId to toId; the reverse direction is not included. */
  public find(fromId: string, toId: string): readonly RelationshipRecord[] {
    return this.#pairs.get(fromId)?.get(toId) ?? noRelationships;
  }

  public has(fromId: string, toId: string): boolean {
    return this.find(fromId, toId).length > 0;
  }

  public outgoing(fromId: string): readonly RelationshipRecord[] {
    return this.#outgoing.get(fromId) ?? noRelationships;
  }

  /** Unique, sorted, non-empty interface names declared anywhere in the pack. */
  public declaredInterfaceNames(): readonly string[] {
    return this.#names;
  }

  /** Unique, sorted, non-empty interface names declared for one directed pair. */
  public interfaceNamesFor(fromId: string, toId: string): readonly string[] {
    const records = this.find(fromId, toId);
    return records.length === 0 ? noStrings : namesOf(records);
  }
}
