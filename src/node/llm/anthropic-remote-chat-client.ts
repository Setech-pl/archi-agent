import { parseStrictJsonObject } from "../../core/llm/strict-json-response.js";
import {
  isSafeModelId,
  isValidStructuredChatMaxTokens,
  type ChatMessage,
  type ModelGenerationMetadata,
  type StructuredChatClient,
  type StructuredChatRequest,
  type StructuredChatResult
} from "../../core/llm/structured-chat-client.js";
import { stableCompare } from "../../core/util/ordering.js";
import { projectAnthropicJsonSchema } from "./anthropic-json-schema.js";
import {
  checkedApiKey,
  checkedRemoteTimeout,
  NodeHttpsJsonTransport,
  RemoteProviderError,
  remoteTransportLimits,
  type RemoteJsonTransport
} from "./remote-json-transport.js";

export const anthropicGeneratorType = "anthropic-remote";
const anthropicVersion = "2023-06-01";

function headers(apiKey: string): Readonly<Record<string, string>> {
  return Object.freeze({ "x-api-key": apiKey, "anthropic-version": anthropicVersion });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function anthropicMessages(messages: readonly ChatMessage[]): { readonly system: string; readonly messages: readonly object[] } {
  let systemCount = 0;
  while (messages[systemCount]?.role === "system") systemCount += 1;
  const remaining = messages.slice(systemCount);
  if (systemCount === 0 || remaining.length === 0 || remaining.some((message) => message.role === "system")) {
    throw new RemoteProviderError("invalid-message-sequence");
  }
  return Object.freeze({
    system: messages.slice(0, systemCount).map((message) => message.content).join("\n\n"),
    messages: Object.freeze(remaining.map((message) => Object.freeze({ role: message.role, content: message.content })))
  });
}

export function buildAnthropicRemoteRequest(request: StructuredChatRequest, modelId: string): Readonly<Record<string, unknown>> {
  const mapped = anthropicMessages(request.messages);
  return Object.freeze({
    model: modelId,
    system: mapped.system,
    messages: mapped.messages,
    max_tokens: request.maxTokens,
    stream: false,
    output_config: Object.freeze({
      format: Object.freeze({ type: "json_schema", schema: projectAnthropicJsonSchema(request.schema) })
    })
  });
}

function parseAnthropicResponse(text: string): Readonly<Record<string, unknown>> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new RemoteProviderError("invalid-envelope");
  }
  if (!isRecord(envelope) || !Array.isArray(envelope["content"])) throw new RemoteProviderError("invalid-envelope");
  const stopReason = envelope["stop_reason"];
  if (stopReason === "max_tokens") throw new RemoteProviderError("truncated-output");
  if (stopReason === "refusal") throw new RemoteProviderError("response-refused");
  if (stopReason !== "end_turn") throw new RemoteProviderError("unexpected-finish-reason");
  if (envelope["content"].length !== 1) throw new RemoteProviderError("unexpected-content-block");
  const block = envelope["content"][0];
  if (!isRecord(block) || block["type"] !== "text" || typeof block["text"] !== "string") {
    throw new RemoteProviderError("unexpected-content-block");
  }
  const parsed = parseStrictJsonObject(block["text"]);
  if (!parsed.ok) throw new RemoteProviderError(parsed.code);
  return parsed.value;
}

export interface AnthropicRemoteChatClientOptions {
  readonly modelId: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly transport?: RemoteJsonTransport;
}

export class AnthropicRemoteChatClient implements StructuredChatClient {
  public readonly clientType = anthropicGeneratorType;
  public readonly generationMetadata: ModelGenerationMetadata;
  readonly #modelId: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #transport: RemoteJsonTransport;

  public constructor(options: AnthropicRemoteChatClientOptions) {
    if (!isSafeModelId(options.modelId)) throw new RemoteProviderError("unsafe-model-id");
    this.#modelId = options.modelId;
    this.#apiKey = checkedApiKey(options.apiKey);
    this.#timeoutMs = checkedRemoteTimeout(options.timeoutMs);
    this.#transport = options.transport ?? new NodeHttpsJsonTransport();
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
    const body = JSON.stringify(buildAnthropicRemoteRequest(request, this.#modelId));
    if (Buffer.byteLength(body, "utf8") > remoteTransportLimits.maxRequestBytes) throw new RemoteProviderError("request-too-large");
    const text = await this.#transport.exchange({
      endpoint: "anthropic-messages",
      headers: headers(this.#apiKey),
      body,
      timeoutMs: this.#timeoutMs,
      maxResponseBytes: remoteTransportLimits.maxGenerationResponseBytes,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    return Object.freeze({ value: parseAnthropicResponse(text), source: "content" });
  }
}

export interface ListAnthropicRemoteModelsOptions {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly signal?: StructuredChatRequest["signal"];
  readonly transport?: RemoteJsonTransport;
}

export async function listAnthropicRemoteModels(options: ListAnthropicRemoteModelsOptions): Promise<readonly string[]> {
  const apiKey = checkedApiKey(options.apiKey);
  const transport = options.transport ?? new NodeHttpsJsonTransport();
  const text = await transport.exchange({
    endpoint: "anthropic-models",
    headers: headers(apiKey),
    timeoutMs: checkedRemoteTimeout(options.timeoutMs),
    maxResponseBytes: remoteTransportLimits.maxModelsResponseBytes,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new RemoteProviderError("invalid-model-list");
  }
  if (!isRecord(envelope) || !Array.isArray(envelope["data"]) || typeof envelope["has_more"] !== "boolean") {
    throw new RemoteProviderError("invalid-model-list");
  }
  if (envelope["has_more"]) throw new RemoteProviderError("model-list-truncated");
  if (envelope["data"].length > remoteTransportLimits.maxListedModels) throw new RemoteProviderError("too-many-models");
  const ids: string[] = [];
  for (const entry of envelope["data"]) {
    if (!isRecord(entry)) throw new RemoteProviderError("invalid-model-list");
    const capabilities = entry["capabilities"];
    if (!isRecord(capabilities)) continue;
    const structuredOutputs = capabilities["structured_outputs"];
    if (!isRecord(structuredOutputs) || structuredOutputs["supported"] !== true) continue;
    const id = entry["id"];
    if (!isSafeModelId(id)) throw new RemoteProviderError("unsafe-listed-model-id");
    ids.push(id);
  }
  if (new Set(ids).size !== ids.length) throw new RemoteProviderError("duplicate-model-id");
  return Object.freeze([...ids].sort(stableCompare));
}
