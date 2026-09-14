/**
 * Central, immutable limits for knowledge-pack sources. Parsers import these values instead of
 * repeating numeric literals.
 */
export const knowledgePackLimits = Object.freeze({
  /**
   * Maximum size of one pack file in bytes. The exact byte limit is enforced by the source adapter
   * before decoding; text parsers can only apply the lower bound in textExceedsFileLimit.
   */
  maxFileBytes: 1024 * 1024,
  maxTableRows: 10_000,
  maxTableColumns: 16,
  maxCellChars: 2_000,
  maxIdentifierChars: 64,
  maxCanonicalNameChars: 256,
  maxFlowSourceChars: 50_000,
  maxFrontMatterValueChars: 256,
  maxRelativePathChars: 256,
  maxReportedIssues: 100
} as const);

export type KnowledgePackLimits = typeof knowledgePackLimits;

/** Counts Unicode code points, so a character outside the basic plane counts once. */
export function countUnicodeCharacters(value: string): number {
  let count = 0;

  for (const _character of value) {
    count += 1;
  }

  return count;
}

/**
 * A decoded string longer than maxFileBytes UTF-16 code units certainly came from a file larger than
 * maxFileBytes bytes, because every code unit needs at least one byte in UTF-8. Shorter strings may
 * still exceed the byte limit; only the source adapter can enforce the exact byte size.
 */
export function textExceedsFileLimit(
  text: string,
  maxFileBytes: number = knowledgePackLimits.maxFileBytes
): boolean {
  return text.length > maxFileBytes;
}

/**
 * Control characters that are never allowed in pack text: C0 and C1 controls (including tab and a
 * lone carriage return), DEL, bidirectional formatting marks, line and paragraph separators and a
 * byte order mark after the start of the text.
 */
export function isForbiddenControlCodePoint(codePoint: number): boolean {
  return (
    codePoint < 32 ||
    codePoint === 127 ||
    (codePoint >= 128 && codePoint <= 159) ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0xfeff
  );
}

export function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    if (isForbiddenControlCodePoint(character.codePointAt(0) ?? 0)) {
      return true;
    }
  }

  return false;
}
