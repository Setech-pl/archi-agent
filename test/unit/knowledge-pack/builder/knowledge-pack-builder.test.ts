import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildKnowledgePack,
  compareBuildIssues,
  type KnowledgePackBuildIssue,
  type KnowledgePackBuildResult
} from "../../../../src/core/knowledge-pack/builder/knowledge-pack-builder.js";
import {
  isIncludedInPack,
  knowledgePackTableKinds,
  type CandidateDecision,
  type EvidenceBasis,
  type KnowledgePackCandidate,
  type KnowledgePackDraft,
  type KnowledgePackDraftEntry
} from "../../../../src/core/knowledge-pack/builder/knowledge-pack-candidate.js";
import { InMemoryKnowledgePackSource } from "../../../../src/core/knowledge-pack/in-memory-knowledge-pack-source.js";
import { loadKnowledgePack } from "../../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { knowledgePackFileNames } from "../../../../src/core/knowledge-pack/knowledge-pack-source.js";
import { knowledgePackTables, type KnowledgePackTableKind } from "../../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { basePackRows, buildPackFiles } from "../../../doubles/knowledge-pack-fixture.js";

type Success = Extract<KnowledgePackBuildResult, { ok: true }>;

const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const excerptMarker = "EVIDENCE-EXCERPT-MARKER";
const sourceMarker = "notes/evidence-source-marker.md";

function rowFrom(kind: KnowledgePackTableKind, cells: readonly string[]): Record<string, string> {
  const row: Record<string, string> = {};
  knowledgePackTables[kind].columns.forEach((column, index) => {
    row[column] = cells[index] ?? "";
  });
  return row;
}

function entry(
  table: KnowledgePackTableKind,
  cells: readonly string[],
  basis: EvidenceBasis = "explicit",
  decision: CandidateDecision = "accepted"
): KnowledgePackDraftEntry {
  const candidate = {
    table,
    row: rowFrom(table, cells),
    basis,
    evidence: [{ sourceId: sourceMarker, excerpt: excerptMarker + " " + table, location: { startLine: 3, endLine: 4 } }]
  } as unknown as KnowledgePackCandidate;
  return { candidate, decision };
}

/** A draft whose included rows equal the shared observatory fixture, listed in reverse order. */
function baseEntries(): KnowledgePackDraftEntry[] {
  return knowledgePackTableKinds.flatMap((kind) => [...basePackRows[kind]].reverse().map((cells) => entry(kind, cells)));
}

function draft(entries: readonly KnowledgePackDraftEntry[]): KnowledgePackDraft {
  return { entries };
}

async function expectBuilt(entries: readonly KnowledgePackDraftEntry[]): Promise<Success> {
  const result = await buildKnowledgePack(draft(entries));

  if (!result.ok) {
    throw new Error("Expected a built pack: " + JSON.stringify(result.issues));
  }

  return result;
}

async function expectIssues(input: unknown): Promise<readonly KnowledgePackBuildIssue[]> {
  const result = await buildKnowledgePack(input as KnowledgePackDraft);
  expect(result.ok).toBe(false);
  expect("documents" in result).toBe(false);
  return result.ok ? [] : result.issues;
}

function summary(issues: readonly KnowledgePackBuildIssue[]) {
  return issues.map(({ code, entry: index, table, field }) => ({ code, entry: index, table, field }));
}

describe("buildKnowledgePack - valid drafts", () => {
  it("builds exactly five documents that load to the same pack as the equivalent hand-written files", async () => {
    const built = await expectBuilt(baseEntries());

    expect(built.documents.map((document) => document.file)).toEqual([...knowledgePackFileNames]);
    expect(built.warnings).toEqual([]);

    const handWritten = await loadKnowledgePack(new InMemoryKnowledgePackSource(Object.entries(buildPackFiles())));
    expect(handWritten.ok).toBe(true);

    const comparable = (pack: object) =>
      Object.fromEntries(
        Object.entries(pack).map(([table, records]) => [
          table,
          (records as readonly object[])
            .map((record) => JSON.stringify({ ...record, location: undefined }))
            .sort()
        ])
      );

    if (handWritten.ok) {
      expect(comparable(built.pack)).toEqual(comparable(handWritten.pack));
    }
  });

  it("round-trips rendered documents through an in-memory source and the loader", async () => {
    const built = await expectBuilt(baseEntries());
    const source = new InMemoryKnowledgePackSource(built.documents.map((document) => [document.file, document.text] as const));
    const loaded = await loadKnowledgePack(source);

    expect(loaded.ok).toBe(true);

    if (loaded.ok) {
      expect(loaded.pack).toEqual(built.pack);
    }
  });

  it("is deterministic and independent of the order of draft entries", async () => {
    const first = await expectBuilt(baseEntries());
    const second = await expectBuilt(baseEntries());
    const reversed = await expectBuilt([...baseEntries()].reverse());

    expect(second.documents).toEqual(first.documents);
    expect(reversed.documents).toEqual(first.documents);
  });

  it("never writes evidence or source identifiers into the documents", async () => {
    const built = await expectBuilt(baseEntries());

    for (const document of built.documents) {
      expect(document.text).not.toContain(excerptMarker);
      expect(document.text).not.toContain(sourceMarker);
    }
  });

  it("accepts a pack with systems only and renders empty tables with header and separator", async () => {
    const built = await expectBuilt([entry("systems", ["image-archive", "Image Archive", "database", "Stores frames"])]);

    expect(built.pack.actors).toEqual([]);
    expect(built.pack.relationships).toEqual([]);
    expect(built.pack.aliases).toEqual([]);
    expect(built.pack.rules).toEqual([]);
    expect(built.documents.find((document) => document.file === "aliases.md")?.text).toBe(
      ["# Aliases", "", "| alias | target_id |", "| --- | --- |", ""].join(LF)
    );
  });

  it("keeps pipes and backslashes through rendering and loading", async () => {
    const description = "Splits a|b and keeps " + BACKSLASH + " and " + BACKSLASH + "| and a trailing " + BACKSLASH;
    const built = await expectBuilt([entry("systems", ["image-archive", "Image " + BACKSLASH + " Archive|", "database", description])]);

    expect(built.pack.systems[0]?.description).toBe(description);
    expect(built.pack.systems[0]?.canonicalName).toBe("Image " + BACKSLASH + " Archive|");
  });

  it("includes accepted candidates and leaves out rejected candidates, whatever their basis", async () => {
    const entries = [
      ...baseEntries(),
      entry("aliases", ["Frame Store", "image-archive"], "inferred", "accepted"),
      entry("aliases", ["Wing", "dome-controller"], "explicit", "accepted"),
      entry("aliases", ["Dome", "dome-controller"], "inferred", "rejected"),
      entry("systems", ["unused-system", "Unused System", "system", "Never included"], "explicit", "rejected")
    ];
    const built = await expectBuilt(entries);

    expect(built.pack.aliases.map((record) => record.alias)).toContain("Frame Store");
    expect(built.pack.aliases.map((record) => record.alias)).toContain("Wing");
    expect(built.pack.aliases.map((record) => record.alias)).not.toContain("Dome");
    expect(built.pack.systems.map((record) => record.id)).not.toContain("unused-system");
  });

  it("returns warnings of the loader without blocking the pack", async () => {
    const entries = [
      ...baseEntries().filter((item) => !(item.candidate.table === "relationships" && item.candidate.row.to_id === "image-archive"))
    ];
    const built = await expectBuilt(entries);

    expect(summary(built.warnings)).toEqual([
      { code: "required-relationship-missing", entry: expect.any(Number), table: "rules", field: "rule" }
    ]);
  });

  it("decides inclusion from the decision alone; basis never overrides it", () => {
    const explicit = entry("systems", ["a", "A", "system", "A"]);
    const inferred = entry("systems", ["a", "A", "system", "A"], "inferred");

    expect(isIncludedInPack(explicit)).toBe(true);
    expect(isIncludedInPack(inferred)).toBe(true);
    expect(isIncludedInPack({ ...explicit, decision: "rejected" })).toBe(false);
    expect(isIncludedInPack({ ...inferred, decision: "rejected" })).toBe(false);
    expect(isIncludedInPack({ ...explicit, decision: "pending" })).toBe(false);
    expect(isIncludedInPack({ ...inferred, decision: "pending" })).toBe(false);
  });
});

describe("buildKnowledgePack - decision blocks the build regardless of basis", () => {
  const cases: readonly [EvidenceBasis, CandidateDecision, "included" | "excluded" | "blocked"][] = [
    ["explicit", "accepted", "included"],
    ["inferred", "accepted", "included"],
    ["explicit", "rejected", "excluded"],
    ["inferred", "rejected", "excluded"],
    ["explicit", "pending", "blocked"],
    ["inferred", "pending", "blocked"]
  ];

  it.each(cases)("basis=%s decision=%s -> %s", async (basis, decision, outcome) => {
    const entries = [...baseEntries(), entry("aliases", ["Frame Store", "image-archive"], basis, decision)];
    const result = await buildKnowledgePack(draft(entries));

    if (outcome === "blocked") {
      expect(result.ok).toBe(false);
      expect(result.ok ? [] : summary(result.issues)).toEqual([
        { code: "candidate-decision-pending", entry: entries.length - 1, table: "aliases", field: "decision" }
      ]);
      return;
    }

    expect(result.ok).toBe(true);

    if (result.ok) {
      const aliasNames = result.pack.aliases.map((record) => record.alias);
      expect(aliasNames.includes("Frame Store")).toBe(outcome === "included");
    }
  });

  it("does not reveal the row or the evidence of a pending candidate, for either basis", async () => {
    for (const basis of ["explicit", "inferred"] as const) {
      const secretEntry: KnowledgePackDraftEntry = {
        candidate: {
          table: "aliases",
          row: { alias: "SECRET-ALIAS-" + basis, target_id: "image-archive" },
          basis,
          evidence: [{ sourceId: "notes/SECRET-SOURCE.md", excerpt: "SECRET-EXCERPT-" + basis }]
        } as unknown as KnowledgePackCandidate,
        decision: "pending"
      };
      const entries = [...baseEntries(), secretEntry];
      const issues = await expectIssues(draft(entries));
      const text = JSON.stringify(issues);

      expect(summary(issues)).toEqual([
        { code: "candidate-decision-pending", entry: entries.length - 1, table: "aliases", field: "decision" }
      ]);
      expect(text).not.toContain("SECRET");
    }
  });

  it("gives the same issues for a mixed-decision draft regardless of entry order", async () => {
    const mixed = [
      ...baseEntries(),
      entry("aliases", ["Frame Store", "image-archive"], "inferred", "accepted"),
      entry("aliases", ["Dome", "dome-controller"], "explicit", "rejected"),
      entry("aliases", ["Wing", "dome-controller"], "inferred", "pending")
    ];

    const forward = await buildKnowledgePack(draft(mixed));
    const backward = await buildKnowledgePack(draft([...mixed].reverse()));

    expect(forward.ok).toBe(false);
    expect(backward.ok).toBe(false);

    if (!forward.ok && !backward.ok) {
      const withoutEntry = (issues: readonly KnowledgePackBuildIssue[]) =>
        issues.map(({ code, table, field }) => JSON.stringify({ code, table, field })).sort();

      expect(withoutEntry(backward.issues)).toEqual(withoutEntry(forward.issues));
    }
  });
});

describe("buildKnowledgePack - rejected drafts", () => {
  it("rejects a draft without systems, also when every system was rejected", async () => {
    const withoutSystems = baseEntries().filter((item) => item.candidate.table !== "systems");
    expect(summary(await expectIssues(draft([entry("actors", ["night-observer", "Night Observer", "role", "Observes"])])))).toEqual([
      { code: "no-data-rows", entry: undefined, table: "systems", field: undefined }
    ]);

    const issues = await expectIssues(
      draft([...withoutSystems, entry("systems", ["image-archive", "Image Archive", "database", "Stores"], "explicit", "rejected")])
    );
    expect(issues.map((issue) => issue.code)).toContain("no-data-rows");
  });

  it("rejects a pending candidate regardless of basis", async () => {
    const inferredPending = [...baseEntries(), entry("aliases", ["Frame Store", "image-archive"], "inferred", "pending")];
    expect(summary(await expectIssues(draft(inferredPending)))).toEqual([
      { code: "candidate-decision-pending", entry: inferredPending.length - 1, table: "aliases", field: "decision" }
    ]);

    const explicitPending = [...baseEntries(), entry("aliases", ["Frame Store", "image-archive"], "explicit", "pending")];
    expect(summary(await expectIssues(draft(explicitPending)))).toEqual([
      { code: "candidate-decision-pending", entry: explicitPending.length - 1, table: "aliases", field: "decision" }
    ]);
  });

  it("rejects missing or malformed evidence", async () => {
    const valid = entry("systems", ["image-archive", "Image Archive", "database", "Stores"]);
    const withEvidence = (evidence: unknown) => ({ ...valid, candidate: { ...valid.candidate, evidence } });

    for (const evidence of [
      [],
      [{ sourceId: "", excerpt: "text" }],
      [{ sourceId: "a.md", excerpt: "   " }],
      [{ sourceId: "a.md", excerpt: "text", location: { startLine: 0 } }],
      [{ sourceId: "a.md", excerpt: "text", location: { startLine: 4, endLine: 2 } }],
      [{ sourceId: "a.md", excerpt: "text", page: 2 }]
    ]) {
      const issues = await expectIssues(draft([withEvidence(evidence) as KnowledgePackDraftEntry]));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((issue) => issue.code === "invalid-evidence" && issue.entry === 0)).toBe(true);
    }
  });

  it("rejects malformed candidate envelopes", async () => {
    const valid = entry("systems", ["image-archive", "Image Archive", "database", "Stores"]);

    expect((await expectIssues(null)).map((issue) => issue.code)).toEqual(["invalid-candidate"]);
    expect((await expectIssues({ entries: "x" })).map((issue) => issue.code)).toEqual(["invalid-candidate"]);

    for (const broken of [
      { ...valid, decision: "maybe" },
      { ...valid, candidate: { ...valid.candidate, table: "components" } },
      { ...valid, candidate: { ...valid.candidate, basis: "guessed" } },
      { ...valid, candidate: { ...valid.candidate, row: { id: "image-archive" } } },
      { ...valid, candidate: { ...valid.candidate, row: { ...valid.candidate.row, extra: "x" } } },
      { ...valid, candidate: { ...valid.candidate, row: { ...valid.candidate.row, kind: 3 } } }
    ]) {
      const issues = await expectIssues(draft([broken as unknown as KnowledgePackDraftEntry]));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((issue) => issue.code === "invalid-candidate" && issue.entry === 0)).toBe(true);
    }
  });

  it("rejects invalid identifiers and enum values using the pack schemas", async () => {
    const entries = [
      ...baseEntries(),
      entry("systems", ["Bad_Id", "Bad Id", "system", "Invalid identifier"]),
      entry("actors", ["guest", "Guest", "visitor", "Invalid kind"]),
      entry("relationships", ["night-observer", "image-archive", "GRPC", "", "synchronous", "Invalid type"])
    ];
    const issues = summary(await expectIssues(draft(entries)));

    expect(issues).toEqual(
      expect.arrayContaining([
        { code: "invalid-identifier", entry: entries.length - 3, table: "systems", field: "id" },
        { code: "invalid-enum-value", entry: entries.length - 2, table: "actors", field: "kind" },
        { code: "invalid-enum-value", entry: entries.length - 1, table: "relationships", field: "interface_type" }
      ])
    );
  });

  it("rejects exact duplicates and collisions after normalization", async () => {
    const duplicate = [...baseEntries(), entry("systems", ["image-archive", "Image Archive", "database", "Stores captured frames"])];
    expect((await expectIssues(draft(duplicate))).map((issue) => issue.code)).toContain("duplicate-record");

    const canonical = [...baseEntries(), entry("actors", ["archive-operator", "image_ARCHIVE", "role", "Collides by name"])];
    expect(summary(await expectIssues(draft(canonical)))).toEqual([
      { code: "canonical-name-collision", entry: canonical.length - 1, table: "actors", field: "canonical_name" }
    ]);

    const alias = [...baseEntries(), entry("aliases", ["the-archive", "image-archive"]), entry("aliases", ["The Archive", "image-archive"])];
    expect(summary(await expectIssues(draft(alias)))).toEqual([
      { code: "alias-collision", entry: alias.length - 1, table: "aliases", field: "alias" }
    ]);

    const differentTargets = [
      ...baseEntries(),
      entry("aliases", ["Frame-Store", "image-archive"]),
      entry("aliases", ["frame store", "dome-controller"])
    ];
    expect(summary(await expectIssues(draft(differentTargets)))).toEqual([
      { code: "alias-collision", entry: differentTargets.length - 1, table: "aliases", field: "alias" }
    ]);

    const collision = [...baseEntries(), entry("actors", ["image-archive", "Archive Keeper", "person", "Same identifier"])];
    expect((await expectIssues(draft(collision))).map((issue) => issue.code)).toContain("identifier-collision");
  });

  it("rejects a second target for the same normalized alias even with the exact same spelling", async () => {
    const entries = [...baseEntries(), entry("aliases", ["Scheduler", "dome-controller"])];
    expect(summary(await expectIssues(draft(entries)))).toEqual([
      { code: "alias-collision", entry: entries.length - 1, table: "aliases", field: "alias" }
    ]);
  });

  describe("one normalized alias resolves to exactly one target", () => {
    const systemA = "telescope-scheduler";
    const systemB = "image-archive";

    it.each([
      ["identical spelling, different targets", "CRM", systemA, "CRM", systemB],
      ["case differs, different targets", "CRM", systemA, "crm", systemB],
      ["hyphen vs. space, same target", "CRM-System", systemA, "CRM System", systemA]
    ] as const)("rejects: %s", async (_label, firstAlias, firstTarget, secondAlias, secondTarget) => {
      const entries = [...baseEntries(), entry("aliases", [firstAlias, firstTarget]), entry("aliases", [secondAlias, secondTarget])];
      expect(summary(await expectIssues(draft(entries)))).toEqual([
        { code: "alias-collision", entry: entries.length - 1, table: "aliases", field: "alias" }
      ]);
    });

    it("accepts a single alias naming one target", async () => {
      const built = await expectBuilt([...baseEntries(), entry("aliases", ["CRM", systemA])]);
      expect(built.pack.aliases.map((record) => record.alias)).toContain("CRM");
    });

    it("does not reveal the alias, the target or the evidence in the collision issue", async () => {
      const entries = [
        ...baseEntries(),
        entry("aliases", ["SECRET-ALIAS-ONE", systemA]),
        entry("aliases", ["secret alias one", systemB])
      ];
      const issues = await expectIssues(draft(entries));
      const text = JSON.stringify(issues);

      expect(summary(issues)).toEqual([{ code: "alias-collision", entry: entries.length - 1, table: "aliases", field: "alias" }]);
      expect(text).not.toContain("SECRET");
      expect(text).not.toContain(systemA);
      expect(text).not.toContain(systemB);
      expect(text).not.toContain(excerptMarker);
    });
  });

  it("rejects unknown references", async () => {
    const entries = [
      ...baseEntries(),
      entry("aliases", ["Ghost", "ghost-system"]),
      entry("relationships", ["night-observer", "ghost-system", "INTERNAL", "", "synchronous", "Unknown target"])
    ];
    expect(summary(await expectIssues(draft(entries)))).toEqual([
      { code: "unknown-reference", entry: entries.length - 2, table: "aliases", field: "target_id" },
      { code: "unknown-reference", entry: entries.length - 1, table: "relationships", field: "to_id" }
    ]);
  });

  it("rejects forbidden relationships and conflicting rules with the loader semantics", async () => {
    const forbidden = [
      ...baseEntries(),
      entry("relationships", ["night-observer", "dome-controller", "INTERNAL", "", "synchronous", "Moves the dome"])
    ];
    expect(summary(await expectIssues(draft(forbidden)))).toEqual([
      { code: "forbidden-relationship", entry: forbidden.length - 1, table: "relationships", field: "from_id" }
    ]);

    const conflicting = [...baseEntries(), entry("rules", ["require", "night-observer", "dome-controller", "Direct control"])];
    expect(summary(await expectIssues(draft(conflicting)))).toEqual([
      { code: "conflicting-rules", entry: conflicting.length - 1, table: "rules", field: "rule" }
    ]);
  });

  it("rejects forbidden markup and control characters before rendering", async () => {
    const entries = [
      ...baseEntries(),
      entry("systems", ["script-host", "Script <script>", "system", "Markup"]),
      entry("systems", ["line-host", "Line Host", "system", "First" + LF + "| injected | row |"]),
      entry("actors", ["diagram-author", "Diagram Author", "person", "@startuml"])
    ];
    expect(summary(await expectIssues(draft(entries)))).toEqual([
      { code: "forbidden-markdown", entry: entries.length - 3, table: "systems", field: "canonical_name" },
      { code: "control-character", entry: entries.length - 2, table: "systems", field: "description" },
      { code: "forbidden-markdown", entry: entries.length - 1, table: "actors", field: "description" }
    ]);
  });

  it("rejects values that would not survive the round trip", async () => {
    const entries = [entry("systems", ["image-archive", " Image Archive", "database", "Stores "])];
    expect(summary(await expectIssues(draft(entries)))).toEqual([
      { code: "round-trip-mismatch", entry: 0, table: "systems", field: "canonical_name" },
      { code: "round-trip-mismatch", entry: 0, table: "systems", field: "description" }
    ]);
  });

  it("reports issues without values or evidence, in a deterministic order", async () => {
    const entries = [
      entry("systems", ["Secret_Value", "SECRET-NAME <b>", "system", "SECRET-DESCRIPTION"]),
      entry("aliases", ["SECRET-ALIAS", "secret-target"], "inferred")
    ];
    const issues = await expectIssues(draft(entries));
    const text = JSON.stringify(issues);

    expect(text).not.toContain("SECRET");
    expect(text).not.toContain(excerptMarker);
    expect([...issues].sort(compareBuildIssues)).toEqual(issues);
  });

  it("caps the number of reported issues", async () => {
    const entries = Array.from({ length: 5 }, (_unused, index) => entry("systems", ["Bad" + index, "Bad", "system", "Bad"]));
    const result = await buildKnowledgePack(draft(entries), { maxIssues: 2 });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.truncated).toBe(true);
      expect(result.issues.map((issue) => issue.code).at(-1)).toBe("too-many-issues");
    }
  });
});

describe("knowledge-pack builder boundary", () => {
  it("keeps the builder, renderer and in-memory source free of platform and editor access", () => {
    const coreDir = new URL("../../../../src/core/knowledge-pack/", import.meta.url);
    const builderFiles = readdirSync(new URL("builder/", coreDir)).filter((file) => file.endsWith(".ts"));

    expect(builderFiles.sort()).toEqual(["knowledge-pack-builder.ts", "knowledge-pack-candidate.ts", "knowledge-pack-renderer.ts"]);

    for (const file of [...builderFiles.map((name) => "builder/" + name), "in-memory-knowledge-pack-source.ts"]) {
      const text = readFileSync(new URL(file, coreDir), "utf8");

      expect(text).not.toMatch(/from ["']node:/);
      expect(text).not.toMatch(/from ["']vscode["']/);

      for (const forbidden of ["require(", "import(", "eval(", "new Function(", "process.", "fetch(", "globalThis"]) {
        expect(text.includes(forbidden)).toBe(false);
      }
    }
  });
});
