/**
 * Strict parser for the structured answer of an OpenAI-compatible chat completion.
 *
 * The expected envelope is a JSON object whose choices array holds exactly one choice, whose
 * finish_reason is stop (or absent) and whose message.content is a string holding exactly one JSON
 * object, optionally surrounded by JSON whitespace. Nothing is repaired: there is no fence
 * stripping, no search for the first or last brace and no second attempt. Results carry a stable
 * code only, never the response text.
 */

export const strictJsonResponseLimits = Object.freeze({
  maxEnvelopeChars: 1_048_576,
  maxContentChars: 262_144
});

export const strictJsonResponseCodes = [
  "envelope-too-large",
  "invalid-envelope",
  "missing-choices",
  "multiple-choices",
  "missing-content",
  "truncated-output",
  "unexpected-finish-reason",
  "content-too-large",
  "empty-content",
  "control-character",
  "not-a-json-object",
  "malformed-json",
  "empty-object"
] as const;

export type StrictJsonResponseCode = (typeof strictJsonResponseCodes)[number];

export type StrictJsonResponseResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly code: StrictJsonResponseCode };

const whitespaceCodes = new Set([9, 10, 13, 32]);

function failure(code: StrictJsonResponseCode): StrictJsonResponseResult {
  return Object.freeze({ ok: false, code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parses content that must be exactly one JSON object. */
export function parseStrictJsonObject(content: string): StrictJsonResponseResult {
  if (content.length > strictJsonResponseLimits.maxContentChars) {
    return failure("content-too-large");
  }

  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);

    if (code < 32 && !whitespaceCodes.has(code)) {
      return failure("control-character");
    }
  }

  let start = 0;
  let end = content.length;

  while (start < end && whitespaceCodes.has(content.charCodeAt(start))) {
    start += 1;
  }

  while (end > start && whitespaceCodes.has(content.charCodeAt(end - 1))) {
    end -= 1;
  }

  if (start === end) {
    return failure("empty-content");
  }

  const body = content.slice(start, end);

  if (!body.startsWith("{") || !body.endsWith("}")) {
    return failure("not-a-json-object");
  }

  let value: unknown;

  try {
    value = JSON.parse(body);
  } catch {
    return failure("malformed-json");
  }

  if (!isRecord(value)) {
    return failure("not-a-json-object");
  }

  if (Object.keys(value).length === 0) {
    return failure("empty-object");
  }

  return Object.freeze({ ok: true, value });
}

/** Parses the complete response body of a non-streaming chat completion. */
export function parseChatCompletion(body: string): StrictJsonResponseResult {
  if (body.length > strictJsonResponseLimits.maxEnvelopeChars) {
    return failure("envelope-too-large");
  }

  let envelope: unknown;

  try {
    envelope = JSON.parse(body);
  } catch {
    return failure("invalid-envelope");
  }

  if (!isRecord(envelope)) {
    return failure("invalid-envelope");
  }

  const choices = envelope["choices"];

  if (!Array.isArray(choices) || choices.length === 0) {
    return failure("missing-choices");
  }

  if (choices.length > 1) {
    return failure("multiple-choices");
  }

  const choice: unknown = choices[0];

  if (!isRecord(choice)) {
    return failure("invalid-envelope");
  }

  const finishReason = choice["finish_reason"];

  if (finishReason === "length") {
    return failure("truncated-output");
  }

  if (finishReason !== undefined && finishReason !== null && finishReason !== "stop") {
    return failure("unexpected-finish-reason");
  }

  const message = choice["message"];

  if (!isRecord(message)) {
    return failure("invalid-envelope");
  }

  const content = message["content"];

  if (typeof content !== "string") {
    return failure("missing-content");
  }

  return parseStrictJsonObject(content);
}
