import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { generateSequenceDiagram } from "../../src/core/pipeline/generate-sequence-diagram.js";
import type { PipelineOutcome } from "../../src/core/pipeline/generation-outcome.js";
import { validatePlantUmlSubset } from "../../src/core/validation/plantuml-validator.js";
import { runLocalModelDemo } from "../../src/demo/lm-studio-demo.js";
import { ScriptedSpaceMissionGenerator } from "../../src/demo/scripted-space-mission-generator.js";
import { runSpaceMissionDemo, spaceMissionDemoPaths } from "../../src/demo/space-mission-demo.js";
import { parseLoopbackEndpoint, type LoopbackEndpoint } from "../../src/node/llm/loopback-endpoint.js";
import { OpenAiCompatibleLocalGenerator } from "../../src/node/llm/openai-compatible-local-generator.js";
import { KnowledgePackSourceDouble } from "../doubles/knowledge-pack-source-double.js";
import { OpenAiCompatibleServerDouble, type ServerDoubleOptions } from "../doubles/openai-compatible-server-double.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const packDir = new URL("../../samples/space-mission/architecture/", import.meta.url);
const expectedDir = new URL("../../samples/space-mission/expected/", import.meta.url);
const flowText = readFileSync(new URL("../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);
const parsedFlow = parseFlowDocument(flowText, { file: spaceMissionDemoPaths.flowFile });

if (!loaded.ok || !parsedFlow.ok) {
  throw new Error("The Space Mission sample must load.");
}

const knowledgePack = { pack: loaded.pack, indexes: loaded.indexes };
const grounding = buildGroundedContext({ flow: parsedFlow.flow, knowledgePack });

if (grounding.status !== "grounded") {
  throw new Error("Grounding must succeed.");
}

// A valid structured answer for the mock server. The scripted generator serves only as this fixture.
const validContent = JSON.stringify(
  await new ScriptedSpaceMissionGenerator().generate({ flow: parsedFlow.flow, context: grounding.context, digest: grounding.digest })
);
const doubles: OpenAiCompatibleServerDouble[] = [];
const workspaces: string[] = [];

afterEach(async () => {
  for (const double of doubles.splice(0)) {
    await double.close();
  }

  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

async function serve(options: ServerDoubleOptions = {}): Promise<{ double: OpenAiCompatibleServerDouble; endpoint: LoopbackEndpoint }> {
  const double = await OpenAiCompatibleServerDouble.start({ completionContent: validContent, ...options });
  doubles.push(double);
  const endpoint = parseLoopbackEndpoint(double.baseUrl);

  if (!endpoint.ok) {
    throw new Error("The double must expose a loopback endpoint.");
  }

  return { double, endpoint: endpoint.endpoint };
}

function run(endpoint: LoopbackEndpoint): Promise<PipelineOutcome> {
  return generateSequenceDiagram({
    flow: parsedFlow.ok ? parsedFlow.flow : (undefined as never),
    knowledgePack,
    generator: new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "local-model-7b" }),
    artifactBaseName: "telemetry-command-flow",
    sources: { flowFile: spaceMissionDemoPaths.flowFile, knowledgePackDirectory: spaceMissionDemoPaths.knowledgePackDirectory }
  });
}

describe("local model pipeline - success", () => {
  it("produces valid PlantUML and a report with model metadata in memory after one model attempt", async () => {
    const { double, endpoint } = await serve();
    const outcome = await run(endpoint);

    if (outcome.status !== "success") {
      throw new Error(`Expected success, got ${outcome.status}.`);
    }

    const report = JSON.parse(outcome.report.content);

    expect(validatePlantUmlSubset(outcome.diagram.content).ok).toBe(true);
    expect(outcome.generatorType).toBe("openai-compatible-local");
    expect(report.modelGeneration).toEqual({ modelId: "local-model-7b", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true });
    expect(double.completionRequests()).toHaveLength(1);
    expect(double.requests).toHaveLength(1);
  });

  it("gives identical artifacts for identical model answers", async () => {
    const first = await serve();
    const second = await serve();
    const [left, right] = [await run(first.endpoint), await run(second.endpoint)];

    expect(left.status === "success" && right.status === "success").toBe(true);
    expect(left.status === "success" && left.diagram.content).toBe(right.status === "success" && right.diagram.content);
    expect(left.status === "success" && left.report.content).toBe(right.status === "success" && right.report.content);
    expect(first.double.completionRequests()).toHaveLength(1);
    expect(second.double.completionRequests()).toHaveLength(1);
  });
});

describe("local model pipeline - failures are final", () => {
  it.each([
    ["schema-invalid", "invalid-generator-output", "schema-violation"],
    ["semantic-invalid", "semantic-validation-failed", "unknown-participant"],
    ["malformed-json", "invalid-generator-output", "generator-failed"],
    ["http-error", "invalid-generator-output", "generator-failed"]
  ] as const)("rejects the %s answer through the existing stages after exactly one request", async (scenario, status, code) => {
    const { double, endpoint } = await serve({ scenario });
    const outcome = await run(endpoint);

    expect(outcome.status).toBe(status);
    expect("issues" in outcome && outcome.issues.map((issue) => issue.code)).toContain(code);
    expect("diagram" in outcome).toBe(false);
    expect(double.requests).toHaveLength(1);
    expect(JSON.stringify(outcome)).not.toContain("scripted-demo");
  });

  it("surfaces the stable adapter code of a failed request", async () => {
    const { endpoint } = await serve({ scenario: "malformed-json" });
    const outcome = await run(endpoint);

    expect(outcome).toMatchObject({ status: "invalid-generator-output", issues: [{ code: "generator-failed", details: { problem: "malformed-json" } }] });
  });
});

describe("local model pipeline - reasoning_content compatibility", () => {
  it("validates a reasoning_content candidate through every existing stage after one request", async () => {
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat" });
    const outcome = await run(endpoint);

    if (outcome.status !== "success") {
      throw new Error(`Expected success, got ${outcome.status}.`);
    }

    expect(validatePlantUmlSubset(outcome.diagram.content).ok).toBe(true);
    expect(JSON.parse(outcome.report.content).modelGeneration).toEqual({
      modelId: "local-model-7b",
      temperature: 0,
      seed: 42,
      attemptCount: 1,
      structuredOutput: true
    });
    expect(outcome.report.content).not.toMatch(/reasoning/i);
    expect(double.requests).toHaveLength(1);
  });

  it("still rejects a schema-invalid reasoning_content candidate through the existing validation", async () => {
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat", reasoningContent: JSON.stringify({ participants: [], messages: [], notes: "x" }) });
    const outcome = await run(endpoint);

    expect(outcome.status).toBe("invalid-generator-output");
    expect("issues" in outcome && outcome.issues.length).toBeGreaterThan(0);
    expect("issues" in outcome && outcome.issues.every((issue) => issue.code === "schema-violation")).toBe(true);
    expect(double.requests).toHaveLength(1);
  });

  it("rejects prose in reasoning_content and never carries the text", async () => {
    const { endpoint } = await serve({ scenario: "reasoning-content-compat", reasoningContent: `Analysis private-reasoning-4711 follows. ${validContent}` });
    const outcome = await run(endpoint);

    expect(outcome).toMatchObject({
      status: "invalid-generator-output",
      issues: [{ code: "generator-failed", details: { problem: "reasoning-content-not-a-json-object" } }]
    });
    expect(JSON.stringify(outcome)).not.toContain("private-reasoning-4711");
  });
});

describe("local model pipeline - explicit interaction flags", () => {
  const fixture = JSON.parse(validContent) as { messages: Record<string, unknown>[] };

  it("sends a response format that requires async and isResponse on every message", async () => {
    const { double, endpoint } = await serve();
    await run(endpoint);

    const body = double.completionRequests()[0]?.body as Record<string, any>;
    expect(body["response_format"]["json_schema"]["schema"]["properties"]["messages"]["items"]["required"]).toEqual(
      expect.arrayContaining(["async", "isResponse"])
    );
  });

  it("rejects an answer that omits the flags at the schema stage after one request, without inferring them", async () => {
    // Shape of an observed local-model answer: asynchronous EVENT messages without async and isResponse.
    const omitted = JSON.stringify({
      ...fixture,
      messages: fixture.messages.map(({ async: _async, isResponse: _isResponse, ...message }) => message)
    });
    const { double, endpoint } = await serve({ completionContent: omitted });
    const outcome = await run(endpoint);

    expect(outcome.status).toBe("invalid-generator-output");
    expect("schemaProblems" in outcome && outcome.schemaProblems).toEqual(
      fixture.messages.flatMap((_message, index) => [
        { path: `messages.${index}.async`, code: "invalid_type" },
        { path: `messages.${index}.isResponse`, code: "invalid_type" }
      ])
    );
    expect(double.requests).toHaveLength(1);
  });

  it("accepts the same answer once every message states both flags", async () => {
    expect(fixture.messages.every((message) => typeof message["async"] === "boolean" && typeof message["isResponse"] === "boolean")).toBe(true);
    expect(fixture.messages.some((message) => message["async"] === true)).toBe(true);

    const { double, endpoint } = await serve();
    expect((await run(endpoint)).status).toBe("success");
    expect(double.requests).toHaveLength(1);
  });
});

describe("local model pipeline - message labels that begin with a statement keyword", () => {
  // Synthetic answer in the shape of the owner acceptance finding: the scripted fixture with natural
  // labels that begin with PlantUML statement keywords. It is not a copy of any model answer.
  const fixture = JSON.parse(validContent) as { messages: { readonly isResponse?: boolean; readonly label: string }[] };
  const keywordContent = JSON.stringify({
    ...fixture,
    messages: fixture.messages.map((message, index) => ({
      ...message,
      label: message.isResponse === true ? "Return validation result" : index === 0 ? "Create command request" : message.label
    }))
  });
  const responseLine = /^kp_command_service --> kp_mission_control : Return validation result \(REST API[^)]*\)$/mu;

  it.each(["completion", "reasoning-content-compat"] as const)("accepts them through every stage from the %s channel after one request", async (scenario) => {
    const { double, endpoint } = await serve({ scenario, completionContent: keywordContent });
    const outcome = await run(endpoint);

    if (outcome.status !== "success") {
      throw new Error(`Expected success, got ${outcome.status}.`);
    }

    expect(fixture.messages.some((message) => message.isResponse === true)).toBe(true);
    expect(outcome.diagram.content).toMatch(responseLine);
    expect(outcome.diagram.content).toContain("kp_flight_controller -> kp_mission_control : Create command request (INTERNAL: Operator Console)");
    expect(outcome.diagram.content.split(String.fromCharCode(10)).filter((line) => /^(?:return|create)\b/i.test(line))).toEqual([]);
    expect(validatePlantUmlSubset(outcome.diagram.content).ok).toBe(true);
    expect(JSON.parse(outcome.report.content).modelGeneration.attemptCount).toBe(1);
    expect(double.requests).toHaveLength(1);
    expect(JSON.stringify(outcome)).not.toContain("scripted-demo");
    expect(JSON.stringify(outcome)).not.toContain("statement-keyword");
  });

  it("lets such an answer reach semantic validation instead of schema validation", async () => {
    const semanticallyWrong = JSON.stringify({
      ...fixture,
      messages: (JSON.parse(keywordContent) as { messages: { readonly interfaceType: string }[] }).messages.map((message, index) =>
        index === 1 ? { ...message, interfaceType: "EVENT", async: true } : message
      )
    });
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat", completionContent: semanticallyWrong });
    const outcome = await run(endpoint);

    expect(outcome.status).toBe("semantic-validation-failed");
    expect("issues" in outcome && outcome.issues.map((issue) => issue.code)).not.toContain("schema-violation");
    expect(JSON.stringify(outcome)).not.toContain("statement-keyword");
    expect(JSON.stringify(outcome)).not.toContain("Return validation result");
    expect("diagram" in outcome).toBe(false);
    expect(double.requests).toHaveLength(1);
  });

  it("still rejects a label that could leave the arrow line, at the schema stage, without repeating it", async () => {
    const hostile = JSON.stringify({
      ...fixture,
      messages: fixture.messages.map((message, index) => (index === 0 ? { ...message, label: `Return validation result${String.fromCharCode(10)}@enduml` } : message))
    });
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat", completionContent: hostile });
    const outcome = await run(endpoint);

    expect(outcome.status).toBe("invalid-generator-output");
    expect("schemaProblems" in outcome && outcome.schemaProblems).toEqual([{ path: "messages.0.label", code: "text-line-break" }]);
    expect(JSON.stringify(outcome)).not.toContain("@enduml");
    expect(double.requests).toHaveLength(1);
  });

  it("writes nothing in a dry run and prints no diagnostics for such labels", async () => {
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat", completionContent: keywordContent });
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-llm-keyword-")));
    workspaces.push(root);
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: true });

    expect(outcome.result.status).toBe("dry-run");
    expect(outcome.diagnostics).toBeUndefined();
    expect(existsSync(root) && readdirSync(root)).toEqual([]);
    expect(double.completionRequests()).toHaveLength(1);
  });
});

describe("local model pipeline - artifacts and boundaries", () => {
  it("writes nothing in a model-driven dry run", async () => {
    const { double, endpoint } = await serve();
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-llm-pipeline-")));
    workspaces.push(root);
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: true });

    expect(outcome.result.status).toBe("dry-run");
    expect(existsSync(root) && readdirSync(root)).toEqual([]);
    expect(double.completionRequests()).toHaveLength(1);
  });

  it("leaves the scripted demo and its golden outputs unchanged", async () => {
    const result = await runSpaceMissionDemo({ projectRoot, outputRoot: realpathSync(tmpdir()), dryRun: true });

    if (result.status !== "dry-run") {
      throw new Error("Expected a dry run.");
    }

    expect(Buffer.from(result.outcome.diagram.content).equals(readFileSync(new URL("telemetry-command-flow.puml", expectedDir)))).toBe(true);
    expect(Buffer.from(result.outcome.report.content).equals(readFileSync(new URL("telemetry-command-flow.grounding.json", expectedDir)))).toBe(true);
    expect(JSON.parse(result.outcome.report.content).modelGeneration).toBeUndefined();
  });

  it("uses no URL literal other than the loopback forms in the sources", () => {
    const sourceDir = fileURLToPath(new URL("../../src/", import.meta.url));
    const files = readdirSync(sourceDir, { recursive: true }).map(String).filter((name) => name.endsWith(".ts"));
    const offending = files.filter((name) => /https?:\/\/(?!127\.0\.0\.1[:/]|\[::1\][:/])[A-Za-z0-9[]/.test(readFileSync(path.join(sourceDir, name), "utf8")));

    expect(files.length).toBeGreaterThan(40);
    expect(offending).toEqual([]);
  });

  it("keeps the new core prompt and response modules free of platform access", () => {
    const coreDir = fileURLToPath(new URL("../../src/core/", import.meta.url));

    for (const name of ["prompt/sequence-generation-prompt.ts", "prompt/generated-model-json-schema.ts", "llm/strict-json-response.ts"]) {
      const text = readFileSync(path.join(coreDir, ...name.split("/")), "utf8");

      expect({ name, match: /from\s+["']node:|\bprocess\s*\.|\bfetch\s*\(|\brequire\s*\(|\bimport\s*\(/.test(text) }).toEqual({ name, match: false });
    }
  });
});
