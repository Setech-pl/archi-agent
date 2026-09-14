import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import {
  compareFlowReferences,
  compareGroundedRelationships,
  compareGroundedRules,
  compareMatchKinds,
  computeContextDigest,
  contextDigestInput,
  groundingMatchKinds,
  participantResolutions,
  type GroundedContext
} from "../../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { stableDigest } from "../../../src/core/util/stable-digest.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const packDir = new URL("../../fixtures/space-mission/architecture/", import.meta.url);
const sampleUrl = new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url);

async function loadSpaceMission() {
  const files = Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")]));
  const result = await loadKnowledgePack(new KnowledgePackSourceDouble(files));

  if (!result.ok) {
    throw new Error("The Space Mission fixture pack must load.");
  }

  return { pack: result.pack, indexes: result.indexes };
}

const spaceMission = await loadSpaceMission();

function groundSample(): GroundedContext {
  const parsed = parseFlowDocument(readFileSync(sampleUrl, "utf8"), { file: "flows/telemetry-command-flow.md" });

  if (!parsed.ok) {
    throw new Error("The sample flow must parse.");
  }

  const outcome = buildGroundedContext({ flow: parsed.flow, knowledgePack: spaceMission });

  if (outcome.status !== "grounded") {
    throw new Error("The sample flow must ground.");
  }

  return outcome.context;
}

const base = groundSample();

describe("grounded context model", () => {
  it("lists match kinds in resolution precedence order", () => {
    expect([...groundingMatchKinds]).toEqual([
      "exact-id",
      "exact-canonical",
      "exact-alias",
      "normalized-id",
      "normalized-canonical",
      "normalized-alias"
    ]);
    expect([...participantResolutions]).toEqual(["direct", "selected"]);
    expect(compareMatchKinds("exact-alias", "normalized-id")).toBeLessThan(0);
    expect(compareMatchKinds("normalized-alias", "exact-id")).toBeGreaterThan(0);
  });

  it("orders references, relationships and rules deterministically", () => {
    const references = [
      { line: 8, column: 1, length: 3 },
      { line: 7, column: 9, length: 2 },
      { line: 7, column: 9, length: 1 }
    ];
    expect([...references].sort(compareFlowReferences)).toEqual([references[2], references[1], references[0]]);
    expect([...base.relationships].reverse().sort(compareGroundedRelationships)).toEqual([...base.relationships]);
    expect([...base.rules].reverse().sort(compareGroundedRules)).toEqual([...base.rules]);
  });

  it("keeps known participants identified by pack identifiers and new participants without one", () => {
    for (const participant of [...base.actors, ...base.systems]) {
      expect(participant.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(participant.source.file === "systems.md" || participant.source.file === "actors.md").toBe(true);
    }

    const withNew: GroundedContext = {
      ...base,
      newParticipants: [
        { participantType: "new", key: "ground station", displayName: "Ground Station", confirmed: true, mentions: [{ line: 7, column: 1, length: 21 }] }
      ]
    };
    expect("id" in (withNew.newParticipants[0] ?? {})).toBe(false);
  });
});

describe("context digest", () => {
  it("does not depend on insertion order", () => {
    const shuffled: GroundedContext = {
      ...base,
      actors: [...base.actors].reverse(),
      systems: [...base.systems].reverse(),
      relationships: [...base.relationships].reverse(),
      rules: [...base.rules].reverse()
    };

    expect(computeContextDigest(shuffled)).toEqual(computeContextDigest(base));
    expect(computeContextDigest(base).algorithm).toBe("sha256");
    expect(computeContextDigest(base).value).toBe(stableDigest(contextDigestInput(base)));
  });

  it("changes when participants, relationships, rules, new participants or metadata change", () => {
    const [firstSystem] = base.systems;
    const [firstRelationship] = base.relationships;
    const [firstRule] = base.rules;

    if (firstSystem === undefined || firstRelationship === undefined || firstRule === undefined) {
      throw new Error("The sample context must contain systems, relationships and rules.");
    }

    const newParticipant = {
      participantType: "new" as const,
      key: "ground station",
      displayName: "Ground Station",
      confirmed: true as const,
      mentions: [{ line: 7, column: 1, length: 21 }]
    };
    const variants: GroundedContext[] = [
      base,
      { ...base, systems: base.systems.slice(1) },
      { ...base, systems: [{ ...firstSystem, canonicalName: "Command Buffer" }, ...base.systems.slice(1)] },
      { ...base, systems: [{ ...firstSystem, description: "Changed description" }, ...base.systems.slice(1)] },
      { ...base, actors: [] },
      { ...base, relationships: base.relationships.slice(1) },
      { ...base, relationships: [{ ...firstRelationship, purpose: "Changed purpose" }, ...base.relationships.slice(1)] },
      { ...base, relationships: [{ ...firstRelationship, interfaceName: "Other Frame" }, ...base.relationships.slice(1)] },
      { ...base, rules: base.rules.slice(1) },
      { ...base, rules: [{ ...firstRule, reason: "Changed reason" }, ...base.rules.slice(1)] },
      { ...base, newParticipants: [newParticipant] },
      { ...base, newParticipants: [{ ...newParticipant, displayName: "Ground station" }] },
      { ...base, metadata: { ...base.metadata, language: "pl" } },
      { ...base, metadata: { ...base.metadata, flowName: "Other flow" } }
    ];
    const digests = variants.map((variant) => computeContextDigest(variant).value);

    expect(new Set(digests).size).toBe(variants.length);
  });

  it("ignores mention positions, pack line numbers and the author", () => {
    const moved: GroundedContext = {
      ...base,
      metadata: { ...base.metadata, author: "Another Author" },
      systems: base.systems.map((system) => ({
        ...system,
        mentions: system.mentions.map((mention) => ({ ...mention, line: mention.line + 40 })),
        source: { ...system.source, line: system.source.line + 3 }
      })),
      relationships: base.relationships.map((relationship) => ({
        ...relationship,
        source: { ...relationship.source, line: relationship.source.line + 3 }
      }))
    };

    expect(computeContextDigest(moved)).toEqual(computeContextDigest(base));
  });

  it("uses no timestamps, paths, positions or author in the digest input", () => {
    const input = contextDigestInput(base);
    const text = JSON.stringify(input);

    expect(Object.keys(input as Record<string, unknown>).sort()).toEqual([
      "actors",
      "metadata",
      "newParticipants",
      "relationships",
      "rules",
      "systems",
      "version"
    ]);

    for (const excluded of ["mentions", "source", "line", "column", "author", base.metadata.author, "file", ".md", ":/", "created", "timestamp"]) {
      expect(text.includes(excluded)).toBe(false);
    }
  });
});
