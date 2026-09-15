import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { validatePlantUmlSubset } from "../../src/core/validation/plantuml-validator.js";
import { describeLocalModelResult, main, parseLmStudioArguments, runLocalModelDemo } from "../../src/demo/lm-studio-demo.js";
import { ScriptedSpaceMissionGenerator } from "../../src/demo/scripted-space-mission-generator.js";
import { spaceMissionDemoPaths } from "../../src/demo/space-mission-demo.js";
import { parseLoopbackEndpoint, type LoopbackEndpoint } from "../../src/node/llm/loopback-endpoint.js";
import { KnowledgePackSourceDouble } from "../doubles/knowledge-pack-source-double.js";
import { OpenAiCompatibleServerDouble, type ServerDoubleOptions } from "../doubles/openai-compatible-server-double.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const packDir = new URL("../../samples/space-mission/architecture/", import.meta.url);
const flowText = readFileSync(new URL("../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);
const parsedFlow = parseFlowDocument(flowText, { file: spaceMissionDemoPaths.flowFile });

if (!loaded.ok || !parsedFlow.ok) {
  throw new Error("The Space Mission sample must load.");
}

const grounding = buildGroundedContext({ flow: parsedFlow.flow, knowledgePack: { pack: loaded.pack, indexes: loaded.indexes } });

if (grounding.status !== "grounded") {
  throw new Error("Grounding must succeed.");
}

const validContent = JSON.stringify(
  await new ScriptedSpaceMissionGenerator().generate({ flow: parsedFlow.flow, context: grounding.context, digest: grounding.digest })
);
const doubles: OpenAiCompatibleServerDouble[] = [];
const workspaces: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();

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

function outputRoot(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-llm-demo-")));
  workspaces.push(root);
  return root;
}

function tree(root: string): string[] {
  return existsSync(root) ? readdirSync(root, { recursive: true }).map(String).sort() : [];
}

function captureOutput(): { stdout: () => string; stderr: () => string } {
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return {
    stdout: () => out.mock.calls.map((call) => String(call[0])).join(""),
    stderr: () => err.mock.calls.map((call) => String(call[0])).join("")
  };
}

describe("parseLmStudioArguments", () => {
  it("accepts explicit model selection, dry runs and loopback base URLs", () => {
    const plain = parseLmStudioArguments(["generate", "--model", "local-model-7b"]);
    const full = parseLmStudioArguments(["generate", "--dry-run", "--model", "qwen/qwen3-8b", "--base-url", "http://[::1]:1234/v1"]);
    const models = parseLmStudioArguments(["models"]);

    expect(plain.ok && plain.value).toMatchObject({ command: "generate", modelId: "local-model-7b", dryRun: false, endpoint: { baseUrl: "http://127.0.0.1:1234/v1" } });
    expect(full.ok && full.value).toMatchObject({ command: "generate", modelId: "qwen/qwen3-8b", dryRun: true, endpoint: { hostname: "::1" } });
    expect(models.ok && models.value.command).toBe("models");
  });

  it("requires an explicit model and never guesses one", () => {
    expect(parseLmStudioArguments(["generate"])).toEqual({ ok: false, problem: "missing-model" });
    expect(parseLmStudioArguments(["generate", "--dry-run"])).toEqual({ ok: false, problem: "missing-model" });
    expect(parseLmStudioArguments(["generate", "--model", "bad model"])).toEqual({ ok: false, problem: "invalid-model" });
  });

  it("rejects unknown, repeated or misplaced arguments and non-loopback base URLs", () => {
    for (const argv of [
      [],
      ["serve"],
      ["generate", "--model"],
      ["generate", "--model", "a", "--model", "b"],
      ["generate", "--model", "a", "--dry-run", "--dry-run"],
      ["generate", "--model", "a", "--temperature", "1"],
      ["models", "--model", "a"],
      ["models", "--dry-run"]
    ]) {
      expect(parseLmStudioArguments(argv)).toEqual({ ok: false, problem: "usage" });
    }

    expect(parseLmStudioArguments(["models", "--base-url", "http://localhost:1234/v1"])).toEqual({
      ok: false,
      problem: "invalid-base-url",
      code: "non-loopback-host"
    });
  });
});

describe("lm-studio demo command line", () => {
  it("fails safely without a model and shows the model-list command", async () => {
    const output = captureOutput();

    expect(await main(["generate", "--dry-run"])).toBe(2);
    expect(output.stderr()).toContain("never chooses a model automatically");
    expect(output.stderr()).toContain("npm run local:models");
    expect(output.stdout()).toBe("");
  });

  it("lists sanitized model identifiers without printing the raw server response", async () => {
    const { double } = await serve({ models: ["qwen2.5-7b-instruct", "google/gemma-3-12b"] });
    const output = captureOutput();

    expect(await main(["models", "--base-url", double.baseUrl])).toBe(0);
    expect(output.stdout()).toContain("Models reported by the local server (2):");
    expect(output.stdout()).toContain("  google/gemma-3-12b\n  qwen2.5-7b-instruct\n");
    expect(output.stdout()).not.toContain('"object"');
    expect(double.requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("reports a model listing failure with a stable code", async () => {
    const { double } = await serve({ scenario: "http-error" });
    const output = captureOutput();

    expect(await main(["models", "--base-url", double.baseUrl])).toBe(1);
    expect(output.stdout()).toContain("Model listing failed (http-status)");
    expect(output.stdout()).not.toContain("synthetic failure");
  });

  it("runs a model-driven dry run from the command line and writes nothing", async () => {
    const { double } = await serve();
    const before = tree(path.join(projectRoot, "architecture-diagrams"));
    const output = captureOutput();

    expect(await main(["generate", "--dry-run", "--model", "local-model-7b", "--base-url", double.baseUrl], { projectRoot })).toBe(0);
    expect(output.stdout()).toContain("Dry run: no directory or file was created.");
    expect(tree(path.join(projectRoot, "architecture-diagrams"))).toEqual(before);
    expect(double.completionRequests()).toHaveLength(1);
  });
});

describe("runLocalModelDemo", () => {
  it("executes the complete pipeline in a dry run and writes nothing", async () => {
    const { double, endpoint } = await serve();
    const root = outputRoot();
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: true });
    const lines = describeLocalModelResult("local-model-7b", outcome);

    expect(outcome.result.status).toBe("dry-run");
    expect(tree(root)).toEqual([]);
    expect(double.completionRequests()).toHaveLength(1);
    expect(lines).toContain("Generator: openai-compatible-local (model local-model-7b; loopback endpoint; one attempt; temperature 0; seed 42; structured output)");
    expect(lines.join("\n")).not.toMatch(/sequence-diagram planner|ARCHGROUND_|The Command Queue forwards|\{/);
  });

  it("writes a versioned pair whose report names the model generation without endpoint or prompt", async () => {
    const { endpoint } = await serve();
    const root = outputRoot();
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: false });

    if (outcome.result.status !== "written") {
      throw new Error(`Expected written artifacts, got ${outcome.result.status}.`);
    }

    const directory = path.join(root, ...spaceMissionDemoPaths.outputDirectory.split("/"));
    const diagram = readFileSync(path.join(directory, "telemetry-command-flow.puml"), "utf8");
    const reportText = readFileSync(path.join(directory, "telemetry-command-flow.grounding.json"), "utf8");
    const report = JSON.parse(reportText);

    expect(outcome.result.diagramPath).toBe(`${spaceMissionDemoPaths.outputDirectory}/telemetry-command-flow.puml`);
    expect(validatePlantUmlSubset(diagram).ok).toBe(true);
    expect(diagram).toContain("' generator: openai-compatible-local");
    expect(report.generatorType).toBe("openai-compatible-local");
    expect(report.modelGeneration).toEqual({ modelId: "local-model-7b", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true });
    expect(reportText).not.toMatch(/127\.0\.0\.1|chat\/completions|planner|ARCHGROUND_/);
    expect(String(endpoint.port).length).toBeGreaterThan(0);
    expect(reportText).not.toContain(`:${endpoint.port}`);
  });

  it("fails after one attempt without retry, repair or scripted fallback", async () => {
    const { double, endpoint } = await serve({ scenario: "schema-invalid" });
    const root = outputRoot();
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: false });
    const lines = describeLocalModelResult("local-model-7b", outcome);

    expect(outcome.result).toEqual({ status: "failed", stage: "invalid-generator-output", codes: ["schema-violation"] });
    expect(lines).toContain("Result: FAILED at invalid-generator-output");
    expect(lines).toContain("No retry, repair or fallback generator was used.");
    expect(lines.join("\n")).not.toContain("free text");
    expect(double.completionRequests()).toHaveLength(1);
    expect(tree(root)).toEqual([]);
  });

  it("names the stable generator failure code when the request itself fails", async () => {
    const { double, endpoint } = await serve({ scenario: "http-error" });
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: outputRoot(), endpoint, modelId: "local-model-7b", dryRun: true });

    expect(outcome).toEqual({ result: { status: "failed", stage: "invalid-generator-output", codes: ["generator-failed"] }, generatorFailure: "http-status" });
    expect(describeLocalModelResult("local-model-7b", outcome)).toContain("Generator failure: http-status");
    expect(double.completionRequests()).toHaveLength(1);
  });
});
