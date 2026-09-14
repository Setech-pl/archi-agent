import { describe, expect, it } from "vitest";
import {
  actorKinds,
  interactionModes,
  interfaceTypes,
  parseKnowledgePackTable,
  ruleTypes,
  systemKinds,
  systemRowSchema,
  validateSystemsTable
} from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";

const LF = String.fromCharCode(10);
const table = (...lines: string[]): string => lines.join(LF);
const systemsHeader = ["| id | canonical_name | kind | description |", "| --- | --- | --- | --- |"];
const actorsHeader = ["| id | canonical_name | kind | description |", "| --- | --- | --- | --- |"];
const relationshipsHeader = [
  "| from_id | to_id | interface_type | interface_name | mode | purpose |",
  "| --- | --- | --- | --- | --- | --- |"
];
const aliasesHeader = ["| alias | target_id |", "| --- | --- |"];
const rulesHeader = ["| rule | from_id | to_id | reason |", "| --- | --- | --- | --- |"];

describe("knowledge-pack schemas - valid records", () => {
  it("validates systems with every kind and keeps locations", () => {
    const rows = systemKinds.map((kind, index) => `| system-${index} | System ${index} | ${kind} | Synthetic system |`);
    const result = parseKnowledgePackTable("systems", table(...systemsHeader, ...rows));
    expect(result.ok).toBe(true);
    expect(result.records.map((record) => record.kind)).toEqual([...systemKinds]);
    expect(result.records[0]).toEqual({
      id: "system-0",
      canonicalName: "System 0",
      kind: "system",
      description: "Synthetic system",
      location: { file: "systems.md", line: 3 }
    });
  });

  it("validates actors with every kind", () => {
    const rows = actorKinds.map((kind, index) => `| actor-${index} | Actor ${index} | ${kind} | Synthetic actor |`);
    const result = parseKnowledgePackTable("actors", table(...actorsHeader, ...rows));
    expect(result.ok).toBe(true);
    expect(result.records.map((record) => record.kind)).toEqual([...actorKinds]);
  });

  it("validates relationships with every interface type and mode, mapping an empty name to undefined", () => {
    const rows = interfaceTypes.flatMap((type, typeIndex) =>
      interactionModes.map(
        (mode, modeIndex) =>
          `| source-${typeIndex} | target-${modeIndex} | ${type} | ${modeIndex === 0 ? "" : "Named interface"} | ${mode} | Moves data |`
      )
    );
    const result = parseKnowledgePackTable("relationships", table(...relationshipsHeader, ...rows));
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(interfaceTypes.length * interactionModes.length);
    expect(result.records[0]?.interfaceName).toBeUndefined();
    expect(result.records[1]?.interfaceName).toBe("Named interface");
    expect(new Set(result.records.map((record) => record.interfaceType))).toEqual(new Set(interfaceTypes));
  });

  it("validates rules with every rule type", () => {
    const rows = ruleTypes.map((rule) => `| ${rule} | mission-control-portal | spacecraft-simulator | Synthetic reason |`);
    const result = parseKnowledgePackTable("rules", table(...rulesHeader, ...rows));
    expect(result.ok).toBe(true);
    expect(result.records.map((record) => record.rule)).toEqual([...ruleTypes]);
  });

  it("keeps declared alias ambiguity and several aliases per target", () => {
    const result = parseKnowledgePackTable(
      "aliases",
      table(
        ...aliasesHeader,
        "| Ground Station | ground-station-alpha |",
        "| Ground Station | ground-station-beta |",
        "| GS Alpha | ground-station-alpha |"
      )
    );
    expect(result.ok).toBe(true);
    expect(result.records.map((record) => [record.alias, record.targetId])).toEqual([
      ["Ground Station", "ground-station-alpha"],
      ["Ground Station", "ground-station-beta"],
      ["GS Alpha", "ground-station-alpha"]
    ]);
  });

  it("preserves Unicode canonical names", () => {
    const polish = String.fromCodePoint(0x015a, 0x0142, 0x0105, 0x0144);
    const result = parseKnowledgePackTable("systems", table(...systemsHeader, `| orbit-desk | Orbit ${polish} Desk | system | Text |`));
    expect(result.records[0]?.canonicalName).toBe(`Orbit ${polish} Desk`);
  });
});

describe("knowledge-pack schemas - invalid records", () => {
  it("rejects invalid identifiers without normalising them", () => {
    for (const id of ["Telemetry", "1gateway", "tele_metry", "tele.metry", "tele/metry", "-gateway", "gate way"]) {
      const result = parseKnowledgePackTable("systems", table(...systemsHeader, `| ${id} | Name | system | Text |`));
      expect(result.ok).toBe(false);
      expect(result.issues).toEqual([expect.objectContaining({ code: "invalid-identifier", line: 3, column: "id" })]);
    }
  });

  it("enforces identifier and canonical name length limits", () => {
    const longest = "a".repeat(64);
    expect(parseKnowledgePackTable("systems", table(...systemsHeader, `| ${longest} | Name | system | Text |`)).ok).toBe(true);
    expect(parseKnowledgePackTable("systems", table(...systemsHeader, `| ${longest}a | Name | system | Text |`)).issues).toEqual([
      expect.objectContaining({ code: "limit-exceeded", column: "id", limit: 64 })
    ]);
    expect(
      parseKnowledgePackTable("systems", table(...systemsHeader, `| gateway | ${"n".repeat(257)} | system | Text |`)).issues
    ).toEqual([expect.objectContaining({ code: "limit-exceeded", column: "canonical_name", limit: 256 })]);
  });

  it("rejects values outside the enums", () => {
    expect(parseKnowledgePackTable("systems", table(...systemsHeader, "| gateway | Name | robot | Text |")).issues).toEqual([
      expect.objectContaining({ code: "invalid-enum-value", column: "kind" })
    ]);
    expect(
      parseKnowledgePackTable("relationships", table(...relationshipsHeader, "| a | b | REST API |  | synchronous | Text |")).issues
    ).toEqual([expect.objectContaining({ code: "invalid-enum-value", column: "interface_type" })]);
    expect(
      parseKnowledgePackTable("relationships", table(...relationshipsHeader, "| a | b | EVENT |  | sometimes | Text |")).issues
    ).toEqual([expect.objectContaining({ code: "invalid-enum-value", column: "mode" })]);
    expect(parseKnowledgePackTable("rules", table(...rulesHeader, "| allow | a | b | Text |")).issues).toEqual([
      expect.objectContaining({ code: "invalid-enum-value", column: "rule" })
    ]);
  });

  it("rejects unknown fields", () => {
    expect(
      systemRowSchema.safeParse({ id: "gateway", canonical_name: "Name", kind: "system", description: "Text", extra: "x" }).success
    ).toBe(false);
    const result = validateSystemsTable({
      file: "systems.md",
      columns: ["id", "canonical_name", "kind", "description"],
      headerLine: 1,
      rows: [{ line: 3, cells: [], values: { id: "gateway", canonical_name: "Name", kind: "system", description: "Text", extra: "x" } }]
    });
    expect(result.issues).toEqual([expect.objectContaining({ code: "unknown-field", line: 3 })]);
  });

  it("rejects duplicate identifiers, relationships, aliases and rules within one file", () => {
    expect(
      parseKnowledgePackTable("systems", table(...systemsHeader, "| gateway | A | system | Text |", "| gateway | B | queue | Text |")).issues
    ).toEqual([expect.objectContaining({ code: "duplicate-record", line: 4, column: "id" })]);
    expect(
      parseKnowledgePackTable("actors", table(...actorsHeader, "| operator | A | role | Text |", "| operator | B | person | Text |")).issues
    ).toEqual([expect.objectContaining({ code: "duplicate-record", line: 4, column: "id" })]);
    expect(
      parseKnowledgePackTable(
        "relationships",
        table(...relationshipsHeader, "| a | b | EVENT |  | asynchronous | One |", "| a | b | EVENT |  | asynchronous | Two |")
      ).issues
    ).toEqual([expect.objectContaining({ code: "duplicate-record", line: 4 })]);
    expect(
      parseKnowledgePackTable("aliases", table(...aliasesHeader, "| Portal | portal |", "| Portal | portal |")).issues
    ).toEqual([expect.objectContaining({ code: "duplicate-record", line: 4, column: "alias" })]);
    expect(
      parseKnowledgePackTable("rules", table(...rulesHeader, "| forbid | a | b | One |", "| forbid | a | b | Two |")).issues
    ).toEqual([expect.objectContaining({ code: "duplicate-record", line: 4, column: "rule" })]);
  });

  it("reports several problems in a deterministic order", () => {
    const text = table(...systemsHeader, "| Bad_Id | Name | robot | Text |", "| 9bad | Name | system | Text |");
    const first = parseKnowledgePackTable("systems", text);
    const second = parseKnowledgePackTable("systems", text);
    expect(first.issues).toEqual(second.issues);
    expect(first.issues.map((issue) => [issue.line, issue.column, issue.code])).toEqual([
      [3, "id", "invalid-identifier"],
      [3, "kind", "invalid-enum-value"],
      [4, "id", "invalid-identifier"]
    ]);
  });

  it("returns parser issues for structurally invalid files", () => {
    const result = parseKnowledgePackTable("aliases", table("| alias |", "| --- |", "| Portal |"));
    expect(result.ok).toBe(false);
    expect(result.records).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "missing-column", column: "target_id" })]);
  });
});
