import { describe, expect, it } from "vitest";
import { normalizeGroundingReference } from "../../../src/core/grounding/reference-key.js";

describe("normalizeGroundingReference", () => {
  it("unifies case, separators and surrounding whitespace", () => {
    expect(normalizeGroundingReference("  Mission_Control-Portal  ")).toBe("mission control portal");
    expect(normalizeGroundingReference("Mission \t Control\nPortal")).toBe("mission control portal");
  });

  it("folds compatibility forms", () => {
    expect(normalizeGroundingReference("\uff2d\uff49\uff53\uff53\uff49\uff4f\uff4e")).toBe("mission");
  });

  it("lower-cases without depending on the host locale", () => {
    expect(normalizeGroundingReference("IDENTITY SERVICE")).toBe("identity service");
  });

  it("is idempotent and deterministic", () => {
    const once = normalizeGroundingReference(" Telemetry__Gateway ");
    expect(normalizeGroundingReference(once)).toBe(once);
    expect(normalizeGroundingReference(" Telemetry__Gateway ")).toBe(once);
  });

  it("keeps distinct names distinct", () => {
    expect(normalizeGroundingReference("Telemetry Gateway"))
      .not.toBe(normalizeGroundingReference("Telemetry Gateways"));
  });

  it("returns an empty key for blank input", () => {
    expect(normalizeGroundingReference(" \t-_ ")).toBe("");
  });
});
