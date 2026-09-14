import { describe, expect, it } from "vitest";
import { toPlantUmlAlias } from "../../../src/core/util/slugify.js";

describe("toPlantUmlAlias", () => {
  it("replaces spaces and punctuation with single underscores", () => {
    expect(toPlantUmlAlias("Mission Control Portal")).toBe("Mission_Control_Portal");
    expect(toPlantUmlAlias("a.b/c")).toBe("a_b_c");
  });

  it("maps the new-participant prefix to an alias-safe prefix", () => {
    expect(toPlantUmlAlias("[NEW] Orbit Dynamics Engine")).toBe("NEW_Orbit_Dynamics_Engine");
  });

  it("strips combining marks after decomposition", () => {
    expect(toPlantUmlAlias("Caf\u00e9 Service")).toBe("Cafe_Service");
  });

  it("trims leading and trailing separators", () => {
    expect(toPlantUmlAlias("  --Telemetry Gateway--  ")).toBe("Telemetry_Gateway");
  });

  it("falls back to a fixed alias when nothing alias-safe remains", () => {
    expect(toPlantUmlAlias("!!!")).toBe("Element");
    expect(toPlantUmlAlias("")).toBe("Element");
  });

  it("is deterministic for repeated calls", () => {
    expect(toPlantUmlAlias("Command Queue")).toBe(toPlantUmlAlias("Command Queue"));
  });
});
