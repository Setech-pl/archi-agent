import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import type { StructuredChatClient, StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
import { diagramEnvelopeLimits, diagramEnvelopeSchema, envelopeTooLarge } from "../../src/core/pipeline/generate-diagram.js";
import { reviewerResponseSchema } from "../../src/core/pipeline/reviewed-sequence.js";
import { basePackRows, buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";
import { OpenAiCompatibleServerDouble } from "../doubles/openai-compatible-server-double.js";

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-d11-")));
const packPath = path.join(root, "architecture");
mkdirSync(packPath);
for (const [name, content] of Object.entries(buildPackFiles())) writeFileSync(path.join(packPath, name), content);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const flow = { kind: "document", text: "---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler registers frames in Image Archive.\n" } as const;
const generator = { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "test-model" } as const;
const request = { diagramType: "sequence", flow, knowledgePack: { kind: "local-directory", path: packPath }, generator } as const;
const plantUml = "@startuml\nparticipant \"Telescope Scheduler\" as kp_telescope_scheduler\ndatabase \"Image Archive\" as kp_image_archive\nkp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)\n@enduml";
const generated = { plantUml };
const accepted = { verdict: "accept", violations: [], confirmations: [] };
const rejected = { verdict: "reject", violations: [{ code: "coverage-gap", diagramLine: 4, factId: "m1", evidenceIds: ["relationship:1"], explanation: "Important step omitted" }], confirmations: [] };

function runtime(generatorAnswer: unknown = generated, reviewerAnswer: unknown = accepted) {
  const calls: StructuredChatRequest[] = [];
  const client: StructuredChatClient = {
    clientType: "openai-compatible-local",
    generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
    async complete(chat) { calls.push(chat); return { source: "content", value: (calls.length === 1 ? generatorAnswer : reviewerAnswer) as Record<string, unknown> }; }
  };
  return { calls, app: createArchiAgentRuntime({ diagramClientFactory: () => client }) };
}

describe("D1.1 reviewed sequence path", () => {
  it("uses recursively strict generator and reviewer schemas", () => {
    const visit = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema["type"] === "object") {
        const keys = Object.keys(schema["properties"] as Record<string, unknown>);
        expect(schema["additionalProperties"]).toBe(false);
        expect([...(schema["required"] as string[])].sort()).toEqual([...keys].sort());
      }
      for (const child of Object.values(schema)) visit(child);
    };
    visit(diagramEnvelopeSchema);
    visit(reviewerResponseSchema);
    expect(Object.keys(diagramEnvelopeSchema["properties"] as object)).toEqual(["plantUml"]);
    expect(JSON.stringify(reviewerResponseSchema)).toContain("evidenceIds");
  });

  it("bounds the entire unknown JSON envelope", () => {
    const atLimit = { padding: "x".repeat(diagramEnvelopeLimits.maxJsonChars - '{"padding":""}'.length) };
    expect(envelopeTooLarge(atLimit)).toBe(false);
    expect(envelopeTooLarge({ padding: `${atLimit.padding}x` })).toBe(true);
    const cycle: Record<string, unknown> = {}; cycle["self"] = cycle;
    expect(envelopeTooLarge(cycle)).toBe(true);
    expect(envelopeTooLarge({ value: BigInt(1) })).toBe(true);
  });

  it("returns unchanged PlantUML after two independent calls and reports local physical facts", async () => {
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plantUml).toBe(plantUml);
    expect(result.summary).toMatchObject({ participantCount: 2, messageCount: 1 });
    const report = JSON.parse(result.groundingReport);
    expect(report).toMatchObject({ reportSchemaVersion: 2, diagramType: "sequence", semanticReview: { verdict: "accept" },
      parsedFacts: { relationships: [{ factId: "m1", lineNumber: 4, order: 1, evidenceIds: ["relationship:1"] }] } });
    expect(report.snapshotDigest.value).toBe(result.digest);
    expect(report.parsedFacts.elements.every((fact: { evidenceIds: string[] }) => fact.evidenceIds.length === 1)).toBe(true);
    expect(result.groundingReport).not.toContain("Registers frames");
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.schemaName)).toEqual(["reviewed_sequence_generator", "reviewed_sequence_verdict"]);
    expect(calls[0]?.messages[1]?.content).toContain(result.digest);
    expect(calls[1]?.messages[1]?.content).toContain(result.digest);
    expect(calls[0]?.messages[1]?.content).not.toContain("Night Observer");
    const generatorInput = JSON.parse(calls[0]?.messages[1]?.content ?? "{}");
    const reviewerInput = JSON.parse(calls[1]?.messages[1]?.content ?? "{}");
    expect(Object.keys(generatorInput.snapshot).sort()).toEqual(["digest", "elements", "flowEvidence", "flowFile", "metadata", "relationships", "rules", "snapshotId", "sources"]);
    expect(generatorInput.snapshot).toEqual(reviewerInput.snapshot);
    expect(generatorInput.snapshot.digest).toBe(report.snapshotDigest.value);
    expect(reviewerInput.snapshot.digest).toBe(report.snapshotDigest.value);
    expect(generatorInput.snapshot.relationships[0].evidenceClass).toBe("source-confirmed");
    expect(generatorInput.relationshipArrowContract).toEqual(expect.arrayContaining([
      { from: "telescope-scheduler", to: "image-archive", interfaceType: "DB", interfaceName: "Archive Writer",
        mode: "synchronous", requestArrow: "->", responseAllowed: true }
    ]));
    const instructions = calls[0]?.messages[0]?.content ?? "";
    expect(instructions).toContain("Synchronous request: A -> B : Label (TYPE)");
    expect(instructions).toContain("matching response: B --> A : Label (TYPE)");
    expect(instructions).toContain("Asynchronous request: A ->> B : Label (TYPE)");
    expect(instructions).toContain("The relationship mode determines the arrow for every interface type, including EVENT");
  });

  it("derives shifted line numbers, ordered arrows and fragments without rewriting", async () => {
    const text = plantUml.replace("kp_telescope_scheduler ->", "opt Retry\nkp_telescope_scheduler ->").replace("@enduml", "end\n@enduml");
    const { app, calls } = runtime({ plantUml: text }, { ...accepted, confirmations: [{ factId: "a1", flowEvidenceIds: ["flow:7"] }, { factId: "a2", flowEvidenceIds: ["flow:7"] }] });
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plantUml).toBe(text);
    expect(JSON.parse(result.groundingReport).parsedFacts.relationships[0]).toMatchObject({ lineNumber: 5, order: 1 });
    expect(JSON.parse(result.groundingReport).parsedFacts.annotations.map((fact: { evidenceIds: string[] }) => fact.evidenceIds)).toEqual([["flow:7"], ["flow:7"]]);
    const reviewed = JSON.parse(calls[1]?.messages[1]?.content ?? "{}");
    expect(reviewed.facts.relationships[0]).toMatchObject({ lineNumber: 5, label: "Registers frames", async: false, isResponse: false });
    expect(reviewed.facts.annotations).toMatchObject([{ fragmentKind: "opt", condition: "Retry" }, { fragmentKind: "end" }]);
  });

  it("maps each physical arrow in order and binds a response to its earlier synchronous request", async () => {
    const text = plantUml.replace("@enduml", "kp_image_archive --> kp_telescope_scheduler : Stored frames (DB: Archive Writer)\n@enduml");
    const { app, calls } = runtime({ plantUml: text });
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.summary).toMatchObject({ messageCount: 2, responseCount: 1 });
    expect(JSON.parse(result.groundingReport).parsedFacts.relationships).toMatchObject([
      { factId: "m1", lineNumber: 4, order: 1, arrow: "->" },
      { factId: "m2", lineNumber: 5, order: 2, arrow: "-->" }
    ]);
    expect(calls).toHaveLength(2);
    const missingRequest = runtime({ plantUml: text.replace("kp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)\n", "") });
    expect(await missingRequest.app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    expect(missingRequest.calls).toHaveLength(1);
  });

  it.each([
    plantUml.replace('participant "Telescope Scheduler" as kp_telescope_scheduler', 'participant kp_telescope_scheduler as "Telescope Scheduler"')
      .replace('database "Image Archive" as kp_image_archive', 'database kp_image_archive as "Image Archive"')
      .replace(' : Registers frames ', ': "Registers frames" '),
    plantUml.replace(' : Registers frames ', '  :  Registers frames ')
  ])("accepts both safe declaration and message forms without changing PlantUML", async (text) => {
    const { app, calls } = runtime({ plantUml: text });
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plantUml).toBe(text);
    expect(JSON.parse(calls[1]?.messages[1]?.content ?? "{}").facts.relationships[0].label).toBe("Registers frames");
  });

  it("enforces an asynchronous source-confirmed EVENT and forbids its response", async () => {
    const directory = path.join(root, "async-event"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: [
      ...basePackRows.relationships.filter((row) => row[1] !== "image-archive"),
      ["telescope-scheduler", "image-archive", "EVENT", "", "asynchronous", "Signals frames"]
    ] }))) writeFileSync(path.join(directory, name), content);
    const event = plantUml.replace(" -> kp_image_archive : Registers frames (DB: Archive Writer)", " ->> kp_image_archive : Registers frames (EVENT)");
    const eventRequest = { ...request, knowledgePack: { kind: "local-directory" as const, path: directory } };
    const good = runtime({ plantUml: event });
    expect((await good.app.generateDiagram!({ ...eventRequest })).status).toBe("success");
    expect(JSON.parse(good.calls[0]?.messages[1]?.content ?? "{}").relationshipArrowContract).toEqual(expect.arrayContaining([
      { from: "telescope-scheduler", to: "image-archive", interfaceType: "EVENT", interfaceName: null,
        mode: "asynchronous", requestArrow: "->>", responseAllowed: false }
    ]));
    const wrongArrow = runtime({ plantUml: event.replace(" ->> kp_image_archive", " -> kp_image_archive") });
    expect(await wrongArrow.app.generateDiagram!({ ...eventRequest })).toMatchObject({ status: "failed", stage: "semantic-validation-failed",
      issues: [{ code: "interaction-mode-mismatch" }] });
    expect(wrongArrow.calls).toHaveLength(1);
    const wrongResponse = runtime({ plantUml: event.replace("@enduml", "kp_image_archive --> kp_telescope_scheduler : Response (EVENT)\n@enduml") });
    const responseResult = await wrongResponse.app.generateDiagram!({ ...eventRequest });
    expect(responseResult).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    if (responseResult.status === "failed") expect(responseResult.issues.map((issue) => issue.code)).toContain("response-without-request");
    expect(wrongResponse.calls).toHaveLength(1);
  });

  it("uses synchronous mode for EVENT even when its interface type is EVENT", async () => {
    const directory = path.join(root, "sync-event"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: [
      ...basePackRows.relationships.filter((row) => row[1] !== "image-archive"),
      ["telescope-scheduler", "image-archive", "EVENT", "", "synchronous", "Signals frames"]
    ] }))) writeFileSync(path.join(directory, name), content);
    const eventRequest = { ...request, knowledgePack: { kind: "local-directory" as const, path: directory } };
    const sync = plantUml.replace("(DB: Archive Writer)", "(EVENT)");
    const good = runtime({ plantUml: sync });
    expect((await good.app.generateDiagram!({ ...eventRequest })).status).toBe("success");
    expect(JSON.parse(good.calls[0]?.messages[1]?.content ?? "{}").relationshipArrowContract).toEqual(expect.arrayContaining([
      { from: "telescope-scheduler", to: "image-archive", interfaceType: "EVENT", interfaceName: null,
        mode: "synchronous", requestArrow: "->", responseAllowed: true }
    ]));
    const wrong = runtime({ plantUml: sync.replace(" -> kp_image_archive", " ->> kp_image_archive") });
    expect(await wrong.app.generateDiagram!({ ...eventRequest })).toMatchObject({ status: "failed", stage: "semantic-validation-failed",
      issues: [{ code: "interaction-mode-mismatch" }] });
    expect(wrong.calls).toHaveLength(1);
  });

  it("rejects the saved S1 syntax with precise source-confirmed mode errors before review", async () => {
    const directory = path.join(root, "s1-mode-diagnostic"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({
      systems: [
        ["intake-app", "Intake App", "system", "Starts a job"],
        ["workflow-service", "Workflow Service", "service", "Processes a job"],
        ["audit-store", "Audit Store", "database", "Stores records"],
        ["notification-hub", "Notification Hub", "system", "Receives events"]
      ], actors: [], aliases: [], rules: [], relationships: [
        ["intake-app", "workflow-service", "REST_API", "Submit Job", "synchronous", "Starts a job"],
        ["workflow-service", "audit-store", "DB", "Job Record", "synchronous", "Stores a record"]
      ]
    }))) writeFileSync(path.join(directory, name), content);
    const diagnostic = [
      "@startuml", 'participant kp_intake_app as "Intake App"', 'participant kp_workflow_service as "Workflow Service"',
      'database kp_audit_store as "Audit Store"', 'participant kp_notification_hub as "Notification Hub"', "",
      'kp_intake_app ->> kp_workflow_service: "Submit Job" (REST API)',
      'kp_workflow_service --> kp_intake_app: "Response" (REST API)', "",
      'kp_workflow_service ->> kp_audit_store: "Job Record" (DB)',
      'kp_audit_store --> kp_workflow_service: "Response" (DB)', "",
      'kp_workflow_service -> kp_notification_hub: "Job Ready" (EVENT)', "@enduml"
    ].join("\n");
    const diagnosticFlow = { kind: "document" as const, text: "---\ndiagram_name: job\nflow_name: Job\nauthor: Test\nlanguage: en\n---\nIntake App sends to Workflow Service, which uses Audit Store and Notification Hub.\n" };
    const { app, calls } = runtime({ plantUml: diagnostic });
    const result = await app.generateDiagram!({ ...request, flow: diagnosticFlow,
      knowledgePack: { kind: "local-directory", path: directory } });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    if (result.status === "failed") expect(result.issues.map((issue) => [issue.code, issue.details?.["line"]])).toEqual([
      ["interaction-mode-mismatch", 7], ["response-without-request", 8],
      ["interaction-mode-mismatch", 10], ["response-without-request", 11]
    ]);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["extra envelope field", { ...generated, other: true }, "invalid-generator-output"],
    ["missing plantUml", {}, "invalid-generator-output"],
    ["oversized", { plantUml: "x".repeat(256 * 1024 + 1) }, "invalid-generator-output"],
    ["unknown participant", { plantUml: plantUml.replace("kp_image_archive", "kp_unknown") }, "semantic-validation-failed"],
    ["wrong canonical name", { plantUml: plantUml.replace("Image Archive", "Invented") }, "semantic-validation-failed"],
    ["directive", { plantUml: plantUml.replace("@enduml", "!include secret\n@enduml") }, "render-validation-failed"],
    ["URL", { plantUml: plantUml.replace("Registers frames", "https://invalid.example") }, "render-validation-failed"],
    ["unsafe syntax", { plantUml: plantUml.replace("@enduml", "note over kp_image_archive: x\n@enduml") }, "semantic-validation-failed"],
    ["missing marker", { plantUml: plantUml.replace("@enduml", "") }, "render-validation-failed"]
  ])("rejects %s deterministically after one call", async (_name, answer, stage) => {
    const { app, calls } = runtime(answer);
    expect(await app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", stage });
    expect(calls).toHaveLength(1);
  });

  it("rejects a different interface type before review without exposing model text", async () => {
    const text = plantUml.replace("(DB: Archive Writer)", "(EVENT)");
    const { app, calls } = runtime({ plantUml: text }, rejected);
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed",
      issues: [{ code: "interface-type-mismatch", details: { line: 4, factId: "m1" } }] });
    expect(JSON.stringify(result)).not.toContain("Registers frames");
    expect(JSON.stringify(result)).not.toContain("user-stated");
    expect(calls).toHaveLength(1);
  });

  it.each([
    [plantUml.replace("kp_telescope_scheduler -> kp_image_archive", "kp_image_archive -> kp_telescope_scheduler"), "relationship-direction"],
    [plantUml.replace(" -> ", " ->> "), "interaction-mode-mismatch"],
    [plantUml.replace("Archive Writer", "Invented"), "interface-name-mismatch"],
    [plantUml.replace(": Archive Writer", ""), "interface-name-mismatch"]
  ])("blocks a source-confirmed contradiction before review", async (text, code) => {
    const { app, calls } = runtime({ plantUml: text });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    if (result.status === "failed") expect(result.issues.map((issue) => issue.code)).toContain(code);
    expect(calls).toHaveLength(1);
  });

  it("chooses only a complete type, mode and name match among relationships for one pair", async () => {
    const directory = path.join(root, "multiple-interfaces"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: [
      ...basePackRows.relationships.filter((row) => row[1] !== "image-archive"),
      ["telescope-scheduler", "image-archive", "EVENT", "Signals", "asynchronous", "Signals frames"],
      ["telescope-scheduler", "image-archive", "DB", "Other Writer", "synchronous", "Writes elsewhere"],
      ["telescope-scheduler", "image-archive", "DB", "Archive Writer", "synchronous", "Registers frames"]
    ] }))) writeFileSync(path.join(directory, name), content);
    const multiRequest = { ...request, knowledgePack: { kind: "local-directory" as const, path: directory } };
    const good = runtime();
    const result = await good.app.generateDiagram!({ ...multiRequest });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      const snapshot = JSON.parse(good.calls[0]?.messages[1]?.content ?? "{}").snapshot;
      const matching = snapshot.relationships.find((entry: { interfaceType: string; interfaceName: string }) =>
        entry.interfaceType === "DB" && entry.interfaceName === "Archive Writer");
      expect(JSON.parse(result.groundingReport).parsedFacts.relationships[0].evidenceIds).toEqual([matching.evidenceId]);
    }
    for (const [text, code] of [
      [plantUml.replace("Archive Writer", "Unknown Writer"), "interface-name-mismatch"],
      [plantUml.replace("DB: Archive Writer", "EVENT: Archive Writer"), "interaction-mode-mismatch"]
    ]) {
      const attempt = runtime({ plantUml: text });
      const failure = await attempt.app.generateDiagram!({ ...multiRequest });
      expect(failure).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
      if (failure.status === "failed") expect(failure.issues.map((issue) => issue.code)).toContain(code);
      expect(attempt.calls).toHaveLength(1);
    }
  });

  it("sends an ungrounded known-to-known relation to review", async () => {
    const directory = path.join(root, "reverse-unrelated"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: basePackRows.relationships.filter((row) => row[1] !== "image-archive") })))
      writeFileSync(path.join(directory, name), content);
    const text = plantUml.replace("kp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)",
      "kp_image_archive -> kp_telescope_scheduler : Invented event (EVENT)");
    const { app, calls } = runtime({ plantUml: text }, { ...rejected, violations: [{ ...rejected.violations[0], evidenceIds: ["flow:7"] }] });
    expect(await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    expect(calls).toHaveLength(2);
  });

  it("accepts a flow-stated relation only with reviewer evidence and traces it in report v2", async () => {
    const directory = path.join(root, "flow-evidence"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: basePackRows.relationships.filter((row) => row[1] !== "image-archive") })))
      writeFileSync(path.join(directory, name), content);
    const confirmation = { factId: "m1", flowEvidenceIds: ["flow:7"] };
    const { app, calls } = runtime(generated, { ...accepted, confirmations: [confirmation] });
    const result = await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const report = JSON.parse(result.groundingReport);
    expect(report.parsedFacts.relationships[0].evidenceIds).toEqual(["flow:7"]);
    expect(report.sources.evidence).toContainEqual({ id: "flow:7", file: "flow.md", line: 7, evidenceClass: "user-stated" });
    expect(JSON.parse(calls[0]?.messages[1]?.content ?? "{}").snapshot).toEqual(JSON.parse(calls[1]?.messages[1]?.content ?? "{}").snapshot);
    expect(calls).toHaveLength(2);

    for (const invalid of [
      accepted,
      { ...accepted, confirmations: [{ factId: "m1", flowEvidenceIds: ["flow:999"] }] },
      { ...accepted, confirmations: [{ factId: "m1", flowEvidenceIds: ["relationship:1"] }] },
      { ...accepted, confirmations: [confirmation, confirmation] },
      { ...accepted, confirmations: [{ factId: "m1", flowEvidenceIds: ["flow:7", "flow:7"] }] }
    ]) {
      const attempt = runtime(generated, invalid);
      expect(await attempt.app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).toMatchObject({ status: "failed", stage: "invalid-generator-output" });
      expect(attempt.calls).toHaveLength(2);
    }
    const denied = runtime(generated, { ...rejected, violations: [{ ...rejected.violations[0], evidenceIds: ["flow:7"] }] });
    expect(await denied.app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    expect(denied.calls).toHaveLength(2);
  });

  it("enforces a pack prohibition before semantic review", async () => {
    const directory = path.join(root, "forbidden-flow-relation"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: basePackRows.relationships.filter((row) => row[1] !== "image-archive"),
      rules: [...basePackRows.rules.filter((row) => row[1] !== "telescope-scheduler" || row[2] !== "image-archive"), ["forbid", "telescope-scheduler", "image-archive", "Blocked"]] }))) writeFileSync(path.join(directory, name), content);
    const { app, calls } = runtime();
    expect(await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.messages[1]?.content ?? "{}").snapshot.rules).toContainEqual(expect.objectContaining({
      rule: "forbid", fromId: "telescope-scheduler", toId: "image-archive"
    }));
  });

  it("accepts ARCHGROUND_ as ordinary flow text", async () => {
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request, flow: { ...flow, text: flow.text.replace("registers frames", "registers ARCHGROUND_ frames") } });
    expect(result.status).toBe("success");
    expect(calls).toHaveLength(2);
  });

  it("requires [NEW] confirmation before any call", async () => {
    const newFlow = { kind: "document", text: "---\ndiagram_name: new-station\nflow_name: New station\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends data to [NEW: Ground Station].\n" } as const;
    const { app, calls } = runtime();
    expect(await app.generateDiagram!({ ...request, flow: newFlow })).toMatchObject({ status: "failed", stage: "grounding-blocked" });
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid flow context before model I/O", async () => {
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request, flow: { kind: "file", path: "/does/not/exist" } });
    expect(result.status).toBe("failed");
    expect(calls).toHaveLength(0);
  });

  it("uses a confirmed [NEW] participant without pretending it has Knowledge Pack evidence", async () => {
    const newFlow = { kind: "document", text: "---\ndiagram_name: new-station\nflow_name: New station\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends data to [NEW: Ground Station].\n" } as const;
    const text = "@startuml\nparticipant \"Telescope Scheduler\" as kp_telescope_scheduler\nparticipant \"[NEW] Ground Station\" as new_ground_station\nkp_telescope_scheduler ->> new_ground_station : Sends data (EVENT)\n@enduml";
    const { app, calls } = runtime({ plantUml: text }, { ...accepted, confirmations: [{ factId: "e2", flowEvidenceIds: ["flow:7"] }, { factId: "m1", flowEvidenceIds: ["flow:7"] }] });
    const result = await app.generateDiagram!({ ...request, flow: newFlow, confirmedNewParticipants: ["Ground Station"] });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.summary).toMatchObject({ newParticipantCount: 1, asynchronousCount: 1 });
    expect(result.warnings.map((issue) => issue.code)).toContain("unverified-new-participant-interaction");
    expect(calls).toHaveLength(2);
  });

  it("accepts a grounded unnamed interface", async () => {
    const directory = path.join(root, "unnamed-interface"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: basePackRows.relationships.map((row) =>
      row[1] === "image-archive" ? [row[0]!, row[1]!, row[2]!, "", row[4]!, row[5]!] : row) }))) writeFileSync(path.join(directory, name), content);
    const { app } = runtime({ plantUml: plantUml.replace(" (DB: Archive Writer)", " (DB)") });
    expect((await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).status).toBe("success");
  });

  it("rejects a named fact against an unnamed source-confirmed interface before review", async () => {
    const directory = path.join(root, "unnamed-interface-with-named-fact"); mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: basePackRows.relationships.map((row) =>
      row[1] === "image-archive" ? [row[0]!, row[1]!, row[2]!, "", row[4]!, row[5]!] : row) }))) writeFileSync(path.join(directory, name), content);
    const label = "SENSITIVE_LABEL_TOKEN";
    const prompt = "SENSITIVE_PROMPT_TOKEN";
    const secret = "synthetic-credential-sentinel";
    const answer = { plantUml: plantUml.replace("Registers frames", label) };
    const transport = new RemoteJsonTransportDouble(JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify(answer), refusal: null } }] }));
    const app = createArchiAgentRuntime({ remoteTransport: transport });
    const result = await app.generateDiagram!({ ...request,
      flow: { ...flow, text: flow.text.replace("registers frames", `registers ${prompt} frames`) },
      knowledgePack: { kind: "local-directory", path: directory },
      generator: { kind: "remote-provider", profileId: "cloud-openai", modelId: "test-model",
        credential: { type: "api-key", value: secret } } });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed",
      issues: [{ code: "interface-name-mismatch", details: { line: 4, factId: "m1" } }] });
    expect(transport.requests).toHaveLength(1);
    expect(result).not.toHaveProperty("plantUml");
    expect(result).not.toHaveProperty("groundingReport");
    const diagnostic = JSON.stringify(result);
    for (const sensitive of [label, prompt, JSON.stringify(answer), secret, "user-stated", "@startuml"])
      expect(diagnostic).not.toContain(sensitive);
  });

  it("chooses the exact named evidence deterministically when several relationships match", async () => {
    const directory = path.join(root, "multiple-evidence"); mkdirSync(directory);
    const original = basePackRows.relationships.find((row) => row[1] === "image-archive")!;
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: [...basePackRows.relationships, [original[0]!, original[1]!, original[2]!, "Archive Writer 2", original[4]!, original[5]!]] })))
      writeFileSync(path.join(directory, name), content);
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } });
    expect(result.status).toBe("success");
    if (result.status === "success") {
      const snapshot = JSON.parse(calls[0]?.messages[1]?.content ?? "{}").snapshot;
      const matching = snapshot.relationships.find((entry: { interfaceName: string }) => entry.interfaceName === "Archive Writer");
      expect(JSON.parse(result.groundingReport).parsedFacts.relationships[0].evidenceIds).toEqual([matching.evidenceId]);
    }
  });

  it("rejects review without artifacts after exactly two calls", async () => {
    const { app, calls } = runtime(generated, rejected);
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed", issues: [{ code: "review-rejected", details: { line: 4, factId: "m1" } }] });
    expect(JSON.stringify(result)).not.toContain("Important step omitted");
    expect(JSON.stringify(result)).not.toContain("@startuml");
    expect(calls).toHaveLength(2);
  });

  it.each([
    { verdict: "accept", violations: [rejected.violations[0]], confirmations: [] },
    { verdict: "reject", violations: [], confirmations: [] },
    { verdict: "reject", violations: [{ ...rejected.violations[0], factId: "m99" }], confirmations: [] },
    { verdict: "reject", violations: [{ ...rejected.violations[0], evidenceIds: ["secret"] }], confirmations: [] },
    { verdict: "reject", violations: [{ ...rejected.violations[0], diagramLine: 99 }], confirmations: [] },
    { verdict: "reject", violations: [{ ...rejected.violations[0], explanation: "x".repeat(501) }], confirmations: [] },
    { ...accepted, plantUml: "secret" }
  ])("fails closed on malformed reviewer output", async (review) => {
    const { app, calls } = runtime(generated, review);
    expect(await app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", stage: "invalid-generator-output", issues: [{ code: "review-schema-violation" }] });
    expect(calls).toHaveLength(2);
  });

  it("cancels before generation and between generation and review", async () => {
    const before = runtime();
    expect((await before.app.generateDiagram!({ ...request, signal: { aborted: true } })).status).toBe("failed");
    expect(before.calls).toHaveLength(0);
    const signal = { aborted: false };
    let calls = 0;
    const client: StructuredChatClient = { clientType: "synthetic-client", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete() { calls += 1; signal.aborted = true; return { source: "content", value: generated }; } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    expect((await app.generateDiagram!({ ...request, signal })).status).toBe("failed");
    expect(calls).toBe(1);
  });

  it("contains a reviewer timeout to two calls with safe error", async () => {
    let calls = 0;
    const client: StructuredChatClient = { clientType: "synthetic-client", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete() { calls += 1; if (calls === 2) throw Object.assign(new Error("synthetic-secret"), { code: "timeout" }); return { source: "content", value: generated }; } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "invalid-generator-output", issues: [{ code: "reviewer-failed" }] });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(calls).toBe(2);
  });

  it("contains a generator timeout to one call without review", async () => {
    let calls = 0;
    const client: StructuredChatClient = { clientType: "synthetic-client", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete() { calls += 1; throw Object.assign(new Error("synthetic-secret"), { code: "timeout" }); } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "invalid-generator-output", issues: [{ code: "generator-failed" }] });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(calls).toBe(1);
  });

  it("does not expose cloud credentials or untrusted answer text in a failed review", async () => {
    const raw = "synthetic-secret";
    const transport = new RemoteJsonTransportDouble(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(generated), refusal: null } }] }),
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ...rejected, violations: [{ ...rejected.violations[0], explanation: raw }] }), refusal: null } }] })
    );
    const app = createArchiAgentRuntime({ remoteTransport: transport });
    const result = await app.generateDiagram!({ ...request, generator: { kind: "remote-provider", profileId: "cloud-openai", modelId: "test-model", credential: { type: "api-key", value: raw } } });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    expect(JSON.stringify(result)).not.toContain(raw);
    expect(transport.requests).toHaveLength(2);
    for (const sent of transport.requests) expect(sent.body).not.toContain(raw);
  });

  it.each([
    ["cloud-anthropic", (content: string) => JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] })],
    ["cloud-openai", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })],
    ["cloud-openrouter", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })]
  ] as const)("keeps %s API key only in both authorization headers on rejection", async (profileId, response) => {
    const secret = "synthetic-secret";
    const transport = new RemoteJsonTransportDouble(response(JSON.stringify(generated)), response(JSON.stringify(rejected)));
    const app = createArchiAgentRuntime({ remoteTransport: transport });
    const result = await app.generateDiagram!({ ...request, flow: { ...flow, text: flow.text.replace("registers frames", "registers ARCHGROUND_ frames") },
      generator: { kind: "remote-provider", profileId, modelId: "test-model", credential: { type: "api-key", value: secret } } });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(transport.requests).toHaveLength(2);
    for (const sent of transport.requests) {
      expect(sent.body ?? "").not.toContain(secret);
      expect(sent.headers).toEqual(profileId === "cloud-anthropic"
        ? { "x-api-key": secret, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${secret}` });
    }
  });

  it("stops after reviewer cancellation, without a third request", async () => {
    const signal = { aborted: false };
    let calls = 0;
    const client: StructuredChatClient = { clientType: "synthetic-client", generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete() { calls += 1; if (calls === 2) signal.aborted = true; return { source: "content", value: calls === 1 ? generated : accepted }; } };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    expect((await app.generateDiagram!({ ...request, signal })).status).toBe("failed");
    expect(calls).toBe(2);
  });

  it.each(["component", "c4-context", "c4-container", "archimate-hld"]) ("rejects %s before source and provider I/O", async (diagramType) => {
    const { app, calls } = runtime();
    const result = await app.generateDiagram!({ ...request, diagramType: diagramType as "sequence", flow: { kind: "file", path: "/does/not/exist" }, knowledgePack: { kind: "local-directory", path: "/does/not/exist" } });
    expect(result).toMatchObject({ status: "failed", stage: "generator-configuration", issues: [{ code: "diagram-type-unsupported" }] });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["cloud-anthropic", "anthropic-messages", (content: string) => JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] })],
    ["cloud-openai", "openai-chat-completions", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })],
    ["cloud-openrouter", "openrouter-chat-completions", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })]
  ])("uses two %s requests with one selected model", async (profileId, endpoint, response) => {
    const transport = new RemoteJsonTransportDouble(response(JSON.stringify(generated)), response(JSON.stringify(accepted)));
    const app = createArchiAgentRuntime({ remoteTransport: transport });
    const result = await app.generateDiagram!({ ...request, generator: { kind: "remote-provider", profileId, modelId: "test-model", credential: { type: "api-key", value: "synthetic-secret" } } });
    expect(result.status).toBe("success");
    expect(transport.requests.map((sent) => sent.endpoint)).toEqual([endpoint, endpoint]);
    for (const sent of transport.requests) expect(sent.body).toContain("test-model");
    const nodes = (value: unknown): Record<string, unknown>[] => value !== null && typeof value === "object"
      ? [value as Record<string, unknown>, ...Object.values(value).flatMap(nodes)] : [];
    const secret = "synthetic-secret";
    for (const sent of transport.requests) {
      expect(sent.body).not.toContain(secret);
      expect(sent.headers).toEqual(profileId === "cloud-anthropic"
        ? { "x-api-key": secret, "anthropic-version": "2023-06-01" }
        : { Authorization: `Bearer ${secret}` });
    }
    if (profileId !== "cloud-anthropic") {
      const sent = JSON.parse(transport.requests[0]?.body ?? "{}");
      expect(sent.response_format.json_schema).toMatchObject({ name: "reviewed_sequence_generator", strict: true });
      const review = JSON.parse(transport.requests[1]?.body ?? "{}");
      expect(review.response_format.json_schema).toMatchObject({ name: "reviewed_sequence_verdict", strict: true });
      for (const schema of [sent.response_format.json_schema.schema, review.response_format.json_schema.schema]) {
        const all = nodes(schema);
        for (const node of all) {
          for (const forbidden of ["maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum"])
            expect(node).not.toHaveProperty(forbidden);
          if (node.type === "object") {
            expect(node.additionalProperties).toBe(false);
            expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort());
          }
        }
      }
    } else {
      for (const sent of transport.requests) {
        const body = JSON.parse(sent.body ?? "{}");
        expect(body.output_config.format.type).toBe("json_schema");
        expect(nodes(body.output_config.format.schema).filter((node) => node.type === "object")
          .every((node) => node.additionalProperties === false)).toBe(true);
      }
    }
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });

  it.each(["local-lm-studio", "local-ollama"]) ("uses two %s POSTs", async (profileId) => {
    const server = await OpenAiCompatibleServerDouble.start({ completionContents: [JSON.stringify(generated), JSON.stringify(accepted)] });
    try {
      const app = createArchiAgentRuntime();
      const result = await app.generateDiagram!({ ...request, generator: { kind: "openai-compatible-local", profileId, modelId: "test-model", baseUrl: server.baseUrl } });
      expect(result.status).toBe("success");
      expect(server.completionRequests().map((sent) => [sent.method, sent.path])).toEqual([["POST", "/v1/chat/completions"], ["POST", "/v1/chat/completions"]]);
      expect(server.completionRequests().map((sent) => (sent.body as any).model)).toEqual(["test-model", "test-model"]);
    } finally { await server.close(); }
  });
});
