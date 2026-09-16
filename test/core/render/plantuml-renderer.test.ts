import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import type { GroundedContext, GroundingSuccess } from "../../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import {
  parseGeneratedSequenceModel,
  type GeneratedSequenceModel,
  type SequenceFragment
} from "../../../src/core/model/sequence-diagram-model.schema.js";
import { normalizeGeneratedModel } from "../../../src/core/normalization/model-normalizer.js";
import { arrowFor, renderPlantUml } from "../../../src/core/render/plantuml-renderer.js";
import { participantKindOf } from "../../../src/core/validation/grounding-validator.js";
import { validatePlantUmlSubset } from "../../../src/core/validation/plantuml-validator.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

type Raw = Record<string, unknown>;
type End = string | { readonly newName: string };
type Step = readonly [End, End, string, Raw?];

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const packDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);
const sampleFlow = readFileSync(new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);

if (!loaded.ok) {
  throw new Error("The Space Mission pack must load.");
}

const knowledgePack = { pack: loaded.pack, indexes: loaded.indexes };

function ground(extraLines: readonly string[] = [], confirmedNewParticipants: readonly string[] = []): GroundingSuccess {
  const parsed = parseFlowDocument([sampleFlow.trimEnd(), ...extraLines, ""].join(LF), { file: "samples/space-mission/flows/telemetry-command-flow.md" });

  if (!parsed.ok) {
    throw new Error("The flow must parse.");
  }

  const outcome = buildGroundedContext({ flow: parsed.flow, knowledgePack, confirmedNewParticipants });

  if (outcome.status !== "grounded") {
    throw new Error(`Grounding was blocked: ${outcome.issues.map((issue) => issue.code).join(", ")}`);
  }

  return outcome;
}

const grounding = ground(["A [NEW: Ground Station] watches the uplink."], ["Ground Station"]);
const { context, digest } = grounding;

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

    return { from: ref(from), to: ref(to), label: `Step ${index + 1}`, interfaceType, order: index + 1, ...(extra ?? {}) };
  });
  const result = parseGeneratedSequenceModel({ participants: [...participants.values()], messages, fragments });

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return normalizeGeneratedModel(result.model);
}

function render(model: GeneratedSequenceModel, target: GroundedContext = context): string {
  const result = renderPlantUml({ context: target, model, digest, generatorType: "scripted-demo" });

  if (!result.ok) {
    throw new Error(`Expected a rendered diagram: ${JSON.stringify(result.issues)}`);
  }

  return result.text;
}

function bodyLines(text: string): string[] {
  return text.split(LF).filter((line) => /^(?:kp_|new_|alt |else |opt |loop |group |end$)/.test(line));
}

const steps: readonly Step[] = [
  ["flight-controller", "flight-controller", "INTERNAL"],
  ["mission-control", "command-service", "REST API", { interfaceName: "Command API" }],
  ["command-service", "mission-control", "REST API", { isResponse: true }],
  ["command-service", "command-queue", "EVENT", { async: true, interfaceName: "Command Accepted Event" }],
  ["telemetry-service", "telemetry-store", "DB"],
  [{ newName: "ground station" }, "mission-control", "FILE", { async: true }]
];

describe("renderPlantUml - structure", () => {
  const text = render(modelOf(steps));
  const lines = text.split(LF);

  it("emits exactly one start and one end marker, LF line endings and a final newline", () => {
    expect(lines[0]).toBe("@startuml");
    expect(lines.filter((line) => line === "@startuml")).toHaveLength(1);
    expect(lines.filter((line) => line === "@enduml")).toHaveLength(1);
    expect(lines.at(-2)).toBe("@enduml");
    expect(lines.at(-1)).toBe("");
    expect(text.endsWith(`@enduml${LF}`)).toBe(true);
    expect(text).not.toContain(CR);
  });

  it("declares every participant once, with the actor and system shapes and canonical names", () => {
    const declarations = lines.filter((line) => / as (?:kp|new)_/.test(line));

    expect(declarations).toEqual([
      'actor "Flight Controller" as kp_flight_controller',
      'participant "Mission Control" as kp_mission_control',
      'participant "Command Service" as kp_command_service',
      'queue "Command Queue" as kp_command_queue',
      'participant "Telemetry Service" as kp_telemetry_service',
      'database "Telemetry Store" as kp_telemetry_store',
      'participant "[NEW] Ground Station" as new_ground_station'
    ]);
  });

  it("renders synchronous, asynchronous and response arrows", () => {
    expect(bodyLines(text)).toEqual([
      "kp_flight_controller -> kp_flight_controller : Step 1 (INTERNAL)",
      "kp_mission_control -> kp_command_service : Step 2 (REST API: Command API)",
      "kp_command_service --> kp_mission_control : Step 3 (REST API)",
      "kp_command_service ->> kp_command_queue : Step 4 (EVENT: Command Accepted Event)",
      "kp_telemetry_service -> kp_telemetry_store : Step 5 (DB)",
      "new_ground_station ->> kp_mission_control : Step 6 (FILE)"
    ]);
    expect(arrowFor({ from: { elementId: "a" }, to: { elementId: "b" }, label: "x", interfaceType: "EVENT", order: 1, async: true, isResponse: true })).toBe("-->");
  });

  it("renders INTERNAL between two different participants between their aliases and a self-message as a self arrow", () => {
    const text = render(
      modelOf([
        ["flight-controller", "mission-control", "INTERNAL", { interfaceName: "Operator Console" }],
        ["command-service", "command-service", "INTERNAL"],
        ["mission-control", "command-service", "REST API"]
      ])
    );

    expect(bodyLines(text)).toEqual([
      "kp_flight_controller -> kp_mission_control : Step 1 (INTERNAL: Operator Console)",
      "kp_command_service -> kp_command_service : Step 2 (INTERNAL)",
      "kp_mission_control -> kp_command_service : Step 3 (REST API)"
    ]);
    expect(text).not.toContain("kp_flight_controller -> kp_flight_controller");
    expect(validatePlantUmlSubset(text).ok).toBe(true);
  });

  it("writes safe metadata comments and the local legend, and nothing else", () => {
    expect(lines.slice(1, 8)).toEqual([
      "' ArchGround sequence diagram",
      "' diagram: telemetry-command-flow",
      "' flow: Telemetry command flow",
      "' author: Space Mission Sample Team",
      "' language: en",
      `' grounding digest: sha256:${digest.value}`,
      "' generator: scripted-demo"
    ]);
    expect(text).toContain(`legend right${LF}Legend${LF}`);
    expect(text).not.toMatch(/!include|!define|!pragma|!theme|skinparam|<style>|:\/\//i);
  });

  it("passes the local structural validation of the emitted subset", () => {
    expect(validatePlantUmlSubset(text)).toEqual({ ok: true, issues: [], truncated: false });
  });

  it("is deterministic and independent of the participant order supplied by the generator", () => {
    const model = modelOf(steps);
    const shuffled: GeneratedSequenceModel = { ...model, participants: [...model.participants].reverse() };

    expect(render(model)).toBe(text);
    expect(bodyLines(render(shuffled))).toEqual(bodyLines(text));
  });

  it("takes display names from the grounded context, never from the generator", () => {
    const model = modelOf([["mission-control", "command-service", "REST API"]]);
    const spoofed: GeneratedSequenceModel = {
      ...model,
      participants: model.participants.map((participant) =>
        participant.origin === "knowledge-pack" ? { ...participant, canonicalName: "Spoofed Name" } : participant
      )
    };

    expect(render(spoofed)).toContain('participant "Mission Control" as kp_mission_control');
    expect(render(spoofed)).not.toContain("Spoofed Name");
  });

  it("uses the Polish legend when the flow language is pl", () => {
    const polish: GroundedContext = { ...context, metadata: { ...context.metadata, language: "pl" } };
    const text = render(modelOf([["mission-control", "command-service", "REST API"]]), polish);

    expect(text).toContain(`legend right${LF}Legenda${LF}`);
    expect(text).toContain("' language: pl");
    expect(validatePlantUmlSubset(text).ok).toBe(true);
  });
});

describe("renderPlantUml - fragments", () => {
  const fourSteps: readonly Step[] = [
    ["mission-control", "command-service", "REST API"],
    ["command-service", "mission-control", "REST API", { isResponse: true }],
    ["command-service", "command-queue", "EVENT", { async: true }],
    ["command-queue", "orbital-relay", "EVENT", { async: true }]
  ];

  it("renders balanced alt, else, opt, loop and group fragments around their messages", () => {
    const text = render(
      modelOf(fourSteps, [
        { kind: "alt", condition: "Command accepted", firstOrder: 1, lastOrder: 4, elseBranches: [{ condition: "Command rejected", firstOrder: 3 }] },
        { kind: "opt", condition: "Retry allowed", firstOrder: 1, lastOrder: 2 },
        { kind: "loop", condition: "Each queued command", firstOrder: 4, lastOrder: 4 }
      ])
    );

    expect(bodyLines(text)).toEqual([
      "alt Command accepted",
      "opt Retry allowed",
      "kp_mission_control -> kp_command_service : Step 1 (REST API)",
      "kp_command_service --> kp_mission_control : Step 2 (REST API)",
      "end",
      "else Command rejected",
      "kp_command_service ->> kp_command_queue : Step 3 (EVENT)",
      "loop Each queued command",
      "kp_command_queue ->> kp_orbital_relay : Step 4 (EVENT)",
      "end",
      "end"
    ]);
    expect(validatePlantUmlSubset(text).ok).toBe(true);

    const grouped = render(modelOf(fourSteps, [{ kind: "group", condition: "Uplink window", firstOrder: 3, lastOrder: 4 }]));
    expect(bodyLines(grouped).filter((line) => !line.startsWith("kp_"))).toEqual(["group Uplink window", "end"]);
    expect(validatePlantUmlSubset(grouped).ok).toBe(true);
  });

  it("returns a validation failure instead of rendering fragments that are not strictly nested", () => {
    const model = modelOf(fourSteps);
    const crossing: SequenceFragment[] = [
      { kind: "opt", condition: "First", firstOrder: 1, lastOrder: 3, elseBranches: [] },
      { kind: "loop", condition: "Second", firstOrder: 2, lastOrder: 4, elseBranches: [] }
    ];
    const result = renderPlantUml({ context, model: { ...model, fragments: crossing }, digest, generatorType: "scripted-demo" });

    expect(result).toEqual({ ok: false, issues: [expect.objectContaining({ code: "render-failed", details: { problem: "unrenderable-model" } })] });
  });
});

describe("renderPlantUml - message labels after the controlled colon", () => {
  const keywordLabels = [
    "Return validation result",
    "return telemetry frames",
    "ReTuRn mixed case frames",
    "Create payment instruction",
    "Activate subscription",
    "Deactivate temporary route",
    "Destroy expired session",
    "Alt processing route selected",
    "Else use fallback channel",
    "Opt retry once",
    "Loop over available records",
    "Group matching results",
    "End customer session",
    "Note validation outcome",
    "Title lookup",
    "Return: validation result",
    "end"
  ];

  it("keeps a response label that begins with Return on the arrow line as a response, byte for byte", () => {
    const text = render(
      modelOf([
        ["mission-control", "command-service", "REST API", { label: "Create payment instruction", interfaceName: "Command API" }],
        ["command-service", "mission-control", "REST API", { label: "Return validation result", isResponse: true }]
      ])
    );

    expect(bodyLines(text)).toEqual([
      "kp_mission_control -> kp_command_service : Create payment instruction (REST API: Command API)",
      "kp_command_service --> kp_mission_control : Return validation result (REST API)"
    ]);
    expect(text.split(LF).filter((line) => /^\s*(?:return|create)\b/i.test(line))).toEqual([]);
    expect(text).toContain(` : Return validation result (REST API)${LF}`);
    expect(validatePlantUmlSubset(text).ok).toBe(true);
  });

  it("renders every keyword-leading label unchanged after the alias, arrow and colon it never controls", () => {
    for (const label of keywordLabels) {
      const text = render(modelOf([["mission-control", "command-service", "REST API", { label }]]));

      expect(bodyLines(text)).toEqual([`kp_mission_control -> kp_command_service : ${label} (REST API)`]);
      expect(text.split(LF).filter((line) => line.endsWith(` : ${label} (REST API)`))).toHaveLength(1);
      expect(validatePlantUmlSubset(text)).toEqual({ ok: true, issues: [], truncated: false });
    }
  });

  it("still refuses a label that could leave the arrow line, naming only the problem", () => {
    const base = modelOf([["mission-control", "command-service", "REST API"]]);

    for (const [label, problem] of [
      [`Return validation result${LF}@enduml`, "line-break"],
      [`Return${CR}validation result`, "line-break"],
      ["Return @enduml", "directive-like"],
      ["Return !include local.puml", "directive-like"],
      ["Return <img:logo.png>", "creole-markup"]
    ] as const) {
      const result = renderPlantUml({ context, model: { ...base, messages: base.messages.map((message) => ({ ...message, label })) }, digest, generatorType: "scripted-demo" });

      expect(result).toEqual({ ok: false, issues: [expect.objectContaining({ code: "render-failed", details: { problem } })] });
      expect(JSON.stringify(result)).not.toContain("validation result");
    }
  });
});

describe("renderPlantUml - refusal", () => {
  const base = modelOf([["mission-control", "command-service", "REST API"]]);
  const refuse = (model: GeneratedSequenceModel) => renderPlantUml({ context, model, digest, generatorType: "scripted-demo" });

  it("refuses unsafe text that bypassed validation, naming only the problem", () => {
    const result = refuse({ ...base, messages: base.messages.map((message) => ({ ...message, label: "@startuml" })) });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]?.details).toEqual({ problem: "directive-like" });
    expect(JSON.stringify(result)).not.toContain("@startuml");

    const fragment = refuse({ ...base, fragments: [{ kind: "opt", condition: "end", firstOrder: 1, lastOrder: 1, elseBranches: [] }] });
    expect(!fragment.ok && fragment.issues[0]?.details).toEqual({ problem: "statement-keyword" });
  });

  it("refuses participants outside the grounded context and unconfirmed new participants", () => {
    const outside = refuse({
      ...base,
      participants: [...base.participants, { origin: "knowledge-pack", elementId: "mission-commander", canonicalName: "Mission Commander", kind: "actor" }]
    });
    const unconfirmed = refuse({
      ...base,
      participants: [...base.participants, { origin: "new", newName: "launch pad", displayName: "[NEW] Launch Pad", kind: "system", confirmedByUser: true }]
    });

    expect(outside.ok).toBe(false);
    expect(unconfirmed.ok).toBe(false);
  });

  it("refuses an empty diagram and an undeclared endpoint", () => {
    expect(refuse({ ...base, messages: [] }).ok).toBe(false);
    expect(
      refuse({ ...base, messages: base.messages.map((message) => ({ ...message, to: { elementId: "telemetry-store" } })) }).ok
    ).toBe(false);
  });
});
