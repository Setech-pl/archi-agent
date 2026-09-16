import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import type { GroundingSuccess } from "../../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { parseGeneratedSequenceModel, type GeneratedSequenceModel } from "../../../src/core/model/sequence-diagram-model.schema.js";
import { normalizeGeneratedModel } from "../../../src/core/normalization/model-normalizer.js";
import {
  buildGroundingReport,
  groundingReportSchemaVersion,
  serializeGroundingReport,
  type GroundingReportInput
} from "../../../src/core/report/grounding-report.js";
import { participantKindOf } from "../../../src/core/validation/grounding-validator.js";
import { applyInterfaceNamePolicy } from "../../../src/core/validation/interface-name-guard.js";
import { sortModelIssues } from "../../../src/core/validation/model-validator.js";
import { validateRelationships } from "../../../src/core/validation/relationship-validator.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

type Raw = Record<string, unknown>;
type End = string | { readonly newName: string };
type Step = readonly [End, End, string, Raw?];

const LF = String.fromCharCode(10);
const flowFile = "samples/space-mission/flows/telemetry-command-flow.md";
const packDirectory = "samples/space-mission/architecture";
const packDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);
const sampleFlow = readFileSync(new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);

if (!loaded.ok) {
  throw new Error("The Space Mission pack must load.");
}

const knowledgePack = { pack: loaded.pack, indexes: loaded.indexes };

function ground(extraLines: readonly string[], confirmedNewParticipants: readonly string[], selections: Readonly<Record<string, string>> = {}): GroundingSuccess {
  const parsed = parseFlowDocument([sampleFlow.trimEnd(), ...extraLines, ""].join(LF), { file: flowFile });

  if (!parsed.ok) {
    throw new Error("The flow must parse.");
  }

  const outcome = buildGroundedContext({ flow: parsed.flow, knowledgePack, confirmedNewParticipants, selections });

  if (outcome.status !== "grounded") {
    throw new Error(`Grounding was blocked: ${outcome.issues.map((issue) => issue.code).join(", ")}`);
  }

  return outcome;
}

const grounding = ground(
  ["A [NEW: Ground Station] watches the uplink.", "The control desk confirms the uplink window."],
  ["Ground Station"],
  { control: "mission-control" }
);

function modelOf(steps: readonly Step[]): GeneratedSequenceModel {
  const participants = new Map<string, Raw>();
  const ref = (end: End): Raw => (typeof end === "string" ? { elementId: end } : { newName: end.newName });
  const participantFor = (end: End): Raw => {
    if (typeof end !== "string") {
      return { origin: "new", newName: end.newName, displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: true };
    }

    const element = [...grounding.context.actors, ...grounding.context.systems].find((candidate) => candidate.id === end);

    if (element === undefined) {
      throw new Error(`Unknown test element ${end}.`);
    }

    return { origin: "knowledge-pack", elementId: end, canonicalName: element.canonicalName, kind: participantKindOf(element) };
  };
  const messages = steps.map(([from, to, interfaceType, extra], index) => {
    for (const end of [from, to]) {
      participants.set(typeof end === "string" ? end : `new:${end.newName}`, participantFor(end));
    }

    return { from: ref(from), to: ref(to), label: `Label number ${index + 1}`, interfaceType, order: index + 1, ...(extra ?? {}) };
  });
  const result = parseGeneratedSequenceModel({ participants: [...participants.values()], messages });

  if (!result.ok) {
    throw new Error(`Expected an accepted model: ${JSON.stringify(result.problems)}`);
  }

  return normalizeGeneratedModel(result.model);
}

const steps: readonly Step[] = [
  ["mission-control", "command-service", "REST API", { interfaceName: "Legacy Gateway" }],
  ["command-service", "mission-control", "REST API", { isResponse: true }],
  ["command-service", "command-queue", "EVENT", { async: true, interfaceName: "Command Accepted Event" }],
  [{ newName: "ground station" }, "command-queue", "FILE", { async: true }]
];

function reportInput(overrides: Partial<GroundingReportInput> = {}): GroundingReportInput {
  const model = modelOf(steps);
  const relationships = validateRelationships(model, grounding.context);
  const cleaned = applyInterfaceNamePolicy(model, relationships.matches);

  return {
    context: grounding.context,
    digest: grounding.digest,
    ambiguityReport: grounding.ambiguityReport,
    generatorType: "scripted-demo",
    model: cleaned.model,
    matches: relationships.matches,
    groundingWarnings: grounding.warnings,
    pipelineWarnings: sortModelIssues([...relationships.issues, ...cleaned.issues]),
    sources: { flowFile, knowledgePackDirectory: packDirectory },
    outputs: { diagramFile: "telemetry-command-flow-v2.puml", reportFile: "telemetry-command-flow-v2.grounding.json" },
    ...overrides
  };
}

const text = serializeGroundingReport(buildGroundingReport(reportInput()));
const report = JSON.parse(text) as Record<string, any>;

describe("grounding report - format", () => {
  it("is deterministic JSON with a fixed key order, two-space indentation and one final newline", () => {
    expect(serializeGroundingReport(buildGroundingReport(reportInput()))).toBe(text);
    expect(Object.keys(report)).toEqual([
      "reportSchemaVersion",
      "diagramName",
      "flowName",
      "author",
      "language",
      "groundingDigest",
      "generatorType",
      "sources",
      "knownParticipants",
      "newParticipants",
      "relationships",
      "rules",
      "ambiguitySelections",
      "messages",
      "fragments",
      "warnings",
      "validation",
      "outputs"
    ]);
    expect(text.split(LF)[1]).toBe(`  "reportSchemaVersion": ${groundingReportSchemaVersion},`);
    expect(text.endsWith(`}${LF}`)).toBe(true);
    expect(text.endsWith(`${LF}${LF}`)).toBe(false);
  });

  it("does not depend on the order of relationship matches", () => {
    const input = reportInput();
    const reversed = serializeGroundingReport(buildGroundingReport({ ...input, matches: [...input.matches].reverse() }));

    expect(reversed).toBe(text);
  });
});

describe("grounding report - content", () => {
  it("records metadata, digest, generator type and project-relative sources", () => {
    expect(report["reportSchemaVersion"]).toBe(1);
    expect([report["diagramName"], report["flowName"], report["author"], report["language"]]).toEqual([
      "telemetry-command-flow",
      "Telemetry command flow",
      "Space Mission Sample Team",
      "en"
    ]);
    expect(report["groundingDigest"]).toEqual({ algorithm: "sha256", value: grounding.digest.value });
    expect(report["generatorType"]).toBe("scripted-demo");
    expect(report["sources"]).toEqual({ flow: flowFile, knowledgePack: packDirectory });
    expect(report["outputs"]).toEqual({ diagram: "telemetry-command-flow-v2.puml", report: "telemetry-command-flow-v2.grounding.json" });
  });

  it("lists grounded participants with identifiers, kinds, canonical names and evidence", () => {
    const participants = report["knownParticipants"] as Raw[];
    const store = participants.find((participant) => participant["elementId"] === "command-queue");

    expect(participants.map((participant) => participant["elementId"])).toEqual([...participants.map((participant) => participant["elementId"] as string)].sort());
    expect(store).toMatchObject({
      participantType: "system",
      elementKind: "queue",
      diagramKind: "queue",
      canonicalName: "Command Queue",
      usedInDiagram: true,
      source: { file: `${packDirectory}/systems.md`, line: 9 }
    });
    expect(participants.find((participant) => participant["elementId"] === "flight-controller")?.["usedInDiagram"]).toBe(false);
    expect(report["newParticipants"]).toEqual([
      { key: "ground station", displayName: "Ground Station", grounded: false, usedInDiagram: true, flowMentions: [expect.objectContaining({ column: 3 })] }
    ]);
  });

  it("includes the relationships and rules of the minimal context with the messages they support", () => {
    const relationships = report["relationships"] as Raw[];
    const commandApi = relationships.find((relationship) => relationship["interfaceName"] === "Command API");

    expect(commandApi).toMatchObject({ fromId: "mission-control", toId: "command-service", mode: "synchronous", supportsMessages: [1, 2] });
    expect((report["rules"] as Raw[]).map((rule) => rule["rule"])).toEqual(["require", "forbid"]);
    expect((report["messages"] as Raw[]).map((message) => message["verification"])).toEqual(["grounded", "grounded", "grounded", "unverified-new"]);
    expect((report["messages"] as Raw[])[0]?.["interfaceName"]).toBeNull();
  });

  it("records explicit ambiguity selections with their candidates", () => {
    expect(report["ambiguitySelections"]).toEqual([{ mention: "control", selectedId: "mission-control", candidates: ["flight-controller", "mission-control"] }]);
  });

  it("records warnings by origin and the validation summary", () => {
    const warnings = report["warnings"] as Raw[];

    expect(warnings.map((warning) => [warning["origin"], warning["code"]])).toEqual([
      ["pipeline", "interface-name-removed"],
      ["pipeline", "unverified-new-participant-interaction"]
    ]);
    expect(report["validation"]).toEqual({
      schema: "passed",
      normalization: "passed",
      participantGrounding: "passed",
      relationships: "passed",
      interfaceNamePolicy: "names-removed",
      plantUmlSubset: "passed",
      officialPlantUmlRendering: "not-executed",
      errorCount: 0,
      warningCount: 2
    });
  });
});

describe("grounding report - exclusions", () => {
  it("contains no flow text, pack prose, message label, removed name, timestamp or absolute path", () => {
    for (const forbidden of [
      "prepares a command",
      "watches the uplink",
      "Console application used",
      "Label number",
      "Legacy Gateway",
      process.cwd(),
      process.cwd().split(String.fromCharCode(92)).join("/")
    ]) {
      expect(text).not.toContain(forbidden);
    }

    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toMatch(/"[A-Za-z]:[\\/]/);
    expect(text).not.toMatch(/"\/[A-Za-z]/);
  });

  it("rejects unsafe source paths and unplanned output names", () => {
    for (const flow of ["/abs/flow.md", "../flow.md", "C:/flows/flow.md", "flows\\flow.md"]) {
      expect(() => buildGroundingReport(reportInput({ sources: { flowFile: flow, knowledgePackDirectory: packDirectory } }))).toThrow();
    }

    for (const diagramFile of ["../x.puml", "Evil.puml", "x.txt", "dir/x.puml"]) {
      expect(() => buildGroundingReport(reportInput({ outputs: { diagramFile, reportFile: "x.grounding.json" } }))).toThrow();
    }
  });
});

describe("grounding report - model generation metadata", () => {
  const metadata = { modelId: "local-model-7b", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true };

  it("adds a modelGeneration block right after the generator type for a model-backed generator", () => {
    const withModel = JSON.parse(
      serializeGroundingReport(buildGroundingReport(reportInput({ generatorType: "openai-compatible-local", modelGeneration: metadata })))
    );

    expect(Object.keys(withModel).slice(5, 9)).toEqual(["groundingDigest", "generatorType", "modelGeneration", "sources"]);
    expect(withModel.modelGeneration).toEqual(metadata);
    expect(JSON.stringify(withModel)).not.toMatch(/127\.0\.0\.1|chat\/completions|planner/);
  });

  it("omits the block for a generator that is not model-backed", () => {
    expect("modelGeneration" in report).toBe(false);
  });

  it("refuses unsafe metadata", () => {
    for (const unsafe of [
      { ...metadata, modelId: "bad model" },
      { ...metadata, temperature: -1 },
      { ...metadata, seed: 1.5 },
      { ...metadata, attemptCount: 0 },
      { ...metadata, endpoint: "loopback" }
    ]) {
      expect(() => buildGroundingReport(reportInput({ modelGeneration: unsafe as never }))).toThrow();
    }
  });
});
