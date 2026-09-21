import { describe, expect, it } from "vitest";
import { generatedSequenceModelSchema, sequenceModelLimits } from "../../../src/core/model/sequence-diagram-model.schema.js";
import { buildGeneratedModelJsonSchema } from "../../../src/core/prompt/generated-model-json-schema.js";
import { projectAnthropicJsonSchema } from "../../../src/node/llm/anthropic-json-schema.js";

function nodes(value: unknown, result: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) value.forEach((entry) => nodes(entry, result));
  else if (value !== null && typeof value === "object") {
    result.push(value as Record<string, unknown>);
    Object.values(value).forEach((entry) => nodes(entry, result));
  }
  return result;
}

describe("Anthropic JSON Schema projection", () => {
  it("projects the real full generated-model schema without mutating it", () => {
    const original = buildGeneratedModelJsonSchema();
    const before = JSON.stringify(original);
    const wire = projectAnthropicJsonSchema(original);
    const wireNodes = nodes(wire);
    const forbidden = [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "minLength",
      "maxLength",
      "maxItems",
      "uniqueItems",
      "contains",
      "minContains",
      "maxContains",
      "oneOf"
    ];

    expect(JSON.stringify(original)).toBe(before);
    expect(wire).not.toBe(original);
    expect(Object.isFrozen(wire)).toBe(true);
    expect(wireNodes.every((node) => forbidden.every((keyword) => !(keyword in node)))).toBe(true);
    expect(wireNodes.filter((node) => node["type"] === "object").every((node) => node["additionalProperties"] === false)).toBe(true);
    expect(wireNodes.filter((node) => "minItems" in node).every((node) => node["minItems"] === 0 || node["minItems"] === 1)).toBe(true);
  });

  it("keeps removed constraints enforced by the unchanged local Zod schema", () => {
    const tooManyParticipants = {
      participants: Array.from({ length: sequenceModelLimits.maxParticipants + 1 }, (_, index) => ({
        origin: "knowledge-pack",
        elementId: `system-${index}`,
        canonicalName: `System ${index}`,
        kind: "system"
      })),
      messages: [
        {
          from: { elementId: "system-0" },
          to: { elementId: "system-1" },
          label: "Call",
          interfaceType: "REST API",
          async: false,
          isResponse: false,
          order: 1
        }
      ]
    };

    expect(JSON.stringify(projectAnthropicJsonSchema(buildGeneratedModelJsonSchema()))).not.toContain("maxItems");
    expect(generatedSequenceModelSchema.safeParse(tooManyParticipants).success).toBe(false);
  });

  it("rejects unsupported object policies, external references and minItems above one", () => {
    expect(() => projectAnthropicJsonSchema({ type: "object", properties: {}, additionalProperties: true })).toThrowError(
      expect.objectContaining({ code: "unsupported-json-schema" })
    );
    expect(() => projectAnthropicJsonSchema({ $ref: "https://example.test/schema" })).toThrowError(
      expect.objectContaining({ code: "unsupported-json-schema" })
    );
    expect(() => projectAnthropicJsonSchema({ type: "array", items: { type: "string" }, minItems: 2 })).toThrowError(
      expect.objectContaining({ code: "unsupported-json-schema" })
    );
  });
});
