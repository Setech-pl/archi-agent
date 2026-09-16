import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fragmentKinds, generatedSequenceModelSchema, sequenceModelLimits } from "../../../src/core/model/sequence-diagram-model.schema.js";
import { allowedInterfaceTypes, participantKinds } from "../../../src/core/model/types.js";
import {
  buildGeneratedModelJsonSchema,
  generatedModelJsonSchemaName,
  type JsonSchemaObject
} from "../../../src/core/prompt/generated-model-json-schema.js";

type Schema = Record<string, any>;

/**
 * Minimal checker for the JSON Schema keywords the derived schema uses. It throws on any other
 * keyword, so the test also proves the schema stays inside this subset. Test-only; no dependency.
 */
const supportedKeywords = new Set(["type", "properties", "required", "additionalProperties", "enum", "const", "items", "minItems", "maxItems", "minimum", "maximum", "oneOf", "anyOf"]);

function conforms(schema: Schema, value: unknown): boolean {
  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) {
      throw new Error(`Unsupported JSON Schema keyword ${keyword}.`);
    }
  }

  if (schema["oneOf"] !== undefined && (schema["oneOf"] as Schema[]).filter((option) => conforms(option, value)).length !== 1) {
    return false;
  }

  if (schema["anyOf"] !== undefined && !(schema["anyOf"] as Schema[]).some((option) => conforms(option, value))) {
    return false;
  }

  if (schema["const"] !== undefined && value !== schema["const"]) {
    return false;
  }

  if (schema["enum"] !== undefined && !(schema["enum"] as unknown[]).includes(value)) {
    return false;
  }

  switch (schema["type"]) {
    case undefined:
      return true;
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
    case "number":
      return (
        typeof value === "number" &&
        (schema["type"] === "number" || Number.isInteger(value)) &&
        (schema["minimum"] === undefined || value >= schema["minimum"]) &&
        (schema["maximum"] === undefined || value <= schema["maximum"])
      );
    case "array":
      return (
        Array.isArray(value) &&
        (schema["minItems"] === undefined || value.length >= schema["minItems"]) &&
        (schema["maxItems"] === undefined || value.length <= schema["maxItems"]) &&
        value.every((entry) => conforms(schema["items"] as Schema, entry))
      );
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }

      const record = value as Record<string, unknown>;
      const properties = (schema["properties"] ?? {}) as Record<string, Schema>;

      if (((schema["required"] ?? []) as string[]).some((key) => !(key in record))) {
        return false;
      }

      if (schema["additionalProperties"] === false && Object.keys(record).some((key) => !(key in properties))) {
        return false;
      }

      return Object.entries(record).every(([key, entry]) => properties[key] === undefined || conforms(properties[key], entry));
    }
    default:
      throw new Error("Unsupported type.");
  }
}

const jsonSchema = buildGeneratedModelJsonSchema() as Schema;

function zodAccepts(value: unknown): boolean {
  return generatedSequenceModelSchema.safeParse(value).success;
}

function nodes(value: unknown, found: Schema[] = []): Schema[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => nodes(entry, found));
  } else if (value !== null && typeof value === "object") {
    found.push(value as Schema);
    Object.values(value).forEach((entry) => nodes(entry, found));
  }

  return found;
}

const known = (id: string, canonicalName: string, kind = "system") => ({ origin: "knowledge-pack", elementId: id, canonicalName, kind });
const message = (order: number, extra: Record<string, unknown> = {}) => ({
  from: { elementId: "mission-control" },
  to: { elementId: "command-service" },
  label: `Step ${order}`,
  interfaceType: "REST API",
  async: false,
  isResponse: false,
  order,
  ...extra
});
const valid = (extra: Record<string, unknown> = {}) => ({
  participants: [known("mission-control", "Mission Control"), known("command-service", "Command Service")],
  messages: [message(1), message(2, { isResponse: true, from: { elementId: "command-service" }, to: { elementId: "mission-control" } })],
  ...extra
});

describe("generated-model JSON Schema - derivation", () => {
  it("is Zod's own conversion of the strict generated-model schema, without the meta-schema URI", () => {
    const converted = z.toJSONSchema(generatedSequenceModelSchema, { target: "draft-2020-12", unrepresentable: "throw", io: "input" }) as Record<string, unknown>;
    const { $schema: metaSchema, ...expected } = converted;

    expect(typeof metaSchema).toBe("string");
    expect(jsonSchema).toEqual(expected);
    expect("$schema" in jsonSchema).toBe(false);
  });

  it("is deterministic, frozen and carries a stable name", () => {
    expect(buildGeneratedModelJsonSchema()).toBe(buildGeneratedModelJsonSchema());
    expect(JSON.stringify(buildGeneratedModelJsonSchema())).toBe(JSON.stringify(jsonSchema));
    expect(Object.isFrozen(jsonSchema)).toBe(true);
    expect(Object.isFrozen(jsonSchema["properties"]["messages"])).toBe(true);
    expect(generatedModelJsonSchemaName).toBe("archground_sequence_model_v1");
  });

  it("contains no source path, author, URL or machine data", () => {
    const text = JSON.stringify(jsonSchema);

    for (const forbidden of ["samples", "author", "http", "Space Mission", ":\\\\", "/Users", "/home"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("generated-model JSON Schema - strictness", () => {
  it("makes every object strict with explicit properties", () => {
    const objects = nodes(jsonSchema).filter((node) => node["type"] === "object");

    expect(objects.length).toBeGreaterThanOrEqual(7);

    for (const node of objects) {
      expect(node["additionalProperties"]).toBe(false);
      expect(node["properties"]).toBeDefined();
      expect(Array.isArray(node["required"])).toBe(true);
    }
  });

  it("uses closed enums and constants", () => {
    const enums = nodes(jsonSchema).filter((node) => Array.isArray(node["enum"])).map((node) => node["enum"]);
    const constants = nodes(jsonSchema).filter((node) => "const" in node).map((node) => node["const"]);

    expect(enums).toContainEqual([...allowedInterfaceTypes]);
    expect(enums).toContainEqual([...participantKinds]);
    expect(enums).toContainEqual([...fragmentKinds]);
    expect(constants).toEqual(expect.arrayContaining(["knowledge-pack", "new", true]));
  });

  it("represents required fields, participant references, fragments and limits", () => {
    const properties = jsonSchema["properties"];
    const messageSchema = properties["messages"]["items"];
    const fragmentSchema = properties["fragments"]["items"];
    const [knownParticipant, newParticipant] = properties["participants"]["items"]["oneOf"];

    expect(jsonSchema["required"]).toEqual(["participants", "messages"]);
    expect(messageSchema["required"]).toEqual(["from", "to", "label", "interfaceType", "async", "isResponse", "order"]);
    expect([messageSchema["properties"]["async"], messageSchema["properties"]["isResponse"]]).toEqual([{ type: "boolean" }, { type: "boolean" }]);
    expect(knownParticipant["required"]).toEqual(["origin", "elementId", "canonicalName", "kind"]);
    expect(newParticipant["required"]).toEqual(["origin", "newName", "displayName", "kind", "confirmedByUser"]);
    expect(messageSchema["properties"]["from"]["anyOf"].map((option: Schema) => option["required"])).toEqual([["elementId"], ["newName"]]);
    expect(fragmentSchema["required"]).toEqual(["kind", "condition", "firstOrder", "lastOrder"]);
    expect(fragmentSchema["properties"]["elseBranches"]["maxItems"]).toBe(sequenceModelLimits.maxElseBranches);
    expect([properties["participants"]["minItems"], properties["participants"]["maxItems"]]).toEqual([1, sequenceModelLimits.maxParticipants]);
    expect([properties["messages"]["minItems"], properties["messages"]["maxItems"]]).toEqual([1, sequenceModelLimits.maxMessages]);
    expect(properties["fragments"]["maxItems"]).toBe(sequenceModelLimits.maxFragments);
    expect(messageSchema["properties"]["order"]).toEqual({ type: "integer", minimum: 1, maximum: sequenceModelLimits.maxOrder });
  });
});

describe("generated-model JSON Schema - consistency with the Zod schema", () => {
  it("accepts representative valid models in both", () => {
    const models = [
      valid(),
      valid({ fragments: [] }),
      valid({
        participants: [
          known("mission-control", "Mission Control"),
          known("command-service", "Command Service"),
          { origin: "new", newName: "ground station", displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: true }
        ],
        messages: [
          message(1, { interfaceName: "Command API", businessDescription: "Daily plan" }),
          message(2, { isResponse: true, from: { elementId: "command-service" }, to: { elementId: "mission-control" } }),
          message(3, { from: { newName: "ground station" }, interfaceType: "EVENT", async: true })
        ],
        fragments: [{ kind: "alt", condition: "Accepted", firstOrder: 1, lastOrder: 3, elseBranches: [{ condition: "Rejected", firstOrder: 3 }] }]
      })
    ];

    for (const model of models) {
      expect([conforms(jsonSchema, model), zodAccepts(model)]).toEqual([true, true]);
    }
  });

  it("rejects structural violations in both", () => {
    const invalid = [
      valid({ notes: "free text" }),
      valid({ messages: [message(1, { raw: "A -> B" })] }),
      valid({ messages: [message(1, { interfaceType: "GRPC" })] }),
      valid({ messages: [{ from: { elementId: "mission-control" }, to: { elementId: "command-service" }, interfaceType: "EVENT", order: 1 }] }),
      valid({ messages: [message(1, { order: "1" })] }),
      valid({ messages: [(({ async: _async, ...rest }) => rest)(message(1))] }),
      valid({ messages: [(({ isResponse: _isResponse, ...rest }) => rest)(message(1))] }),
      valid({ messages: [message(1, { order: 0 })] }),
      valid({ messages: [message(1, { to: { elementId: "command-service", newName: "ground station" } })] }),
      valid({ participants: [] }),
      valid({ participants: Array.from({ length: sequenceModelLimits.maxParticipants + 1 }, (_, index) => known(`system-${index}`, "System")) }),
      valid({ participants: [{ ...known("mission-control", "Mission Control"), origin: "model" }] }),
      valid({ participants: [{ origin: "new", newName: "ground station", displayName: "[NEW] Ground Station", kind: "system", confirmedByUser: false }] }),
      valid({ participants: [known("mission-control", "Mission Control", "service")] }),
      valid({ fragments: [{ kind: "par", condition: "Both", firstOrder: 1, lastOrder: 2 }] }),
      [valid()],
      "not an object"
    ];

    for (const model of invalid) {
      expect([conforms(jsonSchema, model), zodAccepts(model)]).toEqual([false, false]);
    }
  });

  it("leaves refinements to the Zod schema and the validators after the response", () => {
    const refinementOnly = [
      valid({ messages: [message(1, { to: { elementId: "telemetry-store" } })] }),
      valid({ participants: [known("Mission Control", "Mission Control"), known("command-service", "Command Service")] }),
      valid({ messages: [message(1, { label: "@startuml" })] }),
      valid({ participants: [known("mission-control", "Mission Control"), known("command-service", "Command Service"), known("mission-control", "Mission Control")] }),
      valid({
        fragments: [
          { kind: "opt", condition: "First", firstOrder: 1, lastOrder: 2 },
          { kind: "opt", condition: "Same", firstOrder: 1, lastOrder: 2 }
        ]
      })
    ];

    for (const model of refinementOnly) {
      expect([conforms(jsonSchema, model), zodAccepts(model)]).toEqual([true, false]);
    }
  });

  it("types the export as a JSON object", () => {
    const typed: JsonSchemaObject = buildGeneratedModelJsonSchema();

    expect(typed["type"]).toBe("object");
  });
});
