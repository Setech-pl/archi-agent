import { describe, expect, it } from "vitest";
import { limitText, limitWarnings, truncationMarker } from "../../../src/core/util/text-limits.js";

function omittedCount(result: string): number {
  const match = /\[truncated: (\d+) characters omitted\]$/.exec(result);

  if (match?.[1] === undefined) {
    throw new Error("missing truncation marker");
  }

  return Number(match[1]);
}

describe("limitText", () => {
  it("returns text at or below the limit unchanged", () => {
    expect(limitText("abc", 3)).toBe("abc");
    expect(limitText("abc", 10)).toBe("abc");
    expect(limitText("", 0)).toBe("");
  });

  it("truncates oversized text to exactly the limit with a consistent marker", () => {
    const value = "x".repeat(1000);
    const result = limitText(value, 60);
    expect(result.length).toBe(60);
    expect(result.indexOf(" [truncated:") + omittedCount(result)).toBe(value.length);
  });

  it("keeps a short prefix when the limit is just above the marker length", () => {
    const value = "y".repeat(500);
    const result = limitText(value, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.startsWith("y")).toBe(true);
    expect(result.indexOf(" [truncated:") + omittedCount(result)).toBe(value.length);
  });

  it("never exceeds the limit when the marker itself does not fit", () => {
    expect(limitText("abcdef", 3)).toBe("\u2026");
    expect(limitText("abcdef", 0)).toBe("");
  });
});

describe("truncationMarker", () => {
  it("states the omitted character count", () => {
    expect(truncationMarker(5)).toBe(" [truncated: 5 characters omitted]");
  });
});

describe("limitWarnings", () => {
  it("de-duplicates and sorts warnings within the limit", () => {
    expect(limitWarnings(["b", "a", "b"], 5)).toEqual(["a", "b"]);
  });

  it("keeps limit minus one entries plus a summary when entries are dropped", () => {
    expect(limitWarnings(["e", "d", "c", "b", "a"], 3))
      .toEqual(["a", "b", "Grounding diagnostics truncated: kept 2 of 5."]);
  });

  it("returns only the summary when the limit is one", () => {
    expect(limitWarnings(["b", "a"], 1)).toEqual(["Grounding diagnostics truncated: kept 0 of 2."]);
  });

  it("returns nothing for a non-positive limit", () => {
    expect(limitWarnings(["a"], 0)).toEqual([]);
    expect(limitWarnings([], 0)).toEqual([]);
  });
});
