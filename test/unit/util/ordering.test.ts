import { describe, expect, it } from "vitest";
import { stableCompare, uniqueSorted } from "../../../src/core/util/ordering.js";

describe("stableCompare", () => {
  it("orders by code unit", () => {
    expect(stableCompare("a", "b")).toBe(-1);
    expect(stableCompare("b", "a")).toBe(1);
    expect(stableCompare("same", "same")).toBe(0);
  });

  it("does not depend on locale collation", () => {
    expect(["b", "B", "a", "A"].sort(stableCompare)).toEqual(["A", "B", "a", "b"]);
    expect(stableCompare("\u00e9", "f")).toBe(1);
  });

  it("orders a prefix before a longer string", () => {
    expect(stableCompare("gateway", "gateway-api")).toBe(-1);
  });
});

describe("uniqueSorted", () => {
  it("removes duplicates and sorts deterministically", () => {
    expect(uniqueSorted(["gateway", "api", "gateway"])).toEqual(["api", "gateway"]);
  });

  it("accepts any iterable and leaves the input untouched", () => {
    const input = ["b", "a"];
    expect(uniqueSorted(new Set(input))).toEqual(["a", "b"]);
    expect(input).toEqual(["b", "a"]);
  });

  it("returns an empty array for empty input", () => {
    expect(uniqueSorted([])).toEqual([]);
  });
});
