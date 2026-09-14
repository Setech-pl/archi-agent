import { uniqueSorted } from "./ordering.js";

/**
 * Bounds a text to `limit` characters. A truncated result ends with a marker
 * that states how many characters were omitted and never exceeds the limit.
 */
export function limitText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  let retainedCharacters = 0;
  let marker = truncationMarker(value.length);

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const nextRetainedCharacters = Math.max(0, limit - marker.length);
    const omittedCharacters = value.length - nextRetainedCharacters;
    const nextMarker = truncationMarker(omittedCharacters);

    if (
      nextRetainedCharacters === retainedCharacters &&
      nextMarker === marker
    ) {
      break;
    }

    retainedCharacters = nextRetainedCharacters;
    marker = nextMarker;
  }

  if (marker.length > limit) {
    return "\u2026".slice(0, Math.max(0, limit));
  }

  retainedCharacters = Math.max(0, limit - marker.length);
  return `${value.slice(0, retainedCharacters)}${marker}`;
}

export function truncationMarker(omittedCharacters: number): string {
  return ` [truncated: ${omittedCharacters} characters omitted]`;
}

/**
 * De-duplicates and sorts warnings, keeping at most `limit` entries. When
 * entries are dropped, the last kept entry states how many were kept.
 */
export function limitWarnings(warnings: string[], limit: number): string[] {
  const unique = uniqueSorted(warnings);

  if (unique.length <= limit) {
    return unique;
  }

  if (limit < 1) {
    return [];
  }

  if (limit === 1) {
    return [`Grounding diagnostics truncated: kept 0 of ${unique.length}.`];
  }

  return [
    ...unique.slice(0, limit - 1),
    `Grounding diagnostics truncated: kept ${limit - 1} of ${unique.length}.`
  ];
}
