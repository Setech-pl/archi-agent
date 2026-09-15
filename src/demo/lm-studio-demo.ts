import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactFileSystem } from "../core/output/artifact-file-system.js";
import type { RejectedGenerationOutcome } from "../core/pipeline/generation-outcome.js";
import {
  isSafeModelId,
  type ModelGenerationMetadata,
  type SequenceModelGenerationRequest,
  type SequenceModelGenerator,
  type UntrustedGeneratorOutput
} from "../core/pipeline/sequence-model-generator.js";
import { stableCompare } from "../core/util/ordering.js";
import type { ModelIssue } from "../core/validation/model-validator.js";
import { defaultLocalModelBaseUrl, parseLoopbackEndpoint, type LoopbackEndpoint, type LoopbackEndpointCode } from "../node/llm/loopback-endpoint.js";
import {
  listLocalModels,
  localGenerationSettings,
  OpenAiCompatibleLocalGenerator,
  type LocalResponseSource
} from "../node/llm/openai-compatible-local-generator.js";
import { runSpaceMissionDemo, type SpaceMissionDemoResult } from "./space-mission-demo.js";

/**
 * Model-driven Space Mission demo for a local OpenAI-compatible structured-output server such as LM
 * Studio.
 *
 *   node dist/demo/lm-studio-demo.js models   [--base-url <loopback url>]
 *   node dist/demo/lm-studio-demo.js generate <model-id> [--dry-run] [--base-url <loopback url>]
 *   node dist/demo/lm-studio-demo.js generate --model <model-id> [--dry-run] [--base-url <loopback url>]
 *
 * Through npm the model is passed as one positional argument (npm run demo:llm:dry-run -- "id"),
 * because npm treats --model as its own configuration option when the -- separator is removed by
 * the shell. The model plans the diagram from the existing sample flow and its minimal grounded
 * context; the existing pipeline validates, renders and writes it. The model must be chosen
 * explicitly; there is no default model and no automatic choice. One model attempt, no retry, no
 * repair and no fallback to the scripted generator. The console shows metadata, counts, stable issue
 * codes and bounded diagnostics built from safe issue details only, never the prompt, the model
 * response, the flow, the grounded context or the report.
 */

const listCommand = "npm run local:models";

export const npmDryRunExample = 'npm run demo:llm:dry-run -- "<model-id>"';
export const npmRunExample = 'npm run demo:llm -- "<model-id>"';

export type LmStudioCommand =
  | { readonly command: "models"; readonly endpoint: LoopbackEndpoint }
  | { readonly command: "generate"; readonly endpoint: LoopbackEndpoint; readonly modelId: string; readonly dryRun: boolean };

export type LmStudioArgumentsProblem = "usage" | "missing-model" | "multiple-models" | "invalid-model" | "invalid-base-url";

export type LmStudioArgumentsResult =
  | { readonly ok: true; readonly value: LmStudioCommand }
  | { readonly ok: false; readonly problem: LmStudioArgumentsProblem; readonly code?: LoopbackEndpointCode };

export const lmStudioUsage = [
  "usage: node dist/demo/lm-studio-demo.js models [--base-url <url>]",
  "       node dist/demo/lm-studio-demo.js generate (<model-id> | --model <model-id>) [--dry-run] [--base-url <url>]",
  `       ${npmDryRunExample}`,
  `       ${npmRunExample}`,
  `The base URL must be a literal loopback URL; default ${defaultLocalModelBaseUrl}`
];

export function parseLmStudioArguments(argv: readonly string[]): LmStudioArgumentsResult {
  const command = argv[0];

  if (command !== "models" && command !== "generate") {
    return { ok: false, problem: "usage" };
  }

  let baseUrl: string | undefined;
  let optionModel: string | undefined;
  const positional: string[] = [];
  let dryRun = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";

    if (argument === "--base-url" && baseUrl === undefined && index + 1 < argv.length) {
      baseUrl = argv[index + 1];
      index += 1;
    } else if (command === "generate" && argument === "--model" && optionModel === undefined && index + 1 < argv.length) {
      optionModel = argv[index + 1];
      index += 1;
    } else if (command === "generate" && argument === "--dry-run" && !dryRun) {
      dryRun = true;
    } else if (command === "generate" && !argument.startsWith("--")) {
      positional.push(argument);
    } else {
      return { ok: false, problem: "usage" };
    }
  }

  const endpoint = parseLoopbackEndpoint(baseUrl ?? defaultLocalModelBaseUrl);

  if (!endpoint.ok) {
    return { ok: false, problem: "invalid-base-url", code: endpoint.code };
  }

  if (command === "models") {
    return { ok: true, value: { command, endpoint: endpoint.endpoint } };
  }

  const candidates = optionModel === undefined ? positional : [...positional, optionModel];

  if (candidates.length === 0) {
    return { ok: false, problem: "missing-model" };
  }

  if (candidates.length > 1) {
    return { ok: false, problem: "multiple-models" };
  }

  const modelId = candidates[0];

  if (!isSafeModelId(modelId)) {
    return { ok: false, problem: "invalid-model" };
  }

  return { ok: true, value: { command, endpoint: endpoint.endpoint, modelId, dryRun } };
}

export const diagnosticLimits = Object.freeze({ maxEntries: 20 });

const printablePath = /^(?:\(root\)|[A-Za-z][A-Za-z0-9]*(?:\.(?:[A-Za-z][A-Za-z0-9]*|\d+))*)$/;
const printableCode = /^[A-Za-z0-9_-]{1,64}$/;
const describedDetailKeys = new Set(["order", "fromId", "toId", "elementId", "newName", "expected", "actual", "expectedKind", "problem"]);

/** One line per issue from its code, location and safe identifier details only. */
function describeIssue(issue: ModelIssue): string {
  const details = issue.details ?? {};
  const parts: string[] = [];
  const order = details["order"];

  if (typeof order === "number") {
    parts.push(`message order ${order}`);
  } else if (issue.path !== undefined) {
    parts.push(issue.path);
  }

  if (details["fromId"] !== undefined && details["toId"] !== undefined) {
    parts.push(`${details["fromId"]} -> ${details["toId"]}`);
  }

  const labelled: ReadonlyArray<readonly [string, string]> = [
    ["elementId", "element"],
    ["newName", "new participant"],
    ["expected", "expected"],
    ["actual", "actual"],
    ["expectedKind", "expected kind"],
    ["problem", "problem"]
  ];

  for (const [key, label] of labelled) {
    if (details[key] !== undefined) {
      parts.push(`${label} ${details[key]}`);
    }
  }

  for (const key of Object.keys(details).sort(stableCompare)) {
    if (!describedDetailKeys.has(key)) {
      parts.push(`${key} ${details[key]}`);
    }
  }

  return parts.length === 0 ? `[${issue.code}]` : `[${issue.code}] ${parts.join(", ")}`;
}

/**
 * Bounded diagnostic lines for a rejected answer, in the deterministic order of the pipeline.
 * Schema problems show their schema path and validation code, never the rejected value. Semantic
 * issues show the message order number (the model's own order field), relationship direction,
 * element identifiers and expected and actual enum values where the validator provides them.
 */
export function formatRejectionDiagnostics(rejection: RejectedGenerationOutcome, maxEntries: number = diagnosticLimits.maxEntries): readonly string[] {
  let entries: string[];

  if (rejection.status === "invalid-generator-output" && rejection.schemaProblems.length > 0) {
    entries = rejection.schemaProblems.map(
      (problem) =>
        `[schema-violation] ${printablePath.test(problem.path) && problem.path.length <= 128 ? problem.path : "(unprintable path)"}: ` +
        `${printableCode.test(problem.code) ? problem.code : "(unprintable code)"}`
    );
  } else if (rejection.status === "render-validation-failed" && rejection.structureIssues.length > 0) {
    entries = rejection.structureIssues.map((issue) => `[plantuml-structure] ${issue.line === undefined ? "document" : `line ${issue.line}`}: ${issue.rule}`);
  } else {
    entries = rejection.issues.map(describeIssue);
  }

  const shown = entries.slice(0, maxEntries);
  const omitted = entries.length - shown.length;
  return Object.freeze([...shown, ...(omitted > 0 ? [`... ${omitted} more issue${omitted === 1 ? "" : "s"} omitted`] : [])]);
}

const failureCodePattern = /^[a-z][a-z0-9-]{0,63}$/;

/** Passes every call through unchanged; remembers only a failure code and the safe rejection outcome. */
class RecordingGenerator implements SequenceModelGenerator {
  public readonly generatorType: string;
  public readonly generationMetadata: ModelGenerationMetadata;
  public failureCode: string | undefined;
  public rejection: RejectedGenerationOutcome | undefined;
  readonly #inner: OpenAiCompatibleLocalGenerator;

  public constructor(inner: OpenAiCompatibleLocalGenerator) {
    this.#inner = inner;
    this.generatorType = inner.generatorType;
    this.generationMetadata = inner.generationMetadata;
  }

  public async generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput> {
    try {
      return await this.#inner.generate(request);
    } catch (error) {
      const code = error !== null && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
      this.failureCode = typeof code === "string" && failureCodePattern.test(code) ? code : "generator-failed";
      throw error;
    }
  }

  public observeRejection(rejection: RejectedGenerationOutcome): void {
    this.rejection = rejection;
  }
}

export interface LocalModelDemoOptions {
  readonly projectRoot: string;
  readonly outputRoot?: string;
  readonly endpoint: LoopbackEndpoint;
  readonly modelId: string;
  readonly dryRun: boolean;
  readonly timeoutMs?: number;
  /** Test seam, as in the scripted demo. */
  readonly fileSystem?: ArtifactFileSystem;
}

export interface LocalModelDemoResult {
  readonly result: SpaceMissionDemoResult;
  /** Stable code of a generator failure, when the model request itself failed. */
  readonly generatorFailure?: string;
  /** Response field the accepted answer came from; never its text. */
  readonly responseSource?: LocalResponseSource;
  /** Bounded diagnostic lines when the pipeline rejected the answer. */
  readonly diagnostics?: readonly string[];
}

export async function runLocalModelDemo(options: LocalModelDemoOptions): Promise<LocalModelDemoResult> {
  const observed: { source?: LocalResponseSource } = {};
  const generator = new RecordingGenerator(
    new OpenAiCompatibleLocalGenerator({
      endpoint: options.endpoint,
      modelId: options.modelId,
      onResponseSource: (source) => {
        observed.source = source;
      },
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    })
  );
  const result = await runSpaceMissionDemo({
    projectRoot: options.projectRoot,
    dryRun: options.dryRun,
    generator,
    ...(options.outputRoot === undefined ? {} : { outputRoot: options.outputRoot }),
    ...(options.fileSystem === undefined ? {} : { fileSystem: options.fileSystem })
  });
  const diagnostics = result.status === "failed" && generator.rejection !== undefined ? formatRejectionDiagnostics(generator.rejection) : undefined;

  return Object.freeze({
    result,
    ...(generator.failureCode === undefined ? {} : { generatorFailure: generator.failureCode }),
    ...(observed.source === undefined ? {} : { responseSource: observed.source }),
    ...(diagnostics === undefined ? {} : { diagnostics })
  });
}

/** Concise console summary: metadata, counts, paths, issue codes and safe diagnostics only. */
export function describeLocalModelResult(modelId: string, outcome: LocalModelDemoResult): readonly string[] {
  const lines = [
    "ArchGround model-driven demo - Space Mission telemetry command flow",
    `Generator: openai-compatible-local (model ${modelId}; loopback endpoint; one attempt; temperature ${localGenerationSettings.temperature}; ` +
      `seed ${localGenerationSettings.seed}; structured output)`
  ];

  if (outcome.responseSource !== undefined) {
    lines.push(
      outcome.responseSource === "content"
        ? "Response channel: content"
        : "Response channel: reasoning-content-compat (compatibility field; validated exactly like content)"
    );
  }

  const result = outcome.result;

  if (result.status === "failed") {
    return [
      ...lines,
      `Result: FAILED at ${result.stage}`,
      `Issue codes: ${result.codes.join(", ") || "none"}`,
      ...(outcome.generatorFailure === undefined ? [] : [`Generator failure: ${outcome.generatorFailure}`]),
      ...(outcome.diagnostics === undefined || outcome.diagnostics.length === 0 ? [] : ["Diagnostics:", ...outcome.diagnostics.map((line) => `  ${line}`)]),
      "No retry, repair or fallback generator was used."
    ];
  }

  const summary = result.outcome.summary;
  lines.push(
    "Result: all validation stages passed",
    `Participants: ${summary.participantCount} (${summary.knownParticipantCount} grounded, ${summary.newParticipantCount} new)`,
    `Messages: ${summary.messageCount} (${summary.synchronousCount} synchronous, ${summary.asynchronousCount} asynchronous, ` +
      `${summary.responseCount} response; ${summary.selfMessageCount} self-message${summary.selfMessageCount === 1 ? "" : "s"})`,
    `Warnings: ${summary.warningCount}`,
    `Grounding digest: sha256:${result.outcome.digest.value}`
  );

  if (result.status === "dry-run") {
    return [...lines, "Dry run: no directory or file was created.", `Planned: ${result.plan.diagramPath}`, `Planned: ${result.plan.reportPath}`];
  }

  return [...lines, `Written: ${result.diagramPath}`, `Written: ${result.reportPath}`];
}

export interface LmStudioMainOptions {
  /** Test seam; defaults to the project containing the compiled demo. */
  readonly projectRoot?: string;
  readonly timeoutMs?: number;
}

export async function main(argv: readonly string[], options: LmStudioMainOptions = {}): Promise<number> {
  const parsed = parseLmStudioArguments(argv);

  if (!parsed.ok) {
    if (parsed.problem === "missing-model") {
      process.stderr.write(
        "No model selected. ArchGround never chooses a model automatically.\n" +
          `List the models of the local server with: ${listCommand}\n` +
          `Then run, for example: ${npmDryRunExample}\n`
      );
    } else if (parsed.problem === "multiple-models") {
      process.stderr.write("Name exactly one model, either as one positional argument or with --model.\n");
    } else if (parsed.problem === "invalid-model") {
      process.stderr.write("The model identifier is not a safe model identifier.\n");
    } else if (parsed.problem === "invalid-base-url") {
      process.stderr.write(`The base URL was rejected (${parsed.code ?? "invalid-url"}). Only literal loopback URLs are allowed.\n`);
    } else {
      process.stderr.write(`${lmStudioUsage.join("\n")}\n`);
    }

    return 2;
  }

  const timeout = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };

  if (parsed.value.command === "models") {
    try {
      const models = await listLocalModels(parsed.value.endpoint, timeout);
      process.stdout.write(
        [`Models reported by the local server (${models.length}):`, ...models.map((id) => `  ${id}`), `Select one explicitly, for example: ${npmDryRunExample}`].join(
          "\n"
        ) + "\n"
      );
      return 0;
    } catch (error) {
      const code = error !== null && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "failed";
      process.stdout.write(`Model listing failed (${failureCodePattern.test(code) ? code : "failed"}). Is the local server running?\n`);
      return 1;
    }
  }

  const projectRoot = options.projectRoot ?? fileURLToPath(new URL("../../", import.meta.url));
  const outcome = await runLocalModelDemo({
    projectRoot,
    endpoint: parsed.value.endpoint,
    modelId: parsed.value.modelId,
    dryRun: parsed.value.dryRun,
    ...timeout
  });
  process.stdout.write(`${describeLocalModelResult(parsed.value.modelId, outcome).join("\n")}\n`);
  return outcome.result.status === "failed" ? 1 : 0;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  const normalize = (value: string): string => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };

  return normalize(fileURLToPath(import.meta.url)) === normalize(entry);
}

if (invokedDirectly()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.stderr.write("ArchGround model-driven demo failed unexpectedly.\n");
      process.exitCode = 1;
    }
  );
}
