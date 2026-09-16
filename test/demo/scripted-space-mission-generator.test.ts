import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../src/core/grounding/grounded-context-builder.js";
import type { GroundedContext, GroundingSuccess } from "../../src/core/grounding/grounded-context.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { parseGeneratedSequenceModel } from "../../src/core/model/sequence-diagram-model.schema.js";
import { packInterfaceType } from "../../src/core/validation/relationship-validator.js";
import {
  ScriptedGeneratorError,
  ScriptedSpaceMissionGenerator,
  scriptedDemoGeneratorType,
  spaceMissionScript
} from "../../src/demo/scripted-space-mission-generator.js";
import { KnowledgePackSourceDouble } from "../doubles/knowledge-pack-source-double.js";

type Raw = Record<string, any>;

const packDir = new URL("../../samples/space-mission/architecture/", import.meta.url);
const sourceUrl = new URL("../../src/demo/scripted-space-mission-generator.ts", import.meta.url);
const flowText = readFileSync(new URL("../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
const loaded = await loadKnowledgePack(
  new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
);

if (!loaded.ok) {
  throw new Error("The Space Mission pack must load.");
}

const parsed = parseFlowDocument(flowText, { file: "samples/space-mission/flows/telemetry-command-flow.md" });

if (!parsed.ok) {
  throw new Error("The flow must parse.");
}

const flow = parsed.flow;
const grounding = buildGroundedContext({ flow, knowledgePack: { pack: loaded.pack, indexes: loaded.indexes } }) as GroundingSuccess;

if (grounding.status !== "grounded") {
  throw new Error("Grounding must succeed.");
}

function generate(context: GroundedContext = grounding.context, signal?: { readonly aborted: boolean }): Promise<unknown> {
  return new ScriptedSpaceMissionGenerator().generate({ flow, context, digest: grounding.digest, ...(signal === undefined ? {} : { signal }) });
}

const output = (await generate()) as Raw;

describe("ScriptedSpaceMissionGenerator - identity", () => {
  it("identifies itself as the deterministic scripted demo generator and never as a language model", () => {
    const source = readFileSync(sourceUrl, "utf8");

    expect(new ScriptedSpaceMissionGenerator().generatorType).toBe("scripted-demo");
    expect(scriptedDemoGeneratorType).toBe("scripted-demo");
    expect("generationMetadata" in new ScriptedSpaceMissionGenerator()).toBe(false);
    expect(source).toContain("SCRIPTED DEMO GENERATOR - not a language model.");
    expect(source).not.toMatch(/\b(?:LLM|GPT)\b/);
    expect(source).not.toMatch(/fetch\(|node:https?|node:net|process\.env|Math\.random|Date\.now|new Date/);
  });
});

describe("ScriptedSpaceMissionGenerator - output", () => {
  it("passes the strict generated-model schema", () => {
    expect(parseGeneratedSequenceModel(output).ok).toBe(true);
  });

  it("references known participants only by identifiers of the grounded context, with context names and kinds", () => {
    const elements = new Map([...grounding.context.actors, ...grounding.context.systems].map((element) => [element.id, element]));

    for (const participant of output["participants"] as Raw[]) {
      expect(participant["origin"]).toBe("knowledge-pack");
      expect(elements.get(participant["elementId"])?.canonicalName).toBe(participant["canonicalName"]);
    }

    for (const message of output["messages"] as Raw[]) {
      expect(elements.has(message["from"]["elementId"])).toBe(true);
      expect(elements.has(message["to"]["elementId"])).toBe(true);
    }
  });

  it("uses only relationships, modes and interface names of the grounded context", () => {
    for (const message of output["messages"] as Raw[]) {
      const from = message["from"]["elementId"] as string;
      const to = message["to"]["elementId"] as string;

      if (from === to) {
        expect(message["interfaceType"]).toBe("INTERNAL");
        expect(message["interfaceName"]).toBeUndefined();
        continue;
      }

      const [source, target] = message["isResponse"] === true ? [to, from] : [from, to];
      const mode = message["async"] === true ? "asynchronous" : "synchronous";
      const relationship = grounding.context.relationships.find(
        (candidate) =>
          candidate.fromId === source &&
          candidate.toId === target &&
          candidate.interfaceType === packInterfaceType(message["interfaceType"]) &&
          candidate.mode === mode
      );

      expect(relationship).toBeDefined();
      expect(message["interfaceName"]).toBe(relationship?.interfaceName ?? undefined);
    }
  });

  it("uses the flight controller through its explicit INTERNAL relationship to mission control", () => {
    const participants = output["participants"] as Raw[];
    const messages = output["messages"] as Raw[];
    const declared = grounding.context.relationships.filter(
      (relationship) => relationship.fromId === "flight-controller" && relationship.toId === "mission-control"
    );

    expect(participants.filter((participant) => participant["elementId"] === "flight-controller")).toEqual([
      { origin: "knowledge-pack", elementId: "flight-controller", canonicalName: "Flight Controller", kind: "actor" }
    ]);
    expect(declared.map((relationship) => [relationship.interfaceType, relationship.mode, relationship.interfaceName])).toEqual([
      ["INTERNAL", "synchronous", "Operator Console"]
    ]);
    expect(messages.filter((message) => [message["from"]["elementId"], message["to"]["elementId"]].includes("flight-controller"))).toEqual([
      {
        from: { elementId: "flight-controller" },
        to: { elementId: "mission-control" },
        label: "Submit prepared command",
        interfaceType: "INTERNAL",
        interfaceName: "Operator Console",
        async: false,
        isResponse: false,
        order: 1
      }
    ]);
  });

  it("declares every participant of the grounded context and uses each one in a message", () => {
    const participants = (output["participants"] as Raw[]).map((participant) => participant["elementId"] as string);
    const messages = output["messages"] as Raw[];
    const used = new Set(messages.flatMap((message) => [message["from"]["elementId"], message["to"]["elementId"]]));
    const contextIds = [...grounding.context.actors, ...grounding.context.systems].map((element) => element.id);

    expect([...participants].sort()).toEqual([...contextIds].sort());
    expect(participants.filter((id) => !used.has(id))).toEqual([]);
    expect(messages.filter((message) => message["from"]["elementId"] === message["to"]["elementId"]).map((message) => message["from"]["elementId"])).toEqual([
      "command-service"
    ]);
  });

  it("produces synchronous and asynchronous interactions in a fixed order", () => {
    const messages = output["messages"] as Raw[];

    expect(messages.map((message) => message["order"])).toEqual(spaceMissionScript.map((_, index) => index + 1));
    expect(messages.some((message) => message["async"] !== true && message["isResponse"] !== true)).toBe(true);
    expect(messages.some((message) => message["async"] === true)).toBe(true);
    expect(messages.some((message) => message["isResponse"] === true)).toBe(true);
  });

  it("is deterministic and contains no timestamp, random identifier or absolute path", async () => {
    const text = JSON.stringify(output);

    expect(JSON.stringify(await generate())).toBe(text);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}-|[A-Za-z]:[\\/]|"\//);
  });
});

describe("ScriptedSpaceMissionGenerator - safe failure", () => {
  it("stops instead of inventing a participant that the context lacks", async () => {
    const withoutQueue: GroundedContext = { ...grounding.context, systems: grounding.context.systems.filter((system) => system.id !== "command-queue") };

    await expect(generate(withoutQueue)).rejects.toBeInstanceOf(ScriptedGeneratorError);
  });

  it("stops instead of inventing a relationship that the context lacks", async () => {
    const withoutUplink: GroundedContext = {
      ...grounding.context,
      relationships: grounding.context.relationships.filter((relationship) => !(relationship.fromId === "command-queue" && relationship.toId === "orbital-relay"))
    };

    await expect(generate(withoutUplink)).rejects.toBeInstanceOf(ScriptedGeneratorError);
  });

  it("honours an aborted cancellation signal", async () => {
    await expect(generate(grounding.context, { aborted: true })).rejects.toBeInstanceOf(ScriptedGeneratorError);
  });
});
