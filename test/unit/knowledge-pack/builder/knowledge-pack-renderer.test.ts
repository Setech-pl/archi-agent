import { describe, expect, it } from "vitest";
import type { KnowledgePackRows } from "../../../../src/core/knowledge-pack/builder/knowledge-pack-candidate.js";
import {
  escapeKnowledgePackCell,
  layoutKnowledgePack,
  renderKnowledgePack
} from "../../../../src/core/knowledge-pack/builder/knowledge-pack-renderer.js";
import { knowledgePackFileNames } from "../../../../src/core/knowledge-pack/knowledge-pack-source.js";
import { parseKnowledgePackTable } from "../../../../src/core/knowledge-pack/knowledge-pack.schema.js";

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BACKSLASH = String.fromCharCode(92);

const emptyRows: KnowledgePackRows = { systems: [], actors: [], relationships: [], aliases: [], rules: [] };

const rows: KnowledgePackRows = {
  ...emptyRows,
  systems: [
    { id: "image-archive", canonical_name: "Image Archive", kind: "database", description: "Stores frames" },
    { id: "dome-controller", canonical_name: "Dome Controller", kind: "system", description: "Rotates the dome" }
  ],
  relationships: [
    {
      from_id: "dome-controller",
      to_id: "image-archive",
      interface_type: "EVENT",
      interface_name: "",
      mode: "asynchronous",
      purpose: "Reports a|b"
    }
  ]
};

describe("renderKnowledgePack", () => {
  it("returns exactly the five pack files in fixed order", () => {
    expect(renderKnowledgePack(emptyRows).map((document) => document.file)).toEqual([...knowledgePackFileNames]);
    expect(renderKnowledgePack(rows).map((document) => document.file)).toEqual([...knowledgePackFileNames]);
  });

  it("renders a heading, header, separator and rows sorted by their cells with LF endings", () => {
    const systems = renderKnowledgePack(rows)[0]!.text;

    expect(systems).toBe(
      [
        "# Systems",
        "",
        "| id | canonical_name | kind | description |",
        "| --- | --- | --- | --- |",
        "| dome-controller | Dome Controller | system | Rotates the dome |",
        "| image-archive | Image Archive | database | Stores frames |",
        ""
      ].join(LF)
    );
    expect(systems.includes(CR)).toBe(false);
    expect(layoutKnowledgePack(rows)[0]!.rowOrder).toEqual([1, 0]);
  });

  it("returns identical text for identical input and for reordered input", () => {
    const reordered: KnowledgePackRows = { ...rows, systems: [...rows.systems].reverse() };

    expect(renderKnowledgePack(rows)).toEqual(renderKnowledgePack(rows));
    expect(renderKnowledgePack(reordered)).toEqual(renderKnowledgePack(rows));
  });

  it("renders empty tables with header and separator only, accepted only when explicitly allowed", () => {
    const rules = renderKnowledgePack(emptyRows)[4]!.text;

    expect(rules).toBe(["# Rules", "", "| rule | from_id | to_id | reason |", "| --- | --- | --- | --- |", ""].join(LF));
    expect(parseKnowledgePackTable("rules", rules, { allowEmpty: true }).ok).toBe(true);
    expect(parseKnowledgePackTable("rules", rules).issues.map((issue) => issue.code)).toEqual(["no-data-rows"]);
  });

  it("escapes pipes and backslashes so that the parser reads back the original value", () => {
    const value = "a|b " + BACKSLASH + " c" + BACKSLASH + "| end" + BACKSLASH;

    expect(escapeKnowledgePackCell("a|b" + BACKSLASH)).toBe("a" + BACKSLASH + "|b" + BACKSLASH + BACKSLASH);

    const text = renderKnowledgePack({
      ...emptyRows,
      systems: [{ id: "image-archive", canonical_name: value, kind: "database", description: value }]
    })[0]!.text;
    const parsed = parseKnowledgePackTable("systems", text);

    expect(parsed.ok).toBe(true);
    expect(parsed.records[0]?.canonicalName).toBe(value);
    expect(parsed.records[0]?.description).toBe(value);
  });

  it("refuses values it cannot represent without echoing them", () => {
    const render = (description: unknown) => () =>
      renderKnowledgePack({
        ...emptyRows,
        systems: [{ id: "image-archive", canonical_name: "Image Archive", kind: "database", description } as never]
      });

    for (const bad of ["SECRET" + LF + "| x |", "SECRET <script>", "SECRET @startuml", "SECRET ${x}", 7]) {
      expect(render(bad)).toThrow(Error);

      try {
        render(bad)();
      } catch (error) {
        expect(String(error)).not.toContain("SECRET");
      }
    }

    expect(() =>
      renderKnowledgePack({ ...emptyRows, aliases: [{ alias: "A", target_id: "b", extra: "c" } as never] })
    ).toThrow(Error);
  });
});
