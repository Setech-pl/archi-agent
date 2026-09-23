import { describe, expect, it } from "vitest";
import { createOperationCatalog, renderSequencePlan, sequenceDiagramPlanSchema, sequencePlanLimits, sequenceReviewLimits,
  validateSequencePlan, validateSequenceReview } from "../../../src/core/pipeline/sequence-diagram-plan.js";
import type { ArchitectureSnapshot } from "../../../src/core/pipeline/reviewed-sequence.js";
import { renderedDocumentFailure } from "../../../src/core/pipeline/generate-diagram.js";

const snapshot = {
  snapshotId: "snapshot-test", digest: "abc", flowFile: "flows/test.md", metadata: {},
  elements: [
    { id: "actor", canonicalName: "Operator", alias: "kp_actor", kind: "actor" },
    { id: "system", canonicalName: "System", alias: "kp_system", kind: "system" },
    { id: "database", canonicalName: "Archive", alias: "kp_database", kind: "database" },
    { id: "queue", canonicalName: "Queue", alias: "kp_queue", kind: "queue" }
  ],
  relationships: [
    { evidenceId: "relationship:1", evidenceClass: "source-confirmed", fromId: "system", toId: "database", interfaceType: "DB", interfaceName: "Exact Writer", mode: "synchronous", source: { file: "relationships.md", line: 3 }, purpose: "Store" },
    { evidenceId: "relationship:2", evidenceClass: "source-confirmed", fromId: "system", toId: "queue", interfaceType: "EVENT", interfaceName: "Exact Event", mode: "asynchronous", source: { file: "relationships.md", line: 4 }, purpose: "Notify" },
    { evidenceId: "relationship:3", evidenceClass: "source-confirmed", fromId: "actor", toId: "system", interfaceType: "EVENT", interfaceName: null, mode: "synchronous", source: { file: "relationships.md", line: 5 }, purpose: "Start" }
  ], rules: [], flowEvidence: [{ flowEvidenceId: "flow:7", evidenceClass: "user-stated", line: 7, text: "Archive reports to Operator" }], sources: []
} as unknown as ArchitectureSnapshot;
const grounded = { order: 1, operationId: "op-0001", label: "Store item" };
const user = { order: 1, fromId: "database", toId: "actor", interactionKind: "request", interfaceType: "REST API",
  interfaceName: "Status", flowEvidenceId: "flow:7", label: "Report" };
const plan = { version: 3, groundedSteps: [grounded], userStatedSteps: [] };
const checked = (input: unknown = plan, context = snapshot) => validateSequencePlan(input, context);
const changed = (fields: object) => ({ ...plan, groundedSteps: [{ ...grounded, ...fields }] });
const withUser = (fields: object = {}) => ({ version: 3, groundedSteps: [], userStatedSteps: [{ ...user, ...fields }] });

describe("SequenceDiagramPlan V3", () => {
  it("has an exact closed envelope and distinct exact step shapes", () => {
    expect(Object.keys(sequenceDiagramPlanSchema.shape)).toEqual(["version", "groundedSteps", "userStatedSteps"]);
    expect(Object.keys(sequenceDiagramPlanSchema.shape.groundedSteps.element.shape)).toEqual(["order", "operationId", "label"]);
    expect(Object.keys(sequenceDiagramPlanSchema.shape.userStatedSteps.element.shape)).toEqual([
      "order", "fromId", "toId", "interactionKind", "interfaceType", "interfaceName", "flowEvidenceId", "label"]);
    expect(sequenceDiagramPlanSchema.safeParse(plan).success).toBe(true);
    for (const invalid of [{ version: 2, steps: [grounded] }, { ...plan, steps: [grounded] },
      { version: 3, groundedSteps: [grounded] }, { version: 3, userStatedSteps: [user] },
      { ...plan, extra: 1 }, changed({ stepType: "grounded-operation" }), changed({ fromId: "actor" }),
      changed({ factId: "fact-0001" }), changed({ requestFactId: null }), changed({ mode: "synchronous" }),
      changed({ evidenceClass: "source-confirmed" }), changed({ relationshipEvidenceId: "relationship:1" }),
      withUser({ operationId: "op-0001" }), withUser({ stepType: "user-stated-interaction" }),
      withUser({ interfaceName: undefined }), withUser({ interactionKind: "response" })])
      expect(sequenceDiagramPlanSchema.safeParse(invalid).success).toBe(false);
    expect(checked({ version: 3, groundedSteps: [], userStatedSteps: [] })).toMatchObject({ ok: false, code: "empty-plan" });
  });

  it("merges interleaved orders, assigns facts after merge and derives first-use participants", () => {
    const input = { version: 3, groundedSteps: [
      { ...grounded, order: 3, operationId: "op-0002", label: "Stored" },
      { ...grounded, order: 1, operationId: "op-0001" }],
    userStatedSteps: [{ ...user, order: 2 }] };
    const result = checked(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ version: 3, participantIds: ["system", "database", "actor"], facts: [
      { factId: "fact-0001", operationId: "op-0001" }, { factId: "fact-0002", flowEvidenceId: "flow:7" },
      { factId: "fact-0003", operationId: "op-0002", requestFactId: "fact-0001" }] });
    const rendered = renderSequencePlan(result.value, snapshot);
    expect(rendered.plantUml).toContain("kp_database --> kp_system : Stored (DB: Exact Writer)");
    expect(Object.fromEntries(rendered.lines)).toEqual({ "fact-0001": 5, "fact-0002": 6, "fact-0003": 7 });
  });

  it("rejects duplicate, missing, nonpositive, fractional and gapped orders without renumbering", () => {
    expect(checked({ ...plan, userStatedSteps: [user] })).toMatchObject({ ok: false, code: "duplicate-order" });
    for (const value of [undefined, 0, -1, 1.5, 513])
      expect(checked(changed({ order: value })).ok).toBe(false);
    expect(checked(changed({ order: 2 }))).toMatchObject({ ok: false, code: "order-gap", order: 2 });
    expect(checked({ ...plan, groundedSteps: [grounded, { ...grounded, order: 3, operationId: "op-0003" }] }))
      .toMatchObject({ ok: false, code: "order-gap", order: 3 });
    expect(checked({ ...plan, groundedSteps: Array.from({ length: sequencePlanLimits.maxMessages + 1 }, (_, i) =>
      ({ ...grounded, order: i + 1 })) }).ok).toBe(false);
  });

  it("resolves only catalog operation semantics and rejects unknown, duplicate and premature response", () => {
    const catalog = createOperationCatalog(snapshot);
    expect(catalog.map((entry) => [entry.operationId, entry.kind])).toEqual([
      ["op-0001", "request"], ["op-0002", "response"], ["op-0003", "asynchronous"],
      ["op-0004", "request"], ["op-0005", "response"]]);
    const first = checked();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.facts[0]).toMatchObject({ fromId: "system", toId: "database", interfaceType: "DB",
      interfaceName: "Exact Writer", evidenceId: "relationship:1", mode: "synchronous" });
    expect(checked(changed({ operationId: "op-9999" }))).toMatchObject({ ok: false, code: "unknown-operation-id" });
    expect(checked(changed({ operationId: "op-0002" }))).toMatchObject({ ok: false, code: "response-before-request" });
    expect(checked({ ...plan, groundedSteps: [grounded, { ...grounded, order: 2 }] }))
      .toMatchObject({ ok: false, code: "duplicate-operation-id" });
    const asyncPlan = checked(changed({ operationId: "op-0003" }));
    expect(asyncPlan.ok && asyncPlan.value.facts[0]?.kind).toBe("asynchronous");
    expect(renderSequencePlan(first.value, snapshot).plantUml).toContain("kp_system -> kp_database : Store item (DB: Exact Writer)");
    expect(() => renderSequencePlan(plan as never, snapshot)).toThrow("resolved-plan-required");
  });

  it("keeps user-stated facts pending exact review and blocks unsafe references and conflicts", () => {
    const result = checked(withUser());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateSequenceReview({ accepted: true, violations: [], confirmedUserStatedFactIds: [] }, result.value).ok).toBe(false);
    expect(validateSequenceReview({ accepted: true, violations: [], confirmedUserStatedFactIds: ["fact-0001"] }, result.value).ok).toBe(true);
    expect(validateSequenceReview({ accepted: true, violations: [], confirmedUserStatedFactIds: ["fact-9999"] }, result.value).ok).toBe(false);
    for (const fields of [{ flowEvidenceId: "flow:8" }, { fromId: "missing" }, { toId: "missing" },
      { interactionKind: "response" }, { operationId: "op-0001" }]) expect(checked(withUser(fields)).ok).toBe(false);
    expect(checked(withUser({ interactionKind: "asynchronous" })).ok).toBe(true);
    expect(checked(withUser({ fromId: "system", toId: "database" }))).toMatchObject({ ok: false, code: "source-confirmed-conflict" });
    const reversed = { fromId: "database", toId: "system", interfaceType: "DB", interfaceName: "Exact Writer" };
    for (const interfaceName of [null, "exact writer", "Exact Writer"])
      expect(checked(withUser({ ...reversed, interfaceName }))).toMatchObject({ ok: false, code: "interaction-direction-mismatch" });
    expect(checked(withUser({ ...reversed, interfaceName: "Independent" })).ok).toBe(true);
    expect(checked(withUser({ ...reversed, interfaceType: "EVENT" })).ok).toBe(true);
    expect(checked(withUser({ fromId: "system", toId: "actor", interfaceType: "EVENT", interfaceName: null })))
      .toMatchObject({ ok: false, code: "interaction-direction-mismatch" });
    const forbidden = { ...snapshot, rules: [{ evidenceId: "rule:1", rule: "forbid", fromId: "database", toId: "actor",
      reason: "Denied", source: { file: "rules.md", line: 1 } }] } as ArchitectureSnapshot;
    expect(checked(withUser(), forbidden)).toMatchObject({ ok: false, code: "forbidden-interaction" });
  });

  it("validates every field and reference of the bounded reviewer verdict locally", () => {
    const result = checked({ version: 3, groundedSteps: [grounded], userStatedSteps: [{ ...user, order: 2 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const accept = { accepted: true, confirmedUserStatedFactIds: ["fact-0002"], violations: [] };
    const issue = { code: "unsupported-user-stated-evidence", factId: "fact-0002" };
    const reject = { accepted: false, confirmedUserStatedFactIds: [], violations: [issue] };
    expect(validateSequenceReview(accept, result.value)).toMatchObject({ ok: true, accepted: true });
    expect(validateSequenceReview(reject, result.value)).toMatchObject({ ok: true, accepted: false,
      violationCodes: ["unsupported-user-stated-evidence"] });
    expect(validateSequenceReview({ ...accept, confirmedUserStatedFactIds: ["fact-0001", "fact-0002"] }, result.value))
      .toMatchObject({ ok: false, code: "accepted-confirmations-mismatch", accepted: true, confirmationCount: 2, violationCount: 0 });
    expect(validateSequenceReview({ ...accept, confirmedUserStatedFactIds: ["fact-9999"] }, result.value))
      .toMatchObject({ ok: false, code: "unknown-confirmed-fact" });
    expect(validateSequenceReview({ ...reject, violations: [{ ...issue, code: "other" }] }, result.value))
      .toMatchObject({ ok: false, code: "unsupported-violation-code" });
    for (const [verdict, code] of [
      [{ ...accept, violations: [issue] }, "accepted-with-violations"],
      [{ ...accept, confirmedUserStatedFactIds: [] }, "accepted-confirmations-mismatch"],
      [{ ...accept, confirmedUserStatedFactIds: ["fact-0002", "fact-0002"] }, "duplicate-fact-reference"],
      [{ ...reject, confirmedUserStatedFactIds: ["fact-0002"] }, "rejected-with-confirmations"],
      [{ ...reject, violations: [] }, "rejected-without-violations"],
      [{ ...reject, violations: [{ ...issue, factId: "fact-9999" }] }, "unknown-violation-fact"],
      [{ ...reject, extra: "SECRET_RESPONSE_BODY" }, "schema-invalid"]
    ] as const) expect(validateSequenceReview(verdict, result.value)).toMatchObject({ ok: false, code });
    expect(validateSequenceReview({ ...reject, violations: [{ ...issue, factId: null }] }, result.value).ok).toBe(true);
    for (const verdict of [
      { ...accept, violations: [issue] }, { ...accept, confirmedUserStatedFactIds: [] },
      { ...accept, confirmedUserStatedFactIds: ["fact-0001"] },
      { ...accept, confirmedUserStatedFactIds: ["fact-0002", "fact-0002"] },
      { ...reject, confirmedUserStatedFactIds: ["fact-0002"] }, { ...reject, violations: [] },
      { ...reject, violations: [issue, issue] }, { ...reject, violations: [{ ...issue, factId: "fact-9999" }] },
      { ...reject, violations: [{ ...issue, code: "other" }] },
      { ...reject, violations: [{ ...issue, explanation: "raw text" }] },
      { ...reject, extra: true }, { accepted: false, violations: [issue] },
      { ...accept, confirmedUserStatedFactIds: Array.from({ length: sequenceReviewLimits.maxConfirmations + 1 }, () => "fact-0002") },
      { ...reject, violations: Array.from({ length: sequenceReviewLimits.maxViolations + 1 }, () => issue) },
      { ...reject, violations: [{ ...issue, factId: "fact-00001" }] }
    ]) expect(validateSequenceReview(verdict, result.value).ok).toBe(false);
    const groundedOnly = checked();
    if (groundedOnly.ok) expect(validateSequenceReview({ accepted: true, confirmedUserStatedFactIds: [], violations: [] }, groundedOnly.value).ok).toBe(true);
    expect(sequenceReviewLimits.maxTokens).toBe(8192);
    expect(sequenceReviewLimits.maxTokens).toBeLessThanOrEqual(16384);
  });

  it("uses the shared 160-character safe label policy", () => {
    expect(checked(changed({ label: "x".repeat(160) })).ok).toBe(true);
    expect(checked(changed({ label: "x".repeat(161) })).ok).toBe(false);
    for (const label of ['Say "hello"', "path\\part", "first\nsecond", "@startuml", "https://example.test"])
      expect(checked(changed({ label })).ok).toBe(false);
    for (const label of ["Store item: phase 2, ready?", "Send (status) - OK; next step."]) {
      const result = checked(changed({ label }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(renderedDocumentFailure(renderSequencePlan(result.value, snapshot).plantUml)).toBeUndefined();
    }
  });
});
