import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import type { StructuredChatClient, StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
import { diagramEnvelopeSchema, envelopeTooLarge, renderedDocumentFailure } from "../../src/core/pipeline/generate-diagram.js";
import { sequenceReviewResponseSchema } from "../../src/core/pipeline/sequence-diagram-plan.js";
import { diagnosticLineLimit } from "../../src/core/pipeline/diagnostics.js";
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
const step = { order: 1, operationId: "op-0001", label: "Registers frames" };
const plan = { version: 3, groundedSteps: [step], userStatedSteps: [] };
const accepted = { accepted: true, confirmedUserStatedFactIds: [], violations: [] };
const rejected = { accepted: false, confirmedUserStatedFactIds: [], violations: [{ code: "candidate-semantics-invalid", factId: "fact-0001" }] };
const golden = '@startuml\nparticipant "Telescope Scheduler" as kp_telescope_scheduler\ndatabase "Image Archive" as kp_image_archive\nkp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)\n@enduml\n';

function assertProviderSchemas(schemas: readonly Record<string, any>[], projection: "local" | "anthropic" | "openai"): void {
  expect(schemas).toHaveLength(2);
  const generator = schemas[0]!;
  const reviewer = schemas[1]!;
  const strictObjects = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record["type"] === "object") {
      expect(record["additionalProperties"]).toBe(false);
      expect([...(record["required"] as string[])].sort()).toEqual(Object.keys(record["properties"] as object).sort());
    }
    for (const child of Object.values(record)) strictObjects(child);
  };
  schemas.forEach(strictObjects);
  const objectFields = (node: any, keys: string[]): void => {
    expect(node.type).toBe("object");
    expect(node.additionalProperties).toBe(false);
    expect(Object.keys(node.properties).sort()).toEqual([...keys].sort());
    expect([...node.required].sort()).toEqual([...keys].sort());
  };
  const nullable = (node: any, type: "string" | "integer", values?: string[]): void => {
    expect(node.anyOf).toHaveLength(2);
    expect(node.anyOf).toContainEqual({ type: "null" });
    const branch = node.anyOf.find((part: any) => part.type !== "null");
    expect(branch.type).toBe(type);
    if (values !== undefined) expect(branch.enum).toEqual(values);
    else expect(branch).not.toHaveProperty("enum");
  };
  const groundedKeys = ["order", "operationId", "label"];
  const userKeys = ["order", "fromId", "toId", "interactionKind", "interfaceType", "interfaceName", "flowEvidenceId", "label"];
  objectFields(generator, ["version", "groundedSteps", "userStatedSteps"]);
  expect(generator.properties.version).toMatchObject(projection === "openai" ? { enum: [3] } : { const: 3 });
  expect(generator.properties.version.type).toBe("number");
  const grounded = generator.properties.groundedSteps.items;
  const user = generator.properties.userStatedSteps.items;
  expect(generator.properties.groundedSteps.type).toBe("array");
  expect(generator.properties.userStatedSteps.type).toBe("array");
  objectFields(grounded, groundedKeys);
  objectFields(user, userKeys);
  expect(grounded.properties.order.type).toBe("integer");
  expect(user.properties.order.type).toBe("integer");
  expect(grounded.properties.operationId.type).toBe("string");
  expect(grounded.properties.label.type).toBe("string");
  expect(user.properties.interactionKind.enum).toEqual(["request", "asynchronous"]);
  expect(user.properties.interfaceType.enum).toEqual(["REST API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"]);
  nullable(user.properties.interfaceName, "string");
  for (const key of ["stepType", "factId", "requestFactId", "mode", "evidenceClass", "relationshipEvidenceId"])
    expect(JSON.stringify(generator)).not.toContain(`"${key}"`);
  expect(Object.keys(reviewer.properties)).toEqual(["accepted", "confirmedUserStatedFactIds", "violations"]);
  objectFields(reviewer, ["accepted", "confirmedUserStatedFactIds", "violations"]);
  expect(reviewer.required).toEqual(["accepted", "confirmedUserStatedFactIds", "violations"]);
  expect(reviewer.properties.accepted.type).toBe("boolean");
  expect(reviewer.properties.violations.type).toBe("array");
  expect(reviewer.properties.confirmedUserStatedFactIds.type).toBe("array");
  const violation = reviewer.properties.violations.items;
  objectFields(violation, ["code", "factId"]);
  expect(Object.keys(reviewer.properties.violations.items.properties)).toEqual(["code", "factId"]);
  expect(reviewer.properties.violations.items.properties.code.enum).toEqual(["unsupported-user-stated-evidence", "sequence-inconsistency", "participant-inconsistency", "candidate-semantics-invalid"]);
  expect(violation.properties.code.type).toBe("string");
  nullable(violation.properties.factId, "string");
  expect(reviewer.properties.confirmedUserStatedFactIds.items.type).toBe("string");
  expect(reviewer.properties.violations.items.properties.factId.anyOf).toContainEqual({ type: "null" });
  for (const field of ["reason", "message", "description", "details", "explanation", "flowEvidenceId", "diagramLine"])
    expect(JSON.stringify(reviewer)).not.toContain(`"${field}"`);
  if (projection === "local") {
    expect(generator.properties.groundedSteps).toMatchObject({ maxItems: 512 });
    expect(generator.properties.userStatedSteps).toMatchObject({ maxItems: 512 });
    expect(grounded.properties.order).toMatchObject({ minimum: 1, maximum: 512 });
    expect(user.properties.order).toMatchObject({ minimum: 1, maximum: 512 });
    expect(grounded.properties.label).toMatchObject({ minLength: 1, maxLength: 320 });
    expect(user.properties.label).toMatchObject({ minLength: 1, maxLength: 320 });
    expect(grounded.properties.operationId).toMatchObject({ minLength: 1, maxLength: 128 });
    for (const key of ["fromId", "toId", "flowEvidenceId"])
      expect(user.properties[key]).toMatchObject({ minLength: 1, maxLength: 128 });
    expect(user.properties.interfaceName.anyOf[0]).toMatchObject({ maxLength: 160 });
    expect(reviewer.properties.violations).toMatchObject({ maxItems: 32 });
    expect(reviewer.properties.confirmedUserStatedFactIds).toMatchObject({ maxItems: 512 });
    expect(reviewer.properties.confirmedUserStatedFactIds.items).toMatchObject({ maxLength: 9 });
    expect(violation.properties.factId.anyOf[0]).toMatchObject({ maxLength: 9 });
  } else if (projection === "anthropic") {
    expect(generator.properties.groundedSteps.type).toBe("array");
    for (const schema of schemas) {
      const serialized = JSON.stringify(schema);
      for (const keyword of ["maxItems", "minLength", "maxLength", "minimum", "maximum"])
        expect(serialized).not.toContain(`"${keyword}"`);
    }
  } else {
    for (const schema of schemas) {
      const serialized = JSON.stringify(schema);
      for (const keyword of ["minItems", "maxItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "format"])
        expect(serialized).not.toContain(`"${keyword}"`);
    }
  }
}

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
    expect(Object.keys(diagramEnvelopeSchema["properties"] as object)).toEqual(["version", "groundedSteps", "userStatedSteps"]);
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
      facts: [{ factId: "fact-0001", operationId: "op-0001", lineNumber: 4, evidenceId: "relationship:1", evidenceClass: "source-confirmed", interfaceType: "DB", interfaceName: "Archive Writer" }] });
    expect(report.facts[0].source).toMatchObject({ file: "relationships.md", line: expect.any(Number) });
    expect(calls.map((call) => call.schemaName)).toEqual(["reviewed_sequence_plan", "reviewed_sequence_verdict"]);
    const generated = JSON.parse(calls[0]!.messages[1]!.content);
    const reviewed = JSON.parse(calls[1]!.messages[1]!.content);
    expect(generated.snapshot).toEqual(reviewed.snapshot);
    expect(generated.snapshot.digest).toBe(result.digest);
    expect(reviewed.plan).toMatchObject({ version: 3, snapshotDigest: result.digest, participantIds: ["telescope-scheduler", "image-archive"],
      facts: [{ factId: "fact-0001", operationId: "op-0001", label: "Registers frames" }] });
    expect(reviewed.plantUml).toBe(golden);
    expect(reviewed.factLines).toEqual({ "fact-0001": 4 });
    expect(result.groundingReport).not.toContain(flow.text);
  });

  it("runs the S1-shaped four-participant fixture with two grounded and one user-stated step", async () => {
    const fixturePath = path.join(root, "s1-architecture");
    mkdirSync(fixturePath, { recursive: true });
    const files = buildPackFiles({
      actors: [["requester", "Requester", "role", "Starts work"]],
      systems: [["work-service", "Work Service", "service", "Processes work"],
        ["audit-store", "Audit Store", "database", "Stores records"],
        ["notification-hub", "Notification Hub", "queue", "Receives events"]],
      relationships: [["requester", "work-service", "REST_API", "Submit Work", "synchronous", "Submits work"],
        ["work-service", "audit-store", "DB", "Record Writer", "synchronous", "Writes records"]],
      aliases: [], rules: []
    });
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(fixturePath, name), content);
    const calls: StructuredChatRequest[] = [];
    let flowEvidenceId = "";
    const client: StructuredChatClient = { clientType: "openai-compatible-local",
      generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete(chat) {
        calls.push(chat);
        if (calls.length === 1) {
          const input = JSON.parse(chat.messages[1]!.content);
          const operations = input.operationCatalog as { operationId: string; fromId: string; toId: string; kind: string }[];
          flowEvidenceId = input.snapshot.flowEvidence.at(-1).flowEvidenceId;
          const operationId = (fromId: string, toId: string) => operations.find((entry) =>
            entry.fromId === fromId && entry.toId === toId && entry.kind === "request")!.operationId;
          return { source: "content", value: { version: 3, groundedSteps: [
            { order: 1, operationId: operationId("requester", "work-service"), label: "Submit work" },
            { order: 2, operationId: operationId("work-service", "audit-store"), label: "Write record" }],
          userStatedSteps: [{ order: 3, fromId: "audit-store", toId: "notification-hub", interactionKind: "asynchronous",
            interfaceType: "EVENT", interfaceName: "Record Ready", flowEvidenceId, label: "Record ready" }] } };
        }
        return { source: "content", value: { accepted: true, violations: [], confirmedUserStatedFactIds: ["fact-0003"] } };
      } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    const result = await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: fixturePath },
      flow: { kind: "document", text: "---\ndiagram_name: work-flow\nflow_name: Work flow\nauthor: Test\nlanguage: en\n---\nRequester submits work to Work Service.\nWork Service writes to Audit Store.\nAudit Store publishes Record Ready to Notification Hub.\n" } });
    expect(result.status).toBe("success");
    expect(calls).toHaveLength(2);
    if (result.status !== "success") return;
    expect(result.plantUml).toBe('@startuml\nactor "Requester" as kp_requester\nparticipant "Work Service" as kp_work_service\ndatabase "Audit Store" as kp_audit_store\nqueue "Notification Hub" as kp_notification_hub\nkp_requester -> kp_work_service : Submit work (REST API: Submit Work)\nkp_work_service -> kp_audit_store : Write record (DB: Record Writer)\nkp_audit_store ->> kp_notification_hub : Record ready (EVENT: Record Ready)\n@enduml\n');
    const report = JSON.parse(result.groundingReport);
    expect(report).toMatchObject({ reportSchemaVersion: 2, attemptCount: 2,
      facts: [{ evidenceClass: "source-confirmed" }, { evidenceClass: "source-confirmed" },
        { evidenceClass: "user-stated", flowEvidenceId }] });
    const generated = JSON.parse(calls[0]!.messages[1]!.content);
    const reviewed = JSON.parse(calls[1]!.messages[1]!.content);
    expect(generated.snapshot.digest).toBe(result.digest);
    expect(reviewed.snapshot.digest).toBe(result.digest);
    expect(reviewed.plan).toMatchObject({ version: 3, participantIds: ["requester", "work-service", "audit-store", "notification-hub"] });
  });

  it.each(["invalid", "valid"])("handles the locally validated 11-line S1 candidate with %s reviewer verdict", async (verdict) => {
    const fixturePath = path.join(root, `s1-review-${verdict}-pack`);
    mkdirSync(fixturePath);
    const files = buildPackFiles({ actors: [["requester", "Requester", "role", "Starts work"]], systems: [
      ["work-service", "Work Service", "service", "Processes work"],
      ["audit-store", "Audit Store", "database", "Stores records"],
      ["notification-hub", "Notification Hub", "queue", "Receives events"]],
    relationships: [
      ["requester", "work-service", "REST_API", "Submit Work", "synchronous", "Submits work"],
      ["work-service", "audit-store", "DB", "Record Writer", "synchronous", "Writes records"],
      ["work-service", "notification-hub", "EVENT", "Work Ready", "asynchronous", "Publishes completion"]],
    aliases: [], rules: [] });
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(fixturePath, name), content);
    const calls: StructuredChatRequest[] = [];
    const client: StructuredChatClient = { clientType: "openai-compatible-local", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete(chat) {
        calls.push(chat);
        if (calls.length === 2) return { source: "content", value: { accepted: true, violations: [],
          confirmedUserStatedFactIds: verdict === "invalid" ? ["fact-0001", "fact-0002", "fact-0005"] : ["fact-0005"] } };
        const input = JSON.parse(chat.messages[1]!.content);
        const catalog = input.operationCatalog as { operationId: string; fromId: string; toId: string; kind: string }[];
        const operationId = (fromId: string, toId: string, kind: string) => catalog.find((entry) =>
          entry.fromId === fromId && entry.toId === toId && entry.kind === kind)!.operationId;
        return { source: "content", value: { version: 3, groundedSteps: [
          { order: 1, operationId: operationId("requester", "work-service", "request"), label: "Submit work" },
          { order: 2, operationId: operationId("work-service", "audit-store", "request"), label: "Write record" },
          { order: 3, operationId: operationId("audit-store", "work-service", "response"), label: "Recorded" },
          { order: 4, operationId: operationId("work-service", "notification-hub", "asynchronous"), label: "Work ready" }],
          userStatedSteps: [{ order: 5, fromId: "audit-store", toId: "requester", interactionKind: "request",
            interfaceType: "EVENT", interfaceName: "Record Notice", flowEvidenceId: input.snapshot.flowEvidence[2].flowEvidenceId,
            label: "Notify requester" }] } };
      } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    const lines: string[] = [];
    const result = await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: fixturePath },
      flow: { kind: "document", text: "---\ndiagram_name: work-flow\nflow_name: Work flow\nauthor: Test\nlanguage: en\n---\nRequester submits work to Work Service.\nWork Service writes to Audit Store and publishes to Notification Hub.\nAudit Store notifies Requester of the record.\n" },
      diagnosticSink: (line) => lines.push(line) });
    expect(result.status).toBe(verdict === "invalid" ? "unverified" : "success");
    expect(calls).toHaveLength(2);
    if (verdict === "invalid") {
      expect(result).toMatchObject({ status: "unverified", review: { status: "failed", problemCode: "invalid-verdict" } });
      if (result.status !== "unverified") return;
      expect(result.plantUmlCandidate.split("\n")).toHaveLength(12);
      expect(result.plantUmlCandidate).toContain("kp_audit_store -> kp_requester : Notify requester");
      expect(result).not.toHaveProperty("groundingReport");
      expect(result).not.toHaveProperty("report");
    } else {
      expect(result.status).toBe("success");
      if (result.status !== "success") return;
      expect(result.plantUml.split("\n")).toHaveLength(12);
      expect(JSON.parse(result.groundingReport)).toMatchObject({ reportSchemaVersion: 2, semanticReview: { verdict: "accept" } });
    }
    const entries = lines.map((line) => JSON.parse(line));
    expect(entries.find((entry) => entry.event === "wire-plan.parsed")).toMatchObject({ groundedStepCount: 4, userStatedStepCount: 1, totalStepCount: 5 });
    expect(entries.find((entry) => entry.event === "renderer.completed")).toMatchObject({ participantCount: 4, messageCount: 5, lineCount: 11 });
    if (verdict === "invalid") {
      expect(entries.find((entry) => entry.event === "reviewer.failed")).toMatchObject({ code: "invalid-verdict",
        rule: "accepted-confirmations-mismatch", accepted: true, confirmationCount: 3, violationCount: 0 });
      expect(entries.at(-1)).toMatchObject({ event: "run.completed", status: "unverified", finalPhase: "reviewer", code: "invalid-verdict",
        generatorCalls: 1, reviewerCalls: 1, totalModelCalls: 2 });
      expect(entries.filter((entry) => entry.event === "artifacts.created")).toHaveLength(0);
      expect(lines.join("\n")).not.toMatch(/Submit work|Write record|Record Notice|Notify requester|@startuml|SENTINEL|architecture|\.md/u);
    } else expect(entries.filter((entry) => entry.event === "artifacts.created")).toHaveLength(1);
  });

  it("rejects the contradictory flat V2 owner-smoke step without repair or review", async () => {
    const old = { version: 2, steps: [{ stepType: "user-stated-interaction", operationId: "op-0001",
      label: "Submit work", fromId: null, toId: null, interactionKind: null, interfaceType: null,
      interfaceName: null, flowEvidenceId: null }] };
    const { app, calls } = runtime(old);
    expect(await app.generateDiagram!({ ...request })).toMatchObject({ status: "failed",
      issues: [{ code: "diagram-plan-invalid", details: { rule: "schema-violation" } }] });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [null, 0],
    [{ ...plan, groundedSteps: [{ ...step, operationId: "missing" }] }, 1],
    [{ ...plan, groundedSteps: [{ ...step, operationId: "op-0002" }] }, 1],
    [plan, 2]
  ])("obeys call policy for plan outcome %s", async (answer, count) => {
    const { app, calls } = runtime(answer ?? plan);
    const actual = answer === null ? await app.generateDiagram!({ ...request, signal: { aborted: true } }) : await app.generateDiagram!({ ...request });
    expect(calls).toHaveLength(count);
    expect(actual.status).toBe(count === 2 ? "success" : "failed");
  });

  it("rejects invalid plans before review and malformed verdicts after two calls", async () => {
    const bad = runtime({ ...plan, groundedSteps: [{ ...step, interfaceType: "DB" }] });
    expect((await bad.app.generateDiagram!({ ...request })).status).toBe("failed");
    expect(bad.calls).toHaveLength(1);
    for (const verdict of [{ ...accepted, confirmedUserStatedFactIds: ["fact-0001"] },
      { ...accepted, violations: rejected.violations },
      { ...rejected, confirmedUserStatedFactIds: ["fact-0001"] },
      { ...rejected, violations: [] },
      { ...rejected, violations: [{ code: "candidate-semantics-invalid", factId: "fact-9999" }] },
      { ...rejected, violations: [rejected.violations[0], rejected.violations[0]] },
      { ...rejected, violations: [{ code: "other", factId: null }] },
      { ...rejected, violations: Array.from({ length: 33 }, () => ({ code: "candidate-semantics-invalid", factId: null })) },
      { ...accepted, extra: true }, { accepted: true, violations: [] }, "{malformed-json"] ) {
      const run = runtime(plan, verdict);
      expect(await run.app.generateDiagram!({ ...request })).toMatchObject({ status: "unverified",
        review: { status: "failed", problemCode: "invalid-verdict" } });
      expect(run.calls).toHaveLength(2);
    }
    const run = runtime(plan, rejected);
    expect((await run.app.generateDiagram!({ ...request })).status).toBe("unverified");
    expect(run.calls).toHaveLength(2);
    expect(run.calls[1]?.maxTokens).toBe(8192);
    expect(run.calls[0]?.maxTokens).toBe(16384);
    expect(run.calls[1]?.messages[0]?.content).toContain("Return the verdict object only");
    expect(run.calls[1]?.messages[0]?.content).not.toContain("explanation");
  });

  it("reports redundant model fields as a plan error before rendering or review", async () => {
    const reproduced = { ...plan, groundedSteps: [{ ...step, requestFactId: "fact-0001" }] };
    const { app, calls } = runtime(reproduced);
    const result = await app.generateDiagram!({ ...request });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed",
      issues: [{ code: "diagram-plan-invalid", details: { rule: "schema-violation" } }] });
    expect(JSON.stringify(result)).not.toContain("plantuml-structure");
    const oversized = runtime({ raw: "x".repeat(512 * 1024 + 1) });
    expect(await oversized.app.generateDiagram!({ ...request })).toMatchObject({ status: "failed",
      issues: [{ code: "diagram-plan-invalid", details: { rule: "envelope-too-large" } }] });
    expect(oversized.calls).toHaveLength(1);
  });

  it("rejects reversed source evidence and unsafe labels before review without exposing model text", async () => {
    const reversed = { order: 2, label: "PRIVATE_FLOW_LABEL",
      fromId: "image-archive", toId: "telescope-scheduler", interactionKind: "request", interfaceType: "DB",
      interfaceName: "Archive Writer", flowEvidenceId: "flow:7" };
    for (const [answer, rule] of [
      [{ version: 3, groundedSteps: [step], userStatedSteps: [reversed] }, "interaction-direction-mismatch"],
      [{ version: 3, groundedSteps: [step], userStatedSteps: [{ ...reversed, interfaceName: null }] }, "interaction-direction-mismatch"],
      [{ version: 3, groundedSteps: [step], userStatedSteps: [{ ...reversed, interfaceName: "archive writer" }] }, "interaction-direction-mismatch"],
      [{ ...plan, groundedSteps: [{ ...step, label: 'Say "hello"' }] }, "label-invalid"],
      [{ ...plan, groundedSteps: [{ ...step, label: "path\\part" }] }, "label-invalid"]
    ] as const) {
      const lines: string[] = [];
      const { app, calls } = runtime(answer);
      const result = await app.generateDiagram!({ ...request, diagnosticSink: (line) => lines.push(line) });
      expect(calls).toHaveLength(1);
      expect(result).toMatchObject({ status: "failed", issues: [{ code: "diagram-plan-invalid", details: { rule } }] });
      expect(result).not.toHaveProperty("plantUml");
      expect(result).not.toHaveProperty("groundingReport");
      expect(JSON.stringify(result)).not.toContain("PRIVATE_FLOW_LABEL");
      expect(JSON.stringify(result)).not.toContain('Say "hello"');
      expect(JSON.stringify(result)).not.toContain("path\\part");
      expect(JSON.stringify(result)).not.toContain("user-stated");
      expect(lines.join("\n")).not.toContain("PRIVATE_FLOW_LABEL");
      expect(lines.join("\n")).not.toContain('Say "hello"');
      expect(lines.join("\n")).not.toContain("path\\part");
      expect(JSON.parse(lines.at(-1)!)).toMatchObject({ event: "run.completed", generatorCalls: 1, reviewerCalls: 0 });
      expect(lines.map((line) => JSON.parse(line))).toContainEqual(expect.objectContaining({
        event: "plan.rejected", rule, stepIndex: 0 }));
    }
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
      expect(result.status).toBe(failAt === 2 && !aborted ? "unverified" : "failed");
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
      expect(bodies[1][profileId === "cloud-openai" ? "max_completion_tokens" : "max_tokens"]).toBe(8192);
      const schemas = bodies.map((body) => profileId === "cloud-anthropic" ? body.output_config.format.schema : body.response_format.json_schema.schema);
      if (profileId !== "cloud-anthropic") {
        expect(bodies.map((body) => body.response_format.json_schema.name)).toEqual(["reviewed_sequence_plan", "reviewed_sequence_verdict"]);
        expect(bodies.every((body) => body.response_format.json_schema.strict === true)).toBe(true);
      } else expect(bodies.every((body) => body.output_config.format.type === "json_schema")).toBe(true);
      expect(JSON.stringify(schemas[0])).not.toContain("plantUml");
      expect(JSON.stringify(schemas[1])).not.toContain("flowEvidenceId");
      assertProviderSchemas(schemas, profileId === "cloud-anthropic" ? "anthropic" : "openai");
      for (const schema of schemas) {
        const visit = (node: unknown): void => {
          if (node === null || typeof node !== "object") return;
          const record = node as Record<string, unknown>;
          if (record["type"] === "object") {
            expect(record["additionalProperties"]).toBe(false);
            expect([...(record["required"] as string[])].sort()).toEqual(Object.keys(record["properties"] as object).sort());
          }
          if (profileId !== "cloud-anthropic") {
            for (const keyword of ["minItems", "maxItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "format"])
              expect(record).not.toHaveProperty(keyword);
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
      expect(server.requests).toHaveLength(2);
      const bodies = server.completionRequests().map((sent) => sent.body as { response_format: { type: string; json_schema: { strict: boolean; schema: Record<string, unknown> } } });
      expect((bodies[1] as unknown as { max_tokens: number }).max_tokens).toBe(8192);
      expect(bodies.every((body) => body.response_format.type === "json_schema" && body.response_format.json_schema.strict)).toBe(true);
      assertProviderSchemas(bodies.map((body) => body.response_format.json_schema.schema), "local");
    } finally { await server.close(); }
  });

  it("emits bounded, ordered safe verbose events only when a sink is passed", async () => {
    const lines: string[] = [];
    const { app } = runtime();
    expect((await app.generateDiagram!({ ...request })).status).toBe("success");
    expect(lines).toEqual([]);
    const verbose = runtime();
    expect((await verbose.app.generateDiagram!({ ...request, diagnosticSink: (line) => lines.push(line) })).status).toBe("success");
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.map((entry) => entry.event)).toEqual(["command.started", "provider.resolved", "grounding.completed",
      "operation-catalog.created", "generator.request.started", "generator.response.received", "wire-plan.parsed", "plan.resolved",
      "renderer.completed", "reviewer.request.started", "reviewer.response.received", "reviewer.accepted", "artifacts.created", "run.completed"]);
    expect(entries.at(-1)).toMatchObject({ status: "success", generatorCalls: 1, reviewerCalls: 1, totalModelCalls: 2 });
    expect(entries.find((entry) => entry.event === "wire-plan.parsed")).toMatchObject({ version: 3,
      groundedStepCount: 1, userStatedStepCount: 0, totalStepCount: 1 });
    expect(new Set(entries.map((entry) => entry.runId)).size).toBe(1);
    expect(lines.every((line) => line.length <= diagnosticLineLimit && !/[\u0000-\u001f\u007f-\u009f]/.test(line))).toBe(true);
    const all = lines.join("\n");
    expect(all).not.toContain("stepTypes");
    for (const forbidden of [packPath, flow.text, "Registers frames", golden, "Authorization", "synthetic-secret", "sentinel-raw-response"])
      expect(all).not.toContain(forbidden);
  });

  it("records plan rejection rule, step index and safe ID with one call and one completion", async () => {
    for (const answer of [{ ...plan, groundedSteps: [{ ...step, operationId: "op-9999" }] },
      { ...plan, groundedSteps: [{ ...step, interfaceType: "DB" }] }]) {
      const lines: string[] = [];
      const { app, calls } = runtime(answer);
      expect((await app.generateDiagram!({ ...request, diagnosticSink: (line) => lines.push(line) })).status).toBe("failed");
      expect(calls).toHaveLength(1);
      const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(entries.filter((entry) => entry.event === "run.completed")).toHaveLength(1);
      expect(entries.at(-1)).toMatchObject({ generatorCalls: 1, reviewerCalls: 0, totalModelCalls: 1 });
      expect(entries.some((entry) => entry.event === (answer.groundedSteps[0]!.operationId === "op-9999" ? "plan.rejected" : "wire-plan.rejected") &&
        entry.stepIndex === 0 && entry.operationId === undefined)).toBe(true);
    }
    const secretLines: string[] = [];
    const secretRun = runtime({ ...plan, groundedSteps: [{ ...step, operationId: "SENTINEL_SECRET_ID" }] });
    await secretRun.app.generateDiagram!({ ...request, diagnosticSink: (line) => secretLines.push(line) });
    expect(secretLines.join("\n")).not.toContain("SENTINEL_SECRET_ID");
    const duplicateLines: string[] = [];
    const duplicate = runtime({ ...plan, groundedSteps: [step, { ...step, order: 2 }] });
    await duplicate.app.generateDiagram!({ ...request, diagnosticSink: (line) => duplicateLines.push(line) });
    expect(duplicateLines.map((line) => JSON.parse(line))).toContainEqual(expect.objectContaining({
      event: "plan.rejected", rule: "duplicate-operation-id", stepIndex: 1, operationId: "op-0001" }));
    const orderLines: string[] = [];
    const invalidOrder = runtime({ ...plan, groundedSteps: [{ ...step, order: 2 }] });
    await invalidOrder.app.generateDiagram!({ ...request, diagnosticSink: (line) => orderLines.push(line) });
    expect(invalidOrder.calls).toHaveLength(1);
    expect(orderLines.map((line) => JSON.parse(line))).toContainEqual(expect.objectContaining({
      event: "plan.rejected", rule: "order-gap", list: "groundedSteps", order: 2, stepIndex: 0 }));
    expect(orderLines.filter((line) => JSON.parse(line).event === "run.completed")).toHaveLength(1);
  });

  it("records cancellation counters without leaking thrown provider text", async () => {
    const beforeLines: string[] = [];
    const before = runtime();
    await before.app.generateDiagram!({ ...request, signal: { aborted: true }, diagnosticSink: (line) => beforeLines.push(line) });
    expect(before.calls).toHaveLength(0);
    expect(JSON.parse(beforeLines.at(-1)!)).toMatchObject({ event: "run.completed", generatorCalls: 0, reviewerCalls: 0, totalModelCalls: 0 });
    for (const failAt of [1, 2]) {
      const lines: string[] = [];
      const calls: StructuredChatRequest[] = [];
      const signal = { aborted: false };
      const client: StructuredChatClient = { clientType: "openai-compatible-local", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
        async complete(chat) {
          calls.push(chat);
          if (calls.length === failAt) { signal.aborted = true; throw new Error("secret prompt raw response sentinel-raw-response"); }
          return { source: "content", value: plan };
        } };
      const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
      await app.generateDiagram!({ ...request, signal, diagnosticSink: (line) => lines.push(line) });
      const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(entries.filter((entry) => entry.event === "run.completed")).toHaveLength(1);
      expect(entries.at(-1)).toMatchObject({ status: "cancelled", generatorCalls: 1, reviewerCalls: failAt - 1, totalModelCalls: failAt });
      expect(lines.join("\n")).not.toContain("sentinel-raw-response");
    }
    const reviewerLines: string[] = [];
    const reviewerRun = runtime(plan, rejected);
    await reviewerRun.app.generateDiagram!({ ...request, diagnosticSink: (line) => reviewerLines.push(line) });
    expect(reviewerRun.calls).toHaveLength(2);
    expect(JSON.parse(reviewerLines.at(-1)!)).toMatchObject({ event: "run.completed", generatorCalls: 1, reviewerCalls: 1, totalModelCalls: 2 });
    const betweenLines: string[] = [];
    const betweenSignal = { aborted: false };
    const betweenCalls: StructuredChatRequest[] = [];
    const betweenClient: StructuredChatClient = { clientType: "openai-compatible-local", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete(chat) { betweenCalls.push(chat); betweenSignal.aborted = true; return { source: "content", value: plan }; } };
    const betweenApp = createArchiAgentRuntime({ diagramClientFactory: () => betweenClient });
    await betweenApp.generateDiagram!({ ...request, signal: betweenSignal, diagnosticSink: (line) => betweenLines.push(line) });
    expect(betweenCalls).toHaveLength(1);
    expect(JSON.parse(betweenLines.at(-1)!)).toMatchObject({ status: "cancelled", generatorCalls: 1, reviewerCalls: 0, totalModelCalls: 1 });
  });
});
