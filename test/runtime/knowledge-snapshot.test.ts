import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime, knowledgeSnapshotFromPack } from "../../src/runtime/index.js";
import { loadKnowledgePack } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { buildGroundedContext, parseFlowDocument } from "../../src/core/grounding/grounded-context-builder.js";
import { buildComponentSnapshot } from "../../src/core/pipeline/component-snapshot.js";
import type { StructuredChatClient, StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
import { buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { KnowledgePackSourceDouble } from "../doubles/knowledge-pack-source-double.js";

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-k1-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const files = buildPackFiles();
const systemsOnly = buildPackFiles({ actors: [], relationships: [], aliases: [], rules: [] });
const packPath = path.join(root, "architecture"), onlyPath = path.join(root, "systems-only");
for (const [folder, content] of [[packPath, files], [onlyPath, systemsOnly]] as const) {
  mkdirSync(folder);
  for (const [file, text] of Object.entries(content)) writeFileSync(path.join(folder, file), text);
}
const loaded = await loadKnowledgePack(new KnowledgePackSourceDouble(files));
if (!loaded.ok) throw new Error("Synthetic pack must load");
const knowledge = knowledgeSnapshotFromPack(loaded.pack);
const flow = { kind: "document", text: "---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler registers frames in Image Archive.\n" } as const;
const generator = { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "test-model" } as const;

function run(diagramType: "sequence" | "component", variant: "grounded" | "user-stated" | "invalid" = "grounded") {
  const calls: StructuredChatRequest[] = [];
  const client: StructuredChatClient = { clientType: "openai-compatible-local",
    generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
    async complete(request) {
      calls.push(request);
      const input = JSON.parse(request.messages[1]!.content);
      if (calls.length === 2) return { source: "content", value: { accepted: true, violations: [],
        confirmedUserStatedFactIds: variant === "user-stated" ? ["fact-0001"] : [] } };
      if (variant === "invalid") return { source: "content", value: {} };
      if (diagramType === "sequence") return { source: "content", value: { version: 3,
        groundedSteps: variant === "grounded" ? [{ order: 1, operationId: "op-0001", label: "Registers frames" }] : [],
        userStatedSteps: variant === "user-stated" ? [{ order: 1, fromId: "telescope-scheduler", toId: "image-archive",
          interactionKind: "request", interfaceType: "DB", interfaceName: null, flowEvidenceId: input.snapshot.flowEvidence[0].flowEvidenceId, label: "Registers frames" }] : [] } };
      return { source: "content", value: { version: 1, elementIds: input.snapshot.elements.map((entry: { id: string }) => entry.id),
        groundedDependencies: variant === "grounded" ? input.relationshipCatalog.map((entry: { dependencyId: string }) => entry.dependencyId) : [],
        userStatedDependencies: variant === "user-stated" ? [{ fromId: "telescope-scheduler", toId: "image-archive", interfaceType: "DB",
          interfaceName: null, mode: "synchronous", flowEvidenceId: input.snapshot.flowEvidence[0].flowEvidenceId }] : [] } };
    } };
  const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
  return { calls, app, request: { diagramType, flow, generator, knowledgePack: { kind: "local-directory", path: variant === "user-stated" ? onlyPath : packPath } } as const };
}

describe("K1 shared knowledge in generation and review", () => {
  for (const diagramType of ["sequence", "component"] as const) {
    it(`${diagramType}: uses identical source snapshot identity/provenance in exactly two calls`, async () => {
      const { calls, app, request } = run(diagramType);
      const result = await app.generateDiagram!(request);
      expect(result.status).toBe("success");
      expect(calls).toHaveLength(2);
      const generated = JSON.parse(calls[0]!.messages[1]!.content).snapshot;
      const reviewed = JSON.parse(calls[1]!.messages[1]!.content).snapshot;
      expect(generated).toEqual(reviewed);
      expect(generated.knowledge.id).toBe(knowledge.id);
      expect(generated.knowledge.digest).toBe(knowledge.digest);
      for (const fact of generated.knowledge.provenance) expect(fact.provenance).toEqual(knowledge.facts.find((entry) => entry.id === fact.factId)?.provenance);
      expect(generated.knowledge.provenance.filter((entry: { recordKey: string }) => JSON.parse(entry.recordKey)[0] === "systems")).toHaveLength(2);
      expect(JSON.stringify(generated.knowledge)).not.toContain("Dome Controller");
      expect(JSON.stringify(generated.knowledge)).not.toContain(root);
      expect(generated.knowledge.provenance.some((entry: { recordKey: string; provenance: { location: { file: string; line: number } }[] }) =>
        JSON.parse(entry.recordKey)[0] === "relationships" && entry.provenance.some((proof) => proof.location.file === "relationships.md" && proof.location.line > 1))).toBe(true);
      if (result.status === "success") expect(result.plantUml).toContain('database "Image Archive"');
    });

    it(`${diagramType}: absence of source relationships permits explicit flow evidence, without creating source evidence`, async () => {
      const { calls, app, request } = run(diagramType, "user-stated");
      const result = await app.generateDiagram!(request);
      expect(result.status).toBe("success");
      expect(calls).toHaveLength(2);
      const generated = JSON.parse(calls[0]!.messages[1]!.content).snapshot;
      expect(generated.relationships).toEqual([]);
      expect(generated.knowledge.provenance.every((entry: { recordKey: string }) => JSON.parse(entry.recordKey)[0] === "systems")).toBe(true);
      const reviewed = JSON.parse(calls[1]!.messages[1]!.content).snapshot;
      expect(reviewed.knowledge).toEqual(generated.knowledge);
      if (result.status === "success") expect(JSON.parse(result.groundingReport).facts[0].evidenceClass).toBe("user-stated");
    });

    it(`${diagramType}: rejected plan and cancelled input keep one and zero calls`, async () => {
      const bad = run(diagramType, "invalid");
      expect((await bad.app.generateDiagram!(bad.request)).status).toBe("failed");
      expect(bad.calls).toHaveLength(1);
      const cancelled = run(diagramType);
      expect((await cancelled.app.generateDiagram!({ ...cancelled.request, signal: { aborted: true } })).status).toBe("failed");
      expect(cancelled.calls).toHaveLength(0);
    });
  }

  it("Sequence and Component project the same common knowledge for the same flow", async () => {
    const sequence = run("sequence"), component = run("component");
    await sequence.app.generateDiagram!(sequence.request);
    await component.app.generateDiagram!(component.request);
    expect(JSON.parse(sequence.calls[0]!.messages[1]!.content).snapshot.knowledge)
      .toEqual(JSON.parse(component.calls[0]!.messages[1]!.content).snapshot.knowledge);
  });

  it.each(["sequence", "component"] as const)("%s keeps a valid larger pack within existing prompt limits", async (diagramType) => {
    const folder = path.join(root, `large-${diagramType}`);
    mkdirSync(folder);
    const large = buildPackFiles({ actors: [], aliases: [], rules: [], relationships: Array.from({ length: 8 }, (_, index) =>
      ["telescope-scheduler", "image-archive", "DB", `Writer ${index}`, "synchronous", "p".repeat(2000)]) });
    for (const [file, text] of Object.entries(large)) writeFileSync(path.join(folder, file), text);
    const app = run(diagramType);
    const result = await app.app.generateDiagram!({ ...app.request, knowledgePack: { kind: "local-directory", path: folder } });
    expect(result.status, JSON.stringify(result)).toBe("success");
    expect(app.calls).toHaveLength(2);
    const generated = JSON.parse(app.calls[0]!.messages[1]!.content);
    expect(generated.snapshot.relationships).toHaveLength(8);
    expect(JSON.stringify(generated.snapshot.knowledge)).not.toContain("p".repeat(2000));
    expect(app.calls[0]!.messages[1]!.content.length).toBeLessThanOrEqual(65536);
  });

  it("Component snapshot does not duplicate sixteen maximum-length relationship purposes", async () => {
    const large = await loadKnowledgePack(new KnowledgePackSourceDouble(buildPackFiles({ actors: [], aliases: [], rules: [],
      relationships: Array.from({ length: 16 }, (_, index) => ["telescope-scheduler", "image-archive", "DB", `Writer ${index}`, "synchronous", "p".repeat(2000)]) })));
    if (!large.ok) throw new Error("Large valid pack must load");
    const parsed = parseFlowDocument(flow.text);
    if (!parsed.ok) throw new Error("Synthetic flow must parse");
    const grounded = buildGroundedContext({ flow: parsed.flow, knowledgePack: large });
    if (grounded.status !== "grounded") throw new Error("Synthetic flow must ground");
    const snapshot = buildComponentSnapshot(grounded.context, parsed.flow, knowledgeSnapshotFromPack(large.pack));
    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(65536);
    expect(snapshot.relationships).toHaveLength(16);
    expect(JSON.stringify(snapshot.knowledge)).not.toContain("p".repeat(2000));
  });
});
