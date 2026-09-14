import { describe, expect, it } from "vitest";
import { ActorIndex } from "../../../src/core/knowledge-pack/index/actor-index.js";
import type { ActorRecord } from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { actorRecord, buildPackFixture } from "../../doubles/knowledge-pack-fixture.js";

const accented = String.fromCodePoint(0x0141, 0x0105, 0x0107);
const accentedLower = String.fromCodePoint(0x0142, 0x0105, 0x0107);

function actors(): ActorRecord[] {
  return [
    actorRecord("flight-lead", "Flight Controller", 3),
    actorRecord("flight-controller", "flight-controller", 4),
    actorRecord("mission-commander", "Mission Commander", 5),
    actorRecord("ground-crew", `Ground ${accented} Crew`, 6)
  ];
}

describe("ActorIndex", () => {
  it("indexes actors only", () => {
    const index = ActorIndex.from(buildPackFixture().actors);
    expect(index.all().map((record) => record.id)).toEqual(["night-observer"]);
    expect(index.byId("telescope-scheduler")).toBeUndefined();
  });

  it("looks up identifiers, exact names and normalized names", () => {
    const index = ActorIndex.from(actors());
    expect(index.byId("mission-commander")?.canonicalName).toBe("Mission Commander");
    expect(index.byId("MISSION-COMMANDER")).toBeUndefined();
    expect(index.byCanonical("Mission Commander").map((record) => record.id)).toEqual(["mission-commander"]);
    expect(index.byCanonical("mission commander")).toEqual([]);
    expect(index.byNormalized("MISSION_commander").map((record) => record.id)).toEqual(["mission-commander"]);
  });

  it("reports missing, unique and several candidates without choosing", () => {
    const index = ActorIndex.from(actors());
    expect(index.lookup("Payload Specialist")).toEqual({ status: "missing", candidates: [] });
    expect(index.lookup("Mission Commander").status).toBe("unique");

    const ambiguous = index.lookup("Flight Controller");
    expect(ambiguous.status).toBe("ambiguous");
    expect(ambiguous.candidates.map((candidate) => [candidate.record.id, candidate.matchedBy])).toEqual([
      ["flight-controller", ["normalized"]],
      ["flight-lead", ["canonical", "normalized"]]
    ]);
    expect(index.lookup("flight-controller").candidates.map((candidate) => [candidate.record.id, candidate.matchedBy])).toEqual([
      ["flight-controller", ["id", "canonical", "normalized"]],
      ["flight-lead", ["normalized"]]
    ]);
  });

  it("sorts deterministically regardless of input order", () => {
    const forward = ActorIndex.from(actors());
    const backward = ActorIndex.from([...actors()].reverse());
    expect(backward.all()).toEqual(forward.all());
    expect(backward.lookup("flight controller")).toEqual(forward.lookup("flight controller"));
  });

  it("preserves Unicode names and does not match approximately", () => {
    const index = ActorIndex.from(actors());
    expect(index.byId("ground-crew")?.canonicalName).toBe(`Ground ${accented} Crew`);
    expect(index.byNormalized(`ground ${accentedLower} crew`).map((record) => record.id)).toEqual(["ground-crew"]);
    expect(index.lookup("Ground Lac Crew").status).toBe("missing");

    for (const raw of ["Flight", "Flight Controllers", "Fligt Controller", "Commander"]) {
      expect(index.lookup(raw).status).toBe("missing");
    }
  });

  it("protects its state from changes to results", () => {
    const index = ActorIndex.from(actors());
    const all = index.all();
    const candidates = index.candidates("Flight Controller");
    expect(() => (all as ActorRecord[]).splice(0, 1)).toThrow(TypeError);
    expect(() => {
      (candidates as unknown[]).length = 0;
    }).toThrow(TypeError);
    expect(() => {
      (all[0] as { id: string }).id = "changed";
    }).toThrow(TypeError);
    expect(index.lookup("Flight Controller").candidates).toHaveLength(2);
    expect(index.size).toBe(4);
  });
});
