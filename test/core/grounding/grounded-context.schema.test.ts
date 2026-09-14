import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import type { GroundedContext } from "../../../src/core/grounding/grounded-context.js";
import { groundedContextSchema, parseGroundedContext } from "../../../src/core/grounding/grounded-context.schema.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
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
const parsedSample = parseFlowDocument(readFileSync(sampleUrl, "utf8"), { file: "flows/telemetry-command-flow.md" });

if (!parsedSample.ok) {
  throw new Error("The sample flow must parse.");
}

const outcome = buildGroundedContext({ flow: parsedSample.flow, knowledgePack: spaceMission });

if (outcome.status !== "grounded") {
  throw new Error("The sample flow must ground.");
}

const base: GroundedContext = outcome.context;

/** A deep, mutable copy for building invalid variants. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutable(): any {
  return structuredClone(base);
}

function problemsOf(value: unknown, withPack = false): readonly string[] {
  const result = parseGroundedContext(value, withPack ? spaceMission.pack : undefined);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.problems;
}

const newParticipant = {
  participantType: "new",
  key: "ground station",
  displayName: "Ground Station",
  confirmed: true,
  mentions: [{ line: 7, column: 1, length: 21 }]
};

describe("grounded context schema - valid input", () => {
  it("accepts the built context with and without the pack check", () => {
    expect(groundedContextSchema.safeParse(base).success).toBe(true);
    const result = parseGroundedContext(base, spaceMission.pack);
    expect(result.ok).toBe(true);

    if (result.ok) {
      const typed: GroundedContext = result.context;
      expect(typed.systems).toHaveLength(6);
      expect(typed).toEqual(base);
    }
  });

  it("accepts a distinct confirmed new participant", () => {
    const copy = mutable();
    copy.newParticipants = [newParticipant];
    expect(parseGroundedContext(copy, spaceMission.pack).ok).toBe(true);
  });
});

describe("grounded context schema - rejected input", () => {
  it("rejects unknown keys at every level", () => {
    const top = mutable();
    top.extra = "x";
    const system = mutable();
    system.systems[0].nickname = "x";
    const metadata = mutable();
    metadata.metadata.created = "x";
    const source = mutable();
    source.relationships[0].source.path = "x";

    for (const value of [top, system, metadata, source]) {
      expect(problemsOf(value).some((problem) => problem.endsWith("unrecognized_keys"))).toBe(true);
    }
  });

  it("rejects a fabricated identifier on a new participant", () => {
    const copy = mutable();
    copy.newParticipants = [{ ...newParticipant, id: "ground-station" }];
    expect(problemsOf(copy)).toContain("newParticipants.0 unrecognized_keys");
  });

  it("uses closed enums", () => {
    const variants = [
      (copy: ReturnType<typeof mutable>) => {
        copy.relationships[0].interfaceType = "REST API";
      },
      (copy: ReturnType<typeof mutable>) => {
        copy.actors[0].actorKind = "robot";
      },
      (copy: ReturnType<typeof mutable>) => {
        copy.systems[0].resolution = "guessed";
      },
      (copy: ReturnType<typeof mutable>) => {
        copy.systems[0].matchKinds = ["fuzzy"];
      },
      (copy: ReturnType<typeof mutable>) => {
        copy.rules[0].rule = "allow";
      },
      (copy: ReturnType<typeof mutable>) => {
        copy.metadata.language = "de";
      }
    ];

    for (const change of variants) {
      const copy = mutable();
      change(copy);
      expect(parseGroundedContext(copy).ok).toBe(false);
    }
  });

  it("enforces identifier and length policies", () => {
    const identifier = mutable();
    identifier.systems[0].id = "Command-Queue";
    expect(problemsOf(identifier)).toContain("systems.0.id invalid-identifier");

    const name = mutable();
    name.systems[0].canonicalName = "n".repeat(257);
    expect(problemsOf(name)).toContain("systems.0.canonicalName invalid-text");

    const diagram = mutable();
    diagram.metadata.diagramName = "Telemetry Flow";
    expect(problemsOf(diagram)).toContain("metadata.diagramName invalid-diagram-name");
  });

  it("rejects duplicate participants", () => {
    const acrossGroups = mutable();
    acrossGroups.actors.push({ ...acrossGroups.actors[0], id: "mission-control" });
    expect(problemsOf(acrossGroups).some((problem) => problem.endsWith("duplicate-participant"))).toBe(true);

    const withinGroup = mutable();
    withinGroup.systems.splice(1, 0, structuredClone(withinGroup.systems[0]));
    expect(problemsOf(withinGroup)).toContain("systems.1.id duplicate-participant");

    const newTwice = mutable();
    newTwice.newParticipants = [newParticipant, newParticipant];
    expect(problemsOf(newTwice)).toContain("newParticipants.1.key duplicate-new-participant");
  });

  it("rejects duplicate relationships and rules", () => {
    const relationships = mutable();
    relationships.relationships.splice(1, 0, structuredClone(relationships.relationships[0]));
    expect(problemsOf(relationships)).toContain("relationships.1 duplicate-relationship");

    const rules = mutable();
    rules.rules.splice(1, 0, structuredClone(rules.rules[0]));
    expect(problemsOf(rules)).toContain("rules.1 duplicate-rule");
  });

  it("rejects relationship and rule endpoints outside the context", () => {
    const relationship = mutable();
    relationship.relationships[0].toId = "mission-commander";
    expect(problemsOf(relationship)).toContain("relationships.0.toId relationship-endpoint-outside-context");

    const rule = mutable();
    rule.rules[0].fromId = "mission-commander";
    expect(problemsOf(rule)).toContain("rules.0.fromId rule-endpoint-outside-context");
  });

  it("requires canonical order", () => {
    const systems = mutable();
    systems.systems.reverse();
    expect(problemsOf(systems)).toContain("systems unsorted-participants");

    const mentions = mutable();
    const withTwo = mentions.systems.find((system: { mentions: unknown[] }) => system.mentions.length > 1);
    withTwo.mentions.reverse();
    expect(problemsOf(mentions).some((problem) => problem.endsWith("unsorted-mentions"))).toBe(true);
  });

  it("does not coerce invalid values", () => {
    const line = mutable();
    line.systems[0].mentions[0].line = "7";
    const version = mutable();
    version.schemaVersion = 2;
    const emptyName = mutable();
    emptyName.relationships[0].interfaceName = "";
    const missingName = mutable();
    delete missingName.relationships[0].interfaceName;

    for (const value of [line, version, emptyName, missingName]) {
      expect(parseGroundedContext(value).ok).toBe(false);
    }
  });

  it("rejects unsafe, mismatched or impersonating new participants", () => {
    const mismatch = mutable();
    mismatch.newParticipants = [{ ...newParticipant, key: "other" }];
    expect(problemsOf(mismatch)).toContain("newParticipants.0.key new-participant-key-mismatch");

    const unsafe = mutable();
    unsafe.newParticipants = [{ ...newParticipant, displayName: "@startuml", key: "@startuml" }];
    expect(problemsOf(unsafe)).toContain("newParticipants.0.displayName unsafe-new-participant-name");

    const unconfirmed = mutable();
    unconfirmed.newParticipants = [{ ...newParticipant, confirmed: false }];
    expect(parseGroundedContext(unconfirmed).ok).toBe(false);

    const canonical = mutable();
    canonical.newParticipants = [{ ...newParticipant, displayName: "Mission Control", key: "mission control" }];
    expect(problemsOf(canonical)).toContain("newParticipants.0.key new-participant-impersonates-known");

    const alias = mutable();
    alias.newParticipants = [{ ...newParticipant, displayName: "MCC", key: "mcc" }];
    expect(parseGroundedContext(alias).ok).toBe(true);
    expect(problemsOf(alias, true)).toContain("newParticipants.0.displayName new-participant-impersonates-known");
  });
});

describe("grounded context schema - pack check", () => {
  it("requires canonical names and declarations from the pack", () => {
    const index = base.systems.findIndex((system) => system.id === "mission-control");

    const renamed = mutable();
    renamed.systems[index].canonicalName = "MISSION CONTROL";
    expect(parseGroundedContext(renamed).ok).toBe(true);
    expect(problemsOf(renamed, true)).toContain(`systems.${index}.canonicalName canonical-name-mismatch`);

    const described = mutable();
    described.systems[index].description = "Changed";
    expect(problemsOf(described, true)).toContain(`systems.${index} element-mismatch`);

    const unknown = mutable();
    unknown.systems.push({ ...unknown.systems[0], id: "zz-station" });
    expect(problemsOf(unknown, true)).toContain("systems.6.id unknown-element");

    const purpose = mutable();
    purpose.relationships[0].purpose = "Changed purpose";
    expect(problemsOf(purpose, true)).toContain("relationships.0 relationship-not-declared");

    const reason = mutable();
    reason.rules[0].reason = "Changed reason";
    expect(problemsOf(reason, true)).toContain("rules.0 rule-not-declared");
  });
});
