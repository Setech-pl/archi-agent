import type { JsonSchemaObject, JsonSchemaValue } from "../../core/llm/structured-chat-client.js";
import { RemoteProviderError } from "./remote-json-transport.js";

const removedKeywords = new Set([
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
  "maxContains"
]);
const scalarKeywords = new Set(["type", "const", "default", "pattern", "description", "title"]);
const supportedFormats = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

function isRecord(value: unknown): value is Record<string, JsonSchemaValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(): never {
  throw new RemoteProviderError("unsupported-json-schema");
}

function cloneArray(value: JsonSchemaValue): readonly JsonSchemaValue[] {
  if (!Array.isArray(value)) fail();
  return value.map((entry) => structuredValue(entry));
}

function structuredValue(value: JsonSchemaValue): JsonSchemaValue {
  if (Array.isArray(value)) return value.map((entry) => structuredValue(entry));
  if (isRecord(value)) return projectNode(value);
  return value;
}

function projectMap(value: JsonSchemaValue): JsonSchemaObject {
  if (!isRecord(value)) fail();
  const result: Record<string, JsonSchemaValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isRecord(child)) fail();
    result[key] = projectNode(child);
  }
  return result;
}

function projectNode(source: Record<string, JsonSchemaValue>): JsonSchemaObject {
  const output: Record<string, JsonSchemaValue> = {};

  for (const [key, value] of Object.entries(source)) {
    if (removedKeywords.has(key)) continue;

    if (scalarKeywords.has(key)) {
      output[key] = structuredValue(value);
      continue;
    }

    switch (key) {
      case "properties":
      case "$defs":
      case "definitions":
        output[key] = projectMap(value);
        break;
      case "items":
        if (!isRecord(value)) fail();
        output[key] = projectNode(value);
        break;
      case "required":
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) fail();
        output[key] = [...value];
        break;
      case "additionalProperties":
        if (value !== false) fail();
        output[key] = false;
        break;
      case "enum":
        if (!Array.isArray(value) || value.some((entry) => entry !== null && typeof entry === "object")) fail();
        output[key] = [...value];
        break;
      case "oneOf":
        // The project schema uses disjoint oneOf branches. Anthropic supports anyOf, not oneOf.
        output["anyOf"] = cloneArray(value);
        break;
      case "anyOf":
      case "allOf": {
        const projected = cloneArray(value);
        if (key === "allOf" && projected.some((entry) => isRecord(entry) && "$ref" in entry)) fail();
        output[key] = projected;
        break;
      }
      case "minItems":
        if (value !== 0 && value !== 1) fail();
        output[key] = value;
        break;
      case "$ref":
        if (typeof value !== "string" || !value.startsWith("#/")) fail();
        output[key] = value;
        break;
      case "format":
        if (typeof value !== "string" || !supportedFormats.has(value)) fail();
        output[key] = value;
        break;
      default:
        fail();
    }
  }

  if (output["type"] === "object" && output["additionalProperties"] !== false) fail();
  return output;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function pointerTarget(root: JsonSchemaObject, reference: string): JsonSchemaValue | undefined {
  if (!reference.startsWith("#/")) return undefined;
  let current: JsonSchemaValue = root;
  for (const encoded of reference.slice(2).split("/")) {
    if (!isRecord(current)) return undefined;
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    const next: JsonSchemaValue | undefined = current[key];
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
}

function rejectRecursiveReferences(root: JsonSchemaObject): void {
  const visit = (value: JsonSchemaValue, active: Set<object>): void => {
    if (value === null || typeof value !== "object") return;
    if (active.has(value)) fail();
    const next = new Set(active);
    next.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, next));
      return;
    }
    const record = value as { readonly [key: string]: JsonSchemaValue };
    const reference = record["$ref"];
    if (typeof reference === "string") {
      const target = pointerTarget(root, reference);
      if (target === undefined) fail();
      visit(target, next);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "$ref") visit(child, next);
    }
  };
  visit(root, new Set());
}

/** Creates a fresh, frozen wire schema without weakening the original local validation schema. */
export function projectAnthropicJsonSchema(schema: JsonSchemaObject): JsonSchemaObject {
  rejectRecursiveReferences(schema);
  return deepFreeze(projectNode(schema));
}

/** Reuse the closed projection; OpenAI-compatible strict output also disallows minItems. */
export function projectOpenAiStrictJsonSchema(schema: JsonSchemaObject): JsonSchemaObject {
  const withoutMinItems = (value: JsonSchemaValue): JsonSchemaValue => {
    if (Array.isArray(value)) return value.map(withoutMinItems);
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "minItems")
      .map(([key, child]) => [key, withoutMinItems(child)]));
    return value;
  };
  return deepFreeze(withoutMinItems(projectAnthropicJsonSchema(schema)) as JsonSchemaObject);
}
