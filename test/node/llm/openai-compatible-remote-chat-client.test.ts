import { describe, expect, it } from "vitest";
import type { StructuredChatRequest } from "../../../src/core/llm/structured-chat-client.js";
import {
  buildOpenAiRemoteRequest,
  buildOpenRouterRemoteRequest,
  listOpenAiCompatibleRemoteModels,
  OpenAiCompatibleRemoteChatClient
} from "../../../src/node/llm/openai-compatible-remote-chat-client.js";
import { RemoteProviderError, remoteEndpointAllowlist } from "../../../src/node/llm/remote-json-transport.js";
import { RemoteJsonTransportDouble } from "../../doubles/remote-json-transport-double.js";

const request: StructuredChatRequest = {
  messages: [
    { role: "system", content: "system" },
    { role: "user", content: "user" }
  ],
  schemaName: "answer_v1",
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  maxTokens: 321
};

const completion = JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}', refusal: null } }] });

describe("OpenAI-compatible remote clients", () => {
  it("uses max_completion_tokens for OpenAI and reports truthful metadata", async () => {
    const transport = new RemoteJsonTransportDouble(completion);
    const client = new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-4.1", apiKey: "secret-openai", transport });
    await expect(client.complete(request)).resolves.toMatchObject({ value: { ok: true }, source: "content" });
    expect(client.generationMetadata).toEqual({ modelId: "gpt-4.1", temperature: null, seed: null, attemptCount: 1, structuredOutput: true });
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.endpoint).toBe("openai-chat-completions");
    expect(transport.requests[0]?.headers).toEqual({ Authorization: "Bearer secret-openai" });
    expect(JSON.parse(transport.requests[0]?.body ?? "")).toEqual(buildOpenAiRemoteRequest(request, "gpt-4.1"));
    expect(JSON.parse(transport.requests[0]?.body ?? "")).toMatchObject({ max_completion_tokens: 321, stream: false });
  });

  it("disables OpenRouter fallback, requires parameters, sends no models field and performs one POST", async () => {
    const transport = new RemoteJsonTransportDouble(completion);
    const client = new OpenAiCompatibleRemoteChatClient({ provider: "openrouter", modelId: "anthropic/claude-sonnet-4.5", apiKey: "secret-router", transport });
    await client.complete(request);
    const body = JSON.parse(transport.requests[0]?.body ?? "") as Record<string, unknown>;
    expect(body).toEqual(buildOpenRouterRemoteRequest(request, "anthropic/claude-sonnet-4.5"));
    expect(body).toMatchObject({ max_tokens: 321, provider: { allow_fallbacks: false, require_parameters: true } });
    expect(body).not.toHaveProperty("models");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("seed");
    expect(transport.requests).toHaveLength(1);
  });

  it("uses the fixed OpenRouter listing query and filters defensively by response_format", async () => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({
        data: [
          { id: "z/model", supported_parameters: ["response_format", "tools"] },
          { id: "a/model", supported_parameters: ["tools"] }
        ],
        total_count: 2
      })
    );
    await expect(listOpenAiCompatibleRemoteModels({ provider: "openrouter", apiKey: "router-key", transport })).resolves.toEqual(["z/model"]);
    expect(transport.requests[0]?.endpoint).toBe("openrouter-models");
    expect(remoteEndpointAllowlist["openrouter-models"].path).toBe("/api/v1/models?supported_parameters=response_format&limit=1000");
  });

  it.each([
    [JSON.stringify({ data: [{ id: "x/model" }] }), "invalid-model-list"],
    [JSON.stringify({ data: [{ id: "x/model", supported_parameters: ["response_format"] }], total_count: 2 }), "model-list-truncated"]
  ])("fails closed for an invalid or truncated OpenRouter list", async (body, code) => {
    const transport = new RemoteJsonTransportDouble(body);
    await expect(listOpenAiCompatibleRemoteModels({ provider: "openrouter", apiKey: "router-key", transport })).rejects.toMatchObject({ code });
  });

  it("rejects refusals and does not retry", async () => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "no" } }] })
    );
    const client = new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-4.1", apiKey: "secret", transport });
    await expect(client.complete(request)).rejects.toMatchObject<Partial<RemoteProviderError>>({ code: "response-refused" });
    expect(transport.requests).toHaveLength(1);
  });

  it.each(["openai", "openrouter"] as const)("requires finish_reason=stop for every %s response", async (provider) => {
    const cases = [
      { label: "undefined", body: JSON.stringify({ choices: [{ finish_reason: undefined, message: { content: '{"ok":true}' } }] }), code: "unexpected-finish-reason" },
      { label: "null", body: JSON.stringify({ choices: [{ finish_reason: null, message: { content: '{"ok":true}' } }] }), code: "unexpected-finish-reason" },
      { label: "missing", body: JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), code: "unexpected-finish-reason" },
      { label: "length", body: JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"ok":true}' } }] }), code: "truncated-output" },
      { label: "content_filter", body: JSON.stringify({ choices: [{ finish_reason: "content_filter", message: { content: '{"ok":true}' } }] }), code: "unexpected-finish-reason" },
      { label: "tool_calls", body: JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { content: '{"ok":true}', tool_calls: [] } }] }), code: "unexpected-finish-reason" }
    ];
    for (const entry of cases) {
      const transport = new RemoteJsonTransportDouble(entry.body);
      const client = new OpenAiCompatibleRemoteChatClient({ provider, modelId: "model-test", apiKey: "secret", transport });
      await expect(client.complete(request), entry.label).rejects.toMatchObject({ code: entry.code });
      expect(transport.requests).toHaveLength(1);
    }
  });

  it.each(["openai", "openrouter"] as const)("rejects invalid %s envelopes without retry", async (provider) => {
    const cases = [
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }, { finish_reason: "stop", message: { content: '{"ok":true}' } }] }), code: "multiple-choices" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "declined" } }] }), code: "response-refused" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}', refusal: "" } }] }), code: "response-refused" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}', tool_calls: [] } }] }), code: "unexpected-content-block" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: {} }] }), code: "missing-content" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: null } }] }), code: "missing-content" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: [] } }] }), code: "missing-content" },
      { body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "not-json" } }] }), code: "not-a-json-object" }
    ];
    for (const entry of cases) {
      const transport = new RemoteJsonTransportDouble(entry.body);
      const client = new OpenAiCompatibleRemoteChatClient({ provider, modelId: "model-test", apiKey: "secret", transport });
      await expect(client.complete(request)).rejects.toMatchObject({ code: entry.code });
      expect(transport.requests).toHaveLength(1);
    }
  });

  it.each([
    "authentication-failed",
    "rate-limited",
    "model-unavailable",
    "provider-unavailable",
    "timeout",
    "cancelled",
    "redirect-rejected",
    "response-too-large",
    "response-truncated"
  ])("preserves the safe transport code %s without retry or secret leakage", async (code) => {
    const transport = new RemoteJsonTransportDouble(new RemoteProviderError(code));
    const client = new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-test", apiKey: "never-log-this-secret", transport });
    let caught: unknown;
    try {
      await client.complete(request);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code });
    expect(String(caught)).not.toContain("never-log-this-secret");
    expect(JSON.stringify(caught)).not.toContain("never-log-this-secret");
    expect(transport.requests).toHaveLength(1);
  });

  it("rejects cancellation and missing credentials before transport I/O", async () => {
    const transport = new RemoteJsonTransportDouble(completion);
    const client = new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-test", apiKey: "secret", transport });
    await expect(client.complete({ ...request, signal: { aborted: true } })).rejects.toMatchObject({ code: "cancelled" });
    expect(transport.requests).toEqual([]);
    expect(() => new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-test", apiKey: "", transport })).toThrowError(
      expect.objectContaining({ code: "credential-required" })
    );
    expect(transport.requests).toEqual([]);
  });

  it.each(["openai", "openrouter"] as const)("keeps the shared maxTokens range for %s before transport I/O", async (provider) => {
    const transport = new RemoteJsonTransportDouble(completion);
    const client = new OpenAiCompatibleRemoteChatClient({ provider, modelId: "model-test", apiKey: "secret", transport });
    await expect(client.complete({ ...request, maxTokens: 0 })).rejects.toMatchObject({ code: "invalid-max-tokens" });
    await expect(client.complete({ ...request, maxTokens: 16_385 })).rejects.toMatchObject({ code: "invalid-max-tokens" });
    expect(transport.requests).toEqual([]);
  });

  it.each(["openai", "openrouter"] as const)("maps both valid maxTokens boundaries for %s", async (provider) => {
    for (const maxTokens of [1, 16_384]) {
      const transport = new RemoteJsonTransportDouble(completion);
      const client = new OpenAiCompatibleRemoteChatClient({ provider, modelId: "model-test", apiKey: "secret", transport });
      await client.complete({ ...request, maxTokens });
      const body = JSON.parse(transport.requests[0]?.body ?? "") as Record<string, unknown>;
      expect(body[provider === "openai" ? "max_completion_tokens" : "max_tokens"]).toBe(maxTokens);
      expect(transport.requests).toHaveLength(1);
    }
  });

  it.each(["openai", "openrouter"] as const)("enforces listed-model ID, duplicate and count boundaries for %s", async (provider) => {
    const entry = (id: string) =>
      provider === "openrouter" ? { id, supported_parameters: ["response_format"] } : { id };
    const envelope = (data: readonly object[]) =>
      JSON.stringify(provider === "openrouter" ? { data, total_count: data.length } : { data });
    const exactId = `m${"x".repeat(127)}`;
    await expect(
      listOpenAiCompatibleRemoteModels({ provider, apiKey: "secret", transport: new RemoteJsonTransportDouble(envelope([entry(exactId)])) })
    ).resolves.toEqual([exactId]);
    await expect(
      listOpenAiCompatibleRemoteModels({ provider, apiKey: "secret", transport: new RemoteJsonTransportDouble(envelope([entry(`${exactId}x`)])) })
    ).rejects.toMatchObject({ code: "unsafe-listed-model-id" });
    await expect(
      listOpenAiCompatibleRemoteModels({ provider, apiKey: "secret", transport: new RemoteJsonTransportDouble(envelope([entry("model-a"), entry("model-a")])) })
    ).rejects.toMatchObject({ code: "duplicate-model-id" });

    const exact = Array.from({ length: 1000 }, (_, index) => entry(`model-${index}`));
    const exactExpectation = expect(
      listOpenAiCompatibleRemoteModels({ provider, apiKey: "secret", transport: new RemoteJsonTransportDouble(envelope(exact)) })
    );
    if (provider === "openrouter") await exactExpectation.rejects.toMatchObject({ code: "model-list-truncated" });
    else await exactExpectation.resolves.toHaveLength(1000);

    await expect(
      listOpenAiCompatibleRemoteModels({ provider, apiKey: "secret", transport: new RemoteJsonTransportDouble(envelope([...exact, entry("model-over")])) })
    ).rejects.toMatchObject({ code: "too-many-models" });
  });

  it.each([
    ["not json", "invalid-envelope"],
    [JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"ok":true}' } }] }), "truncated-output"],
    [JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: ["unexpected"] } }] }), "missing-content"]
  ])("maps malformed or invalid content to %s", async (body, code) => {
    const transport = new RemoteJsonTransportDouble(body);
    const client = new OpenAiCompatibleRemoteChatClient({ provider: "openai", modelId: "gpt-test", apiKey: "secret", transport });
    await expect(client.complete(request)).rejects.toMatchObject({ code });
    expect(transport.requests).toHaveLength(1);
  });
});
