import { describe, expect, it } from "vitest";
import { renderSequencePlan, sequenceDiagramPlanSchema, sequencePlanLimits, validateSequencePlan, validateSequenceReview } from "../../../src/core/pipeline/sequence-diagram-plan.js";
import type { ArchitectureSnapshot } from "../../../src/core/pipeline/reviewed-sequence.js";

const snapshot = {
  snapshotId: "snapshot-test", digest: "abc", flowFile: "flows/test.md", metadata: {},
  elements: [
    { id: "actor", canonicalName: "Operator", kind: "actor" },
    { id: "system", canonicalName: "System", kind: "system" },
    { id: "database", canonicalName: "Archive", kind: "database" },
    { id: "queue", canonicalName: "Queue", kind: "queue" }
  ],
  relationships: [
    { evidenceId: "relationship:1", evidenceClass: "source-confirmed", fromId: "system", toId: "database", interfaceType: "DB", interfaceName: "Exact Writer", mode: "synchronous", source: { file: "relationships.md", line: 3 } },
    { evidenceId: "relationship:2", evidenceClass: "source-confirmed", fromId: "system", toId: "queue", interfaceType: "EVENT", interfaceName: "Exact Event", mode: "asynchronous", source: { file: "relationships.md", line: 4 } },
    { evidenceId: "relationship:3", evidenceClass: "source-confirmed", fromId: "actor", toId: "system", interfaceType: "EVENT", interfaceName: null, mode: "synchronous", source: { file: "relationships.md", line: 5 } }
  ],
  rules: [], flowEvidence: [{ flowEvidenceId: "flow:7", evidenceClass: "user-stated", line: 7, text: "Archive reports to Operator" }], sources: []
} as unknown as ArchitectureSnapshot;
const source = { factId: "m1", fromId: "system", toId: "database", kind: "request", requestFactId: null, label: "Store item", evidenceClass: "source-confirmed", evidenceId: "relationship:1", flowEvidenceId: null, proposed: null } as const;
const plan = { planVersion: 1, participantIds: ["system", "database"], messages: [source] };
function checked(candidate: unknown = plan, context: ArchitectureSnapshot = snapshot) { return validateSequencePlan(candidate, context); }
function candidate(change: object) { return { ...plan, messages: [{ ...source, ...change }] }; }

// All source references and display values are synthetic.
describe("SequenceDiagramPlan validator and renderer", () => {
  it("renders the minimal golden and maps its physical fact line", () => {
    const result = checked();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rendered = renderSequencePlan(result.value, snapshot);
    expect(rendered.plantUml).toBe('@startuml\nparticipant "System" as kp_system\ndatabase "Archive" as kp_database\nkp_system -> kp_database : Store item (DB: Exact Writer)\n@enduml\n');
    expect(Object.fromEntries(rendered.lines)).toEqual({ m1: 4 });
    expect(result.value.facts[0]).toMatchObject({ evidenceClass: "source-confirmed", evidenceId: "relationship:1", source: { file: "relationships.md", line: 3 }, interfaceType: "DB", interfaceName: "Exact Writer" });
  });

  it("uses canonical actor, system, database and queue declarations in plan order", () => {
    const input = { ...plan, participantIds: ["queue", "database", "actor", "system"], messages: [source,
      { ...source, factId: "e1", fromId: "system", toId: "queue", kind: "interaction", evidenceId: "relationship:2" },
      { ...source, factId: "e2", fromId: "actor", toId: "system", evidenceId: "relationship:3" }] };
    const result = checked(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(renderSequencePlan(result.value, snapshot).plantUml.split("\n").slice(1, 5)).toEqual([
      'queue "Queue" as kp_queue', 'database "Archive" as kp_database', 'actor "Operator" as kp_actor', 'participant "System" as kp_system'
    ]);
  });

  it("derives asynchronous EVENT and synchronous EVENT solely from snapshot mode", () => {
    const events = { ...plan, participantIds: ["system", "queue", "actor"], messages: [
      { ...source, factId: "e1", toId: "queue", kind: "interaction", evidenceId: "relationship:2", label: "Publish" },
      { ...source, factId: "e2", fromId: "actor", toId: "system", evidenceId: "relationship:3", label: "Start" }
    ] };
    const result = checked(events);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rendered = renderSequencePlan(result.value, snapshot);
    expect(rendered.plantUml).toContain("kp_system ->> kp_queue : Publish (EVENT: Exact Event)");
    expect(rendered.plantUml).toContain("kp_actor -> kp_system : Start (EVENT)");
    expect(Object.fromEntries(rendered.lines)).toEqual({ e1: 5, e2: 6 });
  });

  it("renders response only after a matching synchronous request", () => {
    const request = { ...source };
    const response = { ...source, factId: "m2", fromId: "database", toId: "system", kind: "response", requestFactId: "m1", label: "Stored" };
    const result = checked({ ...plan, messages: [request, response] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(renderSequencePlan(result.value, snapshot).plantUml).toContain("kp_database --> kp_system : Stored (DB: Exact Writer)");
    for (const messages of [[response], [response, request], [request, { ...response, requestFactId: "other" }],
      [{ ...source, kind: "interaction", evidenceId: "relationship:2", toId: "queue" }, response]])
      expect(checked({ ...plan, participantIds: ["system", "database", "queue"], messages }).ok).toBe(false);
  });

  it.each([
    { participantIds: ["system", "system", "database"] },
    { participantIds: ["system", "missing"] },
    { participantIds: ["system", "database", "queue"] },
    { messages: [source, source] },
    { messages: [{ ...source, evidenceId: "relationship:missing" }] },
    { messages: [{ ...source, fromId: "database", toId: "system" }] },
    { messages: [{ ...source, evidenceClass: "user-stated" }] },
    { messages: [{ ...source, proposed: { interfaceType: "REST API", interfaceName: "Wrong", mode: "asynchronous" } }] }
  ])("rejects unknown, duplicate and conflicting plan references: %j", (change) => {
    expect(checked({ ...plan, ...change }).ok).toBe(false);
  });

  it("rejects explicit forbid before rendering", () => {
    const forbidden = { ...snapshot, rules: [{ evidenceId: "rule:1", rule: "forbid", fromId: "system", toId: "database", reason: "Denied", source: { file: "rules.md", line: 2 } }] } as ArchitectureSnapshot;
    expect(checked(plan, forbidden).ok).toBe(false);
  });

  it("keeps a valid user-stated relation unconfirmed until exact reviewer confirmation", () => {
    const user = { ...source, fromId: "database", toId: "actor", evidenceClass: "user-stated", evidenceId: null,
      flowEvidenceId: "flow:7", proposed: { interfaceType: "REST API", interfaceName: "Status", mode: "synchronous" } };
    const result = checked({ ...plan, participantIds: ["database", "actor"], messages: [user] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facts[0]).toMatchObject({ evidenceClass: "user-stated", evidenceId: "flow:7", source: { file: "flows/test.md", line: 7 } });
    const rendered = renderSequencePlan(result.value, snapshot);
    expect(validateSequenceReview({ verdict: "accept", violations: [], confirmations: [{ factId: "m1", flowEvidenceId: "flow:7" }] }, result.value, rendered, snapshot)).toMatchObject({ ok: true });
    for (const confirmations of [[], [{ factId: "m1", flowEvidenceId: "flow:8" }], [{ factId: "m1", flowEvidenceId: "flow:7" }, { factId: "m1", flowEvidenceId: "flow:7" }]])
      expect(validateSequenceReview({ verdict: "accept", violations: [], confirmations }, result.value, rendered, snapshot).ok).toBe(false);
    for (const change of [{ flowEvidenceId: null }, { flowEvidenceId: "flow:8" }, { evidenceId: "relationship:1" }, { proposed: null }])
      expect(checked({ ...plan, participantIds: ["database", "actor"], messages: [{ ...user, ...change }] }).ok).toBe(false);
    const twoLineSnapshot = { ...snapshot, flowEvidence: [...snapshot.flowEvidence, { flowEvidenceId: "flow:8", evidenceClass: "user-stated", line: 8, text: "Operator acknowledges" }] } as ArchitectureSnapshot;
    const response = { ...user, factId: "m2", fromId: "actor", toId: "database", kind: "response", requestFactId: "m1", flowEvidenceId: "flow:8", label: "Acknowledged" };
    const pair = checked({ ...plan, participantIds: ["database", "actor"], messages: [user, response] }, twoLineSnapshot);
    expect(pair.ok).toBe(true);
    if (pair.ok) expect(validateSequenceReview({ verdict: "accept", violations: [], confirmations: [
      { factId: "m1", flowEvidenceId: "flow:7" }, { factId: "m2", flowEvidenceId: "flow:8" }
    ] }, pair.value, renderSequencePlan(pair.value, twoLineSnapshot), twoLineSnapshot).ok).toBe(true);
  });

  it("rejects malformed, extra, missing and non-JSON plan fields", () => {
    expect(sequenceDiagramPlanSchema.safeParse({ ...plan, extra: true }).success).toBe(false);
    expect(sequenceDiagramPlanSchema.safeParse({ ...plan, messages: [{ ...source, extra: true }] }).success).toBe(false);
    expect(sequenceDiagramPlanSchema.safeParse({ ...plan, messages: [{ ...source, label: undefined }] }).success).toBe(false);
    expect(checked({ ...plan, messages: [{ ...source, label: BigInt(1) }] }).ok).toBe(false);
    expect(checked("{broken").ok).toBe(false);
  });

  it("enforces participant and message limits at and beyond the boundary", () => {
    const repeated = Array.from({ length: sequencePlanLimits.maxMessages }, (_, index) => ({ ...source, factId: `m${index + 1}` }));
    expect(checked({ ...plan, messages: repeated }).ok).toBe(true);
    expect(checked({ ...plan, messages: [...repeated, { ...source, factId: "overflow" }] }).ok).toBe(false);
    expect(sequenceDiagramPlanSchema.safeParse({ ...plan, participantIds: Array.from({ length: sequencePlanLimits.maxParticipants }, (_, index) => `p${index}`) }).success).toBe(true);
    expect(sequenceDiagramPlanSchema.safeParse({ ...plan, participantIds: Array.from({ length: sequencePlanLimits.maxParticipants + 1 }, (_, index) => `p${index}`) }).success).toBe(false);
    expect(checked(candidate({ label: "x".repeat(160) })).ok).toBe(true);
    expect(checked(candidate({ label: "x".repeat(161) })).ok).toBe(false);
    expect(checked(candidate({ factId: "f".repeat(32) })).ok).toBe(true);
    expect(checked(candidate({ factId: "f".repeat(33) })).ok).toBe(false);
  });

  it("escapes quotes and backslashes while rejecting newline and control input", () => {
    const result = checked(candidate({ label: 'Żółć "quoted" \\ path: (done)' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(renderSequencePlan(result.value, snapshot).plantUml).toContain('Żółć \\"quoted\\" \\\\ path: (done)');
    for (const label of ["first\nsecond", "first\rsecond", "bad\u0001control", "bad\u007fcontrol", "first\u2028second", "@startuml", "https://example.test"])
      expect(checked(candidate({ label })).ok).toBe(false);
  });

  it("fails closed on malformed and contradictory reviewer references", () => {
    const result = checked();
    if (!result.ok) throw new Error("fixture");
    const rendered = renderSequencePlan(result.value, snapshot);
    const issue = { code: "coverage-gap", factId: "m1", diagramLine: 4, evidenceIds: ["relationship:1"], explanation: "Missing" };
    expect(validateSequenceReview({ verdict: "reject", violations: [issue], confirmations: [] }, result.value, rendered, snapshot)).toMatchObject({ ok: true, verdict: "reject" });
    for (const changed of [{ ...issue, factId: "missing" }, { ...issue, diagramLine: 3 }, { ...issue, evidenceIds: ["missing"] }])
      expect(validateSequenceReview({ verdict: "reject", violations: [changed], confirmations: [] }, result.value, rendered, snapshot).ok).toBe(false);
    expect(validateSequenceReview({ verdict: "reject", violations: [{ ...issue, factId: null, diagramLine: null, evidenceIds: [] }], confirmations: [] }, result.value, rendered, snapshot).ok).toBe(false);
    expect(validateSequenceReview({ verdict: "reject", violations: [{ ...issue, factId: null, diagramLine: null, evidenceIds: ["flow:7"] }], confirmations: [] }, result.value, rendered, snapshot).ok).toBe(true);
    expect(validateSequenceReview({ verdict: "reject", violations: [issue, issue], confirmations: [] }, result.value, rendered, snapshot).ok).toBe(false);
    expect(validateSequenceReview({ verdict: "accept", violations: [issue], confirmations: [] }, result.value, rendered, snapshot).ok).toBe(false);
  });
});
