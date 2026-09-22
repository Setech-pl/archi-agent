import { describe, expect, it } from "vitest";
import { parseFlowDocument } from "../../../src/core/grounding/grounded-context-builder.js";
import { InMemoryKnowledgePackSource } from "../../../src/core/knowledge-pack/in-memory-knowledge-pack-source.js";
import { loadKnowledgePack } from "../../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { knowledgePackArchitectureProvider } from "../../../src/core/pipeline/reviewed-sequence.js";
import { renderSequencePlan, validateSequencePlan } from "../../../src/core/pipeline/sequence-diagram-plan.js";
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
    const evidence = (fromId: string, toId: string) => snapshot.relationships.find((entry) => entry.fromId === fromId && entry.toId === toId)!.evidenceId;
    const source = (factId: string, fromId: string, toId: string, kind: "request" | "interaction" | "response", requestFactId: string | null, label: string, evidenceId: string) =>
      ({ factId, fromId, toId, kind, requestFactId, label, evidenceClass: "source-confirmed", evidenceId, flowEvidenceId: null, proposed: null });
    const plan = { planVersion: 1, participantIds: ["requester", "work-service", "audit-store", "notification-hub"], messages: [
      source("m1", "requester", "work-service", "request", null, "Submit work", evidence("requester", "work-service")),
      source("m2", "work-service", "audit-store", "request", null, "Write record", evidence("work-service", "audit-store")),
      source("m3", "audit-store", "work-service", "response", "m2", "Recorded", evidence("work-service", "audit-store")),
      source("m4", "work-service", "notification-hub", "interaction", null, "Work ready", evidence("work-service", "notification-hub")),
      { factId: "m5", fromId: "audit-store", toId: "requester", kind: "interaction", requestFactId: null, label: "Notify requester",
        evidenceClass: "user-stated", evidenceId: null, flowEvidenceId: snapshot.flowEvidence[2]!.flowEvidenceId,
        proposed: { interfaceType: "EVENT", interfaceName: "Record Notice", mode: "synchronous" } }
    ] };
    const checked = validateSequencePlan(plan, snapshot);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const rendered = renderSequencePlan(checked.value, snapshot);
    const golden = '@startuml\nactor "Requester" as kp_requester\nparticipant "Work Service" as kp_work_service\ndatabase "Audit Store" as kp_audit_store\nqueue "Notification Hub" as kp_notification_hub\nkp_requester -> kp_work_service : Submit work (REST API: Submit Work)\nkp_work_service -> kp_audit_store : Write record (DB: Record Writer)\nkp_audit_store --> kp_work_service : Recorded (DB: Record Writer)\nkp_work_service ->> kp_notification_hub : Work ready (EVENT: Work Ready)\nkp_audit_store -> kp_requester : Notify requester (EVENT: Record Notice)\n@enduml\n';
    expect(rendered.plantUml).toBe(golden);
    expect(Object.fromEntries(rendered.lines)).toEqual({ m1: 6, m2: 7, m3: 8, m4: 9, m5: 10 });
    expect(rendered.plantUml.endsWith("\n")).toBe(true);
    expect(rendered.plantUml.match(/@startuml/g)).toHaveLength(1);
    expect(rendered.plantUml.match(/@enduml/g)).toHaveLength(1);
    expect(rendered.plantUml.split("\n").at(-2)).toBe("@enduml");
    expect(validatePlantUmlDocument(rendered.plantUml)).toEqual([]);
    expect(validatePlantUmlSubset(rendered.plantUml)).toEqual({ ok: true, issues: [], truncated: false });
  });
});
