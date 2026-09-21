import { describe, expect, it } from "vitest";
import {
  checkedApiKey,
  checkedRemoteTimeout,
  NodeHttpsJsonTransport,
  remoteEndpointAllowlist,
  remoteTransportLimits,
  type RemoteEndpointId,
  type RemoteJsonRequest
} from "../../../src/node/llm/remote-json-transport.js";
import { OpenAiCompatibleRemoteChatClient } from "../../../src/node/llm/openai-compatible-remote-chat-client.js";
import { HttpsRequestPrimitiveDouble } from "../../doubles/https-request-primitive-double.js";

const secret = "SYNTHETIC_TRANSPORT_CREDENTIAL";

function exchange(double: HttpsRequestPrimitiveDouble, overrides: Partial<RemoteJsonRequest> = {}): Promise<string> {
  return new NodeHttpsJsonTransport(double.request).exchange({
    endpoint: "openai-chat-completions",
    headers: { Authorization: `Bearer ${secret}` },
    body: '{"value":"zażółć"}',
    timeoutMs: 1000,
    maxResponseBytes: 1024,
    ...overrides
  });
}

describe("remote HTTPS allowlist", () => {
  it("contains only the six fixed HTTPS host/path/method combinations", () => {
    expect(remoteEndpointAllowlist).toEqual({
      "anthropic-models": { host: "api.anthropic.com", method: "GET", path: "/v1/models?limit=1000" },
      "anthropic-messages": { host: "api.anthropic.com", method: "POST", path: "/v1/messages" },
      "openai-models": { host: "api.openai.com", method: "GET", path: "/v1/models" },
      "openai-chat-completions": { host: "api.openai.com", method: "POST", path: "/v1/chat/completions" },
      "openrouter-models": {
        host: "openrouter.ai",
        method: "GET",
        path: "/api/v1/models?supported_parameters=response_format&limit=1000"
      },
      "openrouter-chat-completions": { host: "openrouter.ai", method: "POST", path: "/api/v1/chat/completions" }
    });
    expect(JSON.stringify(remoteEndpointAllowlist)).not.toContain("http:");
    expect(JSON.stringify(remoteEndpointAllowlist)).not.toContain("@");
  });

  it.each([
    ["a", true],
    ["x".repeat(1024), true],
    ["", false],
    ["x".repeat(1025), false],
    [" padded", false],
    ["padded ", false],
    ["ordinary internal space", true],
    ["   ", false],
    [`secret${String.fromCharCode(0)}inside`, false],
    [`secret${String.fromCharCode(9)}inside`, false],
    [`secret${String.fromCharCode(10)}inside`, false],
    [`secret${String.fromCharCode(13)}inside`, false],
    [`secret${String.fromCharCode(127)}inside`, false],
    [`secret${String.fromCharCode(129)}inside`, false]
  ])("applies the shared API-key boundary", (value, valid) => {
    if (valid) {
      expect(checkedApiKey(value)).toBe(value);
      return;
    }
    let caught: unknown;
    try {
      checkedApiKey(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: value === "" || value.trim() === "" ? "credential-required" : "invalid-credential" });
    expect(String(caught)).not.toContain(value === "" ? "unreachable-marker" : value);
  });

  it("enforces the one-request timeout range", () => {
    expect(checkedRemoteTimeout(undefined)).toBe(120_000);
    expect(() => checkedRemoteTimeout(0)).toThrowError(expect.objectContaining({ code: "invalid-timeout" }));
    expect(() => checkedRemoteTimeout(600_001)).toThrowError(expect.objectContaining({ code: "invalid-timeout" }));
  });
});

describe("NodeHttpsJsonTransport", () => {
  it.each(Object.keys(remoteEndpointAllowlist) as RemoteEndpointId[])("uses the closed wire target for %s", async (endpointId) => {
    const double = new HttpsRequestPrimitiveDouble({ chunks: [Buffer.from('{"ok":true}')] });
    const endpoint = remoteEndpointAllowlist[endpointId];
    const body = endpoint.method === "POST" ? '{"text":"zażółć"}' : undefined;
    const providerHeaders: Readonly<Record<string, string>> =
      endpoint.host === "api.anthropic.com"
        ? { "x-api-key": secret, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${secret}` };
    await expect(
      exchange(double, { endpoint: endpointId, headers: providerHeaders, ...(body === undefined ? { body: undefined } : { body }) })
    ).resolves.toBe('{"ok":true}');

    expect(double.calls).toHaveLength(1);
    expect(double.calls[0]?.options).toEqual({
      protocol: "https:",
      hostname: endpoint.host,
      port: 443,
      method: endpoint.method,
      path: endpoint.path,
      headers: {
        Accept: "application/json",
        ...providerHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body, "utf8")) })
      },
      agent: false
    });
    expect(double.calls[0]?.body).toEqual(body === undefined ? undefined : Buffer.from(body, "utf8"));
  });

  it("destroys the active request on timeout", async () => {
    const double = new HttpsRequestPrimitiveDouble({ noResponse: true });
    await expect(exchange(double, { timeoutMs: 5 })).rejects.toMatchObject({ code: "timeout" });
    expect(double.calls).toHaveLength(1);
    expect(double.calls[0]?.request.destroyedByClient).toBe(true);
  });

  it("does not create a request when already cancelled", async () => {
    const double = new HttpsRequestPrimitiveDouble();
    await expect(exchange(double, { signal: { aborted: true } })).rejects.toMatchObject({ code: "cancelled" });
    expect(double.calls).toEqual([]);
  });

  it("destroys an active request when cancelled", async () => {
    const double = new HttpsRequestPrimitiveDouble({ noResponse: true });
    const controller = new AbortController();
    const pending = exchange(double, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(double.calls).toHaveLength(1);
    expect(double.calls[0]?.request.destroyedByClient).toBe(true);
  });

  it.each([
    [301, "redirect-rejected"],
    [401, "authentication-failed"],
    [403, "authentication-failed"],
    [404, "model-unavailable"],
    [408, "timeout"],
    [429, "rate-limited"],
    [500, "provider-unavailable"],
    [599, "provider-unavailable"]
  ])("maps HTTP %i to %s without retry or credential leakage", async (statusCode, code) => {
    const double = new HttpsRequestPrimitiveDouble({ statusCode });
    let caught: unknown;
    try {
      await exchange(double);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code });
    expect(String(caught)).not.toContain(secret);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(double.calls).toHaveLength(1);
  });

  it.each(["ENOTFOUND", "ECONNRESET", "CERT_HAS_EXPIRED"])("maps %s to a safe connection error without retry", async (requestError) => {
    const double = new HttpsRequestPrimitiveDouble({ requestError });
    await expect(exchange(double)).rejects.toMatchObject({ code: "connection-failed" });
    expect(double.calls).toHaveLength(1);
  });

  it("rejects a non-JSON content type", async () => {
    const double = new HttpsRequestPrimitiveDouble({ headers: { "content-type": "text/plain" } });
    await expect(exchange(double)).rejects.toMatchObject({ code: "unexpected-content-type" });
  });

  it("rejects malformed UTF-8", async () => {
    const double = new HttpsRequestPrimitiveDouble({ chunks: [Buffer.from([0xc3, 0x28])] });
    await expect(exchange(double)).rejects.toMatchObject({ code: "invalid-encoding" });
  });

  it("carries malformed JSON through the production transport to the strict provider parser", async () => {
    const double = new HttpsRequestPrimitiveDouble({ chunks: [Buffer.from("{")] });
    const client = new OpenAiCompatibleRemoteChatClient({
      provider: "openai",
      modelId: "gpt-test",
      apiKey: secret,
      transport: new NodeHttpsJsonTransport(double.request)
    });
    await expect(
      client.complete({
        messages: [{ role: "system", content: "system" }, { role: "user", content: "user" }],
        schemaName: "answer",
        schema: { type: "object", additionalProperties: false },
        maxTokens: 1
      })
    ).rejects.toMatchObject({ code: "invalid-envelope" });
    expect(double.calls).toHaveLength(1);
  });

  it.each([
    [{ aborted: true }, "response-truncated"],
    [{ complete: false }, "response-truncated"],
    [{ responseError: true }, "connection-failed"]
  ])("rejects truncated or failed responses", async (plan, code) => {
    const double = new HttpsRequestPrimitiveDouble(plan);
    await expect(exchange(double)).rejects.toMatchObject({ code });
  });

  it("accepts a response exactly at the limit and rejects one byte over", async () => {
    const exact = Buffer.alloc(32, 0x20);
    const accepted = new HttpsRequestPrimitiveDouble({ headers: { "content-type": "application/json", "content-length": "32" }, chunks: [exact] });
    await expect(exchange(accepted, { maxResponseBytes: 32 })).resolves.toBe(exact.toString("utf8"));

    const rejected = new HttpsRequestPrimitiveDouble({ chunks: [Buffer.alloc(33, 0x20)] });
    await expect(exchange(rejected, { maxResponseBytes: 32 })).rejects.toMatchObject({ code: "response-too-large" });

    const declaredOver = new HttpsRequestPrimitiveDouble({
      headers: { "content-type": "application/json", "content-length": "33" },
      chunks: [Buffer.alloc(1)]
    });
    await expect(exchange(declaredOver, { maxResponseBytes: 32 })).rejects.toMatchObject({ code: "response-too-large" });
  });

  it("accepts a request exactly at the byte limit and rejects one byte over before the primitive", async () => {
    const accepted = new HttpsRequestPrimitiveDouble();
    await expect(exchange(accepted, { body: "x".repeat(remoteTransportLimits.maxRequestBytes) })).resolves.toBe("{}");
    expect(accepted.calls[0]?.options.headers).toMatchObject({ "Content-Length": String(remoteTransportLimits.maxRequestBytes) });

    const rejected = new HttpsRequestPrimitiveDouble();
    await expect(exchange(rejected, { body: "x".repeat(remoteTransportLimits.maxRequestBytes + 1) })).rejects.toMatchObject({ code: "request-too-large" });
    expect(rejected.calls).toEqual([]);
  });
});
