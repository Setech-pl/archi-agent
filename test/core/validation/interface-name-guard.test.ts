import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import type { GroundedContext } from "../../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { parseGeneratedSequenceModel, type GeneratedSequenceModel } from "../../../src/core/model/sequence-diagram-model.schema.js";
import { participantKindOf } from "../../../src/core/validation/grounding-validator.js";
import { applyInterfaceNamePolicy } from "../../../src/core/validation/interface-name-guard.js";
import { hasModelErrors } from "../../../src/core/validation/model-validator.js";
import { validateRelationships } from "../../../src/core/validation/relationship-validator.js";
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
    return { origin: "new", newName: end.newName, displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: true };
  }

  const element = [...context.actors, ...context.systems].find((candidate) => candidate.id === end);

  if (element === undefined) {
    throw new Error(`Unknown test element ${end}.`);
  }

  return { origin: "knowledge-pack", elementId: end, canonicalName: element.canonicalName, kind: participantKindOf(element) };
}

function modelOf(steps: readonly Step[], fragments: readonly Raw[] = []): GeneratedSequenceModel {
  const participants = new Map<string, Raw>();
  const ref = (end: End): Raw => (typeof end === "string" ? { elementId: end } : { newName: end.newName });
  const messages = steps.map(([from, to, interfaceType, extra], index) => {
    for (const end of [from, to]) {
      participants.set(typeof end === "string" ? end : `new:${end.newName}`, participantFor(end));
    }

    return { from: ref(from), to: ref(to), label: `Step ${index + 1}`, interfaceType, async: false, isResponse: false, order: index + 1, ...(extra ?? {}) };
  });
  const result = parseGeneratedSequenceModel({ participants: [...participants.values()], messages, fragments });

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return result.model;
}

function clean(steps: readonly Step[], fragments: readonly Raw[] = []) {
  const model = modelOf(steps, fragments);
  return { input: model, ...applyInterfaceNamePolicy(model, validateRelationships(model, context).matches) };
}

describe("applyInterfaceNamePolicy", () => {
  it("retains an interface name declared by the applicable grounded relationship", () => {
    const result = clean([["mission-control", "command-service", "REST API", { interfaceName: "Command API" }]]);

    expect(result.issues).toEqual([]);
    expect(result.model.messages[0]?.interfaceName).toBe("Command API");
  });

  it("keeps an absent interface name absent and never fills one in", () => {
    const result = clean([
      ["mission-control", "command-service", "REST API"],
      ["telemetry-service", "telemetry-store", "DB"]
    ]);

    expect(result.issues).toEqual([]);
    expect(result.model.messages.map((message) => "interfaceName" in message)).toEqual([false, false]);
  });

  it("removes an ungrounded interface name with a deterministic warning that omits the removed text", () => {
    const result = clean([["mission-control", "command-service", "REST API", { interfaceName: "Legacy Gateway" }]]);

    expect(result.model.messages[0]?.interfaceName).toBeUndefined();
    expect(result.issues.map((issue) => [issue.code, issue.severity, issue.path, issue.details])).toEqual([
      ["interface-name-removed", "warning", "messages.0.interfaceName", { order: 1 }]
    ]);
    expect(JSON.stringify(result.issues)).not.toContain("Legacy Gateway");
    expect(hasModelErrors(result.issues)).toBe(false);
  });

  it("does not guess a replacement, even when another relationship between the same participants has a name", () => {
    const planFile = clean([["mission-control", "command-service", "REST API", { interfaceName: "Command Plan File" }]]);
    const unnamedDb = clean([["telemetry-service", "telemetry-store", "DB", { interfaceName: "Telemetry Writer" }]]);

    expect(planFile.model.messages[0]?.interfaceName).toBeUndefined();
    expect(planFile.issues.map((issue) => issue.code)).toEqual(["interface-name-removed"]);
    expect(unnamedDb.model.messages[0]?.interfaceName).toBeUndefined();
    expect(unnamedDb.issues.map((issue) => issue.code)).toEqual(["interface-name-removed"]);
  });

  it("removes names from internal processing and from unverifiable new-participant interactions", () => {
    const result = clean([
      ["command-service", "command-service", "INTERNAL", { interfaceName: "Validator" }],
      [{ newName: "ground station" }, "mission-control", "REST API", { interfaceName: "Command API" }]
    ]);

    expect(result.model.messages.map((message) => message.interfaceName)).toEqual([undefined, undefined]);
    expect(result.issues.map((issue) => issue.path)).toEqual(["messages.0.interfaceName", "messages.1.interfaceName"]);
  });

  it("changes nothing else and keeps the model valid", () => {
    const fragments = [{ kind: "opt", condition: "Command accepted", firstOrder: 1, lastOrder: 2 }];
    const result = clean(
      [
        ["mission-control", "command-service", "REST API", { interfaceName: "Legacy Gateway", businessDescription: "Daily check" }],
        ["command-service", "mission-control", "REST API", { isResponse: true, interfaceName: "Command API" }]
      ],
      fragments
    );

    expect(result.model.participants).toBe(result.input.participants);
    expect(result.model.fragments).toBe(result.input.fragments);
    expect(result.model.messages[0]).toEqual({ ...result.input.messages[0], interfaceName: undefined });
    expect(result.model.messages[0] && "interfaceName" in result.model.messages[0]).toBe(false);
    expect(result.model.messages[1]).toBe(result.input.messages[1]);
    expect(Object.isFrozen(result.model)).toBe(true);
  });
});
