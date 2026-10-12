import { describe, expect, it } from "vitest";
import { createKnowledgeSnapshot, knowledgeSnapshotFromPack, selectKnowledgeContext, type KnowledgeContribution } from "../../../src/core/knowledge-pack/knowledge-snapshot.js";
import { loadKnowledgePack } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { stableDigest, type CanonicalValue } from "../../../src/core/util/stable-digest.js";
import { buildPackFiles } from "../../doubles/knowledge-pack-fixture.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const system = { id: "catalog", canonicalName: "Katalog", kind: "system" as const, description: "Katalog produktów" };
const second = { ...system, id: "warehouse", canonicalName: "Magazyn" };
const partial = (id = "catalog-source"): KnowledgeContribution => ({
  source: { id, kind: "system-list", scope: { systems: "partial" } }, records: { systems: [system, second] }
});
const loaded = await loadKnowledgePack(new KnowledgePackSourceDouble(buildPackFiles()));
if (!loaded.ok) throw new Error("Synthetic pack must load");

describe("K1 provider-neutral knowledge snapshot", () => {
  it("represents a systems-only source without inventing relationships or file evidence", () => {
    const snapshot = createKnowledgeSnapshot([partial()]);
    expect(snapshot.facts).toHaveLength(2);
    expect(snapshot.facts.every((fact) => fact.table === "systems")).toBe(true);
    expect(snapshot.facts[0]!.provenance).toEqual([{ sourceId: "catalog-source" }]);
    expect(snapshot.gaps.filter((gap) => gap.code === "locator-unavailable")).toHaveLength(2);
    expect(snapshot.gaps).toContainEqual({ code: "scope-not-provided", sourceId: "catalog-source", table: "relationships" });
    expect(snapshot.gaps).toContainEqual({ code: "scope-partial", sourceId: "catalog-source", table: "systems" });
    expect(snapshot.conflicts).toEqual([]);
  });

  it("adapts all five existing Markdown tables, keeping exact provenance and semantic values", () => {
    const snapshot = knowledgeSnapshotFromPack(loaded.pack);
    const rowCount = Object.values(loaded.pack).reduce((sum, rows) => sum + rows.length, 0);
    expect(snapshot.facts).toHaveLength(rowCount);
    for (const [table, rows] of Object.entries(loaded.pack)) for (const row of rows) {
      const { location, ...value } = row;
      const fact = snapshot.facts.find((fact) => fact.table === table && JSON.stringify(fact.value) === JSON.stringify(value));
      expect(fact?.provenance).toEqual([{ sourceId: "knowledge-pack", location }]);
    }
    expect(snapshot.conflicts).toEqual([]);
    expect(snapshot.gaps.every((gap) => gap.code === "required-relationship-missing")).toBe(true);
  });

  it("keeps multi-target aliases explicitly ambiguous and never chooses one", () => {
    const snapshot = createKnowledgeSnapshot([{ ...partial(), source: { ...partial().source, scope: { systems: "partial", aliases: "partial" } },
      records: { systems: [system, second], aliases: [{ alias: "Wspólny", targetId: "catalog" }, { alias: "wspólny", targetId: "warehouse" }] } }]);
    expect(snapshot.ambiguities).toEqual([{ alias: "wspólny", targetIds: ["catalog", "warehouse"] }]);
    expect(snapshot.facts.filter((fact) => fact.table === "aliases")).toHaveLength(2);
    expect(snapshot.conflicts).toEqual([]);
  });

  it("aggregates identical facts and keeps every supplied source/location", () => {
    const first = partial("first");
    const other = { ...partial("second"), records: { systems: [{ ...system, location: { file: "evidence/catalog.md", line: 4 } }] } };
    const snapshot = createKnowledgeSnapshot([first, other]);
    const catalog = snapshot.facts.find((fact) => fact.table === "systems" && fact.value.id === system.id)!;
    expect(catalog.provenance).toEqual([{ sourceId: "first" }, { sourceId: "second", location: { file: "evidence/catalog.md", line: 4 } }]);
    expect(snapshot.facts).toHaveLength(2);
  });

  it("preserves conflicting entity claims and blocks use without a resolution", () => {
    const snapshot = createKnowledgeSnapshot([partial("first"), { ...partial("second"), records: { systems: [{ ...system, canonicalName: "Other catalog" }] } }]);
    expect(snapshot.facts.filter((fact) => fact.table === "systems" && fact.value.id === "catalog")).toHaveLength(2);
    expect(snapshot.conflicts).toHaveLength(1);
    expect(snapshot.conflicts[0]).toMatchObject({ code: "incompatible-records", factIds: expect.any(Array) });
    expect(snapshot.conflicts[0]!.factIds).toHaveLength(2);
    expect(() => selectKnowledgeContext(snapshot, ["catalog"])).toThrow("knowledge-conflicts-unresolved");
  });

  it("preserves conflicting relationship/rule reasons and cross-category ID collisions", () => {
    const snapshot = createKnowledgeSnapshot([{ source: { id: "claims", kind: "test", scope: { systems: "partial", actors: "partial", relationships: "partial", rules: "partial" } }, records: {
      systems: [system, second], actors: [{ ...system, kind: "person" }], relationships: [
        { fromId: "catalog", toId: "warehouse", interfaceType: "DB", interfaceName: undefined, mode: "synchronous", purpose: "Reads" },
        { fromId: "catalog", toId: "warehouse", interfaceType: "DB", interfaceName: undefined, mode: "synchronous", purpose: "Writes" }
      ], rules: [
        { rule: "forbid", fromId: "catalog", toId: "warehouse", reason: "Isolation" },
        { rule: "require", fromId: "catalog", toId: "warehouse", reason: "Inventory" },
        { rule: "require", fromId: "catalog", toId: "warehouse", reason: "Different reason" }
      ]
    } }]);
    expect(new Set(snapshot.conflicts.map((entry) => entry.code))).toEqual(new Set([
      "incompatible-records", "identifier-collision", "conflicting-rules", "forbidden-relationship"
    ]));
    expect(snapshot.facts.filter((entry) => entry.table === "relationships")).toHaveLength(2);
    expect(snapshot.facts.filter((entry) => entry.table === "rules")).toHaveLength(3);
  });

  it("keeps references to absent entities as gaps, without adding entities", () => {
    const snapshot = createKnowledgeSnapshot([{ ...partial(), source: { ...partial().source, scope: { systems: "partial", aliases: "partial", rules: "partial" } },
      records: { systems: [system], aliases: [{ alias: "Missing", targetId: "outside" }],
        rules: [{ rule: "require", fromId: "catalog", toId: "outside", reason: "Declared requirement" }] } }]);
    expect(snapshot.facts.filter((fact) => fact.table === "systems")).toHaveLength(1);
    expect(snapshot.gaps.filter((gap) => gap.code === "missing-reference")).toHaveLength(2);
    expect(snapshot.gaps.some((gap) => gap.code === "required-relationship-missing")).toBe(true);
    expect(snapshot.facts.filter((fact) => fact.table === "relationships")).toEqual([]);
  });

  it("has identical bytes/digest across permutations, repeated claims and object key order", () => {
    const a = partial("first");
    const b = { ...partial("second"), records: { systems: [{ description: system.description, kind: system.kind, canonicalName: system.canonicalName, id: system.id }] } };
    const first = createKnowledgeSnapshot([a, b]);
    const secondSnapshot = createKnowledgeSnapshot([b, { ...a, records: { systems: [second, system, system] } }]);
    expect(secondSnapshot).toEqual(first);
    expect(JSON.stringify(secondSnapshot)).toBe(JSON.stringify(first));
    const { id, digest, ...payload } = first;
    expect(digest).toBe(stableDigest(payload as unknown as CanonicalValue));
    expect(id).toBe(`knowledge-${digest}`);
  });

  it("covers source identity, scope, facts and exact provenance in its digest", () => {
    const first = createKnowledgeSnapshot([partial()]);
    expect(createKnowledgeSnapshot([partial("other")]).digest).not.toBe(first.digest);
    expect(createKnowledgeSnapshot([{ ...partial(), source: { ...partial().source, scope: { systems: "complete" } } }]).digest).not.toBe(first.digest);
    expect(createKnowledgeSnapshot([{ ...partial(), records: { systems: [{ ...system, location: { file: "inventory.md", line: 1 } }, second] } }]).digest).not.toBe(first.digest);
    expect(createKnowledgeSnapshot([{ ...partial(), records: { systems: [{ ...system, description: "Changed" }, second] } }]).digest).not.toBe(first.digest);
  });

  it("normalizes declared scope key order in both digest and serialized bytes", () => {
    const source = partial();
    const a = createKnowledgeSnapshot([{ ...source, source: { ...source.source, scope: { systems: "partial", actors: "complete" } } }]);
    const b = createKnowledgeSnapshot([{ ...source, source: { ...source.source, scope: { actors: "complete", systems: "partial" } } }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.digest).toBe(b.digest);
  });

  it("copies and freezes inputs, and exposes only selected facts to model context", () => {
    const mutable = { ...system };
    const scope = { systems: "partial" as const };
    const snapshot = createKnowledgeSnapshot([{ source: { id: "test", kind: "test", scope }, records: { systems: [mutable, second] } }]);
    mutable.description = "Mutated";
    expect(scope).not.toBe(snapshot.sources[0]!.scope);
    expect(snapshot.facts.find((fact) => fact.table === "systems" && fact.value.id === "catalog")?.value).toMatchObject({ description: system.description });
    expect(Object.isFrozen(snapshot.facts[0]!.provenance)).toBe(true);
    expect(() => (snapshot.facts as unknown as unknown[]).pop()).toThrow();
    const selected = selectKnowledgeContext(snapshot, ["catalog"]);
    expect(selected.digest).toBe(snapshot.digest);
    expect(selected.provenance).toHaveLength(1);
    expect(JSON.stringify(selected)).not.toContain("Magazyn");
  });

  it.each([
    { ...partial(), source: { ...partial().source, id: "/absolute/secret" } },
    { ...partial(), source: { ...partial().source, scope: {} } },
    { ...partial(), records: { systems: [{ ...system, id: "Invalid" }] } },
    { ...partial(), records: { systems: [{ ...system, location: { file: "../private.md", line: 1 } }] } },
    { ...partial(), records: { systems: [{ ...system, location: { file: "inventory.md", line: 0 } }] } },
    { ...partial(), records: { systems: [{ ...system, description: "control\u0000" }] } }
  ])("rejects invalid source scope, semantics or provenance without repair", (contribution) => {
    expect(() => createKnowledgeSnapshot([contribution as KnowledgeContribution])).toThrow();
  });

  it("rejects duplicate source identities instead of silently merging declarations", () => {
    expect(() => createKnowledgeSnapshot([partial(), partial()])).toThrow("knowledge-source-invalid");
  });

  it.each([
    { ...partial(), source: { ...partial().source, id: 123 } },
    { ...partial(), source: { ...partial().source, kind: 456 } },
    { ...partial(), source: { ...partial().source, scope: [] } },
    { ...partial(), records: { systems: { length: 0 } } },
    { ...partial(), records: { systems: null } }
  ])("rejects JavaScript input type coercion at the public factory boundary", (input) => {
    expect(() => createKnowledgeSnapshot([input as unknown as KnowledgeContribution])).toThrow();
  });
});
