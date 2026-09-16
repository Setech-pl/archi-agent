import { describe, expect, it } from "vitest";
import {
  parseChatCompletion,
  parseStrictJsonObject,
  strictJsonResponseLimits,
  type StrictJsonResponseResult
} from "../../../src/core/llm/strict-json-response.js";

const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const fence = "`".repeat(3);
const model = '{"participants":[{"origin":"knowledge-pack"}],"messages":[]}';

function envelope(content: unknown, choice: Record<string, unknown> = {}, choices = 1): string {
  return JSON.stringify({
    object: "chat.completion",
    choices: Array.from({ length: choices }, (_, index) => ({ index, message: { role: "assistant", content }, finish_reason: "stop", ...choice }))
  });
}

function codeOf(result: StrictJsonResponseResult): string {
  return result.ok ? "ok" : result.code;
}

describe("parseStrictJsonObject", () => {
  it("accepts exactly one JSON object, optionally surrounded by JSON whitespace", () => {
    for (const content of [model, `  ${model}${LF}`, `${LF}${TAB}${model}${TAB}${LF}`]) {
      const result = parseStrictJsonObject(content);

      expect(result).toEqual({ ok: true, value: JSON.parse(model) });
    }
  });

  it("accepts escaped control characters inside JSON strings", () => {
    const content = JSON.stringify({ label: `a${String.fromCharCode(1)}b` });

    expect(codeOf(parseStrictJsonObject(content))).toBe("ok");
  });

  it.each([
    ["a Markdown fence", `${fence}json${LF}${model}${LF}${fence}`, "not-a-json-object"],
    ["prose before the object", `Here is the diagram: ${model}`, "not-a-json-object"],
    ["prose after the object", `${model} Thanks.`, "not-a-json-object"],
    ["an array", `[${model}]`, "not-a-json-object"],
    ["a string", '"{}"', "not-a-json-object"],
    ["two concatenated objects", `${model}${model}`, "malformed-json"],
    ["two objects on separate lines", `${model}${LF}${model}`, "malformed-json"],
    ["an unterminated object", '{"participants": [', "not-a-json-object"],
    ["a trailing comma", '{"participants": [],}', "malformed-json"],
    ["an empty object", "{}", "empty-object"],
    ["empty content", "", "empty-content"],
    ["whitespace only", `  ${LF} `, "empty-content"],
    ["a raw control character", `{"label":"a${String.fromCharCode(1)}b"}`, "control-character"],
    ["a raw NUL character", `${model}${String.fromCharCode(0)}`, "control-character"]
  ])("rejects %s", (_name, content, code) => {
    expect(codeOf(parseStrictJsonObject(content))).toBe(code);
  });

  it("rejects oversized content without parsing it", () => {
    const content = `{"label":"${"a".repeat(strictJsonResponseLimits.maxContentChars)}"}`;

    expect(codeOf(parseStrictJsonObject(content))).toBe("content-too-large");
  });
});

describe("parseChatCompletion", () => {
  it("returns the object from choices[0].message.content", () => {
    expect(parseChatCompletion(envelope(model))).toEqual({ ok: true, value: JSON.parse(model) });
    expect(codeOf(parseChatCompletion(envelope(model, { finish_reason: null })))).toBe("ok");
    expect(codeOf(parseChatCompletion(envelope(model, { finish_reason: undefined })))).toBe("ok");
  });

  it.each([
    ["a body that is not JSON", "not json", "invalid-envelope"],
    ["an array envelope", "[]", "invalid-envelope"],
    ["missing choices", JSON.stringify({ object: "chat.completion" }), "missing-choices"],
    ["empty choices", JSON.stringify({ choices: [] }), "missing-choices"],
    ["two choices", envelope(model, {}, 2), "multiple-choices"],
    ["a choice that is not an object", JSON.stringify({ choices: ["text"] }), "invalid-envelope"],
    ["a missing message", JSON.stringify({ choices: [{ finish_reason: "stop" }] }), "invalid-envelope"],
    ["null content", envelope(null), "missing-content"],
    ["numeric content", envelope(42), "missing-content"],
    ["object content", envelope({ participants: [] }), "missing-content"],
    ["a length stop", envelope(model, { finish_reason: "length" }), "truncated-output"],
    ["a tool call stop", envelope(model, { finish_reason: "tool_calls" }), "unexpected-finish-reason"],
    ["fenced content", envelope(`${fence}${LF}${model}${LF}${fence}`), "not-a-json-object"],
    ["malformed content", envelope('{"participants": [}'), "malformed-json"]
  ])("rejects %s", (_name, body, code) => {
    expect(codeOf(parseChatCompletion(body))).toBe(code);
  });

  it("rejects an oversized envelope", () => {
    expect(codeOf(parseChatCompletion(" ".repeat(strictJsonResponseLimits.maxEnvelopeChars + 1)))).toBe("envelope-too-large");
  });

  it("never returns the response text in a failure", () => {
    const marker = "distinctive-response-text-4711";
    const result = parseChatCompletion(envelope(`Sure! ${marker} ${model}`));

    expect(result).toEqual({ ok: false, code: "not-a-json-object" });
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
