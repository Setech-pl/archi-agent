import { describe, expect, it } from "vitest";
import { currentDateIso } from "../../../src/core/util/date.js";

describe("currentDateIso", () => {
  it("formats the UTC calendar date", () => {
    expect(currentDateIso(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02");
  });

  it("uses UTC at the day boundary", () => {
    expect(currentDateIso(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
    expect(currentDateIso(new Date("2027-01-01T00:00:00.000Z"))).toBe("2027-01-01");
  });

  it("rejects an invalid date", () => {
    expect(() => currentDateIso(new Date(Number.NaN))).toThrow(RangeError);
  });

  it("returns a date without a time part", () => {
    expect(currentDateIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
