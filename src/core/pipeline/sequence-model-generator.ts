import type { FlowDocument } from "../grounding/grounded-context-builder.js";
import type { ContextDigest, GroundedContext } from "../grounding/grounded-context.js";
import type { CancellationSignal } from "../knowledge-pack/knowledge-pack-source.js";

/**
 * Provider-neutral port for sequence-model generators.
 *
 * A generator receives the parsed flow document and the successful minimal grounded context (never
 * the whole Knowledge Pack) and returns untrusted data. The pipeline treats every result as unknown:
 * nothing from a generator is used before strict schema validation, normalization and the grounding,
 * relationship and interface-name stages. Adapters implement this port outside the core: the
 * deterministic scripted demo generator (an offline fixture) and the local OpenAI-compatible
 * structured-output adapter in src/node/llm. A generator must honour the cancellation signal and
 * should reject instead of returning partial data.
 */

export interface SequenceModelGenerationRequest {
  readonly flow: FlowDocument;
  readonly context: GroundedContext;
  readonly digest: ContextDigest;
  readonly signal?: CancellationSignal;
}

/** Output of a generator before validation. Deliberately unknown: it must be parsed, never trusted. */
export type UntrustedGeneratorOutput = unknown;

/**
 * Safe description of a model-backed generator, recorded in the grounding report. It carries no
 * endpoint, request body, prompt, response, header, timing or secret, so artifacts stay deterministic.
 */
export interface ModelGenerationMetadata {
  readonly modelId: string;
  readonly temperature: number;
  readonly seed: number;
  readonly attemptCount: number;
  readonly structuredOutput: boolean;
}

export interface SequenceModelGenerator {
  /** Short lower-case identifier written into artifact metadata, for example scripted-demo. */
  readonly generatorType: string;
  /** Present only for model-backed generators. */
  readonly generationMetadata?: ModelGenerationMetadata;
  generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput>;
}

export const modelIdLimits = Object.freeze({ maxChars: 128 });

const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]*$/;
const metadataKeys = "attemptCount,modelId,seed,structuredOutput,temperature";

/** A model identifier as reported by a local server: bounded printable ASCII, no spaces or parent segments. */
export function isSafeModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= modelIdLimits.maxChars &&
    modelIdPattern.test(value) &&
    !value.includes("..") &&
    !value.includes("//")
  );
}

export function isSafeModelGenerationMetadata(value: unknown): value is ModelGenerationMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const temperature = record["temperature"];
  const seed = record["seed"];
  const attemptCount = record["attemptCount"];

  return (
    Object.keys(record).sort().join(",") === metadataKeys &&
    isSafeModelId(record["modelId"]) &&
    typeof temperature === "number" &&
    Number.isFinite(temperature) &&
    temperature >= 0 &&
    temperature <= 2 &&
    typeof seed === "number" &&
    Number.isSafeInteger(seed) &&
    seed >= 0 &&
    typeof attemptCount === "number" &&
    Number.isSafeInteger(attemptCount) &&
    attemptCount >= 1 &&
    attemptCount <= 10 &&
    typeof record["structuredOutput"] === "boolean"
  );
}
