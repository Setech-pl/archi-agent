import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument, type FlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { generateSequenceDiagram, type GenerateSequenceDiagramRequest } from "../../../src/core/pipeline/generate-sequence-diagram.js";
import type { PipelineOutcome } from "../../../src/core/pipeline/generation-outcome.js";
import type { SequenceModelGenerationRequest, SequenceModelGenerator } from "../../../src/core/pipeline/sequence-model-generator.js";
import { validatePlantUmlSubset } from "../../../src/core/validation/plantuml-validator.js";
import { ScriptedSpaceMissionGenerator } from "../../../src/demo/scripted-space-mission-generator.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

type Raw = Record<string, unknown>;

const LF = String.fromCharCode(10);
const flowFile = "samples/space-mission/flows/telemetry-command-flow.md";
const packDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);
const sampleFlow = readFileSync(new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);

if (!loaded.ok) {
  throw new Error("The Space Mission pack must load.");
}

const knowledgePack = { pack: loaded.pack, indexes: loaded.indexes };

function flowWith(extraLines: readonly string[] = []): FlowDocument {
  const parsed = parseFlowDocument([sampleFlow.trimEnd(), ...extraLines, ""].join(LF), { file: flowFile });

  if (!parsed.ok) {
    throw new Error("The flow must parse.");
  }

  return parsed.flow;
}

const flow = flowWith();

/** Test generator: returns whatever the test supplies and records every request. */
class StubGenerator implements SequenceModelGenerator {
  public readonly generatorType: string;
  public readonly requests: SequenceModelGenerationRequest[] = [];
  readonly #produce: (request: SequenceModelGenerationRequest) => unknown;

  public constructor(produce: (request: SequenceModelGenerationRequest) => unknown, generatorType = "test-stub") {
    this.#produce = produce;
    this.generatorType = generatorType;
  }

  public async generate(request: SequenceModelGenerationRequest): Promise<unknown> {
    this.requests.push(request);
    return this.#produce(request);
  }
}

async function scriptedOutput(): Promise<Raw> {
  const grounding = buildGroundedContext({ flow, knowledgePack });

  if (grounding.status !== "grounded") {
    throw new Error("Grounding must succeed.");
  }

  return (await new ScriptedSpaceMissionGenerator().generate({ flow, context: grounding.context, digest: grounding.digest })) as Raw;
}

function run(generator: SequenceModelGenerator, overrides: Partial<GenerateSequenceDiagramRequest> = {}): Promise<PipelineOutcome> {
  return generateSequenceDiagram({
    flow,
    knowledgePack,
    generator,
    artifactBaseName: "telemetry-command-flow",
    sources: { flowFile, knowledgePackDirectory: "samples/space-mission/architecture" },
    ...overrides
  });
}

function withMessages(output: Raw, change: (messages: Raw[]) => Raw[]): Raw {
  return { ...output, messages: change(structuredClone(output["messages"] as Raw[])) };
}

/** Selects exactly one request message by its stable endpoint identifiers and interface type. */
function requestBetween(messages: Raw[], fromId: string, toId: string, interfaceType: string): Raw {
  const found = messages.filter(
    (message) =>
      (message["from"] as Raw)["elementId"] === fromId &&
      (message["to"] as Raw)["elementId"] === toId &&
      message["interfaceType"] === interfaceType &&
      message["isResponse"] !== true
  );

  expect(found).toHaveLength(1);
  return found[0] as Raw;
}

const staleSummaryField = ["internal", "Count"].join("");

describe("generateSequenceDiagram - success", () => {
  it("runs the complete pipeline with the scripted generator and returns both artifacts in memory", async () => {
    const outcome = await run(new ScriptedSpaceMissionGenerator());

    if (outcome.status !== "success") {
      throw new Error(`Expected success, got ${outcome.status}.`);
    }

    expect(outcome.generatorType).toBe("scripted-demo");
    expect(outcome.diagram.fileName).toBe("telemetry-command-flow.puml");
    expect(outcome.report.fileName).toBe("telemetry-command-flow.grounding.json");
    expect(validatePlantUmlSubset(outcome.diagram.content).ok).toBe(true);
    expect(JSON.parse(outcome.report.content)).toMatchObject({
      groundingDigest: { value: outcome.digest.value },
      outputs: { diagram: "telemetry-command-flow.puml", report: "telemetry-command-flow.grounding.json" }
    });
    expect(outcome.summary).toEqual({
      participantCount: 7,
      knownParticipantCount: 7,
      newParticipantCount: 0,
      messageCount: 8,
      synchronousCount: 4,
      asynchronousCount: 3,
      responseCount: 1,
      selfMessageCount: 1,
      warningCount: 0
    });
    expect(Object.keys(outcome.summary)).toContain("selfMessageCount");
    expect(Object.keys(outcome.summary)).not.toContain(staleSummaryField);
  });

  it("counts a cross-participant INTERNAL message by its mode and a self-message as a separate metric", async () => {
    const output = await scriptedOutput();
    const summaryOf = async (value: Raw) => {
      const outcome = await run(new StubGenerator(() => value));

      if (outcome.status !== "success") {
        throw new Error(`Expected success, got ${outcome.status}.`);
      }

      return outcome.summary;
    };
    const endpoints = (message: Raw): [unknown, unknown] => [(message["from"] as Raw)["elementId"], (message["to"] as Raw)["elementId"]];
    const withoutSelfMessage = withMessages(output, (messages) => messages.filter((message) => endpoints(message)[0] !== endpoints(message)[1]));
    const withoutController = {
      ...withMessages(output, (messages) => messages.filter((message) => !endpoints(message).includes("flight-controller"))),
      participants: (output["participants"] as Raw[]).filter((participant) => participant["elementId"] !== "flight-controller")
    };

    const full = await summaryOf(output);
    const noSelfMessage = await summaryOf(withoutSelfMessage);
    const noController = await summaryOf(withoutController);

    expect([full.messageCount, full.synchronousCount, full.selfMessageCount]).toEqual([8, 4, 1]);
    expect([noController.messageCount, noController.synchronousCount, noController.selfMessageCount]).toEqual([7, 3, 1]);
    expect([noSelfMessage.messageCount, noSelfMessage.synchronousCount, noSelfMessage.selfMessageCount]).toEqual([7, 3, 0]);
    expect(full.synchronousCount + full.asynchronousCount + full.responseCount).toBe(full.messageCount);
  });

  it("is deterministic", async () => {
    const first = await run(new ScriptedSpaceMissionGenerator());
    const second = await run(new ScriptedSpaceMissionGenerator());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("gives the generator only the parsed flow, the minimal grounded context and its digest", async () => {
    const output = await scriptedOutput();
    const generator = new StubGenerator(() => output);
    const outcome = await run(generator);

    expect(outcome.status).toBe("success");
    expect(generator.requests).toHaveLength(1);

    const request = generator.requests[0] as SequenceModelGenerationRequest;
    expect(Object.keys(request).sort()).toEqual(["context", "digest", "flow"]);
    expect(request.flow).toBe(flow);
    expect(request.context.actors.map((actor) => actor.id)).toEqual(["flight-controller"]);
    expect(JSON.stringify(request)).not.toContain("mission-commander");
  });

  it("removes an ungrounded interface name with a warning and renders only the cleaned model", async () => {
    const output = withMessages(await scriptedOutput(), (messages) => {
      const request = requestBetween(messages, "mission-control", "command-service", "REST API");
      expect(request["interfaceName"]).toBe("Command API");
      request["interfaceName"] = "Legacy Gateway";
      return messages;
    });
    const outcome = await run(new StubGenerator(() => output));

    if (outcome.status !== "success") {
      throw new Error(`Expected success, got ${outcome.status}.`);
    }

    expect(outcome.warnings.map((warning) => warning.code)).toEqual(["interface-name-removed"]);
    expect(outcome.diagram.content).not.toContain("Legacy Gateway");
    expect(outcome.report.content).not.toContain("Legacy Gateway");
    expect(JSON.parse(outcome.report.content).validation.interfaceNamePolicy).toBe("names-removed");
  });
});

describe("generateSequenceDiagram - stops early", () => {
  it("stops when grounding is blocked and never calls the generator", async () => {
    const generator = new StubGenerator(() => {
      throw new Error("must not be called");
    });
    const outcome = await run(generator, { flow: flowWith(["The control desk confirms the uplink window."]) });

    expect(outcome.status).toBe("grounding-blocked");
    expect(outcome.status === "grounding-blocked" && outcome.ambiguityReport.entries.map((entry) => entry.mention)).toEqual(["control"]);
    expect(generator.requests).toHaveLength(0);
  });

  it("refuses a generator without a safe generator type before calling it", async () => {
    const generator = new StubGenerator(() => ({}), "Real Model");
    const outcome = await run(generator);

    expect(outcome).toMatchObject({ status: "invalid-generator-output", issues: [{ code: "invalid-generator-type" }] });
    expect(generator.requests).toHaveLength(0);
  });

  it("honours cancellation before and during generation", async () => {
    const before = new StubGenerator(() => ({}));
    const aborted = await run(before, { signal: { aborted: true } });

    expect(aborted).toMatchObject({ status: "invalid-generator-output", issues: [{ code: "generation-cancelled" }] });
    expect(before.requests).toHaveLength(0);

    const signal = { aborted: false };
    const output = await scriptedOutput();
    const during = await run(
      new StubGenerator(() => {
        signal.aborted = true;
        return output;
      }),
      { signal }
    );

    expect(during).toMatchObject({ status: "invalid-generator-output", issues: [{ code: "generation-cancelled" }] });
  });

  it("rejects an artifact base name that did not come from the output planner", async () => {
    await expect(run(new ScriptedSpaceMissionGenerator(), { artifactBaseName: "../escape" })).rejects.toThrow();
    await expect(run(new ScriptedSpaceMissionGenerator(), { artifactBaseName: "Name With Spaces" })).rejects.toThrow();
  });
});

describe("generateSequenceDiagram - untrusted generator results", () => {
  const hostilePlantUml = ["@startuml", "!include shared.puml", "A -> B : hi", "@enduml"].join(LF);

  it.each([
    ["null", null],
    ["a number", 42],
    ["raw PlantUML text", hostilePlantUml],
    ["an array", []],
    ["an empty model", { participants: [], messages: [] }]
  ])("treats %s as invalid output", async (_name, value) => {
    const outcome = await run(new StubGenerator(() => value));

    expect(outcome.status).toBe("invalid-generator-output");
    expect(outcome.status === "invalid-generator-output" && outcome.issues.every((issue) => issue.code === "schema-violation")).toBe(true);
    expect(JSON.stringify(outcome)).not.toContain("!include");
  });

  it("rejects extra keys, such as generator-supplied metadata or raw diagram text", async () => {
    const output = await scriptedOutput();
    const outcome = await run(new StubGenerator(() => ({ ...output, metadata: { author: "Model" }, plantuml: hostilePlantUml })));

    expect(outcome).toMatchObject({ status: "invalid-generator-output", schemaProblems: [{ path: "(root)", code: "unrecognized_keys" }] });
  });

  it("maps a failing generator to a safe outcome without its error text", async () => {
    const outcome = await run(
      new StubGenerator(() => {
        throw new Error("provider said: private diagnostic text");
      })
    );

    expect(outcome).toMatchObject({ status: "invalid-generator-output", issues: [{ code: "generator-failed" }] });
    expect(JSON.stringify(outcome)).not.toContain("private diagnostic text");
  });

  it("returns semantic failures as values for ungrounded participants, endpoints, relationships and modes", async () => {
    const output = await scriptedOutput();
    const nextOrder = Math.max(...(output["messages"] as Raw[]).map((message) => message["order"] as number)) + 1;
    const cases: ReadonlyArray<readonly [Raw, string]> = [
      [
        {
          ...output,
          participants: [...(output["participants"] as Raw[]), { origin: "knowledge-pack", elementId: "mission-commander", canonicalName: "Mission Commander", kind: "actor" }],
          messages: [...(output["messages"] as Raw[]), { from: { elementId: "mission-commander" }, to: { elementId: "mission-commander" }, label: "Approve", interfaceType: "INTERNAL", order: nextOrder }]
        },
        "unknown-participant"
      ],
      [
        withMessages(output, (messages) => {
          requestBetween(messages, "mission-control", "command-service", "REST API")["to"] = { elementId: "telemetry-store" };
          return messages;
        }),
        "missing-relationship"
      ],
      [
        withMessages(output, (messages) => {
          const accepted = requestBetween(messages, "command-service", "command-queue", "EVENT");
          expect(accepted["async"]).toBe(true);
          accepted["async"] = false;
          return messages;
        }),
        "interaction-mode-mismatch"
      ],
      [
        withMessages(output, (messages) => [
          ...messages,
          { from: { elementId: "mission-control" }, to: { elementId: "command-service" }, label: "Console step", interfaceType: "INTERNAL", order: nextOrder }
        ]),
        "internal-endpoint-mismatch"
      ]
    ];

    for (const [value, code] of cases) {
      const outcome = await run(new StubGenerator(() => value));

      expect(outcome.status).toBe("semantic-validation-failed");
      expect(outcome.status === "semantic-validation-failed" && outcome.issues.map((issue) => issue.code)).toContain(code);
    }
  });

  it("returns a render-stage failure when the report cannot be produced safely", async () => {
    const outcome = await run(new ScriptedSpaceMissionGenerator(), { sources: { flowFile: "/absolute/flow.md", knowledgePackDirectory: "samples/space-mission/architecture" } });

    expect(outcome).toMatchObject({ status: "render-validation-failed", issues: [{ code: "report-failed" }] });
  });
});

describe("generateSequenceDiagram - model-backed generators", () => {
  const metadata = { modelId: "local-model-7b", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true };

  function modelBacked(produce: () => unknown, generationMetadata: unknown): SequenceModelGenerator & { calls: number } {
    const generator = {
      generatorType: "openai-compatible-local",
      generationMetadata: generationMetadata as never,
      calls: 0,
      async generate(): Promise<unknown> {
        generator.calls += 1;
        return produce();
      }
    };
    return generator;
  }

  it("records the declared model metadata in the grounding report", async () => {
    const output = await scriptedOutput();
    const outcome = await run(modelBacked(() => output, metadata));

    if (outcome.status !== "success") {
      throw new Error(`Expected success, got ${outcome.status}.`);
    }

    expect(JSON.parse(outcome.report.content)).toMatchObject({ generatorType: "openai-compatible-local", modelGeneration: metadata });
    expect(outcome.diagram.content).toContain("' generator: openai-compatible-local");
  });

  it("writes no model metadata for the scripted demo generator", async () => {
    const outcome = await run(new ScriptedSpaceMissionGenerator());

    expect(outcome.status === "success" && JSON.parse(outcome.report.content).modelGeneration).toBeUndefined();
  });

  it("refuses unsafe metadata before calling the generator", async () => {
    for (const unsafe of [{ ...metadata, modelId: "bad model" }, { ...metadata, attemptCount: 0 }, { ...metadata, prompt: "text" }, "metadata"]) {
      const generator = modelBacked(() => ({}), unsafe);

      expect(await run(generator)).toMatchObject({ status: "invalid-generator-output", issues: [{ code: "invalid-generator-type" }] });
      expect(generator.calls).toBe(0);
    }
  });

  it("surfaces a stable generator failure code but never the error message", async () => {
    const coded = Object.assign(new Error("private server text"), { code: "timeout" });
    const unsafe = Object.assign(new Error("private server text"), { code: "Not A Code!" });
    const withCode = await run(modelBacked(() => Promise.reject(coded), metadata));
    const withoutCode = await run(modelBacked(() => Promise.reject(unsafe), metadata));

    expect(withCode).toEqual({
      status: "invalid-generator-output",
      issues: [expect.objectContaining({ code: "generator-failed", details: { problem: "timeout" } })],
      schemaProblems: []
    });
    expect(withoutCode.status === "invalid-generator-output" && withoutCode.issues[0]?.details).toBeUndefined();
    expect(JSON.stringify([withCode, withoutCode])).not.toContain("private server text");
  });
});
