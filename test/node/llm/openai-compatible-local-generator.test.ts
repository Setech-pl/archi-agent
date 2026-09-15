import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import type { SequenceModelGenerationRequest } from "../../../src/core/pipeline/sequence-model-generator.js";
import { buildGeneratedModelJsonSchema, generatedModelJsonSchemaName } from "../../../src/core/prompt/generated-model-json-schema.js";
import { promptDelimiters } from "../../../src/core/prompt/sequence-generation-prompt.js";
import { ScriptedSpaceMissionGenerator } from "../../../src/demo/scripted-space-mission-generator.js";
import { parseLoopbackEndpoint, type LoopbackEndpoint } from "../../../src/node/llm/loopback-endpoint.js";
import { strictJsonResponseLimits } from "../../../src/core/llm/strict-json-response.js";
import {
  listLocalModels,
  localGenerationSettings,
  localTransportLimits,
  LocalModelError,
  OpenAiCompatibleLocalGenerator,
  selectLocalStructuredAnswer,
  type LocalResponseSource
} from "../../../src/node/llm/openai-compatible-local-generator.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";
import { OpenAiCompatibleServerDouble, scenarioContents, type ServerDoubleOptions } from "../../doubles/openai-compatible-server-double.js";

const LF = String.fromCharCode(10);
const packDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);
const flowText = readFileSync(new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);

if (!loaded.ok) {
  throw new Error("The Space Mission pack must load.");
}

const parsedFlow = parseFlowDocument(flowText, { file: "samples/space-mission/flows/telemetry-command-flow.md" });

if (!parsedFlow.ok) {
  throw new Error("The flow must parse.");
}

const grounding = buildGroundedContext({ flow: parsedFlow.flow, knowledgePack: { pack: loaded.pack, indexes: loaded.indexes } });

if (grounding.status !== "grounded") {
  throw new Error("Grounding must succeed.");
}

const generationRequest: SequenceModelGenerationRequest = { flow: parsedFlow.flow, context: grounding.context, digest: grounding.digest };
const validContent = JSON.stringify(await new ScriptedSpaceMissionGenerator().generate(generationRequest));
const doubles: OpenAiCompatibleServerDouble[] = [];

afterEach(async () => {
  for (const double of doubles.splice(0)) {
    await double.close();
  }
});

async function serve(options: ServerDoubleOptions = {}): Promise<{ double: OpenAiCompatibleServerDouble; endpoint: LoopbackEndpoint }> {
  const double = await OpenAiCompatibleServerDouble.start({ completionContent: validContent, ...options });
  doubles.push(double);
  const endpoint = parseLoopbackEndpoint(double.baseUrl);

  if (!endpoint.ok) {
    throw new Error("The double must expose a loopback endpoint.");
  }

  return { double, endpoint: endpoint.endpoint };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? "no-code";
  }

  return "resolved";
}

describe("OpenAiCompatibleLocalGenerator - request contract", () => {
  it("sends one strict structured-output chat completion with fixed repeatability settings", async () => {
    const { double, endpoint } = await serve();
    const generator = new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "local-model-7b" });
    const result = await generator.generate(generationRequest);
    const [request] = double.requests;
    const body = request?.body as Record<string, any>;

    expect(result).toEqual(JSON.parse(validContent));
    expect(double.requests).toHaveLength(1);
    expect([request?.method, request?.path]).toEqual(["POST", "/v1/chat/completions"]);
    expect(request?.headers["content-type"]).toBe("application/json");
    expect(Object.keys(request?.headers ?? {})).not.toContain("authorization");
    expect(Object.keys(request?.headers ?? {}).some((name) => name.includes("api-key"))).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "response_format", "seed", "stream", "temperature"]);
    expect([body["model"], body["temperature"], body["seed"], body["stream"], body["max_tokens"]]).toEqual(["local-model-7b", 0, 42, false, 16_384]);
    expect(body["messages"].map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
    expect(body["messages"][1].content).toContain(promptDelimiters.flowBegin);
    expect(body["response_format"]).toEqual({
      type: "json_schema",
      json_schema: { name: generatedModelJsonSchemaName, strict: true, schema: buildGeneratedModelJsonSchema() }
    });
  });

  it("declares safe generation metadata and its generator type", async () => {
    const { endpoint } = await serve();
    const generator = new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "qwen/qwen3-8b" });

    expect(generator.generatorType).toBe("openai-compatible-local");
    expect(generator.generationMetadata).toEqual({ modelId: "qwen/qwen3-8b", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true });
    expect(localGenerationSettings).toEqual({ temperature: 0, seed: 42, maxTokens: 16_384, attemptCount: 1 });
  });

  it("returns the parsed object as untrusted data and leaves validation to the pipeline", async () => {
    const { double, endpoint } = await serve({ scenario: "schema-invalid" });
    const result = await new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "local-model-7b" }).generate(generationRequest);

    expect(result).toEqual(JSON.parse(scenarioContents["schema-invalid"]));
    expect(double.requests).toHaveLength(1);
  });

  it("rejects unsafe model identifiers and timeouts before any request", async () => {
    const { double, endpoint } = await serve();

    for (const modelId of ["", "model id", "../model", "a".repeat(129), "-model", "model//x"]) {
      expect(() => new OpenAiCompatibleLocalGenerator({ endpoint, modelId })).toThrow(LocalModelError);
    }

    expect(() => new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", timeoutMs: 0 })).toThrow("invalid-timeout");
    expect(() => new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", timeoutMs: localTransportLimits.maxTimeoutMs + 1 })).toThrow("invalid-timeout");
    expect(double.requests).toHaveLength(0);
  });

  it("refuses an oversized prompt without sending a request", async () => {
    const { double, endpoint } = await serve();
    const large = { ...generationRequest, flow: { ...generationRequest.flow, body: `${generationRequest.flow.body}${LF}${"Mission Control waits. ".repeat(4_000)}` } };

    expect(await codeOf(new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m" }).generate(large))).toBe("prompt-too-large");
    expect(double.requests).toHaveLength(0);
  });
});

describe("OpenAiCompatibleLocalGenerator - failures", () => {
  it.each([
    ["invalid-envelope", "invalid-envelope"],
    ["multiple-choices", "multiple-choices"],
    ["malformed-json", "malformed-json"],
    ["wrong-content-type", "unexpected-content-type"],
    ["http-error", "http-status"],
    ["redirect", "redirect-rejected"],
    ["oversized", "response-too-large"]
  ] as const)("maps the %s scenario to %s after exactly one request", async (scenario, code) => {
    const { double, endpoint } = await serve({ scenario });
    const error = await new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m" }).generate(generationRequest).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LocalModelError);
    expect((error as LocalModelError).code).toBe(code);
    expect((error as Error).message).not.toContain("synthetic failure");
    expect(double.requests.map((request) => request.path)).toEqual(["/v1/chat/completions"]);
  });

  it("times out without waiting for the server", async () => {
    const { double, endpoint } = await serve({ scenario: "timeout" });
    const started = Date.now();

    expect(await codeOf(new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", timeoutMs: 200 }).generate(generationRequest))).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(double.requests).toHaveLength(1);
  });

  it("honours cancellation before and during the request", async () => {
    const { double, endpoint } = await serve({ scenario: "timeout" });
    const generator = new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m" });
    const aborted = new AbortController();
    aborted.abort();

    expect(await codeOf(generator.generate({ ...generationRequest, signal: aborted.signal }))).toBe("cancelled");
    expect(double.requests).toHaveLength(0);

    const controller = new AbortController();
    const pending = codeOf(generator.generate({ ...generationRequest, signal: controller.signal }));

    while (double.requests.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    controller.abort();
    expect(await pending).toBe("cancelled");
    expect(double.requests).toHaveLength(1);
  });

  it("reports a refused connection", async () => {
    const { double, endpoint } = await serve();
    await double.close();
    doubles.splice(doubles.indexOf(double), 1);

    expect(await codeOf(new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", timeoutMs: 2_000 }).generate(generationRequest))).toBe(
      "connection-failed"
    );
  });
});

describe("listLocalModels", () => {
  it("lists sanitized model identifiers with one bounded GET request and chooses none", async () => {
    const { double, endpoint } = await serve({ models: ["qwen2.5-7b-instruct", "google/gemma-3-12b", "local-model@q4_k_m"] });
    const models = await listLocalModels(endpoint);

    expect(models).toEqual(["google/gemma-3-12b", "local-model@q4_k_m", "qwen2.5-7b-instruct"]);
    expect(Object.isFrozen(models)).toBe(true);
    expect(double.requests.map((request) => [request.method, request.path])).toEqual([["GET", "/v1/models"]]);
    expect(Object.keys(double.requests[0]?.headers ?? {})).not.toContain("authorization");
  });

  it("returns an empty list when the server reports no model", async () => {
    const { endpoint } = await serve({ models: [] });

    expect(await listLocalModels(endpoint)).toEqual([]);
  });

  it.each([
    ["a duplicate identifier", { models: ["model-a", "model-a"] }, "duplicate-model-id"],
    ["an empty identifier", { models: [""] }, "unsafe-listed-model-id"],
    ["an identifier with spaces", { models: ["model a"] }, "unsafe-listed-model-id"],
    ["a missing identifier", { models: [{ object: "model" }] }, "unsafe-listed-model-id"],
    ["too many models", { models: Array.from({ length: localTransportLimits.maxListedModels + 1 }, (_, index) => `model-${index}`) }, "too-many-models"],
    ["a body that is not JSON", { modelsBody: "not json" }, "invalid-model-list"],
    ["a body without data", { modelsBody: JSON.stringify({ object: "list" }) }, "invalid-model-list"],
    ["a wrong content type", { models: ["model-a"], scenario: "wrong-content-type" as const }, "unexpected-content-type"],
    ["a redirect", { scenario: "redirect" as const }, "redirect-rejected"]
  ])("rejects %s", async (_name, options, code) => {
    const { double, endpoint } = await serve(options);

    expect(await codeOf(listLocalModels(endpoint))).toBe(code);
    expect(double.requests).toHaveLength(1);
  });
});

describe("selectLocalStructuredAnswer", () => {
  const fence = "`".repeat(3);
  const marker = "private-reasoning-4711";
  const other = JSON.stringify({ participants: [{ origin: "knowledge-pack" }], messages: [] });
  const envelopeOf = (message: Record<string, unknown>, choice: Record<string, unknown> = {}, count = 1): string =>
    JSON.stringify({
      object: "chat.completion",
      choices: Array.from({ length: count }, (_, index) => ({ index, message, finish_reason: "stop", ...choice }))
    });
  const codeOfAnswer = (body: string): string => {
    const result = selectLocalStructuredAnswer(body);
    return result.ok ? `ok:${result.source}` : result.code;
  };

  it("uses non-empty content as the primary channel even when reasoning_content is present", () => {
    const result = selectLocalStructuredAnswer(envelopeOf({ role: "assistant", content: other, reasoning_content: validContent }));

    expect(result).toEqual({ ok: true, value: JSON.parse(other), source: "content" });
  });

  it("accepts reasoning_content only when content is empty, null or absent", () => {
    for (const message of [
      { role: "assistant", content: "", reasoning_content: validContent },
      { role: "assistant", content: null, reasoning_content: validContent },
      { role: "assistant", reasoning_content: validContent }
    ]) {
      const result = selectLocalStructuredAnswer(envelopeOf(message));

      expect(result).toEqual({ ok: true, value: JSON.parse(validContent), source: "reasoning-content-compat" });
    }
  });

  it("keeps the empty-content failure when no usable field is present", () => {
    expect(codeOfAnswer(envelopeOf({ content: "", reasoning_content: "" }))).toBe("empty-content");
    expect(codeOfAnswer(envelopeOf({ content: "" }))).toBe("empty-content");
    expect(codeOfAnswer(envelopeOf({ content: "", reasoning_content: { participants: [] } }))).toBe("empty-content");
    expect(codeOfAnswer(envelopeOf({ content: null }))).toBe("missing-content");
  });

  it("never replaces non-empty or non-string content with reasoning_content", () => {
    expect(codeOfAnswer(envelopeOf({ content: `Here it is: ${other}`, reasoning_content: validContent }))).toBe("not-a-json-object");
    expect(codeOfAnswer(envelopeOf({ content: '{"participants": [}', reasoning_content: validContent }))).toBe("malformed-json");
    expect(codeOfAnswer(envelopeOf({ content: "   ", reasoning_content: validContent }))).toBe("empty-content");
    expect(codeOfAnswer(envelopeOf({ content: 42, reasoning_content: validContent }))).toBe("missing-content");
  });

  it.each([
    ["prose before the object", `Let me think about the diagram. ${validContent}`, "reasoning-content-not-a-json-object"],
    ["analysis after the object", `${validContent} That is the plan.`, "reasoning-content-not-a-json-object"],
    ["a fenced object", `${fence}json\n${validContent}\n${fence}`, "reasoning-content-not-a-json-object"],
    ["two concatenated objects", `${validContent}${validContent}`, "reasoning-content-malformed-json"],
    ["malformed JSON", '{"participants": [}', "reasoning-content-malformed-json"],
    ["an empty object", "{}", "reasoning-content-empty-object"],
    ["an oversized candidate", `{"label":"${"a".repeat(strictJsonResponseLimits.maxContentChars)}"}`, "reasoning-content-content-too-large"]
  ])("rejects reasoning_content with %s", (_name, reasoning, code) => {
    expect(codeOfAnswer(envelopeOf({ content: "", reasoning_content: reasoning }))).toBe(code);
  });

  it("keeps the envelope rules for several choices and unfinished answers", () => {
    const message = { content: "", reasoning_content: validContent };

    expect(codeOfAnswer(envelopeOf(message, {}, 2))).toBe("multiple-choices");
    expect(codeOfAnswer(envelopeOf(message, { finish_reason: "length" }))).toBe("truncated-output");
    expect(codeOfAnswer(envelopeOf(message, { finish_reason: "tool_calls" }))).toBe("unexpected-finish-reason");
    expect(codeOfAnswer("not json")).toBe("invalid-envelope");
  });

  it("never carries the reasoning text in a failure or in the result", () => {
    const failure = selectLocalStructuredAnswer(envelopeOf({ content: "", reasoning_content: `${marker} ${validContent}` }));
    const success = selectLocalStructuredAnswer(envelopeOf({ content: "", reasoning_content: validContent }));

    expect(JSON.stringify(failure)).not.toContain(marker);
    expect(Object.keys(success).sort()).toEqual(["ok", "source", "value"]);
    expect(Object.isFrozen(failure) && Object.isFrozen(success)).toBe(true);
  });
});

describe("OpenAiCompatibleLocalGenerator - response channel", () => {
  const marker = "private-reasoning-4711";

  it("reports the content channel for a normal answer", async () => {
    const { endpoint } = await serve();
    const sources: LocalResponseSource[] = [];
    await new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", onResponseSource: (source) => sources.push(source) }).generate(generationRequest);

    expect(sources).toEqual(["content"]);
  });

  it("accepts a reasoning_content answer of the synthetic local-server shape after exactly one request", async () => {
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat" });
    const sources: LocalResponseSource[] = [];
    const result = await new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", onResponseSource: (source) => sources.push(source) }).generate(
      generationRequest
    );

    expect(result).toEqual(JSON.parse(validContent));
    expect(sources).toEqual(["reasoning-content-compat"]);
    expect(double.requests).toHaveLength(1);
  });

  it("rejects prose in reasoning_content with a stable code and without the text", async () => {
    const { double, endpoint } = await serve({ scenario: "reasoning-content-compat", reasoningContent: `Thinking ${marker}. ${validContent}` });
    const sources: LocalResponseSource[] = [];
    const error = await new OpenAiCompatibleLocalGenerator({ endpoint, modelId: "m", onResponseSource: (source) => sources.push(source) })
      .generate(generationRequest)
      .catch((caught: unknown) => caught);

    expect((error as LocalModelError).code).toBe("reasoning-content-not-a-json-object");
    expect((error as Error).message).not.toContain(marker);
    expect(sources).toEqual([]);
    expect(double.requests).toHaveLength(1);
  });
});
