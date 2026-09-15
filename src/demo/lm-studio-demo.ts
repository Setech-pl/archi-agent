import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactFileSystem } from "../core/output/artifact-file-system.js";
import type {
  ModelGenerationMetadata,
  SequenceModelGenerationRequest,
  SequenceModelGenerator,
  UntrustedGeneratorOutput
} from "../core/pipeline/sequence-model-generator.js";
import { isSafeModelId } from "../core/pipeline/sequence-model-generator.js";
import { defaultLocalModelBaseUrl, parseLoopbackEndpoint, type LoopbackEndpoint, type LoopbackEndpointCode } from "../node/llm/loopback-endpoint.js";
import { listLocalModels, localGenerationSettings, OpenAiCompatibleLocalGenerator } from "../node/llm/openai-compatible-local-generator.js";
import { runSpaceMissionDemo, type SpaceMissionDemoResult } from "./space-mission-demo.js";

/**
 * Model-driven Space Mission demo for a local OpenAI-compatible structured-output server such as LM
 * Studio.
 *
 *   node dist/demo/lm-studio-demo.js models   [--base-url <loopback url>]
 *   node dist/demo/lm-studio-demo.js generate --model <id> [--dry-run] [--base-url <loopback url>]
 *
 * The model plans the diagram from the existing sample flow and its minimal grounded context; the
 * existing pipeline validates, renders and writes it. The model must be chosen explicitly; there is no
 * default model and no automatic choice. One model attempt, no retry, no repair and no fallback to the
 * scripted generator. The console shows metadata, counts and stable issue codes only, never the
 * prompt, the model response, the flow, the grounded context or the report.
 */

const listCommand = "npm run local:models";

export type LmStudioCommand =
  | { readonly command: "models"; readonly endpoint: LoopbackEndpoint }
  | { readonly command: "generate"; readonly endpoint: LoopbackEndpoint; readonly modelId: string; readonly dryRun: boolean };

export type LmStudioArgumentsResult =
  | { readonly ok: true; readonly value: LmStudioCommand }
  | { readonly ok: false; readonly problem: "usage" | "missing-model" | "invalid-model" | "invalid-base-url"; readonly code?: LoopbackEndpointCode };

export const lmStudioUsage = [
  "usage: node dist/demo/lm-studio-demo.js models [--base-url <url>]",
  "       node dist/demo/lm-studio-demo.js generate --model <model-id> [--dry-run] [--base-url <url>]",
  `The base URL must be a literal loopback URL; default ${defaultLocalModelBaseUrl}`
];

export function parseLmStudioArguments(argv: readonly string[]): LmStudioArgumentsResult {
  const command = argv[0];

  if (command !== "models" && command !== "generate") {
    return { ok: false, problem: "usage" };
  }

  let baseUrl: string | undefined;
  let modelId: string | undefined;
  let dryRun = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--base-url" && baseUrl === undefined && index + 1 < argv.length) {
      baseUrl = argv[index + 1];
      index += 1;
    } else if (command === "generate" && argument === "--model" && modelId === undefined && index + 1 < argv.length) {
      modelId = argv[index + 1];
      index += 1;
    } else if (command === "generate" && argument === "--dry-run" && !dryRun) {
      dryRun = true;
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

  if (modelId === undefined) {
    return { ok: false, problem: "missing-model" };
  }

  if (!isSafeModelId(modelId)) {
    return { ok: false, problem: "invalid-model" };
  }

  return { ok: true, value: { command, endpoint: endpoint.endpoint, modelId, dryRun } };
}

const failureCodePattern = /^[a-z][a-z0-9-]{0,63}$/;

/** Passes every call through unchanged and remembers only the stable code of a failure. */
class FailureRecordingGenerator implements SequenceModelGenerator {
  public readonly generatorType: string;
  public readonly generationMetadata: ModelGenerationMetadata;
  public failureCode: string | undefined;
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
}

export async function runLocalModelDemo(options: LocalModelDemoOptions): Promise<LocalModelDemoResult> {
  const generator = new FailureRecordingGenerator(
    new OpenAiCompatibleLocalGenerator({
      endpoint: options.endpoint,
      modelId: options.modelId,
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

  return Object.freeze({ result, ...(generator.failureCode === undefined ? {} : { generatorFailure: generator.failureCode }) });
}

/** Concise console summary: metadata, counts, paths and issue codes; never prompt, response or report. */
export function describeLocalModelResult(modelId: string, outcome: LocalModelDemoResult): readonly string[] {
  const lines = [
    "ArchGround model-driven demo - Space Mission telemetry command flow",
    `Generator: openai-compatible-local (model ${modelId}; loopback endpoint; one attempt; temperature ${localGenerationSettings.temperature}; ` +
      `seed ${localGenerationSettings.seed}; structured output)`
  ];
  const result = outcome.result;

  if (result.status === "failed") {
    return [
      ...lines,
      `Result: FAILED at ${result.stage}`,
      `Issue codes: ${result.codes.join(", ") || "none"}`,
      ...(outcome.generatorFailure === undefined ? [] : [`Generator failure: ${outcome.generatorFailure}`]),
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
      process.stderr.write(`No model selected. ArchGround never chooses a model automatically.\nList the models of the local server with: ${listCommand}\n`);
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
        [
          `Models reported by the local server (${models.length}):`,
          ...models.map((id) => `  ${id}`),
          'Select one explicitly, for example: npm run demo:llm:dry-run -- --model "<model-id>"'
        ].join("\n") + "\n"
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
