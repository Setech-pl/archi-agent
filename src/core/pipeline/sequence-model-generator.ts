import type { FlowDocument } from "../grounding/grounded-context-builder.js";
import type { ContextDigest, GroundedContext } from "../grounding/grounded-context.js";
import { throwIfCancelled, type CancellationSignal } from "../knowledge-pack/knowledge-pack-source.js";
import type {
  ModelGenerationMetadata,
  StructuredChatClient,
  StructuredChatResultSource
} from "../llm/structured-chat-client.js";
import { buildGeneratedModelJsonSchema, generatedModelJsonSchemaName } from "../prompt/generated-model-json-schema.js";
import { buildSequenceGenerationPrompt } from "../prompt/sequence-generation-prompt.js";
import type { RejectedGenerationOutcome } from "./generation-outcome.js";

export { isSafeModelGenerationMetadata, isSafeModelId, modelIdLimits } from "../llm/structured-chat-client.js";
export type { ModelGenerationMetadata } from "../llm/structured-chat-client.js";

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
export interface SequenceModelGenerator {
  /** Short lower-case identifier written into artifact metadata, for example scripted-demo. */
  readonly generatorType: string;
  /** Present only for model-backed generators. */
  readonly generationMetadata?: ModelGenerationMetadata;
  generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput>;
  /**
   * Optional in-memory observer, called once when the pipeline rejects the answer this generator
   * returned (schema, semantic or render stage). It receives only the safe outcome (codes, schema
   * paths, identifiers and counts, never answer text), cannot change the result and must not persist it.
   */
  observeRejection?(rejection: RejectedGenerationOutcome): void;
}

/**
 * Provider-neutral sequence generator backed by structured chat. The injected client is the only
 * test seam: provider configuration and transport stay outside the core.
 */
export class StructuredChatSequenceModelGenerator implements SequenceModelGenerator {
  public readonly generatorType: string;
  public readonly generationMetadata: ModelGenerationMetadata;
  readonly #client: StructuredChatClient;
  readonly #maxTokens: number;
  readonly #onResponseSource: ((source: StructuredChatResultSource) => void) | undefined;

  public constructor(
    client: StructuredChatClient,
    maxTokens: number,
    onResponseSource?: (source: StructuredChatResultSource) => void
  ) {
    this.#client = client;
    this.#maxTokens = maxTokens;
    this.#onResponseSource = onResponseSource;
    this.generatorType = client.clientType;
    this.generationMetadata = client.generationMetadata;
  }

  public async generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput> {
    throwIfCancelled(request.signal);

    const prompt = buildSequenceGenerationPrompt({ flow: request.flow, context: request.context, digest: request.digest });
    const result = await this.#client.complete({
      messages: prompt.messages,
      schemaName: generatedModelJsonSchemaName,
      schema: buildGeneratedModelJsonSchema(),
      maxTokens: this.#maxTokens,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });

    this.#onResponseSource?.(result.source);
    return result.value;
  }
}
