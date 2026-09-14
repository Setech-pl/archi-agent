import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RelationshipIndex } from "../../../src/core/knowledge-pack/index/relationship-index.js";
import { parseKnowledgePackTable, type RelationshipRecord } from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { relationshipRecord } from "../../doubles/knowledge-pack-fixture.js";

function relationships(): RelationshipRecord[] {
  return [
    relationshipRecord("a", "b", { interfaceType: "EVENT", interfaceName: "Beta Feed" }, 3),
    relationshipRecord("a", "b", { interfaceType: "REST_API", interfaceName: "Alpha API", mode: "synchronous" }, 4),
    relationshipRecord("b", "a", { interfaceType: "EVENT" }, 5),
    relationshipRecord("a", "c", { interfaceType: "DB", mode: "synchronous" }, 6),
    relationshipRecord("c", "b", { interfaceType: "EVENT", interfaceName: "Alpha API" }, 7)
  ];
}

describe("RelationshipIndex", () => {
  it("is directional and never creates reverse relationships", () => {
    const index = RelationshipIndex.from(relationships());
    expect(index.find("a", "b")).toHaveLength(2);
    expect(index.find("b", "a").map((record) => record.location.line)).toEqual([5]);
    expect(index.find("c", "a")).toEqual([]);
    expect(index.has("a", "c")).toBe(true);
    expect(index.has("c", "a")).toBe(false);
    expect(index.find("x", "y")).toEqual([]);
  });

  it("returns every relationship of a pair in deterministic order", () => {
    const index = RelationshipIndex.from(relationships());
    expect(index.find("a", "b").map((record) => record.interfaceType)).toEqual(["EVENT", "REST_API"]);
    expect(index.outgoing("a").map((record) => [record.toId, record.interfaceType])).toEqual([
      ["b", "EVENT"],
      ["b", "REST_API"],
      ["c", "DB"]
    ]);
  });

  it("keeps an empty interface name undefined and invents none", () => {
    const index = RelationshipIndex.from(relationships());
    expect(index.find("a", "c")[0]?.interfaceName).toBeUndefined();
    expect(index.interfaceNamesFor("a", "c")).toEqual([]);
    expect(index.interfaceNamesFor("b", "a")).toEqual([]);
  });

  it("lists unique, sorted declared interface names", () => {
    const index = RelationshipIndex.from(relationships());
    expect(index.declaredInterfaceNames()).toEqual(["Alpha API", "Beta Feed"]);
    expect(index.interfaceNamesFor("a", "b")).toEqual(["Alpha API", "Beta Feed"]);
    expect(index.interfaceNamesFor("c", "b")).toEqual(["Alpha API"]);
  });

  it("is deterministic regardless of input order", () => {
    const forward = RelationshipIndex.from(relationships());
    const backward = RelationshipIndex.from([...relationships()].reverse());
    expect(backward.all()).toEqual(forward.all());
    expect(backward.find("a", "b")).toEqual(forward.find("a", "b"));
    expect(backward.declaredInterfaceNames()).toEqual(forward.declaredInterfaceNames());
  });

  it("keeps pairs apart even when concatenated identifiers would collide", () => {
    const index = RelationshipIndex.from([
      relationshipRecord("ab", "c", { interfaceName: "First" }),
      relationshipRecord("a", "bc", { interfaceName: "Second" }),
      relationshipRecord("a-b", "c", { interfaceName: "Third" }),
      relationshipRecord("a", "b-c", { interfaceName: "Fourth" })
    ]);
    expect(index.interfaceNamesFor("ab", "c")).toEqual(["First"]);
    expect(index.interfaceNamesFor("a", "bc")).toEqual(["Second"]);
    expect(index.interfaceNamesFor("a-b", "c")).toEqual(["Third"]);
    expect(index.interfaceNamesFor("a", "b-c")).toEqual(["Fourth"]);
    expect(index.find("a", "b")).toEqual([]);
  });

  it("protects its state from changes to results and to the input", () => {
    const input = relationships();
    const index = RelationshipIndex.from(input);
    const found = index.find("a", "b");
    expect(() => (found as RelationshipRecord[]).push(relationshipRecord("a", "b"))).toThrow(TypeError);
    expect(() => {
      (found[0] as { purpose: string }).purpose = "changed";
    }).toThrow(TypeError);
    expect(() => (index.declaredInterfaceNames() as string[]).push("Invented")).toThrow(TypeError);
    expect(() => (index.all() as RelationshipRecord[]).pop()).toThrow(TypeError);

    (input[0] as { interfaceName: string | undefined }).interfaceName = "Changed Input";
    expect(index.declaredInterfaceNames()).toEqual(["Alpha API", "Beta Feed"]);
    expect(index.size).toBe(5);
  });

  it("indexes the space mission sample relationships", () => {
    const text = readFileSync(new URL("../../../samples/space-mission/architecture/relationships.md", import.meta.url), "utf8");
    const parsed = parseKnowledgePackTable("relationships", text);
    expect(parsed.ok).toBe(true);
    const index = RelationshipIndex.from(parsed.records);
    expect(index.declaredInterfaceNames()).toEqual([
      "Approval Console",
      "Command API",
      "Command Accepted Event",
      "Command Plan File",
      "Command Status Event",
      "Downlink Frame",
      "Operator Console",
      "Telemetry Query API",
      "Uplink Frame"
    ]);
    expect(index.find("mission-control", "command-service").map((record) => record.interfaceType)).toEqual(["FILE", "REST_API"]);
    expect(index.find("command-service", "mission-control").map((record) => record.interfaceName)).toEqual(["Command Status Event"]);
  });
});
