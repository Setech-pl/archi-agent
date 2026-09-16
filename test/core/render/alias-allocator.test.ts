import { describe, expect, it } from "vitest";
import { aliasLimits, allocateAliases, baseAlias, isSafeAlias } from "../../../src/core/render/alias-allocator.js";

describe("baseAlias", () => {
  it("derives aliases from stable references and keeps them traceable to element identifiers", () => {
    expect(baseAlias({ elementId: "mission-control" })).toBe("kp_mission_control");
    expect(baseAlias({ elementId: "telemetry-store" })).toBe("kp_telemetry_store");
    expect(baseAlias({ newName: "ground station" })).toBe("new_ground_station");
  });

  it("produces only safe identifier characters with a letter first", () => {
    const accented = `stacja ${String.fromCharCode(0x65, 0x301)}cho ${String.fromCharCode(0x142)}`;

    for (const ref of [{ elementId: "9-lives" }, { newName: accented }, { newName: "a.b (c) d" }, { elementId: "x--y__z" }]) {
      const alias = baseAlias(ref);
      expect(alias).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(isSafeAlias(alias)).toBe(true);
    }

    expect(baseAlias({ elementId: "9-lives" })).toBe("kp_9_lives");
    expect(baseAlias({ newName: accented })).toBe("new_stacja_echo");
    expect(baseAlias({ newName: String.fromCharCode(0x142) })).toBe("new_participant");
  });

  it("bounds the alias length", () => {
    const alias = baseAlias({ elementId: `a${"-b".repeat(60)}` });

    expect(alias.length).toBeLessThanOrEqual(aliasLimits.maxBaseChars);
    expect(alias.endsWith("_")).toBe(false);
  });
});

describe("allocateAliases", () => {
  it("maps each participant reference key to one alias", () => {
    const aliases = allocateAliases([{ elementId: "mission-control" }, { newName: "ground station" }, { elementId: "mission-control" }]);

    expect([...aliases.entries()]).toEqual([
      ["kp:mission-control", "kp_mission_control"],
      ["new:ground station", "new_ground_station"]
    ]);
  });

  it("resolves collisions, including letter-case collisions, with deterministic suffixes", () => {
    const aliases = allocateAliases([{ elementId: "ground-station" }, { elementId: "ground_station" }, { elementId: "Ground-Station" }]);

    expect(Object.fromEntries(aliases)).toEqual({
      "kp:Ground-Station": "kp_Ground_Station",
      "kp:ground-station": "kp_ground_station_2",
      "kp:ground_station": "kp_ground_station_3"
    });
    expect(new Set([...aliases.values()].map((alias) => alias.toLowerCase())).size).toBe(3);
  });

  it("does not depend on the insertion order of the references", () => {
    const refs = [{ elementId: "ground-station" }, { newName: "ground station" }, { elementId: "ground_station" }, { elementId: "command-queue" }];
    const forward = Object.fromEntries(allocateAliases(refs));
    const reversed = Object.fromEntries(allocateAliases([...refs].reverse()));

    expect(reversed).toEqual(forward);
  });

  it("never lets a new participant alias collide with a known element alias", () => {
    const aliases = allocateAliases([{ elementId: "ground-station" }, { newName: "ground station" }]);

    expect(aliases.get("kp:ground-station")?.startsWith("kp_")).toBe(true);
    expect(aliases.get("new:ground station")?.startsWith("new_")).toBe(true);
  });

  it("recognizes unsafe aliases", () => {
    for (const value of ["", "1abc", "_abc", "a-b", "a b", "a.b", "x".repeat(aliasLimits.maxBaseChars + 7)]) {
      expect(isSafeAlias(value)).toBe(false);
    }
  });
});
