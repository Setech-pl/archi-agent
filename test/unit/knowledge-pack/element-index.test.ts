import { describe, expect, it } from "vitest";
import { ElementIndex } from "../../../src/core/knowledge-pack/index/element-index.js";
import type { SystemRecord } from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { buildPackFixture, systemRecord } from "../../doubles/knowledge-pack-fixture.js";

const accented = String.fromCodePoint(0x015a, 0x0142, 0x0105);
const accentedLower = String.fromCodePoint(0x015b, 0x0142, 0x0105);

function systems(): SystemRecord[] {
  return [
    systemRecord("telemetry-store", "Telemetry Store", 3),
    systemRecord("mission-control", "Mission Control", 4),
    systemRecord("telemetry-archive", "telemetry_store", 5),
    systemRecord("orbit-desk", `Orbit ${accented} Desk`, 6)
  ];
}

describe("ElementIndex", () => {
  it("indexes systems only", () => {
    const pack = buildPackFixture();
    const index = ElementIndex.from(pack.systems);
    expect(index.all().map((record) => record.id)).toEqual(["dome-controller", "image-archive", "telescope-scheduler"]);
    expect(index.byId("night-observer")).toBeUndefined();
  });

  it("looks up exact identifiers", () => {
    const index = ElementIndex.from(systems());
    expect(index.byId("mission-control")?.canonicalName).toBe("Mission Control");
    expect(index.byId("Mission-Control")).toBeUndefined();
    expect(index.byId("mission control")).toBeUndefined();
  });

  it("looks up exact canonical names without normalization", () => {
    const index = ElementIndex.from(systems());
    expect(index.byCanonical("Mission Control").map((record) => record.id)).toEqual(["mission-control"]);
    expect(index.byCanonical("mission control")).toEqual([]);
  });

  it("looks up normalized names", () => {
    const index = ElementIndex.from(systems());

    for (const raw of ["mission control", "MISSION_CONTROL", "  Mission   Control ", "mission-control"]) {
      expect(index.byNormalized(raw).map((record) => record.id)).toEqual(["mission-control"]);
    }

    expect(index.byNormalized("---")).toEqual([]);
  });

  it("reports missing, unique and ambiguous lookups without choosing", () => {
    const index = ElementIndex.from(systems());
    expect(index.lookup("Ground Station")).toEqual({ status: "missing", candidates: [] });

    const unique = index.lookup("Mission Control");
    expect(unique.status).toBe("unique");
    expect(unique.candidates.map((candidate) => [candidate.record.id, candidate.matchedBy])).toEqual([
      ["mission-control", ["canonical", "normalized"]]
    ]);
    expect(index.lookup("mission-control").candidates[0]?.matchedBy).toEqual(["id", "normalized"]);

    const ambiguous = index.lookup("Telemetry Store");
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.candidates.map((candidate) => [candidate.record.id, candidate.matchedBy])).toEqual([
      ["telemetry-archive", ["normalized"]],
      ["telemetry-store", ["canonical", "normalized"]]
    ]);
  });

  it("sorts deterministically regardless of input order", () => {
    const forward = ElementIndex.from(systems());
    const backward = ElementIndex.from([...systems()].reverse());
    expect(backward.all()).toEqual(forward.all());
    expect(backward.lookup("telemetry store")).toEqual(forward.lookup("telemetry store"));
    expect(forward.all().map((record) => record.id)).toEqual(["mission-control", "orbit-desk", "telemetry-archive", "telemetry-store"]);
  });

  it("preserves Unicode names and does not fold diacritics", () => {
    const index = ElementIndex.from(systems());
    expect(index.byId("orbit-desk")?.canonicalName).toBe(`Orbit ${accented} Desk`);
    expect(index.byCanonical(`Orbit ${accented} Desk`).map((record) => record.id)).toEqual(["orbit-desk"]);
    expect(index.byNormalized(`orbit ${accentedLower} desk`).map((record) => record.id)).toEqual(["orbit-desk"]);
    expect(index.lookup("Orbit Sla Desk").status).toBe("missing");
  });

  it("does not perform fuzzy, partial or prefix matching", () => {
    const index = ElementIndex.from(systems());

    for (const raw of ["Mision Control", "Mission", "Control", "mission-contro", "Mission Controls", "Telemetry"]) {
      expect(index.lookup(raw).status).toBe("missing");
    }
  });

  it("protects its state from changes to results and to the input", () => {
    const input = systems();
    const index = ElementIndex.from(input);
    const all = index.all();
    const found = index.byCanonical("Mission Control");
    const lookup = index.lookup("Telemetry Store");

    expect(() => (all as SystemRecord[]).push(systemRecord("intruder", "Intruder"))).toThrow(TypeError);
    expect(() => (found as SystemRecord[]).pop()).toThrow(TypeError);
    expect(() => {
      (found[0] as { canonicalName: string }).canonicalName = "Changed";
    }).toThrow(TypeError);
    expect(() => {
      (lookup.candidates[0]?.matchedBy as string[]).push("id");
    }).toThrow(TypeError);
    expect(Object.isFrozen(lookup)).toBe(true);

    (input[1] as { canonicalName: string }).canonicalName = "Changed Input";
    expect(index.byId("mission-control")?.canonicalName).toBe("Mission Control");
    expect(index.size).toBe(4);
  });

  it("rejects duplicate identifiers as a programming error", () => {
    expect(() => ElementIndex.from([systemRecord("gateway", "A"), systemRecord("gateway", "B")])).toThrow();
  });
});
