import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import type { GroundedContext } from "../../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { parseGeneratedSequenceModel, type GeneratedSequenceModel } from "../../../src/core/model/sequence-diagram-model.schema.js";
import { participantKindOf, validateParticipantGrounding } from "../../../src/core/validation/grounding-validator.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

type Raw = Record<string, unknown>;

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

function known(id: string): Raw {
  const element = [...context.actors, ...context.systems].find((candidate) => candidate.id === id);

  if (element === undefined) {
    return { origin: "knowledge-pack", elementId: id, canonicalName: "Unknown Element", kind: "system" };
  }

  return { origin: "knowledge-pack", elementId: id, canonicalName: element.canonicalName, kind: participantKindOf(element) };
}

function modelWith(participants: readonly Raw[]): GeneratedSequenceModel {
  const refs = participants.map((entry) => (entry["origin"] === "new" ? { newName: entry["newName"] } : { elementId: entry["elementId"] }));
  const messages = refs.map((ref, index) => ({ from: ref, to: ref, label: `Step ${index + 1}`, interfaceType: "INTERNAL", async: false, isResponse: false, order: index + 1 }));
  const result = parseGeneratedSequenceModel({ participants, messages });

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return result.model;
}

function codes(participants: readonly Raw[]): string[] {
  return validateParticipantGrounding(modelWith(participants), context).map((issue) => `${issue.code}@${issue.path ?? "-"}`);
}

describe("participantKindOf", () => {
  it("derives the diagram kind from the grounded element kind", () => {
    const kinds = Object.fromEntries([...context.actors, ...context.systems].map((element) => [element.id, participantKindOf(element)]));

    expect(kinds).toEqual({
      "flight-controller": "actor",
      "command-queue": "queue",
      "command-service": "system",
      "mission-control": "system",
      "orbital-relay": "system",
      "telemetry-service": "system",
      "telemetry-store": "database"
    });
  });
});

describe("validateParticipantGrounding", () => {
  it("accepts known participants that use context identifiers, canonical names and kinds", () => {
    expect(codes([known("mission-control"), known("telemetry-store"), known("command-queue"), known("flight-controller")])).toEqual([]);
  });

  it("rejects elements outside the minimal grounded context, even when the pack knows them", () => {
    expect(context.actors.some((actor) => actor.id === "mission-commander")).toBe(false);
    expect(codes([known("mission-commander")])).toEqual(["unknown-participant@participants.0"]);
    expect(codes([known("ground-segment")])).toEqual(["unknown-participant@participants.0"]);
  });

  it("enforces canonical names from the context instead of flow spellings or aliases", () => {
    expect(codes([{ ...known("mission-control"), canonicalName: "MCC" }])).toEqual(["canonical-name-mismatch@participants.0"]);
    expect(codes([{ ...known("telemetry-store"), canonicalName: "TLM Store" }])).toEqual(["canonical-name-mismatch@participants.0"]);
  });

  it("enforces the participant kind derived from grounding", () => {
    const [issue] = validateParticipantGrounding(modelWith([{ ...known("telemetry-store"), kind: "system" }]), context);

    expect(issue?.code).toBe("participant-kind-mismatch");
    expect(issue?.details).toEqual({ elementId: "telemetry-store", expectedKind: "database" });
    expect(codes([{ ...known("flight-controller"), kind: "system" }])).toEqual(["participant-kind-mismatch@participants.0"]);
  });

  it("accepts only confirmed new participants with their exact [NEW] display name", () => {
    const groundStation = { origin: "new", newName: "ground station", displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: true };

    expect(context.newParticipants.map((participant) => participant.key)).toEqual(["ground station"]);
    expect(codes([groundStation])).toEqual([]);
    expect(codes([{ ...groundStation, displayName: "[NEW] Ground station" }])).toEqual(["new-participant-display-mismatch@participants.0"]);
    expect(codes([{ ...groundStation, newName: "launch pad", displayName: "[NEW] Launch Pad" }])).toEqual(["unknown-new-participant@participants.0"]);
  });

  it("reports issues with identifiers only, sorted by path", () => {
    const issues = validateParticipantGrounding(
      modelWith([{ ...known("mission-control"), canonicalName: "Control Room" }, known("mission-commander")]),
      context
    );

    expect(issues.map((issue) => issue.path)).toEqual(["participants.0", "participants.1"]);
    expect(JSON.stringify(issues)).not.toContain("Control Room");
  });
});
