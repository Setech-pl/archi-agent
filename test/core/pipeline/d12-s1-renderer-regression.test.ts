import { describe, expect, it } from "vitest";
import { parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { InMemoryKnowledgePackSource } from "../../../src/core/knowledge-pack/in-memory-knowledge-pack-source.js";
import { loadKnowledgePack } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { knowledgePackArchitectureProvider } from "../../../src/core/pipeline/reviewed-sequence.js";
import { createOperationCatalog, renderSequencePlan, validateSequencePlan } from "../../../src/core/pipeline/sequence-diagram-plan.js";
import { validatePlantUmlDocument } from "../../../src/core/validation/plantuml-document-validator.js";
import { validatePlantUmlSubset } from "../../../src/core/validation/plantuml-validator.js";
import { buildPackFiles } from "../../doubles/knowledge-pack-fixture.js";

describe("D1.2 S1-shaped renderer regression", () => {
  it("builds a production snapshot and emits one exact valid document for every interaction kind", async () => {
    const files = buildPackFiles({
      actors: [["requester", "Requester", "role", "Starts work"]],
      systems: [
        ["work-service", "Work Service", "service", "Processes work"],
        ["audit-store", "Audit Store", "database", "Stores records"],
        ["notification-hub", "Notification Hub", "queue", "Receives events"]
      ],
      relationships: [
        ["requester", "work-service", "REST_API", "Submit Work", "synchronous", "Submits work"],
        ["work-service", "audit-store", "DB", "Record Writer", "synchronous", "Writes records"],
        ["work-service", "notification-hub", "EVENT", "Work Ready", "asynchronous", "Publishes completion"]
      ], aliases: [], rules: []
    });
    const loaded = await loadKnowledgePack(new InMemoryKnowledgePackSource(Object.entries(files)));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const flow = parseFlowDocument("---\ndiagram_name: work-flow\nflow_name: Work flow\nauthor: Test\nlanguage: en\n---\nRequester submits work to Work Service.\nWork Service writes to Audit Store and publishes to Notification Hub.\nAudit Store notifies Requester of the record.\n", { file: "work-flow.md" });
    expect(flow.ok).toBe(true);
    if (!flow.ok) return;
    const resolved = knowledgePackArchitectureProvider.resolve({ flow: flow.flow, knowledgePack: { pack: loaded.pack, indexes: loaded.indexes } });
    expect(resolved.status).not.toBe("blocked");
    if (!resolved.snapshot) return;
    const snapshot = resolved.snapshot;
    const catalog = createOperationCatalog(snapshot);
    const source = (order: number, fromId: string, toId: string, kind: "request" | "response" | "asynchronous", label: string) =>
      ({ order, operationId: catalog.find((entry) => entry.fromId === fromId && entry.toId === toId && entry.kind === kind)!.operationId, label });
    const plan = { version: 3, groundedSteps: [
      source(1, "requester", "work-service", "request", "Submit work"),
      source(2, "work-service", "audit-store", "request", "Write record"),
      source(3, "audit-store", "work-service", "response", "Recorded"),
      source(4, "work-service", "notification-hub", "asynchronous", "Work ready")
    ], userStatedSteps: [
      { order: 5, fromId: "audit-store", toId: "requester", interactionKind: "request", label: "Notify requester",
        interfaceType: "EVENT", interfaceName: "Record Notice", flowEvidenceId: snapshot.flowEvidence[2]!.flowEvidenceId }
    ] };
    const checked = validateSequencePlan(plan, snapshot);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const rendered = renderSequencePlan(checked.value, snapshot);
    const golden = '@startuml\nactor "Requester" as kp_requester\nparticipant "Work Service" as kp_work_service\ndatabase "Audit Store" as kp_audit_store\nqueue "Notification Hub" as kp_notification_hub\nkp_requester -> kp_work_service : Submit work (REST API: Submit Work)\nkp_work_service -> kp_audit_store : Write record (DB: Record Writer)\nkp_audit_store --> kp_work_service : Recorded (DB: Record Writer)\nkp_work_service ->> kp_notification_hub : Work ready (EVENT: Work Ready)\nkp_audit_store -> kp_requester : Notify requester (EVENT: Record Notice)\n@enduml\n';
    expect(rendered.plantUml).toBe(golden);
    expect(Object.fromEntries(rendered.lines)).toEqual({ "fact-0001": 6, "fact-0002": 7, "fact-0003": 8, "fact-0004": 9, "fact-0005": 10 });
    expect(rendered.plantUml.endsWith("\n")).toBe(true);
    expect(rendered.plantUml.match(/@startuml/g)).toHaveLength(1);
    expect(rendered.plantUml.match(/@enduml/g)).toHaveLength(1);
    expect(rendered.plantUml.split("\n").at(-2)).toBe("@enduml");
    expect(validatePlantUmlDocument(rendered.plantUml)).toEqual([]);
    expect(validatePlantUmlSubset(rendered.plantUml)).toEqual({ ok: true, issues: [], truncated: false });
  });
});
