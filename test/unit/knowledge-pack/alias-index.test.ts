import { describe, expect, it } from "vitest";
import { AliasIndex, type AliasTarget } from "../../../src/core/knowledge-pack/index/alias-index.js";
import type { AliasRecord } from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { aliasRecord } from "../../doubles/knowledge-pack-fixture.js";

const catalog = { systemIds: ["mission-control", "orbital-relay"], actorIds: ["flight-controller"] };

function aliases(): AliasRecord[] {
  return [
    aliasRecord("MCC", "mission-control", 3),
    aliasRecord("control", "mission-control", 4),
    aliasRecord("control", "flight-controller", 5),
    aliasRecord("Relay", "orbital-relay", 6),
    aliasRecord("Flight Lead", "flight-controller", 7),
    aliasRecord("CONTROL", "mission-control", 8),
    aliasRecord("---", "orbital-relay", 9)
  ];
}

describe("AliasIndex", () => {
  it("reports a missing alias", () => {
    const index = AliasIndex.from(aliases(), catalog);
    expect(index.lookup("Ground Station")).toEqual({ status: "missing", targets: [] });
    expect(index.lookup("")).toEqual({ status: "missing", targets: [] });
  });

  it("resolves a unique alias to a system or to an actor", () => {
    const index = AliasIndex.from(aliases(), catalog);
    expect(index.lookup("mcc")).toEqual({ status: "unique", targets: [{ targetId: "mission-control", targetKind: "system" }] });
    expect(index.lookup("FLIGHT_LEAD")).toEqual({
      status: "unique",
      targets: [{ targetId: "flight-controller", targetKind: "actor" }]
    });
  });

  it("keeps an alias pointing to a system and an actor ambiguous", () => {
    const index = AliasIndex.from(aliases(), catalog);
    expect(index.lookup("Control")).toEqual({
      status: "ambiguous",
      targets: [
        { targetId: "flight-controller", targetKind: "actor" },
        { targetId: "mission-control", targetKind: "system" }
      ]
    });
    expect(index.isAmbiguous("control")).toBe(true);
    expect(index.targetIds("control")).toEqual(["flight-controller", "mission-control"]);
    expect(index.ambiguousKeys()).toEqual(["control"]);
  });

  it("is deterministic regardless of input order", () => {
    const forward = AliasIndex.from(aliases(), catalog);
    const backward = AliasIndex.from([...aliases()].reverse(), catalog);
    expect(backward.keys()).toEqual(forward.keys());
    expect(forward.keys()).toEqual(["control", "flight lead", "mcc", "relay"]);

    for (const key of forward.keys()) {
      expect(backward.lookup(key)).toEqual(forward.lookup(key));
    }

    expect(forward.aliasesFor("mission-control")).toEqual(["CONTROL", "MCC", "control"]);
    expect(forward.aliasesFor("unknown")).toEqual([]);
  });

  it("does not perform fuzzy, partial or prefix matching", () => {
    const index = AliasIndex.from(aliases(), catalog);

    for (const raw of ["Contro", "controls", "Rela", "M C C", "Flight"]) {
      expect(index.lookup(raw).status).toBe("missing");
    }
  });

  it("leaves out aliases without usable characters", () => {
    expect(AliasIndex.from(aliases(), catalog).aliasesFor("orbital-relay")).toEqual(["Relay"]);
  });

  it("protects its state from changes to results", () => {
    const index = AliasIndex.from(aliases(), catalog);
    const result = index.lookup("control");
    expect(() => (result.targets as AliasTarget[]).push({ targetId: "orbital-relay", targetKind: "system" })).toThrow(TypeError);
    expect(() => {
      (result.targets[0] as { targetId: string }).targetId = "changed";
    }).toThrow(TypeError);
    expect(() => (index.keys() as string[]).push("new")).toThrow(TypeError);
    expect(Object.isFrozen(result)).toBe(true);
    expect(index.targetIds("control")).toEqual(["flight-controller", "mission-control"]);
  });

  it("rejects targets that are not exactly one declared system or actor", () => {
    expect(() => AliasIndex.from([aliasRecord("Ghost", "ghost")], catalog)).toThrow();
    expect(() =>
      AliasIndex.from([aliasRecord("Both", "shared")], { systemIds: ["shared"], actorIds: ["shared"] })
    ).toThrow();
  });
});
