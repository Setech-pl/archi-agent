import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import type { StructuredChatClient, StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
import { diagramEnvelopeSchema, envelopeTooLarge, renderedDocumentFailure } from "../../src/core/pipeline/generate-diagram.js";
import { sequenceReviewResponseSchema } from "../../src/core/pipeline/sequence-diagram-plan.js";
import { buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";
import { OpenAiCompatibleServerDouble } from "../doubles/openai-compatible-server-double.js";

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-d12-")));
const packPath = path.join(root, "architecture");
mkdirSync(packPath);
for (const [name, content] of Object.entries(buildPackFiles())) writeFileSync(path.join(packPath, name), content);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const flow = { kind: "document", text: "---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler registers frames in Image Archive.\n" } as const;
const generator = { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "test-model" } as const;
const request = { diagramType: "sequence", flow, knowledgePack: { kind: "local-directory", path: packPath }, generator } as const;
const message = { factId: "m1", fromId: "telescope-scheduler", toId: "image-archive", kind: "request", requestFactId: null,
  label: "Registers frames", evidenceClass: "source-confirmed", evidenceId: "relationship:1", flowEvidenceId: null, proposed: null };
const plan = { planVersion: 1, participantIds: ["telescope-scheduler", "image-archive"], messages: [message] };
const accepted = { verdict: "accept", violations: [], confirmations: [] };
const rejected = { verdict: "reject", violations: [{ code: "coverage-gap", diagramLine: 4, factId: "m1", evidenceIds: ["relationship:1"], explanation: "Missing step" }], confirmations: [] };
const golden = '@startuml\nparticipant "Telescope Scheduler" as kp_telescope_scheduler\ndatabase "Image Archive" as kp_image_archive\nkp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)\n@enduml\n';

function runtime(generatorAnswer: unknown = plan, reviewerAnswer: unknown = accepted) {
  const calls: StructuredChatRequest[] = [];
  const client: StructuredChatClient = { clientType: "openai-compatible-local", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
    async complete(chat) { calls.push(chat); return { source: "content", value: (calls.length === 1 ? generatorAnswer : reviewerAnswer) as Record<string, unknown> }; } };
  return { calls, app: createArchiAgentRuntime({ diagramClientFactory: () => client }) };
}

describe("D1.2 deterministic reviewed sequence", () => {
  it("uses strict plan and verdict wire schemas without model-authored PlantUML", () => {
    const visit = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema["type"] === "object") {
        expect(schema["additionalProperties"]).toBe(false);
        expect([...(schema["required"] as string[])].sort()).toEqual(Object.keys(schema["properties"] as object).sort());
      }
      for (const child of Object.values(schema)) visit(child);
    };
    visit(diagramEnvelopeSchema);
    visit(sequenceReviewResponseSchema);
    expect(JSON.stringify(diagramEnvelopeSchema)).not.toContain("plantUml");
    expect(Object.keys(diagramEnvelopeSchema["properties"] as object)).toEqual(["planVersion", "participantIds", "messages"]);
    expect(envelopeTooLarge({ value: BigInt(1) })).toBe(true);
  });

  it("renders the exact golden, keeps one snapshot and records physical evidence", async () => {
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plantUml).toBe(golden);
    const report = JSON.parse(result.groundingReport);
    expect(report).toMatchObject({ reportSchemaVersion: 2, generationPath: "reviewed-plan-rendered", attemptCount: 2,
      facts: [{ factId: "m1", lineNumber: 4, evidenceId: "relationship:1", evidenceClass: "source-confirmed", interfaceType: "DB", interfaceName: "Archive Writer" }] });
    expect(report.facts[0].source).toMatchObject({ file: "relationships.md", line: expect.any(Number) });
    expect(calls.map((call) => call.schemaName)).toEqual(["reviewed_sequence_plan", "reviewed_sequence_verdict"]);
    const generated = JSON.parse(calls[0]!.messages[1]!.content);
    const reviewed = JSON.parse(calls[1]!.messages[1]!.content);
    expect(generated.snapshot).toEqual(reviewed.snapshot);
    expect(generated.snapshot.digest).toBe(result.digest);
    expect(reviewed.plan).toEqual(plan);
    expect(reviewed.plantUml).toBe(golden);
    expect(reviewed.factLines).toEqual({ m1: 4 });
    expect(result.groundingReport).not.toContain(flow.text);
  });

  it.each([
    [null, 0],
    [{ ...plan, messages: [{ ...message, evidenceId: "missing" }] }, 1],
    [{ ...plan, messages: [{ ...message, kind: "response", requestFactId: "missing" }] }, 1],
    [plan, 2]
  ])("obeys call policy for plan outcome %s", async (answer, count) => {
    const { app, calls } = runtime(answer ?? plan);
    const actual = answer === null ? await app.generateDiagram!({ ...request, signal: { aborted: true } }) : await app.generateDiagram!({ ...request });
    expect(calls).toHaveLength(count);
    expect(actual.status).toBe(count === 2 ? "success" : "failed");
  });

  it("rejects invalid plans before review and malformed verdicts after two calls", async () => {
    const bad = runtime({ ...plan, messages: [{ ...message, proposed: { interfaceType: "DB", interfaceName: null, mode: "synchronous" } }] });
    expect((await bad.app.generateDiagram!({ ...request })).status).toBe("failed");
    expect(bad.calls).toHaveLength(1);
    for (const verdict of [{ verdict: "accept", violations: [], confirmations: [{ factId: "m1", flowEvidenceId: "flow:7" }] },
      { verdict: "reject", violations: [], confirmations: [] }, { ...accepted, extra: true }]) {
      const run = runtime(plan, verdict);
      expect((await run.app.generateDiagram!({ ...request })).status).toBe("failed");
      expect(run.calls).toHaveLength(2);
    }
    const run = runtime(plan, rejected);
    expect((await run.app.generateDiagram!({ ...request })).status).toBe("failed");
    expect(run.calls).toHaveLength(2);
  });

  it("reports the reproduced invalid request fact as a plan error before rendering or review", async () => {
    const reproduced = { ...plan, messages: [{ ...message, requestFactId: "m1" }] };
    const { app, calls } = runtime(reproduced);
    const result = await app.generateDiagram!({ ...request });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed",
      issues: [{ code: "diagram-plan-invalid", details: { rule: "interaction-mode-mismatch" } }] });
    expect(JSON.stringify(result)).not.toContain("plantuml-structure");
  });

  it("retains the document validator's safe rule and physical line for an actual violation", () => {
    const malformed = '@startuml\nparticipant "A" as kp_a\n!includeurl https://example.test/x\n@enduml\n';
    expect(renderedDocumentFailure(malformed)).toMatchObject({
      status: "render-validation-failed",
      issues: [{ code: "plantuml-structure", details: { line: 3, rule: "forbidden-directive" } }],
      structureIssues: [{ rule: "forbidden-directive", line: 3 }, { rule: "remote-url", line: 3 }]
    });
    expect(renderedDocumentFailure(golden)).toBeUndefined();
  });

  it("counts generator timeout, cancellation between phases and reviewer timeout/cancellation", async () => {
    for (const [failAt, expectedCalls, aborted] of [[1, 1, false], [2, 2, false], [1, 1, true], [2, 2, true]] as const) {
      const calls: StructuredChatRequest[] = [];
      const signal = { aborted: false };
      const client: StructuredChatClient = { clientType: "openai-compatible-local", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
        async complete(chat) {
          calls.push(chat);
          if (calls.length === failAt) {
            if (aborted) signal.aborted = true;
            throw Object.assign(new Error("synthetic secret and provider text"), { code: "timeout" });
          }
          return { source: "content", value: plan };
        } };
      const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
      const result = await app.generateDiagram!({ ...request, signal });
      expect(result.status).toBe("failed");
      expect(calls).toHaveLength(expectedCalls);
      expect(JSON.stringify(result)).not.toContain("synthetic secret");
    }
    const calls: StructuredChatRequest[] = [];
    const signal = { aborted: false };
    const client: StructuredChatClient = { clientType: "openai-compatible-local", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete(chat) { calls.push(chat); signal.aborted = true; return { source: "content", value: plan }; } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    expect((await app.generateDiagram!({ ...request, signal })).status).toBe("failed");
    expect(calls).toHaveLength(1);
  });

  it("keeps secrets out of both cloud request bodies and all artifacts", async () => {
    for (const [profileId, endpoint, response] of [
      ["cloud-anthropic", "anthropic-messages", (content: string) => JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] })],
      ["cloud-openai", "openai-chat-completions", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })],
      ["cloud-openrouter", "openrouter-chat-completions", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })]
    ] as const) {
      const secret = "synthetic-secret";
      const transport = new RemoteJsonTransportDouble(response(JSON.stringify(plan)), response(JSON.stringify(accepted)));
      const app = createArchiAgentRuntime({ remoteTransport: transport });
      const result = await app.generateDiagram!({ ...request, generator: { kind: "remote-provider", profileId, modelId: "test-model", credential: { type: "api-key", value: secret } } });
      expect(result.status).toBe("success");
      if (result.status === "success") expect(JSON.parse(result.groundingReport)).toMatchObject({ generator: { providerProfileId: profileId, modelId: "test-model", attemptCount: 1 }, reviewer: { providerProfileId: profileId, modelId: "test-model", attemptCount: 1 } });
      expect(transport.requests.map((sent) => sent.endpoint)).toEqual([endpoint, endpoint]);
      for (const sent of transport.requests) expect(sent.body).not.toContain(secret);
      expect(JSON.stringify(result)).not.toContain(secret);
      const bodies = transport.requests.map((sent) => JSON.parse(sent.body ?? "{}"));
      const schemas = bodies.map((body) => profileId === "cloud-anthropic" ? body.output_config.format.schema : body.response_format.json_schema.schema);
      if (profileId !== "cloud-anthropic") {
        expect(bodies.map((body) => body.response_format.json_schema.name)).toEqual(["reviewed_sequence_plan", "reviewed_sequence_verdict"]);
        expect(bodies.every((body) => body.response_format.json_schema.strict === true)).toBe(true);
      } else expect(bodies.every((body) => body.output_config.format.type === "json_schema")).toBe(true);
      expect(JSON.stringify(schemas[0])).not.toContain("plantUml");
      expect(JSON.stringify(schemas[1])).toContain("flowEvidenceId");
      for (const schema of schemas) {
        const visit = (node: unknown): void => {
          if (node === null || typeof node !== "object") return;
          const record = node as Record<string, unknown>;
          if (record["type"] === "object") {
            expect(record["additionalProperties"]).toBe(false);
            expect([...(record["required"] as string[])].sort()).toEqual(Object.keys(record["properties"] as object).sort());
          }
          for (const child of Object.values(record)) visit(child);
        };
        visit(schema);
      }
    }
  });

  it.each(["local-lm-studio", "local-ollama"])("uses exactly two %s POSTs", async (profileId) => {
    const server = await OpenAiCompatibleServerDouble.start({ completionContents: [JSON.stringify(plan), JSON.stringify(accepted)] });
    try {
      const app = createArchiAgentRuntime();
      const result = await app.generateDiagram!({ ...request, generator: { kind: "openai-compatible-local", profileId, modelId: "test-model", baseUrl: server.baseUrl } });
      expect(result.status).toBe("success");
      if (result.status === "success") expect(JSON.parse(result.groundingReport).generator.providerProfileId).toBe(profileId);
      expect(server.completionRequests().map((sent) => [sent.method, sent.path])).toEqual([["POST", "/v1/chat/completions"], ["POST", "/v1/chat/completions"]]);
    } finally { await server.close(); }
  });
});
