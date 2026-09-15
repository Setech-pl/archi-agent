import { request as httpRequest } from "node:http";
import type { CancellationSignal } from "../../core/knowledge-pack/knowledge-pack-source.js";
import { parseChatCompletion, parseStrictJsonObject } from "../../core/llm/strict-json-response.js";
import {
  isSafeModelId,
  type ModelGenerationMetadata,
  type SequenceModelGenerationRequest,
  type SequenceModelGenerator,
  type UntrustedGeneratorOutput
} from "../../core/pipeline/sequence-model-generator.js";
import { buildGeneratedModelJsonSchema, generatedModelJsonSchemaName } from "../../core/prompt/generated-model-json-schema.js";
import { buildSequenceGenerationPrompt, type SequenceGenerationPrompt } from "../../core/prompt/sequence-generation-prompt.js";
import { stableCompare } from "../../core/util/ordering.js";
import type { LoopbackEndpoint } from "./loopback-endpoint.js";

/**
 * Sequence-model generator for a local OpenAI-compatible structured-output endpoint (for example LM
 * Studio) reached only through a validated literal loopback endpoint.
 *
 * One attempt per generation: one POST to /v1/chat/completions with the provider-neutral prompt,
 * temperature 0, seed 42, stream false, a bounded max_tokens and a strict json_schema response format
 * derived from the Zod generated-model schema. n is left at its default of one (some local servers
 * reject the parameter) and the response parser refuses more than one choice. There is no retry, no
 * repair, no fallback generator and no Authorization header; redirects are refused, proxies are not
 * consulted (plain node:http to a literal address), request and response sizes are bounded, and the
 * request has a timeout and honours cancellation. The parsed JSON object is returned as untrusted data:
 * schema, grounding, relationship and rendering validation happen in the pipeline, not here. Errors
 * carry stable codes only, never prompt or response text.
 *
 * Response-field compatibility (local servers only): the answer is read from
 * choices[0].message.content. Some local servers return the structured answer in
 * message.reasoning_content and leave content empty. Only when content is exactly an empty string,
 * null or absent, and the envelope is otherwise valid (one choice, acceptable finish_reason), a
 * non-empty string reasoning_content is passed through the same strict one-object parser and marked
 * reasoning-content-compat. The two fields are never combined, non-empty content is never replaced,
 * and the reasoning text is never shown, logged or stored. This is a transport compatibility rule,
 * not a fallback generator, and it applies to this local adapter only.
 */

export const localGeneratorType = "openai-compatible-local";

export const localGenerationSettings = Object.freeze({
  temperature: 0,
  seed: 42,
  maxTokens: 16_384,
  attemptCount: 1
});

export const localTransportLimits = Object.freeze({
  maxRequestBytes: 512 * 1024,
  maxResponseBytes: 1024 * 1024,
  maxModelsResponseBytes: 256 * 1024,
  defaultTimeoutMs: 120_000,
  maxTimeoutMs: 600_000,
  maxListedModels: 200
});

export type LocalModelErrorCode =
  | "unsafe-model-id"
  | "invalid-timeout"
  | "request-too-large"
  | "cancelled"
  | "timeout"
  | "connection-failed"
  | "redirect-rejected"
  | "http-status"
  | "unexpected-content-type"
  | "response-too-large"
  | "invalid-encoding"
  | "invalid-model-list"
  | "too-many-models"
  | "duplicate-model-id"
  | "unsafe-listed-model-id";

export class LocalModelError extends Error {
  public readonly code: string;

  public constructor(code: LocalModelErrorCode | string) {
    super(`The local model request failed (${code}).`);
    this.name = "LocalModelError";
    this.code = code;
  }
}

interface TransportOptions {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly signal?: CancellationSignal;
}

interface EventSignal {
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

function eventSignal(signal: CancellationSignal | undefined): EventSignal | undefined {
  const candidate = signal as Partial<EventSignal> | undefined;
  return candidate !== undefined && typeof candidate.addEventListener === "function" && typeof candidate.removeEventListener === "function"
    ? (candidate as EventSignal)
    : undefined;
}

function checkedTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? localTransportLimits.defaultTimeoutMs;

  if (!Number.isSafeInteger(value) || value < 1 || value > localTransportLimits.maxTimeoutMs) {
    throw new LocalModelError("invalid-timeout");
  }

  return value;
}

/** One bounded HTTP exchange with the loopback endpoint; resolves with the decoded JSON body text. */
function exchange(
  endpoint: LoopbackEndpoint,
  method: "GET" | "POST",
  path: string,
  body: Buffer | undefined,
  options: TransportOptions
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (options.signal?.aborted === true) {
      reject(new LocalModelError("cancelled"));
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abortSource = eventSignal(options.signal);
    const headers: Record<string, string> = { Accept: "application/json" };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(body.length);
    }

    const onAbort = (): void => {
      finish(new LocalModelError("cancelled"));
    };

    const finish = (error: LocalModelError | undefined, text?: string): void => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer !== undefined) {
        clearTimeout(timer);
      }

      abortSource?.removeEventListener("abort", onAbort);

      if (error !== undefined) {
        outgoing.destroy();
        reject(error);
      } else {
        resolve(text ?? "");
      }
    };

    const outgoing = httpRequest(
      {
        host: endpoint.hostname,
        family: endpoint.hostname === "::1" ? 6 : 4,
        port: endpoint.port,
        method,
        path,
        headers,
        agent: false
      },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400) {
          finish(new LocalModelError("redirect-rejected"));
          return;
        }

        if (status < 200 || status >= 300) {
          finish(new LocalModelError("http-status"));
          return;
        }

        if (!/^application\/json(?:\s*;.*)?$/i.test(String(response.headers["content-type"] ?? ""))) {
          finish(new LocalModelError("unexpected-content-type"));
          return;
        }

        const declared = Number(response.headers["content-length"]);

        if (Number.isFinite(declared) && declared > options.maxResponseBytes) {
          finish(new LocalModelError("response-too-large"));
          return;
        }

        response.on("data", (chunk: Buffer) => {
          received += chunk.length;

          if (received > options.maxResponseBytes) {
            finish(new LocalModelError("response-too-large"));
            return;
          }

          chunks.push(chunk);
        });
        response.on("end", () => {
          if (settled) {
            return;
          }

          try {
            finish(undefined, new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
          } catch {
            finish(new LocalModelError("invalid-encoding"));
          }
        });
        response.on("error", () => finish(new LocalModelError("connection-failed")));
      }
    );

    outgoing.on("error", () => finish(new LocalModelError(options.signal?.aborted === true ? "cancelled" : "connection-failed")));
    abortSource?.addEventListener("abort", onAbort);
    timer = setTimeout(() => finish(new LocalModelError("timeout")), options.timeoutMs);
    outgoing.end(body);
  });
}

export type LocalResponseSource = "content" | "reasoning-content-compat";

export type LocalStructuredAnswer =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>>; readonly source: LocalResponseSource }
  | { readonly ok: false; readonly code: string };

function rejectAnswer(code: string): LocalStructuredAnswer {
  return Object.freeze({ ok: false, code });
}

/** choices[0].message of an envelope that the strict parser already accepted up to the content check. */
function firstMessage(body: string): Record<string, unknown> | undefined {
  try {
    const envelope = JSON.parse(body) as { choices?: unknown };
    const choice: unknown = Array.isArray(envelope.choices) ? envelope.choices[0] : undefined;
    const message = choice !== null && typeof choice === "object" ? (choice as Record<string, unknown>)["message"] : undefined;
    return message !== null && typeof message === "object" && !Array.isArray(message) ? (message as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Selects the structured answer of a local chat completion: content first, reasoning_content only
 * under the exact compatibility rule described above. Failures carry stable codes only; a rejected
 * reasoning_content candidate is reported as reasoning-content-<parser code>.
 */
export function selectLocalStructuredAnswer(body: string): LocalStructuredAnswer {
  const primary = parseChatCompletion(body);

  if (primary.ok) {
    return Object.freeze({ ok: true, value: primary.value, source: "content" });
  }

  if (primary.code !== "empty-content" && primary.code !== "missing-content") {
    return rejectAnswer(primary.code);
  }

  const message = firstMessage(body);
  const content = message?.["content"];
  const reasoning = message?.["reasoning_content"];
  const contentEmpty = message !== undefined && (content === undefined || content === null || content === "");

  if (!contentEmpty || typeof reasoning !== "string" || reasoning === "") {
    return rejectAnswer(primary.code);
  }

  const candidate = parseStrictJsonObject(reasoning);

  if (!candidate.ok) {
    return rejectAnswer(`reasoning-content-${candidate.code}`);
  }

  return Object.freeze({ ok: true, value: candidate.value, source: "reasoning-content-compat" });
}

/** The complete chat completion request body. Exported for inspection by tests. */
export function buildChatCompletionRequest(prompt: SequenceGenerationPrompt, modelId: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    model: modelId,
    messages: prompt.messages,
    temperature: localGenerationSettings.temperature,
    seed: localGenerationSettings.seed,
    stream: false,
    max_tokens: localGenerationSettings.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: generatedModelJsonSchemaName, strict: true, schema: buildGeneratedModelJsonSchema() }
    }
  });
}

export interface LocalModelGeneratorOptions {
  readonly endpoint: LoopbackEndpoint;
  /** Chosen explicitly by the caller; never selected automatically. */
  readonly modelId: string;
  readonly timeoutMs?: number;
  /** Called once per accepted answer with the response field it came from; never with its text. */
  readonly onResponseSource?: (source: LocalResponseSource) => void;
}

export class OpenAiCompatibleLocalGenerator implements SequenceModelGenerator {
  public readonly generatorType = localGeneratorType;
  public readonly generationMetadata: ModelGenerationMetadata;
  readonly #endpoint: LoopbackEndpoint;
  readonly #modelId: string;
  readonly #timeoutMs: number;
  readonly #onResponseSource: ((source: LocalResponseSource) => void) | undefined;

  public constructor(options: LocalModelGeneratorOptions) {
    if (!isSafeModelId(options.modelId)) {
      throw new LocalModelError("unsafe-model-id");
    }

    this.#endpoint = options.endpoint;
    this.#modelId = options.modelId;
    this.#timeoutMs = checkedTimeout(options.timeoutMs);
    this.#onResponseSource = options.onResponseSource;
    this.generationMetadata = Object.freeze({
      modelId: options.modelId,
      temperature: localGenerationSettings.temperature,
      seed: localGenerationSettings.seed,
      attemptCount: localGenerationSettings.attemptCount,
      structuredOutput: true
    });
  }

  public async generate(request: SequenceModelGenerationRequest): Promise<UntrustedGeneratorOutput> {
    if (request.signal?.aborted === true) {
      throw new LocalModelError("cancelled");
    }

    const prompt = buildSequenceGenerationPrompt({ flow: request.flow, context: request.context, digest: request.digest });
    const body = Buffer.from(JSON.stringify(buildChatCompletionRequest(prompt, this.#modelId)), "utf8");

    if (body.length > localTransportLimits.maxRequestBytes) {
      throw new LocalModelError("request-too-large");
    }

    const text = await exchange(this.#endpoint, "POST", this.#endpoint.chatCompletionsPath, body, {
      timeoutMs: this.#timeoutMs,
      maxResponseBytes: localTransportLimits.maxResponseBytes,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
    const selected = selectLocalStructuredAnswer(text);

    if (!selected.ok) {
      throw new LocalModelError(selected.code);
    }

    this.#onResponseSource?.(selected.source);
    return selected.value;
  }
}

export interface ListLocalModelsOptions {
  readonly timeoutMs?: number;
  readonly signal?: CancellationSignal;
}

/**
 * Lists the model identifiers reported by GET /v1/models, sorted, without choosing one. Uses no
 * model-management, download or load endpoint.
 */
export async function listLocalModels(endpoint: LoopbackEndpoint, options: ListLocalModelsOptions = {}): Promise<readonly string[]> {
  const text = await exchange(endpoint, "GET", endpoint.modelsPath, undefined, {
    timeoutMs: checkedTimeout(options.timeoutMs),
    maxResponseBytes: localTransportLimits.maxModelsResponseBytes,
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  let envelope: unknown;

  try {
    envelope = JSON.parse(text);
  } catch {
    throw new LocalModelError("invalid-model-list");
  }

  const data = envelope !== null && typeof envelope === "object" && !Array.isArray(envelope) ? (envelope as Record<string, unknown>)["data"] : undefined;

  if (!Array.isArray(data)) {
    throw new LocalModelError("invalid-model-list");
  }

  if (data.length > localTransportLimits.maxListedModels) {
    throw new LocalModelError("too-many-models");
  }

  const ids = data.map((entry: unknown) =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>)["id"] : undefined
  );

  if (!ids.every(isSafeModelId)) {
    throw new LocalModelError("unsafe-listed-model-id");
  }

  if (new Set(ids).size !== ids.length) {
    throw new LocalModelError("duplicate-model-id");
  }

  return Object.freeze([...ids].sort(stableCompare));
}
