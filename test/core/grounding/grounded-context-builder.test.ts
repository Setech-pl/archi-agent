import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildGroundedContext,
  parseFlowDocument,
  type FlowDocument,
  type GroundingRequest
} from "../../../src/core/grounding/grounded-context-builder.js";
import {
  computeContextDigest,
  type GroundingBlocked,
  type GroundingOutcome,
  type GroundingSuccess
} from "../../../src/core/grounding/grounded-context.js";
import type { FlowMetadata } from "../../../src/core/knowledge-pack/front-matter.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { isSha256Hex } from "../../../src/core/util/stable-digest.js";
import { compareValidationIssues } from "../../../src/core/validation/validation-issue.js";
import { KnowledgePackSourceDouble, type ListingOrder } from "../../doubles/knowledge-pack-source-double.js";

const packDir = new URL("../../fixtures/space-mission/architecture/", import.meta.url);
const sampleUrl = new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url);
const coreDir = new URL("../../../src/core/", import.meta.url);
const LF = String.fromCharCode(10);

async function loadSpaceMission(order: ListingOrder = "as-given") {
  const files = Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")]));
  const result = await loadKnowledgePack(new KnowledgePackSourceDouble(files, { order }));

  if (!result.ok) {
    throw new Error("The Space Mission fixture pack must load.");
  }

  return { pack: result.pack, indexes: result.indexes };
}

const spaceMission = await loadSpaceMission();

function flowOf(lines: readonly string[], metadata: Partial<FlowMetadata> = {}): FlowDocument {
  return {
    file: "flows/test-flow.md",
    metadata: { diagramName: "test-flow", flowName: "Test flow", author: "Sample Author", language: "en", ...metadata },
    body: lines.join(LF),
    bodyStartLine: 7
  };
}

function ground(lines: readonly string[], request: Partial<GroundingRequest> = {}): GroundingOutcome {
  return buildGroundedContext({ flow: flowOf(lines), knowledgePack: spaceMission, ...request });
}

function expectGrounded(outcome: GroundingOutcome): GroundingSuccess {
  if (outcome.status !== "grounded") {
    throw new Error(`Expected a grounded outcome, got ${outcome.issues.map((issue) => issue.code).join(", ")}.`);
  }

  return outcome;
}

function expectBlocked(outcome: GroundingOutcome): GroundingBlocked {
  if (outcome.status !== "blocked") {
    throw new Error("Expected a blocked outcome.");
  }

  expect("context" in outcome).toBe(false);
  return outcome;
}

function groundSample(knowledgePack = spaceMission): GroundingSuccess {
  const parsed = parseFlowDocument(readFileSync(sampleUrl, "utf8"), { file: "flows/telemetry-command-flow.md" });

  if (!parsed.ok) {
    throw new Error("The sample flow must parse.");
  }

  return expectGrounded(buildGroundedContext({ flow: parsed.flow, knowledgePack }));
}

describe("buildGroundedContext - Space Mission sample", () => {
  it("grounds the sample flow end to end with a minimal context", () => {
    const { context, digest, warnings, ambiguityReport } = groundSample();

    expect(context.metadata).toEqual({
      diagramName: "telemetry-command-flow",
      flowName: "Telemetry command flow",
      author: "Space Mission Sample Team",
      language: "en"
    });
    expect(context.actors.map((actor) => actor.id)).toEqual(["flight-controller"]);
    expect(context.systems.map((system) => system.id)).toEqual([
      "command-queue",
      "command-service",
      "mission-control",
      "orbital-relay",
      "telemetry-service",
      "telemetry-store"
    ]);
    expect(context.newParticipants).toEqual([]);
    expect(warnings).toEqual([]);
    expect(ambiguityReport.entries).toEqual([]);
    expect(isSha256Hex(digest.value)).toBe(true);
    expect(digest).toEqual(computeContextDigest(context));
  });

  it("includes only relationships between selected participants", () => {
    const { context } = groundSample();

    expect(context.relationships.map((relationship) => [relationship.fromId, relationship.toId, relationship.interfaceType])).toEqual([
      ["command-queue", "orbital-relay", "EVENT"],
      ["command-service", "command-queue", "EVENT"],
      ["command-service", "mission-control", "EVENT"],
      ["flight-controller", "mission-control", "INTERNAL"],
      ["mission-control", "command-service", "FILE"],
      ["mission-control", "command-service", "REST_API"],
      ["mission-control", "telemetry-service", "REST_API"],
      ["orbital-relay", "telemetry-service", "EVENT"],
      ["telemetry-service", "telemetry-store", "DB"]
    ]);
    expect(context.relationships.some((relationship) => relationship.fromId === "mission-commander")).toBe(false);
    expect(context.relationships.find((relationship) => relationship.toId === "telemetry-store")?.interfaceName).toBeNull();
  });

  it("includes rules whose endpoints are both selected", () => {
    const { context } = groundSample();
    expect(context.rules.map((rule) => [rule.rule, rule.fromId, rule.toId, rule.source])).toEqual([
      ["require", "command-service", "command-queue", { file: "rules.md", line: 6 }],
      ["forbid", "flight-controller", "orbital-relay", { file: "rules.md", line: 5 }]
    ]);
  });

  it("records evidence and match kinds per participant, deduplicating repeated mentions", () => {
    const { context } = groundSample();
    const byId = new Map([...context.actors, ...context.systems].map((participant) => [participant.id, participant]));

    expect(byId.get("mission-control")?.mentions).toEqual([
      { line: 7, column: 45, length: 15 },
      { line: 8, column: 1, length: 15 }
    ]);
    expect(byId.get("command-queue")?.matchKinds).toEqual(["exact-canonical", "exact-alias"]);
    expect(byId.get("orbital-relay")?.matchKinds).toEqual(["exact-canonical", "exact-alias"]);
    expect(byId.get("telemetry-store")?.matchKinds).toEqual(["exact-alias"]);
    expect(byId.get("telemetry-store")?.canonicalName).toBe("Telemetry Store");
  });

  it("excludes unrelated elements, aliases, tables and machine data", () => {
    const text = JSON.stringify(groundSample().context);

    for (const excluded of ["mission-commander", "Mission Commander", "MCC", "Commander", "Approval Console", "Uplink Queue", "TLM Store", ":/", "timestamp"]) {
      expect(text.includes(excluded)).toBe(false);
    }
  });

  it("gives the same digest for repeated runs and any pack listing order", async () => {
    const reversed = await loadSpaceMission("reversed");
    expect(groundSample(reversed).digest).toEqual(groundSample().digest);
    expect(groundSample().context).toEqual(groundSample(reversed).context);
  });
});

describe("buildGroundedContext - resolution", () => {
  it("uses canonical names from the pack, never the spelling of the flow", () => {
    const { context } = expectGrounded(ground(["MISSION CONTROL talks to the command service."]));
    expect(context.systems.map((system) => [system.id, system.canonicalName, system.matchKinds])).toEqual([
      ["command-service", "Command Service", ["normalized-canonical"]],
      ["mission-control", "Mission Control", ["normalized-canonical"]]
    ]);
  });

  it("merges repeated mentions of one element into one participant", () => {
    const { context } = expectGrounded(ground(["MCC talks to Mission Control.", "mission-control answers."]));
    expect(context.systems).toHaveLength(1);
    expect(context.systems[0]?.matchKinds).toEqual(["exact-id", "exact-canonical", "exact-alias"]);
    expect(context.systems[0]?.mentions).toEqual([
      { line: 7, column: 1, length: 3 },
      { line: 7, column: 14, length: 15 },
      { line: 8, column: 1, length: 15 }
    ]);
  });

  it("excludes rules and relationships that reach outside the selection", () => {
    const { context } = expectGrounded(
      ground(["The Flight Controller works in Mission Control.", "The Command Service feeds the Command Queue."])
    );
    expect(context.rules.map((rule) => rule.rule)).toEqual(["require"]);
    expect(context.relationships).toHaveLength(5);
    expect(context.relationships.some((relationship) => relationship.toId === "orbital-relay")).toBe(false);
  });

  it("includes an actor relationship only when the actor is referenced", () => {
    const without = expectGrounded(ground(["Mission Control sends a plan."]));
    expect(without.context.relationships).toEqual([]);

    const withCommander = expectGrounded(ground(["The Commander approves in Mission Control."]));
    expect(withCommander.context.relationships.map((relationship) => relationship.fromId)).toEqual(["mission-commander"]);
  });

  it("ignores unknown ordinary text instead of creating new participants", () => {
    const { context } = expectGrounded(ground(["Ground Station sends data to the Command Service."]));
    expect(context.newParticipants).toEqual([]);
    expect(context.systems.map((system) => system.id)).toEqual(["command-service"]);
  });
});

describe("buildGroundedContext - ambiguity", () => {
  it("blocks while the ambiguous alias control has no selection", () => {
    const outcome = expectBlocked(ground(["The control desk calls the Command Service."]));
    expect(outcome.issues).toEqual([
      expect.objectContaining({
        code: "ambiguous-reference",
        location: { file: "flows/test-flow.md", line: 7, column: 5, length: 7 },
        details: { candidates: ["flight-controller", "mission-control"], mention: "control" }
      })
    ]);
    expect(outcome.ambiguityReport.entries.map((entry) => entry.candidates.map((candidate) => candidate.id))).toEqual([
      ["flight-controller", "mission-control"]
    ]);
  });

  it("grounds after an explicit valid selection", () => {
    const outcome = expectGrounded(
      ground(["The control desk calls the Command Service."], { selections: { control: "flight-controller" } })
    );
    expect(outcome.context.actors.map((actor) => [actor.id, actor.resolution, actor.matchKinds])).toEqual([
      ["flight-controller", "selected", ["exact-alias"]]
    ]);
    expect(outcome.context.systems.map((system) => [system.id, system.resolution])).toEqual([["command-service", "direct"]]);
    expect(outcome.ambiguityReport.entries[0]?.selectedId).toBe("flight-controller");

    const asSystem = expectGrounded(
      ground(["The control desk calls the Command Service."], { selections: { Control: "mission-control" } })
    );
    expect(asSystem.context.relationships).toHaveLength(3);
  });

  it("blocks an invalid selection", () => {
    const outcome = expectBlocked(ground(["The control desk calls the Command Service."], { selections: { control: "orbital-relay" } }));
    expect(outcome.issues.map((issue) => issue.code)).toEqual(["invalid-ambiguity-selection"]);
  });
});

describe("buildGroundedContext - new participants", () => {
  const line = "[NEW: Ground Station] sends telemetry to the Telemetry Service.";

  it("blocks an unconfirmed new participant", () => {
    const outcome = expectBlocked(ground([line]));
    expect(outcome.issues).toEqual([
      expect.objectContaining({
        code: "new-participant-unconfirmed",
        location: { file: "flows/test-flow.md", line: 7, column: 1, length: 21 },
        details: { newParticipant: "ground station" }
      })
    ]);
  });

  it("grounds a confirmed new participant as distinct and without a pack identifier", () => {
    const { context } = expectGrounded(ground([line], { confirmedNewParticipants: ["ground station"] }));
    expect(context.newParticipants).toEqual([
      {
        participantType: "new",
        key: "ground station",
        displayName: "Ground Station",
        confirmed: true,
        mentions: [{ line: 7, column: 1, length: 21 }]
      }
    ]);
    expect("id" in (context.newParticipants[0] ?? {})).toBe(false);
    expect(context.systems.map((system) => system.id)).toEqual(["telemetry-service"]);
    expect(context.relationships).toEqual([]);
  });

  it("rejects new names that match known elements even when confirmed", () => {
    for (const name of ["Mission Control", "mcc", "Mission_Control", "flight-controller"]) {
      const outcome = expectBlocked(ground([`[NEW: ${name}] talks to the Command Service.`], { confirmedNewParticipants: [name] }));
      expect(outcome.issues.map((issue) => issue.code)).toContain("new-participant-conflict");
    }
  });

  it("blocks malformed, empty and unsafe markers", () => {
    const outcome = expectBlocked(ground(["[New: Ground Station] and [NEW:] and [NEW: @startuml] talk to Mission Control."]));
    expect(outcome.issues.map((issue) => issue.code)).toEqual([
      "new-participant-malformed",
      "new-participant-empty",
      "new-participant-unsafe"
    ]);
  });

  it("warns about a confirmation for a participant the flow does not declare", () => {
    const outcome = expectGrounded(ground(["Mission Control sends a plan."], { confirmedNewParticipants: ["Relay Hut"] }));
    expect(outcome.warnings).toEqual([
      expect.objectContaining({ code: "unused-new-participant-confirmation", details: { newParticipant: "relay hut" } })
    ]);
  });
});

describe("buildGroundedContext - blocking and reporting", () => {
  it("blocks a flow without participants", () => {
    expect(expectBlocked(ground(["Nothing relevant happens here."])).issues.map((issue) => issue.code)).toEqual(["no-participants"]);
  });

  it("blocks control characters and oversized bodies", () => {
    const control = expectBlocked(ground(["Mission Control" + String.fromCharCode(0x202e) + " sends."]));
    expect(control.issues.map((issue) => [issue.code, issue.location?.line])).toEqual([["flow-control-character", 7]]);

    const large = expectBlocked(ground(["x".repeat(50_001)]));
    expect(large.issues.map((issue) => issue.code)).toEqual(["flow-too-large"]);
  });

  it("orders issues deterministically", () => {
    const lines = ["[NEW:] and control", "[NEW: @startuml] and [NEW: Ground Station]"];
    const first = expectBlocked(ground(lines));
    const second = expectBlocked(ground(lines));

    expect(first.issues).toEqual(second.issues);
    expect([...first.issues].sort(compareValidationIssues)).toEqual([...first.issues]);
    expect(first.issues.map((issue) => [issue.location?.line, issue.code])).toEqual([
      [7, "new-participant-empty"],
      [7, "ambiguous-reference"],
      [8, "new-participant-unsafe"],
      [8, "new-participant-unconfirmed"]
    ]);
  });

  it("never places untrusted flow text in issues", () => {
    const lines = [
      "hidden-flow-marker says control to hidden-flow-marker.",
      "[NEW: @hidden-flow-marker] and [NEW hidden-flow-marker] reach Mission Control."
    ];
    const outcome = expectBlocked(ground(lines));
    const text = JSON.stringify(outcome);

    expect(outcome.issues.length).toBeGreaterThan(0);
    expect(text).not.toContain("hidden-flow-marker");

    for (const issue of outcome.issues) {
      expect(issue.message).not.toContain("control");
    }
  });
});

describe("parseFlowDocument", () => {
  it("parses the sample front matter and keeps the body start line", () => {
    const parsed = parseFlowDocument(readFileSync(sampleUrl, "utf8"), { file: "flows/telemetry-command-flow.md" });
    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.flow.bodyStartLine).toBe(7);
      expect(parsed.flow.metadata.language).toBe("en");
      expect(parsed.flow.body.split(LF)[0]).toContain("Flight Controller");
    }
  });

  it("maps front matter issues into the validation contract", () => {
    const parsed = parseFlowDocument("No front matter here.", { file: "flows/broken.md" });
    expect(parsed.ok).toBe(false);

    if (!parsed.ok) {
      expect(parsed.issues.map((issue) => issue.code)).toEqual(["front-matter:invalid-front-matter"]);
      expect(parsed.issues[0]?.location).toEqual({ file: "flows/broken.md", line: 1 });
    }
  });

  it("refuses absolute or unsafe file names", () => {
    expect(() => parseFlowDocument("---", { file: "/abs/flow.md" })).toThrow();
    expect(() => parseFlowDocument("---", { file: "C:/flows/flow.md" })).toThrow();
  });
});

describe("core boundary", () => {
  it("keeps every core module free of platform, editor, process and dynamic-code access", () => {
    const files = readdirSync(coreDir, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));

    for (const expected of [
      "validation/validation-issue.ts",
      "grounding/grounded-context.ts",
      "grounding/grounded-context.schema.ts",
      "grounding/participant-resolver.ts",
      "grounding/ambiguity-report.ts",
      "util/stable-digest.ts",
      "grounding/grounded-context-builder.ts"
    ]) {
      expect(files.map((file) => file.split(String.fromCharCode(92)).join("/"))).toContain(expected);
    }

    for (const file of files) {
      const text = readFileSync(new URL(file.split(String.fromCharCode(92)).join("/"), coreDir), "utf8");
      expect(text).not.toMatch(/from ["']node:/);
      expect(text).not.toMatch(/from ["']vscode["']/);

      for (const forbidden of ["require(", "import(", "eval(", "new Function(", "child_process", "process.env", "fetch("]) {
        expect(text.includes(forbidden)).toBe(false);
      }
    }
  });
});
