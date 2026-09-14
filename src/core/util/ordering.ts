/**
 * Deterministic ordering helpers. Comparison uses JavaScript string code
 * units, so the result does not depend on host locale or collation settings.
 */
export function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(stableCompare);
}
