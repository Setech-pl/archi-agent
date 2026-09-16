import type { KnowledgePack } from "../knowledge-pack/knowledge-pack.schema.js";
import { countUnicodeCharacters, isForbiddenControlCodePoint } from "../knowledge-pack/source-limits.js";
import { stableCompare } from "../util/ordering.js";
import { groundingMatchKinds, newParticipantLimits, type FlowReference, type GroundingMatchKind } from "./grounded-context.js";
import { normalizeGroundingReference } from "./reference-key.js";

/**
 * Deterministic recognition of participants in flow text.
 *
 * Terms are the identifiers, canonical names and declared aliases of the pack. A mention is a
 * boundary-aligned occurrence of a term. Resolution follows a fixed precedence: exact identifier,
 * exact canonical name, exact alias, then the normalized forms of the same three categories. The
 * first category with any hit decides; one target resolves the mention, several targets keep it
 * ambiguous. Normalization is limited to Unicode NFKC, case folding, trimming and collapsing
 * whitespace. There is no fuzzy, edit-distance, partial-token or semantic matching.
 *
 * New participants exist only as explicit [NEW: Name] markers. Unknown text is never turned into a
 * participant.
 */

const BS = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB_CODE = 9;
const unitPattern = new RegExp("." + BS + "p{M}*", "gsu");
const whitespacePattern = new RegExp("^[" + BS + "s]+$", "u");
const wordCharacterPattern = new RegExp("^[" + BS + "p{L}" + BS + "p{N}" + BS + "p{M}_-]$", "u");
const nameStartPattern = new RegExp("^[" + BS + "p{L}" + BS + "p{N}]", "u");
const nameCharactersPattern = new RegExp("^[" + BS + "p{L}" + BS + "p{N}" + BS + "p{M} ._'()-]+$", "u");

export type ParticipantType = "actor" | "system";

export interface ParticipantTarget {
  readonly id: string;
  readonly participantType: ParticipantType;
}

export interface ResolvedMention {
  readonly status: "resolved";
  readonly location: FlowReference;
  /** Normalized mention text; it equals a normalized pack term. */
  readonly mention: string;
  readonly matchKind: GroundingMatchKind;
  readonly target: ParticipantTarget;
}

export interface AmbiguousMention {
  readonly status: "ambiguous";
  readonly location: FlowReference;
  readonly mention: string;
  readonly matchKind: GroundingMatchKind;
  /** Candidates sorted by identifier. */
  readonly candidates: readonly ParticipantTarget[];
}

export type ParticipantMention = ResolvedMention | AmbiguousMention;

export type NewMarkerProblem = "malformed" | "empty" | "too-long" | "unsafe";

export type NewParticipantMarker =
  | {
      readonly status: "valid";
      readonly location: FlowReference;
      readonly key: string;
      readonly displayName: string;
    }
  | { readonly status: NewMarkerProblem; readonly location: FlowReference };

export interface FlowScan {
  readonly mentions: readonly ParticipantMention[];
  readonly newMarkers: readonly NewParticipantMarker[];
  /** Mentions dropped because they partly overlap a longer accepted mention. */
  readonly overlaps: readonly FlowReference[];
  /** Lines skipped because they contain control or bidirectional formatting characters. */
  readonly controlCharacterLines: readonly number[];
}

export type ReferenceResolution =
  | { readonly status: "resolved"; readonly matchKind: GroundingMatchKind; readonly target: ParticipantTarget }
  | {
      readonly status: "ambiguous";
      readonly matchKind: GroundingMatchKind;
      readonly candidates: readonly ParticipantTarget[];
    }
  | { readonly status: "unresolved" };

type TermCategory = "id" | "canonical" | "alias";

interface Term {
  readonly raw: string;
  readonly folded: string;
  readonly category: TermCategory;
  readonly target: ParticipantTarget;
  readonly endsWithWord: boolean;
}

interface TermMatch {
  readonly term: Term;
  readonly exact: boolean;
}

interface Decision {
  readonly matchKind: GroundingMatchKind;
  readonly targets: readonly ParticipantTarget[];
}

const matchKindTable: Readonly<Record<TermCategory, readonly [GroundingMatchKind, GroundingMatchKind]>> = Object.freeze({
  id: ["exact-id", "normalized-id"],
  canonical: ["exact-canonical", "normalized-canonical"],
  alias: ["exact-alias", "normalized-alias"]
});

interface FoldedText {
  readonly folded: string;
  /** Original code-unit offset of each folded code unit. */
  readonly offsets: readonly number[];
  /** Whether a folded code unit starts a unit (a base character with its combining marks). */
  readonly unitStarts: readonly boolean[];
}

/** Folds text per unit with NFKC and lower-casing, collapsing whitespace runs to one space. */
function foldText(value: string): FoldedText {
  const parts: string[] = [];
  const offsets: number[] = [];
  const unitStarts: boolean[] = [];
  let offset = 0;
  let previousWasSpace = false;

  for (const match of value.matchAll(unitPattern)) {
    const unit = match[0];
    const folded = unit.normalize("NFKC").toLowerCase();

    if (whitespacePattern.test(folded)) {
      if (!previousWasSpace) {
        parts.push(" ");
        offsets.push(offset);
        unitStarts.push(true);
        previousWasSpace = true;
      }

      offset += unit.length;
      continue;
    }

    previousWasSpace = false;

    for (let index = 0; index < folded.length; index += 1) {
      offsets.push(offset);
      unitStarts.push(index === 0);
    }

    parts.push(folded);
    offset += unit.length;
  }

  return { folded: parts.join(""), offsets, unitStarts };
}

/** Normalization used for matching: NFKC, lower case, collapsed whitespace, trimmed. */
export function normalizeReferenceText(value: string): string {
  return foldText(value).folded.trim();
}

function isWordAt(text: string, index: number): boolean {
  const codePoint = text.codePointAt(index);
  return codePoint !== undefined && wordCharacterPattern.test(String.fromCodePoint(codePoint));
}

function isWordBefore(text: string, index: number): boolean {
  if (index <= 0) {
    return false;
  }

  let start = index - 1;
  const code = text.charCodeAt(start);

  if (code >= 0xdc00 && code <= 0xdfff && start > 0) {
    const high = text.charCodeAt(start - 1);

    if (high >= 0xd800 && high <= 0xdbff) {
      start -= 1;
    }
  }

  return isWordAt(text, start);
}

function firstWordAt(text: string, index: number): string {
  let end = index;

  while (end < text.length && isWordAt(text, end)) {
    end += (text.codePointAt(end) ?? 0) > 0xffff ? 2 : 1;
  }

  return text.slice(index, end);
}

function codePointText(text: string, index: number): string {
  const codePoint = text.codePointAt(index);
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
}

function hasForbiddenCharacter(text: string, allowTab: boolean): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (allowTab && codePoint === TAB_CODE) {
      continue;
    }

    if (isForbiddenControlCodePoint(codePoint)) {
      return true;
    }
  }

  return false;
}

/**
 * A safe new-participant name: trimmed, single-spaced, at most the name limit, starting with a
 * letter or digit and containing only letters, digits, marks, spaces and . _ ' ( ) -. Directive
 * markers, quotes, brackets and other markup characters are therefore impossible.
 */
export function isSafeNewParticipantName(name: string): boolean {
  return (
    name.length > 0 &&
    name === name.trim() &&
    !name.includes("  ") &&
    countUnicodeCharacters(name) <= newParticipantLimits.maxNameChars &&
    !hasForbiddenCharacter(name, false) &&
    nameStartPattern.test(name) &&
    nameCharactersPattern.test(name)
  );
}

function classifyNewName(inner: string, location: FlowReference): NewParticipantMarker {
  if (hasForbiddenCharacter(inner, false)) {
    return Object.freeze({ status: "unsafe", location });
  }

  const displayName = inner
    .split(" ")
    .filter((part) => part.length > 0)
    .join(" ");

  if (displayName.length === 0) {
    return Object.freeze({ status: "empty", location });
  }

  if (countUnicodeCharacters(displayName) > newParticipantLimits.maxNameChars) {
    return Object.freeze({ status: "too-long", location });
  }

  if (!isSafeNewParticipantName(displayName)) {
    return Object.freeze({ status: "unsafe", location });
  }

  return Object.freeze({ status: "valid", location, key: normalizeReferenceText(displayName), displayName });
}

/** Finds [NEW...] markers and returns them with a mask of the characters they occupy. */
function findNewMarkers(line: string, lineNumber: number): { markers: NewParticipantMarker[]; mask: boolean[] } {
  const mask = new Array<boolean>(line.length).fill(false);
  const markers: NewParticipantMarker[] = [];
  let index = line.indexOf("[");

  while (index !== -1) {
    const looksLikeMarker = line.slice(index + 1, index + 4).toLowerCase() === "new" && !isWordAt(line, index + 4);

    if (!looksLikeMarker) {
      index = line.indexOf("[", index + 1);
      continue;
    }

    const close = line.indexOf("]", index + 1);
    const end = close === -1 ? index + 4 : close + 1;

    for (let position = index; position < end; position += 1) {
      mask[position] = true;
    }

    const location = Object.freeze({ line: lineNumber, column: index + 1, length: end - index });

    if (close === -1 || !line.startsWith("[NEW:", index)) {
      markers.push(Object.freeze({ status: "malformed", location }));
    } else {
      const inner = line.slice(index + 5, close);
      markers.push(inner.includes("[") ? Object.freeze({ status: "malformed", location }) : classifyNewName(inner, location));
    }

    index = line.indexOf("[", end);
  }

  return { markers, mask };
}

function isMasked(mask: readonly boolean[], start: number, end: number): boolean {
  for (let position = start; position < end; position += 1) {
    if (mask[position] === true) {
      return true;
    }
  }

  return false;
}

function decide(matches: readonly TermMatch[]): Decision | undefined {
  for (const matchKind of groundingMatchKinds) {
    const targets = new Map<string, ParticipantTarget>();

    for (const match of matches) {
      const [exactKind, normalizedKind] = matchKindTable[match.term.category];

      if ((match.exact ? exactKind : normalizedKind) === matchKind || (match.exact && normalizedKind === matchKind)) {
        targets.set(match.term.target.id, match.term.target);
      }
    }

    if (targets.size > 0) {
      return { matchKind, targets: [...targets.values()].sort((left, right) => stableCompare(left.id, right.id)) };
    }
  }

  return undefined;
}

function addToBucket(map: Map<string, Term[]>, key: string, term: Term): void {
  const bucket = map.get(key);

  if (bucket === undefined) {
    map.set(key, [term]);
  } else {
    bucket.push(term);
  }
}

interface SpanCandidate {
  readonly originalStart: number;
  readonly originalEnd: number;
  readonly mention: string;
  readonly decision: Decision;
}

const dictionaryCache = new WeakMap<KnowledgePack, ParticipantDictionary>();

/** Term dictionary of one validated pack. */
export class ParticipantDictionary {
  readonly #targets: ReadonlyMap<string, ParticipantTarget>;
  readonly #byFolded: ReadonlyMap<string, readonly Term[]>;
  readonly #byFirstWord: ReadonlyMap<string, readonly Term[]>;
  readonly #byFirstCharacter: ReadonlyMap<string, readonly Term[]>;
  readonly #referenceKeys: ReadonlySet<string>;

  private constructor(pack: KnowledgePack) {
    const targets = new Map<string, ParticipantTarget>();

    for (const system of pack.systems) {
      targets.set(system.id, Object.freeze({ id: system.id, participantType: "system" }));
    }

    for (const actor of pack.actors) {
      if (targets.has(actor.id)) {
        throw new Error("A system and an actor share an identifier; load the pack with the loader first.");
      }

      targets.set(actor.id, Object.freeze({ id: actor.id, participantType: "actor" }));
    }

    const terms: Term[] = [];
    const addTerm = (raw: string, category: TermCategory, target: ParticipantTarget | undefined): void => {
      const folded = normalizeReferenceText(raw);

      if (target === undefined || folded === "") {
        return;
      }

      terms.push(Object.freeze({ raw, folded, category, target, endsWithWord: isWordBefore(folded, folded.length) }));
    };

    for (const record of [...pack.systems, ...pack.actors]) {
      const target = targets.get(record.id);
      addTerm(record.id, "id", target);
      addTerm(record.canonicalName, "canonical", target);
    }

    for (const alias of pack.aliases) {
      addTerm(alias.alias, "alias", targets.get(alias.targetId));
    }

    const byFolded = new Map<string, Term[]>();
    const byFirstWord = new Map<string, Term[]>();
    const byFirstCharacter = new Map<string, Term[]>();
    const referenceKeys = new Set<string>();

    for (const term of terms) {
      addToBucket(byFolded, term.folded, term);

      if (isWordAt(term.folded, 0)) {
        addToBucket(byFirstWord, firstWordAt(term.folded, 0), term);
      } else {
        addToBucket(byFirstCharacter, codePointText(term.folded, 0), term);
      }

      const referenceKey = normalizeGroundingReference(term.raw);

      if (referenceKey !== "") {
        referenceKeys.add(referenceKey);
      }
    }

    this.#targets = targets;
    this.#byFolded = byFolded;
    this.#byFirstWord = byFirstWord;
    this.#byFirstCharacter = byFirstCharacter;
    this.#referenceKeys = referenceKeys;
  }

  /** Builds or reuses the dictionary of a pack. */
  public static fromPack(pack: KnowledgePack): ParticipantDictionary {
    const cached = dictionaryCache.get(pack);

    if (cached !== undefined) {
      return cached;
    }

    const dictionary = new ParticipantDictionary(pack);
    dictionaryCache.set(pack, dictionary);
    return dictionary;
  }

  public target(id: string): ParticipantTarget | undefined {
    return this.#targets.get(id);
  }

  /** Resolves one complete reference with the fixed precedence; no partial matching. */
  public resolveReference(raw: string): ReferenceResolution {
    const trimmed = raw.trim();
    const folded = normalizeReferenceText(raw);
    const terms = folded === "" ? undefined : this.#byFolded.get(folded);
    const decision = terms === undefined ? undefined : decide(terms.map((term) => ({ term, exact: term.raw === trimmed })));

    if (decision === undefined) {
      return Object.freeze({ status: "unresolved" });
    }

    const [first] = decision.targets;

    return decision.targets.length === 1 && first !== undefined
      ? Object.freeze({ status: "resolved", matchKind: decision.matchKind, target: first })
      : Object.freeze({ status: "ambiguous", matchKind: decision.matchKind, candidates: Object.freeze([...decision.targets]) });
  }

  /**
   * Whether a proposed new-participant name would impersonate a known element: its normalized form
   * equals an identifier, canonical name or alias, also when hyphens, underscores and spaces differ.
   */
  public impersonatesKnown(name: string): boolean {
    const folded = normalizeReferenceText(name);
    return (folded !== "" && this.#byFolded.has(folded)) || this.#referenceKeys.has(normalizeGroundingReference(name));
  }

  /** Scans a flow body line by line. firstLine is the document line number of the first body line. */
  public scanFlow(body: string, firstLine = 1): FlowScan {
    const mentions: ParticipantMention[] = [];
    const markers: NewParticipantMarker[] = [];
    const overlaps: FlowReference[] = [];
    const controlCharacterLines: number[] = [];
    const lines = body.split(LF);

    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index] ?? "";
      const line = raw.endsWith(CR) ? raw.slice(0, -1) : raw;
      const lineNumber = firstLine + index;

      if (hasForbiddenCharacter(line, true)) {
        controlCharacterLines.push(lineNumber);
        continue;
      }

      const found = findNewMarkers(line, lineNumber);
      markers.push(...found.markers);
      const scanned = this.#scanLine(line, lineNumber, found.mask);
      mentions.push(...scanned.mentions);
      overlaps.push(...scanned.overlaps);
    }

    return Object.freeze({
      mentions: Object.freeze(mentions),
      newMarkers: Object.freeze(markers),
      overlaps: Object.freeze(overlaps),
      controlCharacterLines: Object.freeze(controlCharacterLines)
    });
  }

  #scanLine(
    line: string,
    lineNumber: number,
    mask: readonly boolean[]
  ): { mentions: ParticipantMention[]; overlaps: FlowReference[] } {
    const text = foldText(line);
    const folded = text.folded;
    const spans = new Map<string, { start: number; end: number; originalStart: number; originalEnd: number; matches: TermMatch[] }>();

    for (let start = 0; start < folded.length; start += 1) {
      if (text.unitStarts[start] !== true) {
        continue;
      }

      const originalStart = text.offsets[start] ?? 0;

      if (mask[originalStart] === true) {
        continue;
      }

      const wordStart = isWordAt(folded, start);

      if (wordStart && isWordBefore(folded, start)) {
        continue;
      }

      const bucket = wordStart
        ? this.#byFirstWord.get(firstWordAt(folded, start))
        : this.#byFirstCharacter.get(codePointText(folded, start));

      if (bucket === undefined) {
        continue;
      }

      for (const term of bucket) {
        if (!folded.startsWith(term.folded, start)) {
          continue;
        }

        const end = start + term.folded.length;

        if (end < folded.length && text.unitStarts[end] !== true) {
          continue;
        }

        if (term.endsWithWord && isWordAt(folded, end)) {
          continue;
        }

        const originalEnd = end >= folded.length ? line.length : (text.offsets[end] ?? line.length);

        if (isMasked(mask, originalStart, originalEnd)) {
          continue;
        }

        const key = `${start}:${end}`;
        const span = spans.get(key) ?? { start, end, originalStart, originalEnd, matches: [] };
        span.matches.push({ term, exact: line.slice(originalStart, originalEnd) === term.raw });
        spans.set(key, span);
      }
    }

    const candidates: SpanCandidate[] = [];

    for (const span of spans.values()) {
      const decision = decide(span.matches);

      if (decision !== undefined) {
        candidates.push({
          originalStart: span.originalStart,
          originalEnd: span.originalEnd,
          mention: folded.slice(span.start, span.end).trim(),
          decision
        });
      }
    }

    candidates.sort(
      (left, right) =>
        right.originalEnd - right.originalStart - (left.originalEnd - left.originalStart) ||
        left.originalStart - right.originalStart
    );

    const accepted: SpanCandidate[] = [];
    const overlaps: FlowReference[] = [];
    const locationOf = (candidate: SpanCandidate): FlowReference =>
      Object.freeze({
        line: lineNumber,
        column: candidate.originalStart + 1,
        length: candidate.originalEnd - candidate.originalStart
      });

    for (const candidate of candidates) {
      const overlapping = accepted.filter(
        (other) => other.originalStart < candidate.originalEnd && candidate.originalStart < other.originalEnd
      );

      if (overlapping.length === 0) {
        accepted.push(candidate);
      } else if (
        !overlapping.some(
          (other) => other.originalStart <= candidate.originalStart && candidate.originalEnd <= other.originalEnd
        )
      ) {
        overlaps.push(locationOf(candidate));
      }
    }

    accepted.sort((left, right) => left.originalStart - right.originalStart);

    const mentions = accepted.map((candidate): ParticipantMention => {
      const location = locationOf(candidate);
      const [first] = candidate.decision.targets;

      return candidate.decision.targets.length === 1 && first !== undefined
        ? Object.freeze({
            status: "resolved",
            location,
            mention: candidate.mention,
            matchKind: candidate.decision.matchKind,
            target: first
          })
        : Object.freeze({
            status: "ambiguous",
            location,
            mention: candidate.mention,
            matchKind: candidate.decision.matchKind,
            candidates: Object.freeze([...candidate.decision.targets])
          });
    });

    overlaps.sort((left, right) => left.column - right.column || left.length - right.length);
    return { mentions, overlaps };
  }
}

export function scanFlow(dictionary: ParticipantDictionary, body: string, firstLine = 1): FlowScan {
  return dictionary.scanFlow(body, firstLine);
}
