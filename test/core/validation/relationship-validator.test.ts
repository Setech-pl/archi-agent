import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import type { GroundedContext } from "../../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { parseGeneratedSequenceModel, type GeneratedSequenceModel } from "../../../src/core/model/sequence-diagram-model.schema.js";
import { participantKindOf } from "../../../src/core/validation/grounding-validator.js";
import { hasModelErrors } from "../../../src/core/validation/model-validator.js";
import { packInterfaceType, validateRelationships } from "../../../src/core/validation/relationship-validator.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

type Raw = Record<string, unknown>;
type End = string | { readonly newName: string };
type Step = readonly [End, End, string, Raw?];

const LF = String.fromCharCode(10);
const packDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);
const sampleFlow = readFileSync(new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);

if (!loaded.ok) {
  throw new Error("The Space Mission pack must load.");
}

const knowledgePack = { pack: loaded.pack, indexes: loaded.indexes };

function ground(extraLines: readonly string[] = [], confirmedNewParticipants: readonly string[] = []): GroundedContext {
  const parsed = parseFlowDocument([sampleFlow.trimEnd(), ...extraLines, ""].join(LF), { file: "samples/space-mission/flows/telemetry-command-flow.md" });

  if (!parsed.ok) {
    throw new Error("The flow must parse.");
  }

  const outcome = buildGroundedContext({ flow: parsed.flow, knowledgePack, confirmedNewParticipants });

  if (outcome.status !== "grounded") {
    throw new Error(`Grounding was blocked: ${outcome.issues.map((issue) => issue.code).join(", ")}`);
  }

  return outcome.context;
}

const context = ground(["A [NEW: Ground Station] watches the uplink."], ["Ground Station"]);

function participantFor(end: End): Raw {
  if (typeof end !== "string") {
    const confirmed = context.newParticipants.find((participant) => participant.key === end.newName);
    return { origin: "new", newName: end.newName, displayName: `[NEW] ${confirmed?.displayName ?? "Unknown"}`, kind: "system", confirmedByUser: true };
  }

  const element = [...context.actors, ...context.systems].find((candidate) => candidate.id === end);
  return {
    origin: "knowledge-pack",
    elementId: end,
    canonicalName: element?.canonicalName ?? "Unknown Element",
    kind: element === undefined ? "system" : participantKindOf(element)
  };
}

function modelOf(steps: readonly Step[]): GeneratedSequenceModel {
  const participants = new Map<string, Raw>();
  const ref = (end: End): Raw => (typeof end === "string" ? { elementId: end } : { newName: end.newName });
  const messages = steps.map(([from, to, interfaceType, extra], index) => {
    for (const end of [from, to]) {
      participants.set(typeof end === "string" ? end : `new:${end.newName}`, participantFor(end));
    }

    return { from: ref(from), to: ref(to), label: `Step ${index + 1}`, interfaceType, order: index + 1, ...(extra ?? {}) };
  });
  const result = parseGeneratedSequenceModel({ participants: [...participants.values()], messages });

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return result.model;
}

function codes(steps: readonly Step[], target: GroundedContext = context): string[] {
  return validateRelationships(modelOf(steps), target).issues.map((issue) => `${issue.code}@${issue.path ?? "-"}`);
}

const async = { async: true } as const;
const response = { isResponse: true } as const;

describe("validateRelationships - grounded interactions", () => {
  it("accepts a synchronous interaction backed by a grounded relationship in the same direction", () => {
    const result = validateRelationships(modelOf([["mission-control", "command-service", "REST API"]]), context);

    expect(result.issues).toEqual([]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.verification).toBe("grounded");
    expect(result.matches[0]?.relationships.map((relationship) => [relationship.interfaceType, relationship.interfaceName, relationship.mode])).toEqual([
      ["REST_API", "Command API", "synchronous"]
    ]);
  });

  it("accepts an asynchronous interaction backed by an asynchronous relationship", () => {
    expect(codes([["command-service", "command-queue", "EVENT", async]])).toEqual([]);
    expect(codes([["telemetry-service", "telemetry-store", "DB"]])).toEqual([]);
  });

  it("respects relationship direction", () => {
    const [issue] = validateRelationships(modelOf([["telemetry-store", "telemetry-service", "DB"]]), context).issues;

    expect(issue?.code).toBe("relationship-direction");
    expect(issue?.details).toEqual({ order: 1, fromId: "telemetry-store", toId: "telemetry-service" });
  });

  it("rejects an interaction without any grounded relationship", () => {
    expect(codes([["telemetry-service", "command-queue", "EVENT", async]])).toEqual(["missing-relationship@messages.0"]);
  });

  it("rejects an interface type that no relationship between the participants declares", () => {
    expect(codes([["mission-control", "command-service", "EVENT", async]])).toEqual(["interface-type-mismatch@messages.0"]);
  });

  it("validates synchronous and asynchronous compatibility", () => {
    expect(codes([["mission-control", "command-service", "REST API", async]])).toEqual(["interaction-mode-mismatch@messages.0"]);
    expect(codes([["mission-control", "command-service", "FILE"]])).toEqual(["interaction-mode-mismatch@messages.0"]);
    expect(codes([["command-service", "command-queue", "EVENT"]])).toEqual(["interaction-mode-mismatch@messages.0"]);
    expect(codes([["mission-control", "command-service", "FILE", async]])).toEqual([]);
  });

  it("searches only the minimal grounded context, never the complete pack", () => {
    const withoutCommandLink: GroundedContext = {
      ...context,
      relationships: context.relationships.filter(
        (relationship) => ![relationship.fromId, relationship.toId].every((id) => id === "mission-control" || id === "command-service")
      )
    };

    expect(loaded.ok && loaded.pack.relationships.some((relationship) => relationship.fromId === "mission-control" && relationship.toId === "command-service")).toBe(
      true
    );
    expect(codes([["mission-control", "command-service", "REST API"]], withoutCommandLink)).toEqual(["missing-relationship@messages.0"]);
  });

  it("maps model interface types to pack interface types", () => {
    expect(packInterfaceType("REST API")).toBe("REST_API");
    expect(packInterfaceType("INTERNAL")).toBe("INTERNAL");
    expect(packInterfaceType("DB")).toBe("DB");
  });
});

describe("validateRelationships - INTERNAL, responses and new participants", () => {
  it("recognizes a self-message only by equal sender and receiver and needs no relationship", () => {
    const result = validateRelationships(
      modelOf([
        ["command-service", "command-service", "INTERNAL"],
        ["flight-controller", "flight-controller", "INTERNAL"]
      ]),
      context
    );

    expect(context.relationships.some((relationship) => relationship.fromId === relationship.toId)).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.matches).toEqual([
      { order: 1, verification: "self-message", relationships: [] },
      { order: 2, verification: "self-message", relationships: [] }
    ]);
  });

  it("accepts INTERNAL between two different participants when the grounded context declares it", () => {
    const declared = context.relationships.filter(
      (relationship) => relationship.fromId === "flight-controller" && relationship.toId === "mission-control" && relationship.interfaceType === "INTERNAL"
    );
    const result = validateRelationships(modelOf([["flight-controller", "mission-control", "INTERNAL"]]), context);

    expect(declared.map((relationship) => [relationship.mode, relationship.interfaceName])).toEqual([["synchronous", "Operator Console"]]);
    expect(result.issues).toEqual([]);
    expect(result.matches[0]?.verification).toBe("grounded");
    expect(result.matches[0]?.relationships).toEqual(declared);
  });

  it("does not treat an INTERNAL classification as a self-message", () => {
    const result = validateRelationships(modelOf([["flight-controller", "mission-control", "INTERNAL"]]), context);

    expect(result.matches.map((match) => match.verification)).not.toContain("self-message");
    expect(result.matches[0]?.relationships).toHaveLength(1);
  });

  it("enforces the direction of an INTERNAL relationship and accepts the reverse only when it is declared", () => {
    const [issue] = validateRelationships(modelOf([["mission-control", "flight-controller", "INTERNAL"]]), context).issues;

    expect(issue?.code).toBe("relationship-direction");
    expect(issue?.details).toEqual({ order: 1, fromId: "mission-control", toId: "flight-controller" });

    const withReverse: GroundedContext = {
      ...context,
      relationships: [
        ...context.relationships,
        {
          fromId: "mission-control",
          toId: "flight-controller",
          interfaceType: "INTERNAL",
          interfaceName: null,
          mode: "synchronous",
          purpose: "Synthetic reverse console",
          source: { file: "relationships.md", line: 99 }
        }
      ]
    };

    expect(codes([["mission-control", "flight-controller", "INTERNAL"]], withReverse)).toEqual([]);
  });

  it("rejects a cross-participant INTERNAL message without a matching grounded INTERNAL relationship", () => {
    const withoutConsole: GroundedContext = {
      ...context,
      relationships: context.relationships.filter((relationship) => relationship.fromId !== "flight-controller")
    };

    expect(codes([["mission-control", "command-service", "INTERNAL"]])).toEqual(["internal-endpoint-mismatch@messages.0"]);
    expect(codes([["flight-controller", "command-service", "INTERNAL"]])).toEqual(["internal-endpoint-mismatch@messages.0"]);
    expect(codes([["flight-controller", "mission-control", "INTERNAL"]], withoutConsole)).toEqual(["internal-endpoint-mismatch@messages.0"]);
    expect(codes([["mission-control", { newName: "ground station" }, "INTERNAL"]])).toEqual(["internal-endpoint-mismatch@messages.0"]);
    expect(codes([[{ newName: "ground station" }, "mission-control", "INTERNAL"]])).toEqual(["internal-endpoint-mismatch@messages.0"]);
  });

  it("validates the interaction mode of an INTERNAL relationship", () => {
    expect(codes([["flight-controller", "mission-control", "INTERNAL", async]])).toEqual(["interaction-mode-mismatch@messages.0"]);
  });

  it("never lets a self-message authorize an interaction between different participants", () => {
    const result = validateRelationships(
      modelOf([
        ["command-service", "command-service", "INTERNAL"],
        ["command-service", "flight-controller", "INTERNAL"]
      ]),
      context
    );

    expect(result.issues.map((issue) => `${issue.code}@${issue.path ?? "-"}`)).toEqual(["internal-endpoint-mismatch@messages.1"]);
    expect(result.matches.map((match) => match.verification)).toEqual(["self-message", "grounded"]);
    expect(result.matches[1]?.relationships).toEqual([]);
  });

  it("verifies a response against the synchronous relationship of its request", () => {
    const result = validateRelationships(
      modelOf([
        ["mission-control", "command-service", "REST API"],
        ["command-service", "mission-control", "REST API", response]
      ]),
      context
    );

    expect(result.issues).toEqual([]);
    expect(result.matches[1]?.relationships[0]?.fromId).toBe("mission-control");
  });

  it("rejects a response without a preceding request and a response against an asynchronous relationship", () => {
    expect(codes([["command-service", "mission-control", "REST API", response]])).toEqual(["response-without-request@messages.0"]);
    expect(
      codes([
        ["command-queue", "orbital-relay", "EVENT", async],
        ["orbital-relay", "command-queue", "EVENT", response]
      ])
    ).toEqual(["interaction-mode-mismatch@messages.1"]);
  });

  it("never describes an interaction with a confirmed new participant as grounded", () => {
    const result = validateRelationships(modelOf([[{ newName: "ground station" }, "mission-control", "REST API"]]), context);

    expect(result.issues.map((issue) => [issue.code, issue.severity])).toEqual([["unverified-new-participant-interaction", "warning"]]);
    expect(result.matches[0]).toEqual({ order: 1, verification: "unverified-new", relationships: [] });
    expect(hasModelErrors(result.issues)).toBe(false);
  });
});

describe("validateRelationships - rules", () => {
  it("blocks an interaction that a grounded forbid rule prohibits", () => {
    const forbidding: GroundedContext = {
      ...context,
      rules: [...context.rules, { rule: "forbid", fromId: "mission-control", toId: "command-service", reason: "Synthetic reason", source: { file: "rules.md", line: 9 } }]
    };

    expect(codes([["mission-control", "command-service", "REST API"]], forbidding)).toEqual(["forbidden-interaction@messages.0"]);
  });

  it("warns when a require rule between two diagram participants has no interaction", () => {
    const result = validateRelationships(
      modelOf([
        ["mission-control", "command-service", "REST API"],
        ["command-queue", "orbital-relay", "EVENT", async]
      ]),
      context
    );

    expect(result.issues.map((issue) => [issue.code, issue.severity, issue.details])).toEqual([
      ["required-interaction-missing", "warning", { fromId: "command-service", toId: "command-queue" }]
    ]);
    expect(codes([["command-service", "command-queue", "EVENT", async]])).toEqual([]);
  });
});

describe("validateRelationships - diagnostic details", () => {
  it("names the expected and actual mode of an interaction-mode mismatch", () => {
    const result = validateRelationships(modelOf([["command-service", "command-queue", "EVENT"]]), context);

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "interaction-mode-mismatch",
        severity: "error",
        path: "messages.0",
        details: { order: 1, fromId: "command-service", toId: "command-queue", expected: "asynchronous", actual: "synchronous" }
      })
    ]);
    expect(hasModelErrors(result.issues)).toBe(true);
  });

  it("names the grounded and actual interface types of an interface-type mismatch", () => {
    const [issue] = validateRelationships(modelOf([["mission-control", "command-service", "EVENT", async]]), context).issues;

    expect(issue?.code).toBe("interface-type-mismatch");
    expect(issue?.details).toEqual({ order: 1, fromId: "mission-control", toId: "command-service", expected: "FILE or REST API", actual: "EVENT" });
  });
});
