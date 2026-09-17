import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareLoadIssues,
  knowledgePackLoadCodes,
  loadKnowledgePack,
  requiredKnowledgePackFiles,
  type KnowledgePackLoadIssue,
  type KnowledgePackLoadResult,
  type LoadKnowledgePackOptions
} from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { knowledgePackLimits } from "../../../src/core/knowledge-pack/source-limits.js";
import { basePackRows, buildPackFiles, type PackRows } from "../../doubles/knowledge-pack-fixture.js";
import {
  KnowledgePackSourceDouble,
  typedSourceError,
  type SourceDoubleOptions
} from "../../doubles/knowledge-pack-source-double.js";

type Success = Extract<KnowledgePackLoadResult, { ok: true }>;

const LF = String.fromCharCode(10);
const fixtureDir = new URL("../../fixtures/space-mission/architecture/", import.meta.url);
const sampleDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);

async function load(
  files: Readonly<Record<string, string>>,
  sourceOptions: SourceDoubleOptions = {},
  options: LoadKnowledgePackOptions = {}
): Promise<{ source: KnowledgePackSourceDouble; result: KnowledgePackLoadResult }> {
  const source = new KnowledgePackSourceDouble(files, sourceOptions);
  return { source, result: await loadKnowledgePack(source, options) };
}

function expectSuccess(result: KnowledgePackLoadResult): Success {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected a loaded pack.");
  }

  return result;
}

function expectFailure(result: KnowledgePackLoadResult): readonly KnowledgePackLoadIssue[] {
  expect(result.ok).toBe(false);
  expect("pack" in result).toBe(false);
  expect("indexes" in result).toBe(false);
  return result.ok ? [] : result.issues;
}

function withRows(overrides: Partial<PackRows>): Record<string, string> {
  return { ...buildPackFiles(overrides) };
}

function without(file: string): Record<string, string> {
  const files = withRows({});
  delete files[file];
  return files;
}

function readPack(dir: URL): Record<string, string> {
  return Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, dir), "utf8")]));
}

describe("loadKnowledgePack - files", () => {
  it("names exactly the five pack files", () => {
    expect([...requiredKnowledgePackFiles]).toEqual(["systems.md", "actors.md", "relationships.md", "aliases.md", "rules.md"]);
    expect(new Set(knowledgePackLoadCodes).size).toBe(knowledgePackLoadCodes.length);
  });

  it("loads a valid pack with indexes and no warnings", async () => {
    const { result } = await load(withRows({}));
    const loaded = expectSuccess(result);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.pack.systems.map((record) => record.id)).toEqual(["telescope-scheduler", "dome-controller", "image-archive"]);
    expect(loaded.pack.actors.map((record) => record.id)).toEqual(["night-observer"]);
    expect(loaded.pack.relationships).toHaveLength(3);
    expect(loaded.pack.aliases).toHaveLength(2);
    expect(loaded.pack.rules).toHaveLength(2);
    expect(loaded.indexes.elements.byId("dome-controller")?.canonicalName).toBe("Dome Controller");
    expect(loaded.indexes.actors.byId("night-observer")?.kind).toBe("role");
    expect(loaded.indexes.aliases.lookup("scheduler").status).toBe("unique");
    expect(Object.isFrozen(loaded.pack)).toBe(true);
  });

  it("gives the same result for any listing order and reads files in the fixed order", async () => {
    const outcomes = [];

    for (const order of ["as-given", "reversed", "sorted"] as const) {
      const { source, result } = await load(withRows({}), { order });
      const loaded = expectSuccess(result);
      expect(source.readPaths).toEqual([...requiredKnowledgePackFiles]);
      outcomes.push({ pack: loaded.pack, warnings: loaded.warnings });
    }

    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[2]).toEqual(outcomes[0]);
  });

  it("lists once and reads every required file exactly once with the byte limit", async () => {
    const files = withRows({});
    const { source } = await load(files, { listing: [...Object.keys(files), "systems.md", "rules.md"] });
    expect(source.listCallCount).toBe(1);

    for (const file of requiredKnowledgePackFiles) {
      expect(source.readCount(file)).toBe(1);
      expect(source.readOptionsFor(file)?.maxBytes).toBe(knowledgePackLimits.maxFileBytes);
    }
  });

  it("reports each missing file and still reads the others", async () => {
    for (const missing of requiredKnowledgePackFiles) {
      const { source, result } = await load(without(missing));
      expect(expectFailure(result)).toEqual([
        expect.objectContaining({ severity: "error", code: "missing-file", file: missing })
      ]);
      expect(source.wasRead(missing)).toBe(false);

      for (const other of requiredKnowledgePackFiles.filter((file) => file !== missing)) {
        expect(source.readCount(other)).toBe(1);
      }
    }
  });

  it("does not accept a file name with different letter case", async () => {
    const files = without("systems.md");
    files["Systems.md"] = buildPackFiles()["systems.md"] ?? "";
    const { source, result } = await load(files);
    const issues = expectFailure(result);
    expect(issues.map((found) => [found.code, found.file])).toEqual([
      ["missing-file", "systems.md"],
      ["unexpected-file", "Systems.md"]
    ]);
    expect(source.wasRead("Systems.md")).toBe(false);
  });

  it("rejects additional Markdown files without reading them", async () => {
    const files = { ...withRows({}), "notes.md": "# Notes", "extra/overview.markdown": "# Overview" };
    const { source, result } = await load(files);
    expect(expectFailure(result).map((found) => [found.severity, found.code, found.file])).toEqual([
      ["error", "unexpected-file", "extra/overview.markdown"],
      ["error", "unexpected-file", "notes.md"]
    ]);
    expect(source.wasRead("notes.md")).toBe(false);
    expect(source.wasRead("extra/overview.markdown")).toBe(false);
  });

  it("ignores files that are not Markdown with a warning and never reads them", async () => {
    const files = withRows({});
    const { source, result } = await load(files, { listing: [...Object.keys(files), "diagram.png", "readme.txt"] });
    const loaded = expectSuccess(result);
    expect(loaded.warnings).toEqual([
      { severity: "warning", code: "ignored-file", message: expect.any(String), file: "diagram.png" },
      { severity: "warning", code: "ignored-file", message: expect.any(String), file: "readme.txt" }
    ]);
    expect(source.wasRead("diagram.png")).toBe(false);
    expect(source.wasRead("readme.txt")).toBe(false);
  });

  it("rejects listing entries that are not safe relative paths without echoing them", async () => {
    const files = withRows({});
    const { result } = await load(files, { listing: [...Object.keys(files), "../hidden-marker.md"] });
    const issues = expectFailure(result);
    expect(issues).toEqual([expect.objectContaining({ code: "invalid-path" })]);
    expect(JSON.stringify(issues)).not.toContain("hidden-marker");
  });
});

describe("loadKnowledgePack - source failures", () => {
  it("maps an untyped read error to read-failed without using its message", async () => {
    const { result } = await load(withRows({}), { readFailures: { "actors.md": new Error("disk hidden-marker") } });
    const issues = expectFailure(result);
    expect(issues).toEqual([expect.objectContaining({ code: "read-failed", file: "actors.md" })]);
    expect(JSON.stringify(issues)).not.toContain("hidden-marker");
  });

  it("keeps the code of a typed source error", async () => {
    const { result } = await load(withRows({}), { readFailures: { "rules.md": typedSourceError("missing-file", "rules.md") } });
    expect(expectFailure(result)).toEqual([expect.objectContaining({ code: "missing-file", file: "rules.md" })]);
  });

  it("reports a failing listing as one issue", async () => {
    const { source, result } = await load(withRows({}), { listFailure: new Error("listing hidden-marker") });
    const issues = expectFailure(result);
    expect(issues.map((found) => found.code)).toEqual(["read-failed"]);
    expect(JSON.stringify(issues)).not.toContain("hidden-marker");
    expect(source.readPaths).toEqual([]);
  });

  it("stops on cancellation before listing and during reading", async () => {
    const before = await load(withRows({}), {}, { signal: { aborted: true } });
    expect(expectFailure(before.result).map((found) => found.code)).toEqual(["cancelled"]);
    expect(before.source.listCallCount).toBe(0);

    const during = await load(withRows({}), { readFailures: { "actors.md": typedSourceError("cancelled") } });
    expect(expectFailure(during.result).map((found) => found.code)).toEqual(["cancelled"]);
    expect(during.source.wasRead("relationships.md")).toBe(false);
  });
});

describe("loadKnowledgePack - per-file validation", () => {
  it("reports a malformed table in each file and returns no pack", async () => {
    for (const file of requiredKnowledgePackFiles) {
      const files = withRows({});
      files[file] = ["Free text before the table", "| a | b |", "| --- | --- |", "| 1 | 2 |"].join(LF);
      const issues = expectFailure((await load(files)).result);
      expect(issues.length).toBeGreaterThan(0);

      for (const found of issues) {
        expect(found.file).toBe(file);
        expect(found.severity).toBe("error");
      }
    }
  });

  it("accepts empty actors, relationships, aliases and rules tables", async () => {
    const { result } = await load(withRows({ actors: [], relationships: [], aliases: [], rules: [] }));
    const loaded = expectSuccess(result);

    expect(loaded.pack.systems).toHaveLength(basePackRows.systems.length);
    expect(loaded.pack.actors).toEqual([]);
    expect(loaded.pack.relationships).toEqual([]);
    expect(loaded.pack.aliases).toEqual([]);
    expect(loaded.pack.rules).toEqual([]);
    expect(loaded.warnings).toEqual([]);
  });

  it("still rejects a pack without systems", async () => {
    const { result } = await load(withRows({ systems: [], actors: [], relationships: [], aliases: [], rules: [] }));
    expect(expectFailure(result).map((found) => [found.file, found.code])).toEqual([["systems.md", "no-data-rows"]]);
  });

  it("rejects an exact duplicate relationship", async () => {
    const duplicate = basePackRows.relationships[2] ?? [];
    const { result } = await load(withRows({ relationships: [...basePackRows.relationships, duplicate] }));
    expect(expectFailure(result)).toEqual([
      expect.objectContaining({ code: "duplicate-record", file: "relationships.md", line: 6 })
    ]);
  });
});

describe("loadKnowledgePack - cross-file validation", () => {
  it("rejects a system and an actor sharing an identifier", async () => {
    const actors = [...basePackRows.actors, ["image-archive", "Archive Keeper", "role", "Keeps the archive"]];
    const { result } = await load(withRows({ actors }));
    expect(expectFailure(result)).toEqual([
      expect.objectContaining({ code: "identifier-collision", file: "actors.md", line: 4, column: "id" })
    ]);
  });

  it("rejects an alias pointing to an undeclared target", async () => {
    const aliases = [...basePackRows.aliases, ["Ghost", "ghost-target"]];
    const { result } = await load(withRows({ aliases }));
    expect(expectFailure(result)).toEqual([
      expect.objectContaining({ code: "unknown-reference", file: "aliases.md", line: 5, column: "target_id" })
    ]);
  });

  it("rejects an alias that has no usable characters", async () => {
    const aliases = [...basePackRows.aliases, ["---", "image-archive"]];
    const { result } = await load(withRows({ aliases }));
    expect(expectFailure(result)).toEqual([
      expect.objectContaining({ code: "invalid-value", file: "aliases.md", line: 5, column: "alias" })
    ]);
  });

  it("rejects relationships with an undeclared source or target", async () => {
    const unknownFrom = ["ghost-system", "image-archive", "EVENT", "", "asynchronous", "Sends frames"];
    const unknownTo = ["telescope-scheduler", "ghost-system", "EVENT", "", "asynchronous", "Sends frames"];
    const first = await load(withRows({ relationships: [...basePackRows.relationships, unknownFrom] }));
    expect(expectFailure(first.result)).toEqual([
      expect.objectContaining({ code: "unknown-reference", file: "relationships.md", line: 6, column: "from_id" })
    ]);
    const second = await load(withRows({ relationships: [...basePackRows.relationships, unknownTo] }));
    expect(expectFailure(second.result)).toEqual([
      expect.objectContaining({ code: "unknown-reference", file: "relationships.md", line: 6, column: "to_id" })
    ]);
  });

  it("rejects rules with an undeclared endpoint", async () => {
    const rules = [...basePackRows.rules, ["forbid", "night-observer", "ghost-system", "Synthetic reason"]];
    const { result } = await load(withRows({ rules }));
    expect(expectFailure(result)).toEqual([
      expect.objectContaining({ code: "unknown-reference", file: "rules.md", line: 5, column: "to_id" })
    ]);
  });

  it("accepts several different relationships for one directed pair", async () => {
    const extra = ["telescope-scheduler", "image-archive", "FILE", "Frame Export", "asynchronous", "Exports frames"];
    const { result } = await load(withRows({ relationships: [...basePackRows.relationships, extra] }));
    const loaded = expectSuccess(result);
    expect(loaded.indexes.relationships.find("telescope-scheduler", "image-archive").map((record) => record.interfaceType)).toEqual([
      "DB",
      "FILE"
    ]);
    expect(loaded.indexes.relationships.find("image-archive", "telescope-scheduler")).toEqual([]);
  });

  it("rejects forbid and require for the same directed pair", async () => {
    const rules = [...basePackRows.rules, ["require", "night-observer", "dome-controller", "reason-marker-value"]];
    const { result } = await load(withRows({ rules }));
    const issues = expectFailure(result);
    expect(issues).toEqual([expect.objectContaining({ code: "conflicting-rules", file: "rules.md", line: 5, column: "rule" })]);
    expect(JSON.stringify(issues)).not.toContain("reason-marker-value");
  });

  it("rejects a declared relationship that a rule forbids", async () => {
    const rules = [...basePackRows.rules, ["forbid", "telescope-scheduler", "dome-controller", "Synthetic reason"]];
    const { result } = await load(withRows({ rules }));
    expect(expectFailure(result)).toEqual([
      expect.objectContaining({ code: "forbidden-relationship", file: "relationships.md", line: 4, column: "from_id" })
    ]);
  });

  it("does not treat a forbid rule as covering the reverse direction", async () => {
    const rules = [...basePackRows.rules, ["forbid", "dome-controller", "telescope-scheduler", "Synthetic reason"]];
    expectSuccess((await load(withRows({ rules }))).result);
  });

  it("reports a required relationship that is not declared as a warning only", async () => {
    const rules = [...basePackRows.rules, ["require", "night-observer", "image-archive", "Synthetic reason"]];
    const loaded = expectSuccess((await load(withRows({ rules }))).result);
    expect(loaded.warnings).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "required-relationship-missing",
        file: "rules.md",
        line: 5,
        column: "rule"
      })
    ]);
  });
});

describe("loadKnowledgePack - reporting", () => {
  it("sorts issues by file order, line, column and code regardless of listing order", async () => {
    const files = {
      ...withRows({
        systems: [...basePackRows.systems, ["Bad_Id", "Bad", "system", "Text"]],
        aliases: [...basePackRows.aliases, ["Ghost", "Bad_Target"]]
      }),
      "extra.md": "# Extra"
    };
    const expected = [
      ["systems.md", 6, "id", "invalid-identifier"],
      ["aliases.md", 5, "target_id", "invalid-identifier"],
      ["extra.md", undefined, undefined, "unexpected-file"]
    ];

    for (const order of ["as-given", "reversed", "sorted"] as const) {
      const issues = expectFailure((await load(files, { order })).result);
      expect(issues.map((found) => [found.file, found.line, found.column, found.code])).toEqual(expected);
      expect([...issues].sort(compareLoadIssues)).toEqual([...issues]);
    }
  });

  it("caps the number of reported issues", async () => {
    const systems = Array.from({ length: 10 }, (_, index) => [`Bad${index}`, "Name", "system", "Text"]);
    const { result } = await load(withRows({ systems }), {}, { maxIssues: 3 });
    const issues = expectFailure(result);
    expect(result.ok ? false : result.truncated).toBe(true);
    expect(issues).toHaveLength(4);
    expect(issues.slice(0, 3).map((found) => found.line)).toEqual([3, 4, 5]);
    expect(issues.at(-1)).toEqual(expect.objectContaining({ code: "too-many-issues", limit: 3 }));

    const many = Array.from({ length: 150 }, (_, index) => [`Bad${index}`, "Name", "system", "Text"]);
    const defaults = expectFailure((await load(withRows({ systems: many }))).result);
    expect(defaults).toHaveLength(knowledgePackLimits.maxReportedIssues + 1);
  });

  it("never includes cell values in issues", async () => {
    const systems = [...basePackRows.systems, ["Hidden-Marker-Id", "hidden-marker-name", "robot", "hidden-marker-text"]];
    const first = expectFailure((await load(withRows({ systems }))).result);
    const aliases = [...basePackRows.aliases, ["hidden-marker-alias", "hidden-marker-target"]];
    const second = expectFailure((await load(withRows({ aliases }))).result);

    for (const issues of [first, second]) {
      expect(issues.length).toBeGreaterThan(0);
      expect(JSON.stringify(issues).toLowerCase()).not.toContain("hidden-marker");
    }
  });
});

describe("space mission pack", () => {
  const allowedIds = [
    "command-queue",
    "command-service",
    "flight-controller",
    "mission-commander",
    "mission-control",
    "orbital-relay",
    "telemetry-service",
    "telemetry-store"
  ];

  it("keeps samples and fixtures byte-for-byte identical", () => {
    for (const file of requiredKnowledgePackFiles) {
      expect(readFileSync(new URL(file, sampleDir)).equals(readFileSync(new URL(file, fixtureDir)))).toBe(true);
    }
  });

  it("loads without issues and keeps the declared ambiguity of control", async () => {
    const loaded = expectSuccess((await load(readPack(fixtureDir))).result);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.pack.systems.map((record) => record.id)).toEqual([
      "mission-control",
      "command-service",
      "telemetry-service",
      "telemetry-store",
      "command-queue",
      "orbital-relay"
    ]);
    expect(loaded.pack.actors.map((record) => record.id)).toEqual(["flight-controller", "mission-commander"]);
    expect(loaded.indexes.aliases.lookup("control")).toEqual({
      status: "ambiguous",
      targets: [
        { targetId: "flight-controller", targetKind: "actor" },
        { targetId: "mission-control", targetKind: "system" }
      ]
    });
    expect(loaded.indexes.aliases.ambiguousKeys()).toEqual(["control"]);
    expect(loaded.indexes.aliases.lookup("MCC").targets.map((target) => target.targetId)).toEqual(["mission-control"]);
  });

  it("declares the expected relationships and rules", async () => {
    const { relationships, rules } = expectSuccess((await load(readPack(fixtureDir))).result).indexes;
    const expectations = [
      ["flight-controller", "mission-control", "INTERNAL", "synchronous"],
      ["mission-commander", "mission-control", "INTERNAL", "synchronous"],
      ["mission-control", "command-service", "REST_API", "synchronous"],
      ["command-service", "command-queue", "EVENT", "asynchronous"],
      ["command-queue", "orbital-relay", "EVENT", "asynchronous"],
      ["orbital-relay", "telemetry-service", "EVENT", "asynchronous"],
      ["telemetry-service", "telemetry-store", "DB", "synchronous"]
    ] as const;

    for (const [fromId, toId, type, mode] of expectations) {
      expect(relationships.find(fromId, toId).some((record) => record.interfaceType === type && record.mode === mode)).toBe(true);
    }

    expect(relationships.size).toBe(10);
    expect(relationships.find("telemetry-service", "telemetry-store")[0]?.interfaceName).toBeUndefined();
    expect(relationships.find("command-queue", "command-service")).toEqual([]);
    expect(rules.isForbidden("flight-controller", "orbital-relay")).toBe(true);
    expect(rules.isForbidden("orbital-relay", "flight-controller")).toBe(false);
    expect(relationships.has("flight-controller", "orbital-relay")).toBe(false);
    expect(rules.isRequired("command-service", "command-queue")).toBe(true);
    expect(relationships.has("command-service", "command-queue")).toBe(true);
    expect(rules.size).toBe(2);
  });

  it("contains only synthetic ASCII content with the agreed identifiers", async () => {
    const texts = readPack(fixtureDir);

    for (const text of Object.values(texts)) {
      expect([...text].every((character) => (character.codePointAt(0) ?? 0) < 128)).toBe(true);

      for (const marker of ["://", "www.", "@", ".com", ".org", ".net", ".local"]) {
        expect(text.includes(marker)).toBe(false);
      }
    }

    const { pack } = expectSuccess((await load(texts)).result);
    const ids = [
      ...pack.systems.map((record) => record.id),
      ...pack.actors.map((record) => record.id),
      ...pack.relationships.flatMap((record) => [record.fromId, record.toId]),
      ...pack.aliases.map((record) => record.targetId),
      ...pack.rules.flatMap((record) => [record.fromId, record.toId])
    ];
    expect([...new Set(ids)].sort()).toEqual(allowedIds);
  });
});
