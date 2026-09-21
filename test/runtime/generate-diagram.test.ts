import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createArchiAgentRuntime } from "../../src/runtime/index.js";
import type { StructuredChatClient, StructuredChatRequest } from "../../src/core/llm/structured-chat-client.js";
import { diagramEnvelopeLimits, diagramEnvelopeSchema, envelopeTooLarge } from "../../src/core/pipeline/generate-diagram.js";
import { basePackRows, buildPackFiles } from "../doubles/knowledge-pack-fixture.js";
import { RemoteJsonTransportDouble } from "../doubles/remote-json-transport-double.js";
import { OpenAiCompatibleServerDouble } from "../doubles/openai-compatible-server-double.js";

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-d1-")));
const packPath = path.join(root, "architecture");
mkdirSync(packPath);
for (const [name, content] of Object.entries(buildPackFiles())) writeFileSync(path.join(packPath, name), content);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const flow = { kind: "document", text: "---\ndiagram_name: observation\nflow_name: Observation\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler registers frames in Image Archive.\n" } as const;
const generator = { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "test-model" } as const;
const request = { diagramType: "sequence", flow, knowledgePack: { kind: "local-directory", path: packPath }, generator } as const;
const entry = { order: 1, lineNumber: 4, from: { elementId: "telescope-scheduler" }, to: { elementId: "image-archive" }, label: "Registers frames", interfaceType: "DB", interfaceName: "Archive Writer", async: false, isResponse: false };
const plantUml = "@startuml\nparticipant \"Telescope Scheduler\" as kp_telescope_scheduler\ndatabase \"Image Archive\" as kp_image_archive\nkp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)\n@enduml\n";
const answer = { plantUml, messages: [entry] };

function runtime(value: unknown, clientType = "openai-compatible-local") {
  const calls: StructuredChatRequest[] = [];
  const client: StructuredChatClient = {
    clientType,
    generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
    async complete(chat) { calls.push(chat); return { source: "content", value: value as Record<string, unknown> }; }
  };
  return { calls, app: createArchiAgentRuntime({ diagramClientFactory: () => client }) };
}

describe("D1 final PlantUML path", () => {
  it("has a recursively strict schema with required nullable interfaceName", () => {
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
    const message = (diagramEnvelopeSchema["properties"] as Record<string, any>)["messages"].items;
    expect(message.required).toContain("interfaceName");
    expect(message.required).toContain("lineNumber");
    expect(message.properties.interfaceType.enum).toEqual(["REST API", "SOAP", "EVENT", "FILE", "DB", "INTERNAL"]);
    expect(JSON.stringify(message.properties.interfaceName)).toContain('"null"');
  });

  it("bounds the complete JSON envelope at the exact limit and rejects unsafe values", () => {
    const atLimit = { padding: "x".repeat(diagramEnvelopeLimits.maxJsonChars - '{"padding":""}'.length) };
    expect(JSON.stringify(atLimit).length).toBe(diagramEnvelopeLimits.maxJsonChars);
    expect(envelopeTooLarge(atLimit)).toBe(false);
    expect(envelopeTooLarge({ padding: `${atLimit.padding}x` })).toBe(true);
    expect(envelopeTooLarge({ many: Array(diagramEnvelopeLimits.maxJsonChars + 1).fill(null) })).toBe(true);
    let deep: unknown = {};
    for (let index = 0; index <= diagramEnvelopeLimits.maxDepth; index += 1) deep = { child: deep };
    expect(envelopeTooLarge(deep)).toBe(true);
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(envelopeTooLarge(cycle)).toBe(true);
    expect(envelopeTooLarge({ value: BigInt(1) })).toBe(true);
  });

  it("returns the exact validated PlantUML, report and one structured completion", async () => {
    const { app, calls } = runtime(answer);
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plantUml).toBe(plantUml);
    expect(result.summary).toMatchObject({ participantCount: 2, messageCount: 1 });
    expect(JSON.parse(result.groundingReport).messages).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.schemaName).toBe("final_plantuml_sequence");
    expect(calls[0]?.messages[1]?.content).not.toContain("Night Observer");
    expect(calls[0]?.messages[1]?.content).toContain('"kp:telescope-scheduler","kp_telescope_scheduler"');
    expect(calls[0]?.messages[0]?.content).toContain("(REST API)");
    expect(calls[0]?.messages[0]?.content).toContain("Submit command (INTERNAL: Operator Console)");
    expect(calls[0]?.messages[0]?.content).toContain("when the supplied relationship has no name");
  });

  it("keeps a qwen3:30b style answer without final LF byte-for-byte", async () => {
    const withoutFinalLf = plantUml.slice(0, -1);
    const { app, calls } = runtime({ plantUml: withoutFinalLf, messages: [entry] });
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.plantUml).toBe(withoutFinalLf);
    expect(calls).toHaveLength(1);
  });

  it("rejects the captured qwen3:30b alias-only declaration shape at line 2", async () => {
    const aliasOnly = ["@startuml", "actor a", "participant b", "participant c", "queue d", "a -> b : request (API)", "b -> c : validate (API)", "c --> b : accepted (API)", "c ->> d : publish (EVENT)", "@enduml"].join("\n");
    const messages = [6, 7, 8, 9].map((lineNumber, index) => ({ ...entry, order: index + 1, lineNumber }));
    const { app, calls } = runtime({ plantUml: aliasOnly, messages });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed", issues: [{ code: "plantuml-structure", details: { violation: "sequence-declaration-syntax", line: 2 } }] });
    expect(JSON.stringify(result)).not.toContain(aliasOnly);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.messages[0]?.content).toContain('actor "Example Actor" as kp_example_actor');
  });

  it("reports a bounded structural rule and physical line without model text", async () => {
    const secret = "synthetic-secret";
    const unsafe = plantUml.replace("@enduml", `!include ${secret}\n@enduml`);
    const { app } = runtime({ plantUml: unsafe, messages: [entry] });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "render-validation-failed", issues: [{ code: "plantuml-structure", details: { violation: "forbidden-directive", line: 5, count: 1 } }] });
    const safe = JSON.stringify(result);
    expect(safe).not.toContain(secret);
    expect(safe).not.toContain("!include");
    expect(safe).not.toContain("@startuml");
    expect(safe).not.toContain("Generate one grounded sequence diagram");
  });

  it("identifies the second Ollama smoke shape: label copied, but interface type and name omitted from the arrow", async () => {
    const copiedLabel = "Registers frames (Archive Writer)";
    const text = plantUml.replace("Registers frames (DB: Archive Writer)", copiedLabel);
    const { app, calls } = runtime({ plantUml: text, messages: [{ ...entry, label: copiedLabel }] });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed", issues: [{
      code: "plantuml-structure", details: { violation: "sequence-ledger-interface-type-mismatch", line: 4, order: 1 }
    }] });
    expect(calls).toHaveLength(1);
    for (const unsafe of [copiedLabel, "synthetic-secret", "test-model", "Generate one grounded", text])
      expect(JSON.stringify(result)).not.toContain(unsafe);
  });

  it.each([
    ["lineNumber", { ...entry, lineNumber: 5 }, plantUml, "sequence-ledger-line-number-mismatch"],
    ["order", { ...entry, order: 2 }, plantUml, "sequence-ledger-order-mismatch"],
    ["source", entry, plantUml.replace("kp_telescope_scheduler ->", "kp_image_archive ->"), "sequence-ledger-source-mismatch"],
    ["target", entry, plantUml.replace("-> kp_image_archive :", "-> kp_telescope_scheduler :"), "sequence-ledger-target-mismatch"],
    ["arrow", { ...entry, async: true }, plantUml.replace(" -> ", " --> "), "sequence-ledger-arrow-mismatch"],
    ["async", { ...entry, async: true }, plantUml, "sequence-ledger-async-mismatch"],
    ["isResponse", { ...entry, isResponse: true }, plantUml, "sequence-ledger-response-mismatch"],
    ["interfaceType", entry, plantUml.replace("(DB: Archive Writer)", "(REST API: Archive Writer)"), "sequence-ledger-interface-type-mismatch"],
    ["interfaceName", entry, plantUml.replace("(DB: Archive Writer)", "(DB: Different Name)"), "sequence-ledger-interface-name-mismatch"],
    ["label", entry, plantUml.replace("Registers frames", "Different label"), "sequence-ledger-label-mismatch"]
  ])("reports safe %s ledger mismatch", async (_name, ledger, text, violation) => {
    const { app, calls } = runtime({ plantUml: text, messages: [ledger] });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "semantic-validation-failed", issues: [{
      code: "plantuml-structure", details: { violation, line: 4, order: 1 }
    }] });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("Different Name");
    expect(JSON.stringify(result)).not.toContain("Different label");
  });

  it("binds order N to the N-th arrow, not to a declaration, fragment or other arrow", async () => {
    const two = plantUml.replace("@enduml", "opt Save again\nkp_telescope_scheduler -> kp_image_archive : Again (DB: Archive Writer)\nend\n@enduml");
    const second = { ...entry, order: 2, lineNumber: 6, label: "Again" };
    const good = runtime({ plantUml: two, messages: [entry, second] });
    expect((await good.app.generateDiagram!({ ...request })).status).toBe("success");
    const swapped = runtime({ plantUml: two, messages: [second, entry] });
    expect(await swapped.app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", issues: [{ details: { violation: "sequence-ledger-order-mismatch", line: 4, order: 1 } }] });
    const omitted = runtime({ plantUml: two, messages: [entry] });
    expect(await omitted.app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", issues: [{ details: { violation: "sequence-ledger-count-mismatch", line: 6, order: 2 } }] });
    const extra = runtime({ plantUml, messages: [entry, second] });
    expect(await extra.app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", issues: [{ details: { violation: "sequence-ledger-count-mismatch", line: 5, order: 2 } }] });
    const skipped = runtime({ plantUml: two, messages: [entry, { ...second, order: 3 }] });
    expect(await skipped.app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", issues: [{ details: { violation: "sequence-ledger-order-mismatch", line: 6, order: 2 } }] });
  });

  it("accepts a balanced opt fragment without rewriting final PlantUML", async () => {
    const text = plantUml.replace("kp_telescope_scheduler ->", "opt Retry\nkp_telescope_scheduler ->").replace("@enduml", "end\n@enduml");
    const { app, calls } = runtime({ plantUml: text, messages: [{ ...entry, lineNumber: 5 }] });
    const result = await app.generateDiagram!({ ...request });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plantUml).toBe(text);
    expect(JSON.parse(result.groundingReport).fragments).toMatchObject([{ kind: "opt", firstOrder: 1, lastOrder: 1 }]);
    expect(calls).toHaveLength(1);
  });

  it("requires explicit confirmation of a [NEW] participant before model access", async () => {
    const newFlow = { kind: "document", text: "---\ndiagram_name: new-station\nflow_name: New station\nauthor: Test\nlanguage: en\n---\nTelescope Scheduler sends data to [NEW: Ground Station].\n" } as const;
    const text = "@startuml\nparticipant \"Telescope Scheduler\" as kp_telescope_scheduler\nparticipant \"[NEW] Ground Station\" as new_ground_station\nkp_telescope_scheduler ->> new_ground_station : Sends data (EVENT)\n@enduml\n";
    const { app, calls } = runtime({ plantUml: text, messages: [{ order: 1, lineNumber: 4, from: { elementId: "telescope-scheduler" }, to: { newName: "ground station" }, label: "Sends data", interfaceType: "EVENT", interfaceName: null, async: true, isResponse: false }] });
    const blocked = await app.generateDiagram!({ ...request, flow: newFlow });
    expect(blocked).toMatchObject({ status: "failed", stage: "grounding-blocked" });
    expect(calls).toHaveLength(0);
    const confirmed = await app.generateDiagram!({ ...request, flow: newFlow, confirmedNewParticipants: ["Ground Station"] });
    expect(confirmed.status).toBe("success");
    if (confirmed.status !== "success") return;
    expect(confirmed.plantUml).toBe(text);
    expect(confirmed.summary).toMatchObject({ newParticipantCount: 1, asynchronousCount: 1 });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["extra envelope field", { ...answer, other: true }, "invalid-generator-output"],
    ["oversized envelope", { plantUml: "x".repeat(256 * 1024 + 1), messages: [entry] }, "invalid-generator-output"],
    ["missing async", { plantUml, messages: [{ ...entry, async: undefined }] }, "invalid-generator-output"],
    ["missing line number", { plantUml, messages: [{ ...entry, lineNumber: undefined }] }, "invalid-generator-output"],
    ["line at declaration", { plantUml, messages: [{ ...entry, lineNumber: 2 }] }, "semantic-validation-failed"],
    ["line shifted", { plantUml, messages: [{ ...entry, lineNumber: 5 }] }, "semantic-validation-failed"],
    ["missing interface name", { plantUml, messages: [{ ...entry, interfaceName: undefined }] }, "invalid-generator-output"],
    ["large extra field", { ...answer, extra: "synthetic-secret".repeat(100_000) }, "invalid-generator-output"],
    ["both flags", { plantUml, messages: [{ ...entry, async: true, isResponse: true }] }, "semantic-validation-failed"],
    ["wrong arrow", { plantUml: plantUml.replace(" -> ", " ->> "), messages: [entry] }, "semantic-validation-failed"],
    ["wrong label", { plantUml: plantUml.replace("Registers frames", "Invents frames"), messages: [entry] }, "semantic-validation-failed"],
    ["wrong canonical name", { plantUml: plantUml.replace("Image Archive", "Archive"), messages: [entry] }, "semantic-validation-failed"],
    ["directive", { plantUml: plantUml.replace("@enduml", "!include secret\n@enduml"), messages: [entry] }, "render-validation-failed"],
    ["extra statement", { plantUml: plantUml.replace("@enduml", "note over kp_image_archive: x\n@enduml"), messages: [entry] }, "semantic-validation-failed"],
    ["invented relation", { plantUml, messages: [{ ...entry, interfaceType: "EVENT" }] }, "semantic-validation-failed"],
    ["unsupported interface name", { plantUml: plantUml.replace("Archive Writer", "Invented"), messages: [{ ...entry, interfaceName: "Invented" }] }, "semantic-validation-failed"],
    ["missing end marker", { plantUml: plantUml.replace("@enduml\n", ""), messages: [entry] }, "render-validation-failed"]
  ])("rejects %s without a second call", async (_name, value, stage) => {
    const { app, calls } = runtime(value);
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage });
    expect(calls).toHaveLength(1);
  });

  it("accepts required interfaceName null when the grounded relationship has no name", async () => {
    const text = plantUml.replace(" (DB: Archive Writer)", " (DB)");
    const directory = path.join(root, "unnamed-interface");
    mkdirSync(directory);
    for (const [name, content] of Object.entries(buildPackFiles({ relationships: basePackRows.relationships.map((row) =>
      row[1] === "image-archive" ? [row[0]!, row[1]!, row[2]!, "", row[4]!, row[5]!] : row) }))) writeFileSync(path.join(directory, name), content);
    const { app } = runtime({ plantUml: text, messages: [{ ...entry, interfaceName: null }] });
    expect((await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).status).toBe("success");
  });

  it("rejects two ledger entries naming the same arrow line", async () => {
    const text = plantUml.replace("@enduml", "kp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)\n@enduml");
    const { app } = runtime({ plantUml: text, messages: [entry, { ...entry, order: 2 }] });
    expect(await app.generateDiagram!({ ...request })).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
  });

  it("binds a response to the synchronous request when the pack also has an async relation", async () => {
    const directory = path.join(root, "mixed-modes");
    mkdirSync(directory);
    const relationships = [...basePackRows.relationships, ["telescope-scheduler", "image-archive", "DB", "Archive Writer", "asynchronous", "Queues frames"]];
    for (const [name, content] of Object.entries(buildPackFiles({ relationships }))) writeFileSync(path.join(directory, name), content);
    const arrow = "kp_telescope_scheduler -> kp_image_archive : Registers frames (DB: Archive Writer)";
    const text = plantUml.replace(arrow, `kp_telescope_scheduler ->> kp_image_archive : Queues frames (DB: Archive Writer)\n${arrow}\nkp_image_archive --> kp_telescope_scheduler : Stored frames (DB: Archive Writer)`);
    const event = { ...entry, label: "Queues frames", async: true };
    const sync = { ...entry, order: 2, lineNumber: 5 };
    const reply = { ...entry, order: 3, lineNumber: 6, from: entry.to, to: entry.from, label: "Stored frames", isResponse: true };
    const { app } = runtime({ plantUml: text, messages: [event, sync, reply] });
    expect((await app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).status).toBe("success");
    const onlyAsync = runtime({ plantUml: text.replace(`${arrow}\n`, ""), messages: [event, { ...reply, order: 2, lineNumber: 5 }] });
    expect(await onlyAsync.app.generateDiagram!({ ...request, knowledgePack: { kind: "local-directory", path: directory } })).toMatchObject({ status: "failed", stage: "semantic-validation-failed" });
  });

  it("rejects unsafe client metadata before structured chat", async () => {
    const { app, calls } = runtime(answer, "secret\nvalue");
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "invalid-generator-output", issues: [{ code: "invalid-generator-type" }] });
    expect(calls).toHaveLength(0);
  });

  it("reports timeout without leaking the provider error and makes one completion", async () => {
    let completions = 0;
    const client: StructuredChatClient = {
      clientType: "synthetic-client",
      generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete() { completions += 1; throw Object.assign(new Error("synthetic-secret"), { code: "timeout" }); }
    };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    const result = await app.generateDiagram!({ ...request });
    expect(result).toMatchObject({ status: "failed", stage: "invalid-generator-output", issues: [{ code: "generator-failed" }] });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(completions).toBe(1);
  });

  it("contains a remote transport timeout to one D1 request and a safe diagnostic", async () => {
    const transport = new RemoteJsonTransportDouble(Object.assign(new Error("synthetic-secret"), { code: "timeout" }));
    const app = createArchiAgentRuntime({ remoteTransport: transport });
    const result = await app.generateDiagram!({ ...request, generator: { kind: "remote-provider", profileId: "cloud-openai", modelId: "test-model", credential: { type: "api-key", value: "synthetic-secret" } } });
    expect(result).toMatchObject({ status: "failed", stage: "invalid-generator-output", issues: [{ code: "generator-failed" }] });
    expect(transport.requests).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });

  it("cancels before complete and after a pending completion without another call", async () => {
    const before = runtime(answer);
    expect(await before.app.generateDiagram!({ ...request, signal: { aborted: true } })).toMatchObject({ status: "failed", stage: "knowledge-pack" });
    expect(before.calls).toHaveLength(0);
    const signal = { aborted: false };
    let completions = 0;
    const client: StructuredChatClient = {
      clientType: "synthetic-client",
      generationMetadata: { modelId: "test-model", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete() { completions += 1; signal.aborted = true; return { source: "content", value: answer }; }
    };
    const app = createArchiAgentRuntime({ diagramClientFactory: () => client });
    expect(await app.generateDiagram!({ ...request, signal })).toMatchObject({ status: "failed", stage: "invalid-generator-output" });
    expect(completions).toBe(1);
  });

  it.each(["component", "c4-context", "c4-container", "archimate-hld", "unknown"])("rejects %s before any source or provider I/O", async (diagramType) => {
    const { app, calls } = runtime(answer);
    const result = await app.generateDiagram!({ ...request, diagramType: diagramType as "sequence", flow: { kind: "file", path: "/does/not/exist" }, knowledgePack: { kind: "local-directory", path: "/does/not/exist" } });
    expect(result).toMatchObject({ status: "failed", stage: "generator-configuration", issues: [{ code: "diagram-type-unsupported" }] });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["cloud-anthropic", "anthropic-messages", (content: string) => JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: content }] })],
    ["cloud-openai", "openai-chat-completions", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })],
    ["cloud-openrouter", "openrouter-chat-completions", (content: string) => JSON.stringify({ choices: [{ finish_reason: "stop", message: { content, refusal: null } }] })]
  ])("uses one %s provider request for final PlantUML", async (profileId, endpoint, response) => {
    const transport = new RemoteJsonTransportDouble(response(JSON.stringify(answer)));
    const app = createArchiAgentRuntime({ remoteTransport: transport });
    const result = await app.generateDiagram!({ ...request, generator: { kind: "remote-provider", profileId, modelId: "test-model", credential: { type: "api-key", value: "synthetic-secret" } } });
    expect(result.status).toBe("success");
    expect(transport.requests.map((sent) => sent.endpoint)).toEqual([endpoint]);
    if (profileId === "cloud-openai" || profileId === "cloud-openrouter") {
      const sent = JSON.parse(transport.requests[0]?.body ?? "{}");
      expect(sent.response_format.json_schema).toEqual({ name: "final_plantuml_sequence", strict: true, schema: diagramEnvelopeSchema });
    }
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });

  it("uses one local OpenAI-compatible POST for final PlantUML", async () => {
    const server = await OpenAiCompatibleServerDouble.start({ completionContent: JSON.stringify(answer) });
    try {
      const app = createArchiAgentRuntime();
      const result = await app.generateDiagram!({ ...request, generator: { ...generator, baseUrl: server.baseUrl } });
      expect(result.status).toBe("success");
      expect(server.requests.map((sent) => [sent.method, sent.path])).toEqual([["POST", "/v1/chat/completions"]]);
    } finally {
      await server.close();
    }
  });

  it.each(["local-lm-studio", "local-ollama"])("uses the %s profile through one local POST", async (profileId) => {
    const server = await OpenAiCompatibleServerDouble.start({ completionContent: JSON.stringify(answer) });
    try {
      const app = createArchiAgentRuntime();
      const result = await app.generateDiagram!({ ...request, generator: { kind: "openai-compatible-local", profileId, modelId: "test-model", baseUrl: server.baseUrl } });
      expect(result.status).toBe("success");
      expect(server.requests.map((sent) => [sent.method, sent.path])).toEqual([["POST", "/v1/chat/completions"]]);
    } finally {
      await server.close();
    }
  });
});
