import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createArchiAgentRuntime, type GenerateDiagramRequest, type DiagramArtifact } from "../../src/runtime/index.js";
import type { StructuredChatClient } from "../../src/core/llm/structured-chat-client.js";
import { buildPackFiles } from "./knowledge-pack-fixture.js";
export async function art1Fixture(type: "sequence" | "component" = "sequence", modelId = "test-model") {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "art1-test-")));
  const pack = path.join(root, "architecture"); await mkdir(pack);
  for (const [name, content] of Object.entries(buildPackFiles())) await writeFile(path.join(pack, name), content);
  let calls = 0;
  const client: StructuredChatClient = { clientType: "openai-compatible-local",
    generationMetadata: { modelId, temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
    async complete(chat) {
      calls++;
      const input = JSON.parse(chat.messages[1]!.content);
      const value = chat.schemaName.includes("verdict") ? { accepted: true, confirmedUserStatedFactIds: [], violations: [] } :
        chat.schemaName.includes("component") ? { version: 1, elementIds: input.snapshot.elements.map((e: any) => e.id),
          groundedDependencies: input.relationshipCatalog.map((e: any) => e.dependencyId), userStatedDependencies: [] } :
          { version: 3, groundedSteps: [{ order: 1, operationId: "op-0001", label: "Zażółć gęślą jaźń" }], userStatedSteps: [] };
      return { source: "content", value };
    } };
  const app = createArchiAgentRuntime({ diagramClientFactory: () => client, extensionVersion: "0.3.0-alpha.4" });
  const request: GenerateDiagramRequest = { diagramType: type,
    flow: { kind: "document", text: "---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends events to Dome Controller and stores frames in Image Archive.\n" },
    knowledgePack: { kind: "local-directory", path: pack },
    generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId, credential: { type: "api-key", value: "SECRET_MARKER" } } as any };
  const result = await app.generateDiagram!(request);
  if (result.status !== "success" || !result.artifact) throw new Error(`fixture-generation-${JSON.stringify(result)}`);
  return { root, pack, app, request, result, artifact: result.artifact as DiagramArtifact, calls: () => calls };
}
