import { normalizeGroundingReference } from "../../grounding/reference-key.js";
import { stableCompare } from "../../util/ordering.js";
import type { SourceLocation, SystemRecord } from "../knowledge-pack.schema.js";

/**
 * Lookup of systems by identifier, exact canonical name and normalized name.
 *
 * The index never picks a winner. Every lookup returns all matching candidates sorted by
 * identifier, and the caller decides what to do with an ambiguous result. An exact canonical
 * match is reported as such and is never replaced by a normalized match. There is no fuzzy,
 * partial or prefix matching.
 */

export type NameMatchKind = "id" | "canonical" | "normalized";
export type LookupStatus = "missing" | "unique" | "ambiguous";

export interface NamedRecord {
  readonly id: string;
  readonly canonicalName: string;
  readonly location: SourceLocation;
}

export interface IndexCandidate<TRecord> {
  readonly record: TRecord;
  /** Every way the record matched, in the fixed order id, canonical, normalized. */
  readonly matchedBy: readonly NameMatchKind[];
}

export interface IndexLookup<TRecord> {
  readonly status: LookupStatus;
  readonly candidates: readonly IndexCandidate<TRecord>[];
}

export function lookupStatusFor(count: number): LookupStatus {
  return count === 0 ? "missing" : count === 1 ? "unique" : "ambiguous";
}

const noRecords: readonly never[] = Object.freeze([]);

function frozenCopy<TRecord extends NamedRecord>(record: TRecord): TRecord {
  return Object.freeze({ ...record, location: Object.freeze({ ...record.location }) }) as TRecord;
}

function addTo<TValue>(map: Map<string, TValue[]>, key: string, value: TValue): void {
  const list = map.get(key);

  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

function freezeGroups<TValue>(map: Map<string, TValue[]>): ReadonlyMap<string, readonly TValue[]> {
  const result = new Map<string, readonly TValue[]>();

  for (const [key, list] of map) {
    result.set(key, Object.freeze([...list]));
  }

  return result;
}

/** Shared implementation for system and actor indexes. State is private and every result is frozen. */
export class CanonicalNameIndex<TRecord extends NamedRecord> {
  readonly #all: readonly TRecord[];
  readonly #byId: ReadonlyMap<string, TRecord>;
  readonly #byCanonical: ReadonlyMap<string, readonly TRecord[]>;
  readonly #byNormalized: ReadonlyMap<string, readonly TRecord[]>;

  protected constructor(records: readonly TRecord[]) {
    const sorted = records.map(frozenCopy).sort((left, right) => stableCompare(left.id, right.id));
    const byId = new Map<string, TRecord>();
    const byCanonical = new Map<string, TRecord[]>();
    const byNormalized = new Map<string, TRecord[]>();

    for (const record of sorted) {
      if (byId.has(record.id)) {
        throw new Error("Index input contains a duplicate identifier.");
      }

      byId.set(record.id, record);
      addTo(byCanonical, record.canonicalName, record);
      const key = normalizeGroundingReference(record.canonicalName);

      if (key !== "") {
        addTo(byNormalized, key, record);
      }
    }

    this.#all = Object.freeze(sorted);
    this.#byId = byId;
    this.#byCanonical = freezeGroups(byCanonical);
    this.#byNormalized = freezeGroups(byNormalized);
  }

  public get size(): number {
    return this.#all.length;
  }

  /** All records sorted by identifier. */
  public all(): readonly TRecord[] {
    return this.#all;
  }

  /** Exact, case-sensitive identifier lookup. */
  public byId(id: string): TRecord | undefined {
    return this.#byId.get(id);
  }

  /** Records whose canonical name is exactly the given text, without any normalization. */
  public byCanonical(name: string): readonly TRecord[] {
    return this.#byCanonical.get(name) ?? noRecords;
  }

  /** Records whose normalized canonical name equals the normalized input. */
  public byNormalized(name: string): readonly TRecord[] {
    const key = normalizeGroundingReference(name);
    return key === "" ? noRecords : (this.#byNormalized.get(key) ?? noRecords);
  }

  /** Union of identifier, exact and normalized matches, sorted by identifier. */
  public candidates(raw: string): readonly IndexCandidate<TRecord>[] {
    const matches = new Map<string, { readonly record: TRecord; readonly kinds: NameMatchKind[] }>();
    const note = (record: TRecord, kind: NameMatchKind): void => {
      const existing = matches.get(record.id);

      if (existing === undefined) {
        matches.set(record.id, { record, kinds: [kind] });
      } else if (!existing.kinds.includes(kind)) {
        existing.kinds.push(kind);
      }
    };

    const byId = this.byId(raw);

    if (byId !== undefined) {
      note(byId, "id");
    }

    for (const record of this.byCanonical(raw)) {
      note(record, "canonical");
    }

    for (const record of this.byNormalized(raw)) {
      note(record, "normalized");
    }

    return Object.freeze(
      [...matches.values()]
        .sort((left, right) => stableCompare(left.record.id, right.record.id))
        .map((match) => Object.freeze({ record: match.record, matchedBy: Object.freeze([...match.kinds]) }))
    );
  }

  /** Candidates with an explicit missing, unique or ambiguous status; nothing is auto-selected. */
  public lookup(raw: string): IndexLookup<TRecord> {
    const candidates = this.candidates(raw);
    return Object.freeze({ status: lookupStatusFor(candidates.length), candidates });
  }
}

/** Index of systems only. */
export class ElementIndex extends CanonicalNameIndex<SystemRecord> {
  public static from(systems: readonly SystemRecord[]): ElementIndex {
    return new ElementIndex(systems);
  }
}
