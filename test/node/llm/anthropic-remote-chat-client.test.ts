import { describe, expect, it } from "vitest";
import type { StructuredChatRequest } from "../../../src/core/llm/structured-chat-client.js";
import {
  AnthropicRemoteChatClient,
  buildAnthropicRemoteRequest,
  listAnthropicRemoteModels
} from "../../../src/node/llm/anthropic-remote-chat-client.js";
import { RemoteJsonTransportDouble } from "../../doubles/remote-json-transport-double.js";

const request: StructuredChatRequest = {
  messages: [
    { role: "system", content: "system" },
    { role: "user", content: "user" }
  ],
  schemaName: "ignored_by_anthropic",
  schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  maxTokens: 777
};

const structuredOutputs = { structured_outputs: { supported: true } };

describe("Anthropic remote client", () => {
  it("uses stable Messages output_config without beta, temperature or thinking", async () => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({ type: "message", stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }] })
    );
    const client = new AnthropicRemoteChatClient({ modelId: "claude-sonnet-4-5", apiKey: "anthropic-secret", transport });
    await expect(client.complete(request)).resolves.toMatchObject({ value: { ok: true } });
    const sent = transport.requests[0];
    const body = JSON.parse(sent?.body ?? "") as Record<string, unknown>;
    expect(body).toEqual(buildAnthropicRemoteRequest(request, "claude-sonnet-4-5"));
    expect(body).toMatchObject({ max_tokens: 777, system: "system", messages: [{ role: "user", content: "user" }] });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect((body["output_config"] as { format: object }).format).toMatchObject({ type: "json_schema", schema: request.schema });
    expect(sent?.headers).toEqual({ "x-api-key": "anthropic-secret", "anthropic-version": "2023-06-01" });
    expect(sent?.headers).not.toHaveProperty("anthropic-beta");
    expect(client.generationMetadata).toEqual({ modelId: "claude-sonnet-4-5", temperature: null, seed: null, attemptCount: 1, structuredOutput: true });
    expect(transport.requests).toHaveLength(1);
  });

  it("joins every initial system message with exactly two newlines and preserves user/assistant messages", async () => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }] })
    );
    const client = new AnthropicRemoteChatClient({ modelId: "claude-test", apiKey: "secret", transport });
    await client.complete({
      ...request,
      messages: [
        { role: "system", content: "first" },
        { role: "system", content: "second" },
        { role: "system", content: "third" },
        { role: "user", content: "question" },
        { role: "assistant", content: "previous answer" },
        { role: "user", content: "follow-up" }
      ]
    });
    expect(JSON.parse(transport.requests[0]?.body ?? "")).toMatchObject({
      system: "first\n\nsecond\n\nthird",
      messages: [
        { role: "user", content: "question" },
        { role: "assistant", content: "previous answer" },
        { role: "user", content: "follow-up" }
      ]
    });
  });

  it.each([
    [[]],
    [[{ role: "system", content: "only system" }]],
    [[{ role: "user", content: "no system" }]],
    [[{ role: "system", content: "system" }, { role: "user", content: "user" }, { role: "system", content: "late" }]],
    [[{ role: "system", content: "system" }, { role: "assistant", content: "assistant" }, { role: "system", content: "late" }]]
  ] as const)("rejects an empty or invalid message sequence before I/O", async (messages) => {
    const transport = new RemoteJsonTransportDouble();
    const client = new AnthropicRemoteChatClient({ modelId: "claude-test", apiKey: "secret", transport });
    await expect(client.complete({ ...request, messages })).rejects.toMatchObject({ code: "invalid-message-sequence" });
    expect(transport.requests).toEqual([]);
  });

  it.each([
    ["thinking", "unexpected-content-block"],
    ["redacted_thinking", "unexpected-content-block"],
    ["tool_use", "unexpected-content-block"]
  ])("rejects an unexpected %s block", async (type, code) => {
    const transport = new RemoteJsonTransportDouble(JSON.stringify({ stop_reason: "end_turn", content: [{ type }] }));
    const client = new AnthropicRemoteChatClient({ modelId: "claude-sonnet-4-5", apiKey: "secret", transport });
    await expect(client.complete(request)).rejects.toMatchObject({ code });
    expect(transport.requests).toHaveLength(1);
  });

  it.each([
    ["max_tokens", "truncated-output"],
    ["refusal", "response-refused"]
  ])("maps stop_reason %s to %s", async (stopReason, code) => {
    const transport = new RemoteJsonTransportDouble(JSON.stringify({ stop_reason: stopReason, content: [{ type: "text", text: "{}" }] }));
    const client = new AnthropicRemoteChatClient({ modelId: "claude-sonnet-4-5", apiKey: "secret", transport });
    await expect(client.complete(request)).rejects.toMatchObject({ code });
  });

  it("lists models once and fails closed when the page is truncated", async () => {
    const good = new RemoteJsonTransportDouble(
      JSON.stringify({ data: [{ id: "claude-z", capabilities: structuredOutputs }, { id: "claude-a", capabilities: structuredOutputs }], has_more: false })
    );
    await expect(listAnthropicRemoteModels({ apiKey: "secret", transport: good })).resolves.toEqual(["claude-a", "claude-z"]);
    expect(good.requests[0]?.endpoint).toBe("anthropic-models");
    const truncated = new RemoteJsonTransportDouble(
      JSON.stringify({ data: [{ id: "claude-a", capabilities: structuredOutputs }], has_more: true })
    );
    await expect(listAnthropicRemoteModels({ apiKey: "secret", transport: truncated })).rejects.toMatchObject({ code: "model-list-truncated" });
    expect(truncated.requests).toHaveLength(1);
  });

  it("exposes only models whose structured output capability is exactly true", async () => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({
        data: [
          { id: "claude-supported", capabilities: structuredOutputs },
          { id: "claude-missing" },
          { id: "claude-null", capabilities: null },
          { id: "claude-false", capabilities: { structured_outputs: { supported: false } } },
          { id: "claude-no-structured", capabilities: {} },
          { id: "claude-bad-structured", capabilities: { structured_outputs: "yes" } },
          { id: "claude-bad-supported", capabilities: { structured_outputs: { supported: "true" } } }
        ],
        has_more: false
      })
    );
    await expect(listAnthropicRemoteModels({ apiKey: "secret", transport })).resolves.toEqual(["claude-supported"]);
    expect(transport.requests).toHaveLength(1);
  });

  it("enforces model identifier, duplicate and list-size boundaries after capability filtering", async () => {
    const exactId = `m${"x".repeat(127)}`;
    const exactIdTransport = new RemoteJsonTransportDouble(
      JSON.stringify({ data: [{ id: exactId, capabilities: structuredOutputs }], has_more: false })
    );
    await expect(listAnthropicRemoteModels({ apiKey: "secret", transport: exactIdTransport })).resolves.toEqual([exactId]);

    const longId = new RemoteJsonTransportDouble(
      JSON.stringify({ data: [{ id: `${exactId}x`, capabilities: structuredOutputs }], has_more: false })
    );
    await expect(listAnthropicRemoteModels({ apiKey: "secret", transport: longId })).rejects.toMatchObject({ code: "unsafe-listed-model-id" });

    const duplicate = new RemoteJsonTransportDouble(
      JSON.stringify({ data: [{ id: "claude-a", capabilities: structuredOutputs }, { id: "claude-a", capabilities: structuredOutputs }], has_more: false })
    );
    await expect(listAnthropicRemoteModels({ apiKey: "secret", transport: duplicate })).rejects.toMatchObject({ code: "duplicate-model-id" });

    const exactlyLimit = Array.from({ length: 1000 }, (_, index) => ({ id: `claude-${index}`, capabilities: structuredOutputs }));
    await expect(
      listAnthropicRemoteModels({ apiKey: "secret", transport: new RemoteJsonTransportDouble(JSON.stringify({ data: exactlyLimit, has_more: false })) })
    ).resolves.toHaveLength(1000);
    await expect(
      listAnthropicRemoteModels({
        apiKey: "secret",
        transport: new RemoteJsonTransportDouble(JSON.stringify({ data: [...exactlyLimit, { id: "claude-over", capabilities: structuredOutputs }], has_more: false }))
      })
    ).rejects.toMatchObject({ code: "too-many-models" });
  });

  it("keeps the shared maxTokens range before transport I/O", async () => {
    const transport = new RemoteJsonTransportDouble();
    const client = new AnthropicRemoteChatClient({ modelId: "claude-test", apiKey: "secret", transport });
    await expect(client.complete({ ...request, maxTokens: 0 })).rejects.toMatchObject({ code: "invalid-max-tokens" });
    await expect(client.complete({ ...request, maxTokens: 16_385 })).rejects.toMatchObject({ code: "invalid-max-tokens" });
    expect(transport.requests).toEqual([]);
  });

  it.each([1, 16_384])("maps the valid maxTokens boundary %i into one request", async (maxTokens) => {
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }] })
    );
    const client = new AnthropicRemoteChatClient({ modelId: "claude-test", apiKey: "secret", transport });
    await client.complete({ ...request, maxTokens });
    expect(JSON.parse(transport.requests[0]?.body ?? "")).toMatchObject({ max_tokens: maxTokens });
    expect(transport.requests).toHaveLength(1);
  });
});
