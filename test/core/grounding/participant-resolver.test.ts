import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isSafeNewParticipantName,
  normalizeReferenceText,
  ParticipantDictionary,
  scanFlow
} from "../../../src/core/grounding/participant-resolver.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { basePackRows, buildPackFixture } from "../../doubles/knowledge-pack-fixture.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const packDir = new URL("../../fixtures/space-mission/architecture/", import.meta.url);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);

async function loadSpaceMission() {
  const files = Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")]));
  const result = await loadKnowledgePack(new KnowledgePackSourceDouble(files));

  if (!result.ok) {
    throw new Error("The Space Mission fixture pack must load.");
  }

  return result.pack;
}

const dictionary = ParticipantDictionary.fromPack(await loadSpaceMission());
const missionControl = { id: "mission-control", participantType: "system" };
const flightController = { id: "flight-controller", participantType: "actor" };

describe("resolveReference - precedence", () => {
  it("resolves an exact identifier", () => {
    expect(dictionary.resolveReference("mission-control")).toEqual({ status: "resolved", matchKind: "exact-id", target: missionControl });
  });

  it("resolves an exact canonical name", () => {
    expect(dictionary.resolveReference("Mission Control")).toEqual({
      status: "resolved",
      matchKind: "exact-canonical",
      target: missionControl
    });
  });

  it("resolves an exact declared alias", () => {
    expect(dictionary.resolveReference("MCC")).toEqual({ status: "resolved", matchKind: "exact-alias", target: missionControl });
    expect(dictionary.resolveReference("Uplink Queue")).toEqual({
      status: "resolved",
      matchKind: "exact-alias",
      target: { id: "command-queue", participantType: "system" }
    });
  });

  it("resolves normalized identifiers, canonical names and aliases", () => {
    expect(dictionary.resolveReference("Mission-Control")).toMatchObject({ status: "resolved", matchKind: "normalized-id" });
    expect(dictionary.resolveReference("MISSION CONTROL")).toMatchObject({ status: "resolved", matchKind: "normalized-canonical" });
    expect(dictionary.resolveReference("  Mission   Control  ")).toMatchObject({ status: "resolved", matchKind: "normalized-canonical" });
    expect(dictionary.resolveReference("mcc")).toMatchObject({ status: "resolved", matchKind: "normalized-alias" });
    expect(dictionary.resolveReference(String.fromCodePoint(0xff2d, 0xff23, 0xff23))).toEqual({
      status: "resolved",
      matchKind: "normalized-alias",
      target: missionControl
    });
  });

  it("applies the fixed precedence when several categories match", () => {
    const pack = buildPackFixture({
      aliases: [
        ["Dome Controller", "image-archive"],
        ["image-archive", "dome-controller"]
      ]
    });
    const custom = ParticipantDictionary.fromPack(pack);

    expect(custom.resolveReference("Dome Controller")).toMatchObject({ matchKind: "exact-canonical", target: { id: "dome-controller" } });
    expect(custom.resolveReference("dome controller")).toMatchObject({
      matchKind: "normalized-canonical",
      target: { id: "dome-controller" }
    });
    expect(custom.resolveReference("image-archive")).toMatchObject({ matchKind: "exact-id", target: { id: "image-archive" } });
  });

  it("keeps the declared alias control ambiguous", () => {
    expect(dictionary.resolveReference("control")).toEqual({
      status: "ambiguous",
      matchKind: "exact-alias",
      candidates: [flightController, missionControl]
    });
    expect(dictionary.resolveReference("Control")).toMatchObject({ status: "ambiguous", matchKind: "normalized-alias" });
  });

  it("reports several targets of the deciding rank as ambiguous", () => {
    const custom = ParticipantDictionary.fromPack(
      buildPackFixture({
        aliases: [
          ["Scheduler", "telescope-scheduler"],
          ["Scheduler", "dome-controller"]
        ]
      })
    );
    expect(custom.resolveReference("Scheduler")).toMatchObject({
      status: "ambiguous",
      candidates: [
        { id: "dome-controller", participantType: "system" },
        { id: "telescope-scheduler", participantType: "system" }
      ]
    });
  });

  it("does not perform fuzzy, partial or separator-insensitive matching", () => {
    for (const raw of ["Ground Station", "Mision Control", "Mission Contro", "Missions Control", "Mission", "Telemetry", "mission_control", ""]) {
      expect(dictionary.resolveReference(raw)).toEqual({ status: "unresolved" });
    }
  });
});

describe("scanFlow - mentions", () => {
  it("matches only at word boundaries", () => {
    const none = dictionary.scanFlow("MissionControl and Mission Controls and mission-control-backup were offline.");
    expect(none.mentions).toEqual([]);

    const found = dictionary.scanFlow("(Mission Control). Then Mission Control's log.");
    expect(found.mentions.map((mention) => [mention.status, mention.location.column, mention.location.length])).toEqual([
      ["resolved", 2, 15],
      ["resolved", 25, 15]
    ]);
  });

  it("prefers the longest span and ignores a shorter alias inside it", () => {
    const scan = dictionary.scanFlow("Mission Control confirms.");
    expect(scan.mentions).toEqual([
      {
        status: "resolved",
        location: { line: 1, column: 1, length: 15 },
        mention: "mission control",
        matchKind: "exact-canonical",
        target: missionControl
      }
    ]);
  });

  it("reports a partly overlapping shorter span instead of guessing", () => {
    const custom = ParticipantDictionary.fromPack(
      buildPackFixture({
        systems: [
          ["deep-space", "Deep Space", "system", "Synthetic"],
          ["space-relay", "Space Relay", "system", "Synthetic"]
        ]
      })
    );
    const scan = custom.scanFlow("Deep Space Relay");
    expect(scan.mentions.map((mention) => [mention.status === "resolved" ? mention.target.id : "", mention.location.column])).toEqual([
      ["space-relay", 6]
    ]);
    expect(scan.overlaps).toEqual([{ line: 1, column: 1, length: 10 }]);
  });

  it("keeps repeated mentions of one element as separate evidence", () => {
    const scan = dictionary.scanFlow("MCC talks to Mission Control and mission-control.");
    expect(scan.mentions.map((mention) => (mention.status === "resolved" ? [mention.target.id, mention.matchKind] : []))).toEqual([
      ["mission-control", "exact-alias"],
      ["mission-control", "exact-canonical"],
      ["mission-control", "exact-id"]
    ]);
  });

  it("keeps an equal span with different targets ambiguous", () => {
    const scan = dictionary.scanFlow("Ask control.", 7);
    expect(scan.mentions).toEqual([
      {
        status: "ambiguous",
        location: { line: 7, column: 5, length: 7 },
        mention: "control",
        matchKind: "exact-alias",
        candidates: [flightController, missionControl]
      }
    ]);
  });

  it("ignores unknown text instead of inventing participants", () => {
    const scan = dictionary.scanFlow("Ground Station sends data to the Science Archive.");
    expect(scan.mentions).toEqual([]);
    expect(scan.newMarkers).toEqual([]);
  });

  it("skips lines with control or bidirectional formatting characters", () => {
    const scan = dictionary.scanFlow(["Mission Control" + String.fromCharCode(0x202e), "Command Service"].join(LF), 7);
    expect(scan.controlCharacterLines).toEqual([7]);
    expect(scan.mentions.map((mention) => mention.location.line)).toEqual([8]);
  });

  it("is deterministic and keeps document line numbers", () => {
    const body = ["The Relay feeds the Telemetry Service.", "TLM Store keeps it."].join(LF);
    expect(scanFlow(dictionary, body, 7)).toEqual(scanFlow(dictionary, body, 7));
    expect(scanFlow(dictionary, body, 7).mentions.map((mention) => mention.location.line)).toEqual([7, 7, 8]);
  });
});

describe("scanFlow - new participant markers", () => {
  it("recognizes a valid marker and masks its text", () => {
    const scan = dictionary.scanFlow("[NEW: Mission Control Backup] talks to Mission Control.");
    expect(scan.newMarkers).toEqual([
      {
        status: "valid",
        location: { line: 1, column: 1, length: 29 },
        key: "mission control backup",
        displayName: "Mission Control Backup"
      }
    ]);
    expect(scan.mentions.map((mention) => mention.location.column)).toEqual([40]);
  });

  it("normalizes spacing in a valid name", () => {
    const [marker] = dictionary.scanFlow("[NEW:   Deep   Space  Array ]").newMarkers;
    expect(marker).toMatchObject({ status: "valid", displayName: "Deep Space Array", key: "deep space array" });
  });

  it("classifies malformed, empty, unsafe and over-long markers", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["[NEW:]", "empty"],
      ["[NEW:   ]", "empty"],
      ["[New: Ground Station]", "malformed"],
      ["[NEW Ground Station]", "malformed"],
      ["[NEW]", "malformed"],
      ["[NEW: Ground Station", "malformed"],
      ["[NEW: A [B]]", "malformed"],
      ["[NEW: @startuml]", "unsafe"],
      ["[NEW: !include station]", "unsafe"],
      ['[NEW: Name "quoted"]', "unsafe"],
      ["[NEW: Station" + TAB + "One]", "unsafe"],
      ["[NEW: " + "x".repeat(65) + "]", "too-long"],
      ["[NEW: " + "x".repeat(64) + "]", "valid"]
    ];

    for (const [text, status] of cases) {
      expect(dictionary.scanFlow(text).newMarkers.map((marker) => marker.status)).toEqual([status]);
    }
  });

  it("does not treat similar bracketed words as markers", () => {
    expect(dictionary.scanFlow("[news] and [newer] and [renew]").newMarkers).toEqual([]);
  });

  it("detects names that would impersonate a known element", () => {
    for (const name of ["Mission Control", "mission control", "Mission-Control", "mission_control", "MCC", "Flight Controller"]) {
      expect(dictionary.impersonatesKnown(name)).toBe(true);
    }

    for (const name of ["Ground Station", "Mission Control Backup"]) {
      expect(dictionary.impersonatesKnown(name)).toBe(false);
    }
  });
});

describe("normalization helpers", () => {
  it("normalizes case, width and whitespace only", () => {
    expect(normalizeReferenceText("  MISSION   Control ")).toBe("mission control");
    expect(normalizeReferenceText(String.fromCodePoint(0xff2d, 0xff23, 0xff23))).toBe("mcc");
    expect(normalizeReferenceText("mission_control")).toBe("mission_control");
    expect(normalizeReferenceText("Mission-Control")).toBe("mission-control");
  });

  it("accepts only safe new participant names", () => {
    for (const name of ["Ground Station", "Relay 2", "O'Neil Array", "Deck (Aft)", String.fromCodePoint(0x0141) + "ad Bay"]) {
      expect(isSafeNewParticipantName(name)).toBe(true);
    }

    for (const name of ["", " Ground", "Ground  Station", "@startuml", "!include", "Name]", "a:b", "x".repeat(65), "-lead"]) {
      expect(isSafeNewParticipantName(name)).toBe(false);
    }
  });

  it("builds the dictionary only from pack records", () => {
    const pack = buildPackFixture();
    const custom = ParticipantDictionary.fromPack(pack);
    expect(ParticipantDictionary.fromPack(pack)).toBe(custom);
    expect(custom.target("night-observer")).toEqual({ id: "night-observer", participantType: "actor" });
    expect(custom.resolveReference(basePackRows.aliases[0]?.[0] ?? "")).toMatchObject({ status: "resolved", matchKind: "exact-alias" });
  });
});
