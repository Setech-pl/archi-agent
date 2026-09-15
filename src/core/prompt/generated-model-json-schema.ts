import { z } from "zod";
import { generatedSequenceModelSchema } from "../model/sequence-diagram-model.schema.js";

/**
 * Structured-output JSON Schema for sequence-model generators, derived from the strict Zod
 * generated-model schema with Zod's own JSON Schema conversion. There is no handwritten copy.
 *
 * The derived schema carries the structure: strict objects without additional properties, closed
 * enums, required fields, participant references by element identifier or confirmed new-participant
 * key, fragments, and collection and number limits. Zod refinements cannot be expressed in JSON
 * Schema (identifier format, PlantUML text policy, duplicate participants and order numbers, declared
 * endpoints, fragment nesting); they stay enforced by the Zod schema and the validation stages after
 * the response. The meta-schema URI is omitted, so the request carries no URL.
 */

export const generatedModelJsonSchemaName = "archground_sequence_model_v1";

export type JsonSchemaValue = null | boolean | number | string | readonly JsonSchemaValue[] | { readonly [key: string]: JsonSchemaValue };

export type JsonSchemaObject = { readonly [key: string]: JsonSchemaValue };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
}

let derived: JsonSchemaObject | undefined;

/** The derived schema; deterministic and frozen. */
export function buildGeneratedModelJsonSchema(): JsonSchemaObject {
  if (derived === undefined) {
    const converted = z.toJSONSchema(generatedSequenceModelSchema, {
      target: "draft-2020-12",
      unrepresentable: "throw",
      io: "input"
    }) as unknown as Record<string, JsonSchemaValue>;
    const { $schema: _metaSchema, ...schema } = converted;
    derived = deepFreeze(JSON.parse(JSON.stringify(schema)) as JsonSchemaObject);
  }

  return derived;
}
