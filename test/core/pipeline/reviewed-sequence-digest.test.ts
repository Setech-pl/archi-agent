import { describe, expect, it } from "vitest";
import { buildGroundedContext, parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { loadKnowledgePack } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { buildArchitectureSnapshot } from "../../../src/core/pipeline/reviewed-sequence.js";
import { buildPackFiles } from "../../doubles/knowledge-pack-fixture.js";
import { KnowledgePackSourceDouble } from "../../doubles/knowledge-pack-source-double.js";

const loaded = await loadKnowledgePack(new KnowledgePackSourceDouble(buildPackFiles()));
if (!loaded.ok) throw new Error("Synthetic Knowledge Pack must load.");
const pack = { pack: loaded.pack, indexes: loaded.indexes };
const parsed = parseFlowDocument("---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler registers frames in Image Archive.\n", { file: "flows/observation.md" });
if (!parsed.ok) throw new Error("Synthetic flow must parse.");
const flow = parsed.flow;
const grounded = buildGroundedContext({ flow, knowledgePack: pack });
if (grounded.status !== "grounded") throw new Error("Synthetic flow must ground.");
const context = grounded.context;

const digestOf = (nextContext = context, nextFlow = flow) => buildArchitectureSnapshot(nextContext, pack, nextFlow).digest;

describe("D1.1 ArchitectureSnapshot digest", () => {
  it("is stable for identical inputs and contains only logical paths", () => {
    const first = buildArchitectureSnapshot(context, pack, flow);
    const second = buildArchitectureSnapshot(context, pack, flow);
    expect(first.digest).toBe(second.digest);
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(first.flowFile).toBe("flows/observation.md");
    expect(JSON.stringify(first)).not.toContain(process.cwd());
  });

  it("does not depend on object property insertion order", () => {
    const { diagramName, flowName, author, language } = context.metadata;
    expect(digestOf({ ...context, metadata: { language, author, flowName, diagramName } })).toBe(digestOf());
  });

  it("changes when only a participant source file changes", () => {
    const systems = context.systems.map((entry, index) => index === 0
      ? { ...entry, source: { ...entry.source, file: "aliases.md" as const } } : entry);
    expect(digestOf({ ...context, systems })).not.toBe(digestOf());
    const shifted = context.systems.map((entry, index) => index === 0
      ? { ...entry, source: { ...entry.source, line: entry.source.line + 1 } } : entry);
    expect(digestOf({ ...context, systems: shifted })).not.toBe(digestOf());
  });

  it("changes when only a relationship source line changes", () => {
    expect(context.relationships.length).toBeGreaterThan(0);
    const relationships = context.relationships.map((entry, index) => index === 0
      ? { ...entry, source: { ...entry.source, line: entry.source.line + 1 } } : entry);
    expect(digestOf({ ...context, relationships })).not.toBe(digestOf());
    const relocated = context.relationships.map((entry, index) => index === 0
      ? { ...entry, source: { ...entry.source, file: "rules.md" as const } } : entry);
    expect(digestOf({ ...context, relationships: relocated })).not.toBe(digestOf());
  });

  it("changes when only a rule source file or line changes", () => {
    expect(context.rules.length).toBeGreaterThan(0);
    const withSource = (source: typeof context.rules[number]["source"]) => ({ ...context, rules: context.rules.map((entry, index) => index === 0
      ? { ...entry, source } : entry) });
    const original = context.rules[0]!.source;
    expect(digestOf(withSource({ ...original, file: "relationships.md" }))).not.toBe(digestOf());
    expect(digestOf(withSource({ ...original, line: original.line + 1 }))).not.toBe(digestOf());
  });

  it("changes when only the logical flow file name changes", () => {
    expect(digestOf(context, { ...flow, file: "flows/other-observation.md" })).not.toBe(digestOf());
  });

  it("changes when only flow evidence text or its physical line changes", () => {
    expect(digestOf(context, { ...flow, body: "Telescope Scheduler archives frames in Image Archive.\n" })).not.toBe(digestOf());
    expect(digestOf(context, { ...flow, bodyStartLine: flow.bodyStartLine + 1 })).not.toBe(digestOf());
  });
});
