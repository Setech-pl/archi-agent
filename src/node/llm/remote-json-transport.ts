import { request as httpsRequest, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { apiKeyLimits, validateApiKey } from "../../core/llm/api-key.js";
import type { CancellationSignal } from "../../core/knowledge-pack/knowledge-pack-source.js";

export const remoteEndpointAllowlist = Object.freeze({
  "anthropic-models": Object.freeze({ host: "api.anthropic.com", method: "GET" as const, path: "/v1/models?limit=1000" }),
  "anthropic-messages": Object.freeze({ host: "api.anthropic.com", method: "POST" as const, path: "/v1/messages" }),
  "openai-models": Object.freeze({ host: "api.openai.com", method: "GET" as const, path: "/v1/models" }),
  "openai-chat-completions": Object.freeze({ host: "api.openai.com", method: "POST" as const, path: "/v1/chat/completions" }),
  "openrouter-models": Object.freeze({
    host: "openrouter.ai",
    method: "GET" as const,
    path: "/api/v1/models?supported_parameters=response_format&limit=1000"
  }),
  "openrouter-chat-completions": Object.freeze({ host: "openrouter.ai", method: "POST" as const, path: "/api/v1/chat/completions" })
});

export type RemoteEndpointId = keyof typeof remoteEndpointAllowlist;

export const remoteTransportLimits = Object.freeze({
  maxRequestBytes: 512 * 1024,
  maxGenerationResponseBytes: 1024 * 1024,
  maxModelsResponseBytes: 512 * 1024,
  maxListedModels: 1000,
  defaultTimeoutMs: 120_000,
  maxTimeoutMs: 600_000,
  maxCredentialChars: apiKeyLimits.maxChars
});

export type RemoteProviderErrorCode =
  | "credential-required"
  | "invalid-credential"
  | "unsafe-model-id"
  | "invalid-timeout"
  | "invalid-max-tokens"
  | "invalid-message-sequence"
  | "unsupported-json-schema"
  | "request-too-large"
  | "cancelled"
  | "timeout"
  | "connection-failed"
  | "redirect-rejected"
  | "authentication-failed"
  | "rate-limited"
  | "model-unavailable"
  | "request-rejected"
  | "provider-unavailable"
  | "unexpected-content-type"
  | "response-too-large"
  | "response-truncated"
  | "invalid-encoding"
  | "invalid-model-list"
  | "model-list-truncated"
  | "too-many-models"
  | "duplicate-model-id"
  | "unsafe-listed-model-id"
  | "response-refused"
  | "unexpected-content-block";

export class RemoteProviderError extends Error {
  public readonly code: string;

  public constructor(code: RemoteProviderErrorCode | string) {
    super(`The remote provider request failed (${code}).`);
    this.name = "RemoteProviderError";
    this.code = code;
  }
}

export function checkedRemoteTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? remoteTransportLimits.defaultTimeoutMs;

  if (!Number.isSafeInteger(value) || value < 1 || value > remoteTransportLimits.maxTimeoutMs) {
    throw new RemoteProviderError("invalid-timeout");
  }

  return value;
}

export function checkedApiKey(value: unknown): string {
  const result = validateApiKey(value);
  if (!result.ok) throw new RemoteProviderError(result.code);
  return result.value;
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

function statusError(status: number): RemoteProviderError {
  if (status === 401 || status === 403) return new RemoteProviderError("authentication-failed");
  if (status === 429) return new RemoteProviderError("rate-limited");
  if (status === 404) return new RemoteProviderError("model-unavailable");
  if (status === 408 || status === 504) return new RemoteProviderError("timeout");
  if (status >= 500) return new RemoteProviderError("provider-unavailable");
  return new RemoteProviderError("request-rejected");
}

export interface RemoteJsonRequest {
  readonly endpoint: RemoteEndpointId;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly signal?: CancellationSignal;
}

export interface RemoteJsonTransport {
  exchange(request: RemoteJsonRequest): Promise<string>;
}

/** Narrow test seam matching node:https.request; endpoint data still comes only from the allowlist. */
export type HttpsRequestPrimitive = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

/** HTTPS-only transport. Hosts, methods and paths can only come from the closed allowlist above. */
export class NodeHttpsJsonTransport implements RemoteJsonTransport {
  readonly #request: HttpsRequestPrimitive;

  public constructor(requestPrimitive: HttpsRequestPrimitive = httpsRequest) {
    this.#request = requestPrimitive;
  }

  public exchange(input: RemoteJsonRequest): Promise<string> {
    const endpoint = remoteEndpointAllowlist[input.endpoint];
    const body = input.body === undefined ? undefined : Buffer.from(input.body, "utf8");

    if (body !== undefined && body.length > remoteTransportLimits.maxRequestBytes) {
      return Promise.reject(new RemoteProviderError("request-too-large"));
    }

    return new Promise<string>((resolve, reject) => {
      if (input.signal?.aborted === true) {
        reject(new RemoteProviderError("cancelled"));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abortSource = eventSignal(input.signal);
      const headers: Record<string, string> = { Accept: "application/json", ...input.headers };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = String(body.length);
      }

      let outgoing: ClientRequest | undefined;
      const finish = (error: RemoteProviderError | undefined, text?: string): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        abortSource?.removeEventListener("abort", onAbort);
        if (error !== undefined) {
          outgoing?.destroy();
          reject(error);
        } else {
          resolve(text ?? "");
        }
      };
      const onAbort = (): void => finish(new RemoteProviderError("cancelled"));
      outgoing = this.#request(
        {
          protocol: "https:",
          hostname: endpoint.host,
          port: 443,
          method: endpoint.method,
          path: endpoint.path,
          headers,
          agent: false
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) return finish(new RemoteProviderError("redirect-rejected"));
          if (status < 200 || status >= 300) return finish(statusError(status));
          if (!/^application\/json(?:\s*;.*)?$/i.test(String(response.headers["content-type"] ?? ""))) {
            return finish(new RemoteProviderError("unexpected-content-type"));
          }

          const declared = Number(response.headers["content-length"]);
          if (Number.isFinite(declared) && declared > input.maxResponseBytes) return finish(new RemoteProviderError("response-too-large"));

          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > input.maxResponseBytes) return finish(new RemoteProviderError("response-too-large"));
            chunks.push(chunk);
          });
          response.on("aborted", () => finish(new RemoteProviderError("response-truncated")));
          response.on("error", () => finish(new RemoteProviderError("connection-failed")));
          response.on("end", () => {
            if (settled) return;
            if (!response.complete) return finish(new RemoteProviderError("response-truncated"));
            try {
              finish(undefined, new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
            } catch {
              finish(new RemoteProviderError("invalid-encoding"));
            }
          });
        }
      );

      outgoing.on("error", () => finish(new RemoteProviderError(input.signal?.aborted === true ? "cancelled" : "connection-failed")));
      abortSource?.addEventListener("abort", onAbort);
      timer = setTimeout(() => finish(new RemoteProviderError("timeout")), input.timeoutMs);
      outgoing.end(body);
    });
  }
}
