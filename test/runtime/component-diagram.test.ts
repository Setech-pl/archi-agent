import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import type { StructuredChatClient, StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
import { buildPackFiles } from "../doubles/knowledge-pack-fixture.js";

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-d2-")));
const packPath = path.join(root, "architecture");
mkdirSync(packPath);
for (const [name, content] of Object.entries(buildPackFiles())) writeFileSync(path.join(packPath, name), content);
afterAll(() => rmSync(root, { recursive: true, force: true }));
const flow = { kind: "document", text: "---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends events to Dome Controller and stores frames in Image Archive.\n" } as const;
const request = { diagramType: "component", flow, knowledgePack: { kind: "local-directory", path: packPath },
  generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "test-model" } } as const;

function runtime(answer?: unknown, verdict: unknown = { accepted: true, confirmedUserStatedFactIds: [], violations: [] }) {
  const calls: StructuredChatRequest[] = [];
  const client: StructuredChatClient = { clientType: "openai-compatible-local",
    generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
    async complete(chat) {
      calls.push(chat);
      const first = JSON.parse(chat.messages[1]!.content);
      return { source: "content", value: (calls.length === 1 ? answer ?? { version: 1,
        elementIds: first.snapshot.elements.map((item: { id: string }) => item.id),
        groundedDependencies: first.relationshipCatalog.map((item: { dependencyId: string }) => item.dependencyId),
        userStatedDependencies: [] } : verdict) as Record<string, unknown> };
    } };
  return { calls, app: createArchiAgentRuntime({ diagramClientFactory: () => client }) };
}

describe("D2 reviewed component runtime", () => {
  it("uses exactly two calls, one D2 digest and report v2 with physical fact lines", async () => {
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    expect(calls.map((call) => call.schemaName)).toEqual(["reviewed_component_plan", "reviewed_component_verdict"]);
    if (result.status !== "success") return;
    const generated = JSON.parse(calls[0]!.messages[1]!.content);
    const reviewed = JSON.parse(calls[1]!.messages[1]!.content);
    const report = JSON.parse(result.groundingReport);
    expect(generated.snapshot).toEqual(reviewed.snapshot);
    expect(generated.snapshot.digest).toBe(result.digest);
    expect(report).toMatchObject({ reportSchemaVersion: 2, diagramType: "component", generationPath: "reviewed-plan-rendered",
      attemptCount: 2, snapshotDigest: { value: result.digest } });
    expect(report.facts).toHaveLength(2);
    expect(report.facts.every((fact: { evidenceClass: string }) => fact.evidenceClass === "source-confirmed")).toBe(true);
    expect(report.facts.every((fact: { lineNumber: number; source: { file: string; line: number } }) => fact.lineNumber > 1 &&
      fact.source.file === "relationships.md" && fact.source.line > 0)).toBe(true);
    expect(result.plantUml).toContain('component "Telescope Scheduler"');
    expect(result.plantUml).toContain('database "Image Archive"');
    expect(result.plantUml).toContain("EVENT (asynchronous)");
    expect(result.plantUml.endsWith("@enduml\n")).toBe(true);
    expect(result.groundingReport).not.toContain(flow.text);
  });

  it("rejects invalid plans after one call and offers no candidate", async () => {
    const { app, calls } = runtime({ version: 1, elementIds: ["telescope-scheduler", "image-archive"],
      groundedDependencies: ["relationship-9999"], userStatedDependencies: [] });
    expect((await app.generateDiagram!({ ...request })).status).toBe("failed");
    expect(calls).toHaveLength(1);
  });

  it("offers only a warning marked candidate after reviewer rejection", async () => {
    const { app, calls } = runtime(undefined, { accepted: false, confirmedUserStatedFactIds: [],
      violations: [{ code: "missing-component", factId: null }] });
    const lines: string[] = [];
    const result = await app.generateDiagram!({ ...request, diagnosticSink: (line) => lines.push(line) });
    expect(result.status).toBe("unverified");
    expect(calls).toHaveLength(2);
    if (result.status === "unverified") expect(result.review).toEqual({ status: "rejected", violationCodes: ["missing-component"] });
    expect(lines.map((line) => JSON.parse(line).event)).toContain("reviewer.rejected");
    expect(JSON.parse(lines.at(-1)!).totalModelCalls).toBe(2);
  });

  it("keeps the original multiline task for the reviewer", async () => {
    const { app, calls } = runtime();
    const text = flow.text.replace("Image Archive.\n", "Image Archive.\nExclude deployment timing.\n");
    expect((await app.generateDiagram!({ ...request, flow: { kind: "document", text } })).status).toBe("success");
    expect(JSON.parse(calls[0]!.messages[1]!.content).task.description).toContain("Exclude deployment timing.");
    expect(JSON.parse(calls[1]!.messages[1]!.content).task.description).toContain("Exclude deployment timing.");
    expect(JSON.parse(calls[0]!.messages[1]!.content).snapshot.flowEvidence).toHaveLength(2);
    const changed = runtime();
    const updated = text.replace("Exclude deployment timing.", "Include deployment timing.");
    expect((await changed.app.generateDiagram!({ ...request, flow: { kind: "document", text: updated } })).status).toBe("success");
    expect(JSON.parse(calls[0]!.messages[1]!.content).snapshot.digest).not.toBe(JSON.parse(changed.calls[0]!.messages[1]!.content).snapshot.digest);
  });

  it("performs zero calls after cancellation or a missing component slice", async () => {
    const cancelled = runtime();
    expect((await cancelled.app.generateDiagram!({ ...request, signal: { aborted: true } })).status).toBe("failed");
    expect(cancelled.calls).toHaveLength(0);
    const empty = runtime();
    const result = await empty.app.generateDiagram!({ ...request, flow: { kind: "document", text: flow.text.replace(/Telescope Scheduler sends events[^\n]*/, "Telescope Scheduler schedules observations.") } });
    expect(result.status).toBe("failed");
    expect(empty.calls).toHaveLength(0);
  });

  it("does not call the reviewer after cancellation following generation", async () => {
    const signal = { aborted: false };
    const calls: StructuredChatRequest[] = [];
    const client: StructuredChatClient = { clientType: "openai-compatible-local",
      generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete(chat) {
        calls.push(chat);
        const input = JSON.parse(chat.messages[1]!.content);
        signal.aborted = true;
        return { source: "content", value: { version: 1, elementIds: input.snapshot.elements.map((item: { id: string }) => item.id),
          groundedDependencies: input.relationshipCatalog.map((item: { dependencyId: string }) => item.dependencyId), userStatedDependencies: [] } };
      } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    expect((await app.generateDiagram!({ ...request, signal })).status).toBe("failed");
    expect(calls).toHaveLength(1);
  });

  it("keeps a locally valid candidate on malformed reviewer output", async () => {
    const { app, calls } = runtime(undefined, { accepted: true, confirmedUserStatedFactIds: ["fact-9999"], violations: [] });
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("unverified");
    if (result.status === "unverified") expect(result.review).toEqual({ status: "failed", problemCode: "invalid-verdict" });
    expect(calls).toHaveLength(2);
  });

  it("records external and actor provenance in report v2", async () => {
    const externalPack = path.join(root, "external-architecture");
    mkdirSync(externalPack);
    const files = buildPackFiles({ systems: [["external-service", "External Service", "external", "Offers partner data"]],
      actors: [["partner", "Partner", "external", "Requests partner data"]],
      relationships: [["partner", "external-service", "REST_API", "Partner API", "synchronous", "Reads data"]],
      aliases: [], rules: [] });
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(externalPack, name), content);
    const { app } = runtime();
    const result = await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: externalPack },
      flow: { kind: "document", text: flow.text.replace(/Telescope Scheduler sends events[^\n]*/, "Partner reads data from External Service.") } });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const report = JSON.parse(result.groundingReport);
    expect(report.sources.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "partner", elementKind: "external", ownership: "external", evidenceClass: "source-confirmed" }),
      expect.objectContaining({ id: "external-service", elementKind: "external", ownership: "external", evidenceClass: "source-confirmed" })
    ]));
    expect(result.plantUml).toContain('actor "Partner"');
    expect(result.plantUml).toContain('component "External Service"');
  });
});
