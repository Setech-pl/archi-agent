import { afterEach, describe, expect, it } from "vitest";
import type { StructuredChatRequest } from "../../../src/core/llm/structured-chat-client.js";
import { parseLoopbackEndpoint, type LoopbackEndpoint } from "../../../src/node/llm/loopback-endpoint.js";
import {
  localTransportLimits,
  LocalModelError,
  OpenAiCompatibleLocalChatClient
} from "../../../src/node/llm/openai-compatible-local-chat-client.js";
import { OpenAiCompatibleServerDouble } from "../../doubles/openai-compatible-server-double.js";

const request: StructuredChatRequest = {
  messages: [
    { role: "system", content: "system instructions" },
    { role: "user", content: "user data" }
  ],
  schemaName: "synthetic_schema_v1",
  schema: {
    type: "object",
    properties: { result: { type: "string" } },
    required: ["result"],
    additionalProperties: false
  },
  maxTokens: 16_384
};
const responseValue = { result: "accepted" };
const doubles: OpenAiCompatibleServerDouble[] = [];

afterEach(async () => {
  for (const double of doubles.splice(0)) {
    await double.close();
  }
});

async function serve(): Promise<{ double: OpenAiCompatibleServerDouble; endpoint: LoopbackEndpoint }> {
  const double = await OpenAiCompatibleServerDouble.start({ completionContent: JSON.stringify(responseValue) });
  doubles.push(double);
  const endpoint = parseLoopbackEndpoint(double.baseUrl);

  if (!endpoint.ok) {
    throw new Error("The double must expose a loopback endpoint.");
  }

  return { double, endpoint: endpoint.endpoint };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((caught: unknown) => caught);
  return error instanceof LocalModelError ? error.code : "not-a-local-model-error";
}

describe("OpenAiCompatibleLocalChatClient", () => {
  it("maps one neutral request to the complete parsed OpenAI-compatible body", async () => {
    const { double, endpoint } = await serve();
    const client = new OpenAiCompatibleLocalChatClient({ endpoint, modelId: "local-model-7b" });
    const result = await client.complete(request);
    const captured = double.requests[0];

    expect(result).toEqual({ value: responseValue, source: "content" });
    expect(double.requests).toHaveLength(1);
    expect([captured?.method, captured?.path]).toEqual(["POST", "/v1/chat/completions"]);
    expect(captured?.headers["content-type"]).toBe("application/json");
    expect(captured?.headers).not.toHaveProperty("authorization");
    expect(captured?.body).toEqual({
      model: "local-model-7b",
      messages: request.messages,
      temperature: 0,
      seed: 42,
      stream: false,
      max_tokens: 16_384,
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema }
      }
    });
    expect(client.clientType).toBe("openai-compatible-local");
    expect(client.generationMetadata).toEqual({
      modelId: "local-model-7b",
      temperature: 0,
      seed: 42,
      attemptCount: 1,
      structuredOutput: true
    });
  });

  it("rejects invalid maxTokens before sending a request", async () => {
    const { double, endpoint } = await serve();
    const client = new OpenAiCompatibleLocalChatClient({ endpoint, modelId: "m" });

    for (const maxTokens of [0, 16_385, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await errorCode(client.complete({ ...request, maxTokens }))).toBe("invalid-max-tokens");
    }

    expect(double.requests).toHaveLength(0);
  });

  it("rejects an oversized request before opening the HTTP exchange", async () => {
    const { double, endpoint } = await serve();
    const client = new OpenAiCompatibleLocalChatClient({ endpoint, modelId: "m" });
    const oversized = {
      ...request,
      messages: [{ role: "user" as const, content: "x".repeat(localTransportLimits.maxRequestBytes) }]
    };

    expect(await errorCode(client.complete(oversized))).toBe("request-too-large");
    expect(double.requests).toHaveLength(0);
  });
});
