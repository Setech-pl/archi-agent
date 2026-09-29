import { parseChatCompletion } from "../../core/llm/strict-json-response.js";
import {
  isSafeModelId,
  isValidStructuredChatMaxTokens,
  type ModelGenerationMetadata,
  type StructuredChatClient,
  type StructuredChatRequest,
  type StructuredChatResult
} from "../../core/llm/structured-chat-client.js";
import { stableCompare } from "../../core/util/ordering.js";
import {
  checkedApiKey,
  checkedRemoteTimeout,
  NodeHttpsJsonTransport,
  RemoteProviderError,
  remoteTransportLimits,
  type RemoteEndpointId,
  type RemoteJsonTransport
} from "./remote-json-transport.js";

export type OpenAiCompatibleRemoteProvider = "openai" | "openrouter";

const providerConfiguration = Object.freeze({
  openai: Object.freeze({
    generatorType: "openai-remote",
    generationEndpoint: "openai-chat-completions" as const,
    modelsEndpoint: "openai-models" as const
  }),
  openrouter: Object.freeze({
    generatorType: "openrouter-remote",
    generationEndpoint: "openrouter-chat-completions" as const,
    modelsEndpoint: "openrouter-models" as const
  })
});

function bearerHeaders(apiKey: string): Readonly<Record<string, string>> {
  return Object.freeze({ Authorization: `Bearer ${apiKey}` });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRemoteEnvelope(text: string): void {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return;
  }
  if (!isRecord(envelope) || !Array.isArray(envelope["choices"]) || envelope["choices"].length !== 1) return;
  const choice = envelope["choices"][0];
  if (!isRecord(choice)) return;
  if (choice["finish_reason"] === "length") throw new RemoteProviderError("truncated-output");
  if (choice["finish_reason"] !== "stop") throw new RemoteProviderError("unexpected-finish-reason");
  if (!isRecord(choice["message"])) return;
  const message = choice["message"];
  if (message["refusal"] !== undefined && message["refusal"] !== null) throw new RemoteProviderError("response-refused");
  if (message["tool_calls"] !== undefined && message["tool_calls"] !== null) throw new RemoteProviderError("unexpected-content-block");
}

export function buildOpenAiRemoteRequest(request: StructuredChatRequest, modelId: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    model: modelId,
    messages: request.messages,
    stream: false,
    max_completion_tokens: request.maxTokens,
    response_format: Object.freeze({
      type: "json_schema",
      json_schema: Object.freeze({ name: request.schemaName, strict: true, schema: request.schema })
    })
  });
}

export function buildOpenRouterRemoteRequest(request: StructuredChatRequest, modelId: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    model: modelId,
    messages: request.messages,
    stream: false,
    max_tokens: request.maxTokens,
    response_format: Object.freeze({
      type: "json_schema",
      json_schema: Object.freeze({ name: request.schemaName, strict: true, schema: request.schema })
    }),
    provider: Object.freeze({ allow_fallbacks: false, require_parameters: true })
  });
}

export interface OpenAiCompatibleRemoteChatClientOptions {
  readonly provider: OpenAiCompatibleRemoteProvider;
  readonly modelId: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly transport?: RemoteJsonTransport;
}

export class OpenAiCompatibleRemoteChatClient implements StructuredChatClient {
  public readonly clientType: string;
  public readonly generationMetadata: ModelGenerationMetadata;
  readonly #provider: OpenAiCompatibleRemoteProvider;
  readonly #modelId: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #transport: RemoteJsonTransport;

  public constructor(options: OpenAiCompatibleRemoteChatClientOptions) {
    if (!isSafeModelId(options.modelId)) throw new RemoteProviderError("unsafe-model-id");
    this.#provider = options.provider;
    this.#modelId = options.modelId;
    this.#apiKey = checkedApiKey(options.apiKey);
    this.#timeoutMs = checkedRemoteTimeout(options.timeoutMs);
    this.#transport = options.transport ?? new NodeHttpsJsonTransport();
    this.clientType = providerConfiguration[options.provider].generatorType;
    this.generationMetadata = Object.freeze({
      modelId: options.modelId,
      temperature: null,
      seed: null,
      attemptCount: 1,
      structuredOutput: true
    });
  }

  public async complete(request: StructuredChatRequest): Promise<StructuredChatResult> {
    if (request.signal?.aborted === true) throw new RemoteProviderError("cancelled");
    if (!isValidStructuredChatMaxTokens(request.maxTokens)) throw new RemoteProviderError("invalid-max-tokens");

    const payload =
      this.#provider === "openai"
        ? buildOpenAiRemoteRequest(request, this.#modelId)
        : buildOpenRouterRemoteRequest(request, this.#modelId);
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body, "utf8") > remoteTransportLimits.maxRequestBytes) throw new RemoteProviderError("request-too-large");

    const text = await this.#transport.exchange({
      endpoint: providerConfiguration[this.#provider].generationEndpoint,
      headers: bearerHeaders(this.#apiKey),
      body,
      timeoutMs: this.#timeoutMs,
      maxResponseBytes: remoteTransportLimits.maxGenerationResponseBytes,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    validateRemoteEnvelope(text);
    const parsed = parseChatCompletion(text);
    if (!parsed.ok) throw new RemoteProviderError(parsed.code);
    return Object.freeze({ value: parsed.value, source: "content" });
  }
}

function parseModelList(text: string, provider: OpenAiCompatibleRemoteProvider): readonly string[] {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new RemoteProviderError("invalid-model-list");
  }
  if (!isRecord(envelope) || !Array.isArray(envelope["data"])) throw new RemoteProviderError("invalid-model-list");
  const data = envelope["data"];
  if (data.length > remoteTransportLimits.maxListedModels) throw new RemoteProviderError("too-many-models");

  const ids: string[] = [];
  for (const entry of data) {
    if (!isRecord(entry)) throw new RemoteProviderError("invalid-model-list");
    if (provider === "openrouter") {
      const supported = entry["supported_parameters"];
      if (!Array.isArray(supported) || !supported.every((value) => typeof value === "string")) {
        throw new RemoteProviderError("invalid-model-list");
      }
      if (!supported.includes("response_format")) continue;
    }
    const id = entry["id"];
    if (!isSafeModelId(id)) throw new RemoteProviderError("unsafe-listed-model-id");
    ids.push(id);
  }

  if (provider === "openrouter" && typeof envelope["total_count"] === "number" && envelope["total_count"] > data.length) {
    throw new RemoteProviderError("model-list-truncated");
  }
  if (provider === "openrouter" && data.length === remoteTransportLimits.maxListedModels) {
    throw new RemoteProviderError("model-list-truncated");
  }
  if (new Set(ids).size !== ids.length) throw new RemoteProviderError("duplicate-model-id");
  return Object.freeze(ids.sort(stableCompare));
}

export interface ListOpenAiCompatibleRemoteModelsOptions {
  readonly provider: OpenAiCompatibleRemoteProvider;
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly signal?: StructuredChatRequest["signal"];
  readonly transport?: RemoteJsonTransport;
}

export async function listOpenAiCompatibleRemoteModels(options: ListOpenAiCompatibleRemoteModelsOptions): Promise<readonly string[]> {
  const apiKey = checkedApiKey(options.apiKey);
  const transport = options.transport ?? new NodeHttpsJsonTransport();
  const endpoint: RemoteEndpointId = providerConfiguration[options.provider].modelsEndpoint;
  const text = await transport.exchange({
    endpoint,
    headers: bearerHeaders(apiKey),
    timeoutMs: checkedRemoteTimeout(options.timeoutMs),
    maxResponseBytes: remoteTransportLimits.maxModelsResponseBytes,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  return parseModelList(text, options.provider);
}
