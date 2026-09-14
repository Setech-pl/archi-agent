/**
 * Case- and format-insensitive literal mention detection.
 *
 * Folding keeps an exact index map back into the original text, so a reported
 * mention is always a verbatim slice of the source description.
 */

export interface FoldedMentionText {
  original: string;
  folded: string;
  originalOffsets: number[];
  unitStarts: boolean[];
}

const mentionUnitPattern = /.\p{M}*/gsu;

/**
 * Folds text for case- and format-insensitive mention detection while keeping
 * an exact index map back into the original string. Folding is applied per
 * base character plus its combining marks, so a fold that changes length (for
 * example a ligature or a full-width form) can never shift the reported
 * mention offsets. Lower-casing is locale-independent.
 */
export function foldMentionText(value: string): FoldedMentionText {
  const folded: string[] = [];
  const originalOffsets: number[] = [];
  const unitStarts: boolean[] = [];
  let offset = 0;

  for (const match of value.matchAll(mentionUnitPattern)) {
    const unit = match[0];
    const foldedUnit = unit.normalize("NFKC").toLowerCase();

    for (let index = 0; index < foldedUnit.length; index += 1) {
      folded.push(foldedUnit[index]!);
      originalOffsets.push(offset);
      unitStarts.push(index === 0);
    }

    offset += unit.length;
  }

  return {
    original: value,
    folded: folded.join(""),
    originalOffsets,
    unitStarts
  };
}

/**
 * Returns the verbatim source slice of the first whole-word occurrence of
 * `search`, or undefined when the folded text does not contain it.
 */
export function findLiteralMention(
  description: FoldedMentionText,
  search: string
): string | undefined {
  const target = foldMentionText(search).folded;

  if (target.length === 0) {
    return undefined;
  }

  let index = description.folded.indexOf(target);

  while (index >= 0) {
    const end = index + target.length;
    const before = index === 0 ? "" : description.folded[index - 1];
    const after = description.folded[end] ?? "";

    if (
      description.unitStarts[index] === true &&
      (end === description.folded.length || description.unitStarts[end] === true) &&
      isBoundary(before) &&
      isBoundary(after)
    ) {
      const start = description.originalOffsets[index]!;
      const stop = end === description.folded.length
        ? description.original.length
        : description.originalOffsets[end]!;

      return description.original.slice(start, stop);
    }

    index = description.folded.indexOf(target, index + 1);
  }

  return undefined;
}

function isBoundary(character: string | undefined): boolean {
  return !character || !/[\p{L}\p{N}]/u.test(character);
}
