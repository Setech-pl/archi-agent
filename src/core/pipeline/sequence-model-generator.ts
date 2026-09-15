import type { FlowDocument } from "../grounding/grounded-context-builder.js";
import type { ContextDigest, GroundedContext } from "../grounding/grounded-context.js";
import type { CancellationSignal } from "../knowledge-pack/knowledge-pack-source.js";

/**
 * Provider-neutral port for sequence-model generators.
 *
 * A generator receives the parsed flow document and the successful minimal grounded context (never
 * the whole Knowledge Pack) and returns untrusted data. The pipeline treats every result as unknown:
 * nothing from a generator is used before strict schema validation, normalization and the grounding,
 * relationship and interface-name stages. The same port is intended for later adapters such as
 * hosted model APIs, editor-provided models or local compatible endpoints; none is implemented here.
 * A generator must honour the cancellation signal and should reject instead of returning partial data.
 */

export interface SequenceModelGenerationRequest {
  readonly flow: FlowDocument;
  readonly context: GroundedContext;
  readonly digest: ContextDigest;
  readonly signal?: CancellationSignal;
}

/** Output of a generator before validation. Deliberately unknown: it must be parsed, never trusted. */
export type UntrustedGeneratorOutput = unknown;

export interface SequenceModelGenerator {
  /** Short lower-case identifier written into artifact metadata, for example scripted-demo. */
  readonly generatorType: string;
  generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput>;
}
