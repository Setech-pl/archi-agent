import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAmbiguitySelections, buildAmbiguityReport } from "../../../src/core/grounding/ambiguity-report.js";
import { ParticipantDictionary, type AmbiguousMention } from "../../../src/core/grounding/participant-resolver.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import type { KnowledgePack } from "../../../src/core/knowledge-pack/knowledge-pack.schema.js";
import { buildPackFixture } from "../../doubles/knowledge-pack-fixture.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const packDir = new URL("../../fixtures/space-mission/architecture/", import.meta.url);
const LF = String.fromCharCode(10);

async function loadSpaceMission(): Promise<KnowledgePack> {
  const files = Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")]));
  const result = await loadKnowledgePack(new KnowledgePackSourceDouble(files));

  if (!result.ok) {
    throw new Error("The Space Mission fixture pack must load.");
  }

  return result.pack;
}

const spaceMission = await loadSpaceMission();

function ambiguousIn(pack: KnowledgePack, body: string): AmbiguousMention[] {
  return ParticipantDictionary.fromPack(pack)
    .scanFlow(body, 10)
    .mentions.filter((mention): mention is AmbiguousMention => mention.status === "ambiguous");
}

const controlCandidates = [
  {
    id: "flight-controller",
    participantType: "actor",
    elementKind: "role",
    canonicalName: "Flight Controller",
    source: { file: "actors.md", line: 5 }
  },
  {
    id: "mission-control",
    participantType: "system",
    elementKind: "system",
    canonicalName: "Mission Control",
    source: { file: "systems.md", line: 5 }
  }
];

describe("buildAmbiguityReport", () => {
  it("reports the declared ambiguity of control with candidates from the pack", () => {
    const report = buildAmbiguityReport(ambiguousIn(spaceMission, "Ask control now."), spaceMission);
    expect(report).toEqual({
      entries: [
        {
          mention: "control",
          matchKinds: ["exact-alias"],
          locations: [{ line: 10, column: 5, length: 7 }],
          candidates: controlCandidates,
          selectedId: null
        }
      ]
    });
    expect(Object.isFrozen(report.entries[0])).toBe(true);
  });

  it("groups repeated mentions into one entry with sorted locations", () => {
    const report = buildAmbiguityReport(ambiguousIn(spaceMission, ["control here", "and Control there"].join(LF)), spaceMission);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]?.matchKinds).toEqual(["exact-alias", "normalized-alias"]);
    expect(report.entries[0]?.locations).toEqual([
      { line: 10, column: 1, length: 7 },
      { line: 11, column: 5, length: 7 }
    ]);
  });

  it("orders entries by mention and candidates by identifier regardless of input order", () => {
    const pack = buildPackFixture({
      aliases: [
        ["Scope", "telescope-scheduler"],
        ["Scope", "dome-controller"],
        ["Archive", "image-archive"],
        ["Archive", "night-observer"]
      ]
    });
    const mentions = ambiguousIn(pack, "Scope and Archive.");
    const report = buildAmbiguityReport(mentions, pack);

    expect(report.entries.map((entry) => [entry.mention, entry.candidates.map((candidate) => candidate.id)])).toEqual([
      ["archive", ["image-archive", "night-observer"]],
      ["scope", ["dome-controller", "telescope-scheduler"]]
    ]);
    expect(report.entries[0]?.candidates.map((candidate) => candidate.participantType)).toEqual(["system", "actor"]);
    expect(buildAmbiguityReport([...mentions].reverse(), pack)).toEqual(report);
  });

  it("never includes surrounding flow text", () => {
    const body = "hidden-flow-marker text asks control about hidden-flow-marker details";
    const report = buildAmbiguityReport(ambiguousIn(spaceMission, body), spaceMission);
    const applied = applyAmbiguitySelections(report, {});
    expect(JSON.stringify([report, applied])).not.toContain("hidden-flow-marker");
  });
});

describe("applyAmbiguitySelections", () => {
  const report = buildAmbiguityReport(ambiguousIn(spaceMission, "Ask control now."), spaceMission);

  it("accepts an explicit selection of a reported candidate in any spelling of the mention", () => {
    const result = applyAmbiguitySelections(report, { Control: "mission-control" });
    expect(result.issues).toEqual([]);
    expect(result.report.entries[0]?.selectedId).toBe("mission-control");
    expect(report.entries[0]?.selectedId).toBeNull();
  });

  it("blocks when no selection is supplied", () => {
    const result = applyAmbiguitySelections(report, {}, "flows/demo.md");
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "ambiguous-reference",
        location: { file: "flows/demo.md", line: 10, column: 5, length: 7 },
        details: { candidates: ["flight-controller", "mission-control"], mention: "control" }
      })
    ]);
    expect(result.report.entries[0]?.selectedId).toBeNull();
  });

  it("rejects a selection that is not a candidate without echoing it", () => {
    const result = applyAmbiguitySelections(report, { control: "orbital-relay" });
    expect(result.issues.map((issue) => issue.code)).toEqual(["invalid-ambiguity-selection"]);
    expect(result.report.entries[0]?.selectedId).toBeNull();
    expect(JSON.stringify(result.issues)).not.toContain("orbital-relay");
  });

  it("rejects conflicting selections for one mention", () => {
    const result = applyAmbiguitySelections(report, { control: "mission-control", CONTROL: "flight-controller" });
    expect(result.issues.map((issue) => issue.code)).toEqual(["invalid-ambiguity-selection"]);
    expect(result.report.entries[0]?.selectedId).toBeNull();
  });

  it("warns about selections for mentions that are not ambiguous", () => {
    const result = applyAmbiguitySelections(report, { control: "flight-controller", MCC: "mission-control" });
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: "warning", code: "unused-ambiguity-selection", details: { mention: "mcc" } })
    ]);
    expect(result.report.entries[0]?.selectedId).toBe("flight-controller");
  });
});
