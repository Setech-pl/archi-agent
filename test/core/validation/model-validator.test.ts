import { describe, expect, it } from "vitest";
import type { GeneratedSequenceModel, SequenceFragment } from "../../../src/core/model/sequence-diagram-model.schema.js";
import type { SequenceMessage, SequenceParticipant } from "../../../src/core/model/types.js";
import {
  createModelIssue,
  hasModelErrors,
  modelIssueCodes,
  severityOfModelIssue,
  sortModelIssues,
  validateMetadataText,
  validateModelStructure
} from "../../../src/core/validation/model-validator.js";

const LF = String.fromCharCode(10);

const missionControl: SequenceParticipant = { origin: "knowledge-pack", elementId: "mission-control", canonicalName: "Mission Control", kind: "system" };
const commandService: SequenceParticipant = { origin: "knowledge-pack", elementId: "command-service", canonicalName: "Command Service", kind: "system" };
const orbitalRelay: SequenceParticipant = { origin: "knowledge-pack", elementId: "orbital-relay", canonicalName: "Orbital Relay", kind: "system" };

function message(order: number, overrides: Partial<SequenceMessage> = {}): SequenceMessage {
  return {
    from: { elementId: "mission-control" },
    to: { elementId: "command-service" },
    label: `Step ${order}`,
    interfaceType: "REST API",
    order,
    ...overrides
  };
}

function model(
  messages: SequenceMessage[] = [message(1)],
  participants: SequenceParticipant[] = [missionControl, commandService],
  fragments: SequenceFragment[] = []
): GeneratedSequenceModel {
  return { participants, messages, fragments };
}

function codes(target: GeneratedSequenceModel): string[] {
  return validateModelStructure(target).map((issue) => `${issue.code} at ${issue.path ?? "-"}`);
}

describe("model issue contract", () => {
  it("gives every code a fixed severity and message", () => {
    expect(modelIssueCodes).toContain("invalid-fragment");
    expect(modelIssueCodes).toContain("internal-endpoint-mismatch");

    for (const code of modelIssueCodes) {
      const issue = createModelIssue(code);
      expect(issue.severity).toBe(severityOfModelIssue(code));
      expect(issue.message.length).toBeGreaterThan(10);
      expect(Object.isFrozen(issue)).toBe(true);
    }

    expect(severityOfModelIssue("interface-name-removed")).toBe("warning");
    expect(severityOfModelIssue("unverified-new-participant-interaction")).toBe("warning");
    expect(severityOfModelIssue("missing-relationship")).toBe("error");
  });

  it("accepts only schema paths and bounded identifier details", () => {
    expect(createModelIssue("unsafe-text", { path: "messages.2.label", details: { order: 3, elementId: "mission-control" } })).toEqual({
      severity: "error",
      code: "unsafe-text",
      message: createModelIssue("unsafe-text").message,
      path: "messages.2.label",
      details: { elementId: "mission-control", order: 3 }
    });
    expect(() => createModelIssue("unsafe-text", { path: "messages/2" })).toThrow();
    expect(() => createModelIssue("unsafe-text", { details: { value: "Say <b>" } })).toThrow();
    expect(() => createModelIssue("unsafe-text", { details: { value: `a${LF}b` } })).toThrow();
    expect(() => createModelIssue("unsafe-text", { details: { Bad: 1 } })).toThrow();
    expect(() => createModelIssue("unsafe-text", { details: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 } })).toThrow();
    expect(() => createModelIssue("unsafe-text", { details: { order: 1.5 } })).toThrow();
  });

  it("sorts, de-duplicates and caps issues deterministically", () => {
    const issues = [
      createModelIssue("unused-participant", { path: "participants.10" }),
      createModelIssue("unused-participant", { path: "participants.2" }),
      createModelIssue("unused-participant", { path: "participants.2" }),
      createModelIssue("empty-diagram")
    ];

    expect(sortModelIssues(issues).map((issue) => issue.path ?? "-")).toEqual(["participants.2", "participants.10", "-"]);

    const capped = sortModelIssues(issues, 2);
    expect(capped).toHaveLength(3);
    expect(capped[2]).toEqual(createModelIssue("too-many-issues", { details: { limit: 2 } }));
    expect(hasModelErrors(capped)).toBe(true);
    expect(hasModelErrors([createModelIssue("interface-name-removed")])).toBe(false);
  });
});

describe("validateModelStructure", () => {
  it("accepts a well-formed model", () => {
    expect(validateModelStructure(model([message(1), message(2, { isResponse: true, from: { elementId: "command-service" }, to: { elementId: "mission-control" } })]))).toEqual([]);
  });

  it("rejects an empty diagram", () => {
    expect(codes(model([], []))).toEqual(["empty-diagram at -"]);
  });

  it("rejects duplicate participant references and undeclared endpoints", () => {
    expect(codes(model([message(1)], [missionControl, commandService, missionControl]))).toContain("duplicate-participant at participants.2");
    expect(codes(model([message(1, { to: { elementId: "telemetry-store" } })], [missionControl]))).toContain("undeclared-endpoint at messages.0.to");
  });

  it("rejects orphan participants that take part in no message", () => {
    expect(codes(model([message(1)], [missionControl, commandService, orbitalRelay]))).toEqual(["unused-participant at participants.2"]);
  });

  it("allows a self-message only as INTERNAL and a response only as synchronous", () => {
    const self = { from: { elementId: "command-service" }, to: { elementId: "command-service" } } as const;

    expect(codes(model([message(1), message(2, { ...self, interfaceType: "INTERNAL" })]))).toEqual([]);
    expect(codes(model([message(1), message(2, { ...self, interfaceType: "EVENT" })]))).toEqual(["self-message-not-internal at messages.1"]);
    expect(codes(model([message(1, { isResponse: true, async: true })]))).toEqual(["response-mode-invalid at messages.0"]);
  });

  it("does not treat INTERNAL between different participants as a self-message", () => {
    expect(codes(model([message(1, { interfaceType: "INTERNAL" })]))).toEqual([]);
    expect(createModelIssue("internal-endpoint-mismatch").message).toContain("two different participants");
    expect(createModelIssue("internal-endpoint-mismatch").message).not.toContain("same participant");
  });

  it("rejects unsafe text before rendering, even when the schema was bypassed", () => {
    expect(codes(model([message(1, { label: "@startuml" })]))).toEqual(["unsafe-text at messages.0.label"]);
    expect(codes(model([message(1, { interfaceName: "Api [[link]]" })]))).toEqual(["unsafe-text at messages.0.interfaceName"]);
    expect(codes(model([message(1, { businessDescription: "note over A" })]))).toEqual(["unsafe-text at messages.0.businessDescription"]);
    expect(codes(model([message(1)], [{ ...missionControl, canonicalName: 'Mission "Control"' }, commandService]))).toEqual([
      "unsafe-text at participants.0"
    ]);
  });

  it("validates fragment ranges, nesting and condition text", () => {
    const messages = [1, 2, 3, 4].map((order) => message(order));
    const opt = (condition: string, firstOrder: number, lastOrder: number): SequenceFragment => ({
      kind: "opt",
      condition,
      firstOrder,
      lastOrder,
      elseBranches: []
    });

    expect(codes(model(messages, undefined, [opt("Retry", 1, 2), opt("Later", 3, 4)]))).toEqual([]);
    expect(codes(model(messages, undefined, [opt("Retry", 1, 3), opt("Later", 2, 4)]))).toEqual(["invalid-fragment at fragments.1"]);
    expect(codes(model(messages, undefined, [opt("Retry", 1, 9)]))).toEqual(["invalid-fragment at fragments.0"]);
    expect(codes(model(messages, undefined, [opt("end", 1, 2)]))).toEqual(["unsafe-text at fragments.0.condition"]);
    expect(
      codes(
        model(messages, undefined, [
          { kind: "alt", condition: "Accepted", firstOrder: 1, lastOrder: 4, elseBranches: [{ condition: "!include x", firstOrder: 3 }] }
        ])
      )
    ).toEqual(["unsafe-text at fragments.0.elseBranches.0.condition"]);

    const [issue] = validateModelStructure(model(messages, undefined, [opt("Retry", 1, 3), opt("Later", 2, 4)]));
    expect(issue?.details).toEqual({ problem: "overlapping-fragments" });
  });
});

describe("validateMetadataText", () => {
  it("accepts safe flow metadata and rejects values that are unsafe in PlantUML comments", () => {
    const metadata = { diagramName: "telemetry-command-flow", flowName: "Telemetry command flow", author: "Space Mission Sample Team", language: "en" } as const;

    expect(validateMetadataText(metadata)).toEqual([]);
    expect(validateMetadataText({ ...metadata, author: "Team @enduml" }).map((issue) => issue.path)).toEqual(["metadata.author"]);
    expect(validateMetadataText({ ...metadata, flowName: "Flow '/ comment" }).map((issue) => issue.code)).toEqual(["unsafe-metadata"]);
  });
});
