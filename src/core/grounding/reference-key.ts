/**
 * Builds the comparison key for a grounding reference. The key does not depend
 * on host locale, compatibility forms, letter case or separator style.
 */
export function normalizeGroundingReference(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s_-]+/gu, " ")
    .trim()
    .toLowerCase();
}
