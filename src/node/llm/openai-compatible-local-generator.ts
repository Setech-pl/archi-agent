import type { StructuredChatResultSource } from "../../core/llm/structured-chat-client.js";
import {
  StructuredChatSequenceModelGenerator,
  type SequenceModelGenerationRequest,
  type UntrustedGeneratorOutput
} from "../../core/pipeline/sequence-model-generator.js";
import type { LoopbackEndpoint } from "./loopback-endpoint.js";
import { localGenerationSettings, LocalModelError, OpenAiCompatibleLocalChatClient } from "./openai-compatible-local-chat-client.js";

export {
  buildChatCompletionRequest,
  listLocalModels,
  localGenerationSettings,
  localGeneratorType,
  localTransportLimits,
  LocalModelError,
  OpenAiCompatibleLocalChatClient,
  selectLocalStructuredAnswer
} from "./openai-compatible-local-chat-client.js";
export type {
  ListLocalModelsOptions,
  LocalChatClientOptions,
  LocalModelErrorCode,
  LocalResponseSource,
  LocalStructuredAnswer
} from "./openai-compatible-local-chat-client.js";

export interface LocalModelGeneratorOptions {
  readonly endpoint: LoopbackEndpoint;
  /** Chosen explicitly by the caller; never selected automatically. */
  readonly modelId: string;
  readonly timeoutMs?: number;
  /** Called once per accepted answer with the response field it came from; never with its text. */
  readonly onResponseSource?: (source: StructuredChatResultSource) => void;
}

/** Compatibility facade: the sequence prompt/schema over the neutral structured-chat client. */
export class OpenAiCompatibleLocalGenerator extends StructuredChatSequenceModelGenerator {
  public constructor(options: LocalModelGeneratorOptions) {
    super(
      new OpenAiCompatibleLocalChatClient({
        endpoint: options.endpoint,
        modelId: options.modelId,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
      }),
      localGenerationSettings.maxTokens,
      options.onResponseSource
    );
  }

  public override async generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput> {
    if (request.signal?.aborted === true) {
      throw new LocalModelError("cancelled");
    }

    return super.generate(request);
  }
}
