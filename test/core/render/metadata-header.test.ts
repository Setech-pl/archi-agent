import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack, requiredKnowledgePackFiles } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { UnsafePlantUmlTextError } from "../../../src/core/render/plantuml-escape.js";
import { headerTitle, isSafeGeneratorType, metadataHeaderLines, type DiagramHeaderMetadata } from "../../../src/core/render/metadata-header.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const LF = String.fromCharCode(10);
const digestValue = "0123456789abcdef".repeat(4);
const metadata: DiagramHeaderMetadata = {
  diagramName: "telemetry-command-flow",
  flowName: "Telemetry command flow",
  author: "Space Mission Sample Team",
  language: "en",
  digest: { algorithm: "sha256", value: digestValue },
  generatorType: "scripted-demo"
};

describe("metadataHeaderLines", () => {
  it("writes the diagram name, flow name, author, language, grounding digest and generator type as comments", () => {
    expect(metadataHeaderLines(metadata)).toEqual([
      `' ${headerTitle}`,
      "' diagram: telemetry-command-flow",
      "' flow: Telemetry command flow",
      "' author: Space Mission Sample Team",
      "' language: en",
      `' grounding digest: sha256:${digestValue}`,
      "' generator: scripted-demo"
    ]);
  });

  it("contains no timestamp, path, user name or environment value", () => {
    const text = metadataHeaderLines(metadata).join(LF);

    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
    expect(text).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(text).not.toContain("/home");
    expect(text).not.toContain("%");
    expect(text).not.toContain("$");
  });

  it("rejects unsafe metadata instead of escaping it", () => {
    expect(() => metadataHeaderLines({ ...metadata, author: `Team${LF}@enduml` })).toThrow(UnsafePlantUmlTextError);
    expect(() => metadataHeaderLines({ ...metadata, flowName: "!include other.puml" })).toThrow(UnsafePlantUmlTextError);
    expect(() => metadataHeaderLines({ ...metadata, diagramName: "a '/ b" })).toThrow(UnsafePlantUmlTextError);
    expect(() => metadataHeaderLines({ ...metadata, digest: { algorithm: "sha256", value: "not-a-digest" } })).toThrow();
    expect(() => metadataHeaderLines({ ...metadata, generatorType: "Real Model" })).toThrow();
  });

  it("accepts only short lower-case generator types", () => {
    expect(isSafeGeneratorType("scripted-demo")).toBe(true);
    expect(isSafeGeneratorType("local-model-2")).toBe(true);
    for (const value of ["", "Scripted", "scripted demo", "-demo", "a".repeat(33), 7]) {
      expect(isSafeGeneratorType(value)).toBe(false);
    }
  });
});

describe("author and the grounding digest", () => {
  it("keeps the author in metadata but out of the semantic grounding digest", async () => {
    const packDir = new URL("../../../samples/space-mission/architecture/", import.meta.url);
    const flowText = readFileSync(new URL("../../../samples/space-mission/flows/telemetry-command-flow.md", import.meta.url), "utf8");
    const loaded = await loadKnowledgePack(
      new KnowledgePackSourceDouble(Object.fromEntries(requiredKnowledgePackFiles.map((file) => [file, readFileSync(new URL(file, packDir), "utf8")])))
    );

    if (!loaded.ok) {
      throw new Error("The Space Mission pack must load.");
    }

    const groundWith = (text: string) => {
      const parsed = parseFlowDocument(text, { file: "samples/space-mission/flows/telemetry-command-flow.md" });

      if (!parsed.ok) {
        throw new Error("The flow must parse.");
      }

      const outcome = buildGroundedContext({ flow: parsed.flow, knowledgePack: { pack: loaded.pack, indexes: loaded.indexes } });

      if (outcome.status !== "grounded") {
        throw new Error("Grounding must succeed.");
      }

      return outcome;
    };

    const original = groundWith(flowText);
    const otherAuthor = groundWith(flowText.replace("author: Space Mission Sample Team", "author: Another Sample Author"));

    expect(otherAuthor.context.metadata.author).toBe("Another Sample Author");
    expect(otherAuthor.digest).toEqual(original.digest);

    const header = (outcome: typeof original) =>
      metadataHeaderLines({ ...outcome.context.metadata, digest: outcome.digest, generatorType: "scripted-demo" });
    const differing = header(original).filter((line, index) => line !== header(otherAuthor)[index]);

    expect(differing).toEqual(["' author: Space Mission Sample Team"]);
  });
});
