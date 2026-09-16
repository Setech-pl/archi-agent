import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { validatePlantUmlSubset } from "../../src/core/validation/plantuml-validator.js";
import type { RejectedGenerationOutcome } from "../../src/core/pipeline/generation-outcome.js";
import { createModelIssue, sortModelIssues } from "../../src/core/validation/model-validator.js";
import {
  describeLocalModelResult,
  formatRejectionDiagnostics,
  lmStudioUsage,
  main,
  npmDryRunExample,
  npmRunExample,
  parseLmStudioArguments,
  runLocalModelDemo
} from "../../src/demo/lm-studio-demo.js";
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
    expect(output.stdout()).toContain('Select one explicitly, for example: npm run demo:llm:dry-run -- "<model-id>"');
    expect(output.stdout()).not.toContain("--model");
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

describe("parseLmStudioArguments - npm positional model", () => {
  const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts as Record<string, string>;
  const cliPrefix = "node dist/demo/lm-studio-demo.js ";

  /** The arguments Node receives from an npm script, after npm or the shell removed the -- separator. */
  function npmArgv(commandLine: string): string[] {
    const tokens = (commandLine.match(/"[^"]*"|\S+/g) ?? []).map((token) => token.replace(/^"|"$/g, ""));
    const script = scripts[tokens[2] ?? ""] ?? "";
    const start = script.indexOf(cliPrefix);

    expect([tokens[0], tokens[1], start >= 0]).toEqual(["npm", "run", true]);
    return [
      ...script.slice(start + cliPrefix.length).split(" "),
      ...tokens.slice(3).filter((token) => token !== "--").map((token) => (token === "<model-id>" ? "qwen/qwen3-14b" : token))
    ];
  }

  it("accepts exactly one positional model identifier", () => {
    const dry = parseLmStudioArguments(["generate", "--dry-run", "qwen/qwen3-14b"]);
    const real = parseLmStudioArguments(["generate", "qwen3.6-27b-mtp"]);
    const direct = parseLmStudioArguments(["generate", "--model", "qwen3.6-27b-mtp", "--dry-run"]);

    expect(dry.ok && dry.value).toMatchObject({ command: "generate", modelId: "qwen/qwen3-14b", dryRun: true });
    expect(real.ok && real.value).toMatchObject({ command: "generate", modelId: "qwen3.6-27b-mtp", dryRun: false });
    expect(direct.ok && direct.value).toMatchObject({ command: "generate", modelId: "qwen3.6-27b-mtp", dryRun: true });
  });

  it("rejects a positional model together with --model and several positional models", () => {
    expect(parseLmStudioArguments(["generate", "model-a", "--model", "model-b"])).toEqual({ ok: false, problem: "multiple-models" });
    expect(parseLmStudioArguments(["generate", "--model", "model-a", "model-a"])).toEqual({ ok: false, problem: "multiple-models" });
    expect(parseLmStudioArguments(["generate", "model-a", "model-b", "--dry-run"])).toEqual({ ok: false, problem: "multiple-models" });
    expect(parseLmStudioArguments(["models", "model-a"])).toEqual({ ok: false, problem: "usage" });
  });

  it("rejects empty or unsafe positional values with the existing model-identifier policy", () => {
    for (const value of ["", "-model", "bad model", "../model", "a".repeat(129)]) {
      expect(parseLmStudioArguments(["generate", value])).toEqual({ ok: false, problem: "invalid-model" });
    }
  });

  it("keeps every documented npm command and the usage examples working", () => {
    const documented = [readFileSync(new URL("../../README.md", import.meta.url), "utf8"), readFileSync(new URL("../../docs/local-model.md", import.meta.url), "utf8")]
      .flatMap((text) => text.split("\n"))
      .map((line) => line.trim())
      .filter((line) => line.startsWith("npm run demo:llm"));

    expect(documented.length).toBeGreaterThanOrEqual(4);

    for (const commandLine of [...documented, npmDryRunExample, npmRunExample]) {
      const parsed = parseLmStudioArguments(npmArgv(commandLine));

      expect(commandLine).not.toContain("--model");
      expect(parsed.ok && parsed.value).toMatchObject({ command: "generate", modelId: "qwen/qwen3-14b", dryRun: commandLine.includes(":dry-run") });
    }

    expect(lmStudioUsage).toContain(`       ${npmDryRunExample}`);
    expect(parseLmStudioArguments(npmArgv("npm run local:models"))).toMatchObject({ ok: true, value: { command: "models" } });
  });

  it("shows the working positional syntax when the model is missing", async () => {
    const output = captureOutput();

    expect(await main(["generate"])).toBe(2);
    expect(output.stderr()).toContain(npmDryRunExample);
  });
});

describe("local model demo - diagnostics and response channel", () => {
  function variant(change: (model: Record<string, any>) => void): string {
    const model = JSON.parse(validContent) as Record<string, any>;
    change(model);
    return JSON.stringify(model);
  }

  function requestBetween(model: Record<string, any>, fromId: string, toId: string, interfaceType: string): Record<string, any> {
    const found = (model["messages"] as Record<string, any>[]).filter(
      (message) => message["from"]["elementId"] === fromId && message["to"]["elementId"] === toId && message["interfaceType"] === interfaceType && message["isResponse"] !== true
    );

    expect(found).toHaveLength(1);
    return found[0] as Record<string, any>;
  }

  const forbiddenInOutput = (root: string) => [root, projectRoot, "Console application", "ARCHGROUND_", "planner", "The Command Queue forwards"];

  it("identifies an interaction-mode mismatch and writes no file", async () => {
    const content = variant((model) => {
      requestBetween(model, "command-service", "command-queue", "EVENT")["async"] = false;
    });
    const { double, endpoint } = await serve({ completionContent: content });
    const root = outputRoot();
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: false });
    const lines = describeLocalModelResult("local-model-7b", outcome);

    expect(outcome.result).toEqual({ status: "failed", stage: "semantic-validation-failed", codes: ["interaction-mode-mismatch"] });
    expect(outcome.diagnostics).toEqual([
      "[interaction-mode-mismatch] message order 5, command-service -> command-queue, expected asynchronous, actual synchronous"
    ]);
    expect(lines).toContain("Diagnostics:");
    expect(lines).toContain("  [interaction-mode-mismatch] message order 5, command-service -> command-queue, expected asynchronous, actual synchronous");
    expect(tree(root)).toEqual([]);
    expect(double.completionRequests()).toHaveLength(1);

    for (const forbidden of forbiddenInOutput(root)) {
      expect(lines.join("\n")).not.toContain(forbidden);
    }
  });

  it("identifies an unused participant by model path and element identifier", async () => {
    const content = variant((model) => {
      const store = requestBetween(model, "telemetry-service", "telemetry-store", "DB");
      model["messages"] = (model["messages"] as unknown[]).filter((message) => message !== store);
    });
    const { endpoint } = await serve({ completionContent: content });
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: outputRoot(), endpoint, modelId: "local-model-7b", dryRun: true });

    expect(outcome.result).toMatchObject({ status: "failed", stage: "semantic-validation-failed", codes: ["unused-participant"] });
    expect(outcome.diagnostics).toEqual(["[unused-participant] participants.6, element telemetry-store"]);
  });

  it("reports schema violations by path and code without the rejected value", async () => {
    let index = -1;
    const content = variant((model) => {
      const request = requestBetween(model, "mission-control", "command-service", "REST API");
      request["label"] = 'Send "secret-label-4711"';
      index = (model["messages"] as unknown[]).indexOf(request);
    });
    const { endpoint } = await serve({ completionContent: content });
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: outputRoot(), endpoint, modelId: "local-model-7b", dryRun: true });
    const lines = describeLocalModelResult("local-model-7b", outcome).join("\n");

    expect(outcome.result).toMatchObject({ status: "failed", stage: "invalid-generator-output", codes: ["schema-violation"] });
    expect(outcome.diagnostics).toEqual([`[schema-violation] messages.${index}.label: text-forbidden-character`]);
    expect(lines).not.toContain("secret-label-4711");
  });

  it("orders diagnostics deterministically and bounds them with an omitted count", () => {
    const issues = Array.from({ length: 25 }, (_, position) => createModelIssue("unused-participant", { path: `participants.${position}`, details: { elementId: `element-${position}` } }));
    const shuffled: RejectedGenerationOutcome = { status: "semantic-validation-failed", issues: sortModelIssues([...issues].reverse()) };
    const ordered: RejectedGenerationOutcome = { status: "semantic-validation-failed", issues: sortModelIssues(issues) };
    const lines = formatRejectionDiagnostics(shuffled);

    expect(lines).toEqual(formatRejectionDiagnostics(ordered));
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe("[unused-participant] participants.0, element element-0");
    expect(lines[19]).toBe("[unused-participant] participants.19, element element-19");
    expect(lines[20]).toBe("... 5 more issues omitted");
    expect(formatRejectionDiagnostics(ordered, 24).at(-1)).toBe("... 1 more issue omitted");
    expect(formatRejectionDiagnostics(ordered, 25)).toHaveLength(25);
  });

  it("prints no diagnostics after a successful generation and reports the content channel", async () => {
    const { endpoint } = await serve();
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: outputRoot(), endpoint, modelId: "local-model-7b", dryRun: true });
    const lines = describeLocalModelResult("local-model-7b", outcome);

    expect(outcome.diagnostics).toBeUndefined();
    expect(outcome.responseSource).toBe("content");
    expect(lines).toContain("Response channel: content");
    expect(lines.join("\n")).not.toContain("Diagnostics");
  });

  it("reports the reasoning-content-compat channel and validates the candidate like content", async () => {
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat" });
    const root = outputRoot();
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: root, endpoint, modelId: "local-model-7b", dryRun: true });
    const lines = describeLocalModelResult("local-model-7b", outcome);

    expect(outcome.result.status).toBe("dry-run");
    expect(outcome.responseSource).toBe("reasoning-content-compat");
    expect(lines).toContain("Response channel: reasoning-content-compat (compatibility field; validated exactly like content)");
    expect(tree(root)).toEqual([]);
    expect(double.completionRequests()).toHaveLength(1);
  });

  it("reports a rejected reasoning_content candidate with its stable code only", async () => {
    const { endpoint } = await serve({ scenario: "reasoning-content-compat", reasoningContent: `Plan first private-reasoning-4711. ${validContent}` });
    const outcome = await runLocalModelDemo({ projectRoot, outputRoot: outputRoot(), endpoint, modelId: "local-model-7b", dryRun: true });
    const lines = describeLocalModelResult("local-model-7b", outcome).join("\n");

    expect(outcome).toEqual({
      result: { status: "failed", stage: "invalid-generator-output", codes: ["generator-failed"] },
      generatorFailure: "reasoning-content-not-a-json-object"
    });
    expect(lines).not.toContain("private-reasoning-4711");
  });
});
