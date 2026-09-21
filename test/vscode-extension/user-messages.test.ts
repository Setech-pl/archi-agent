import { describe, expect, it } from "vitest";
import type { GenerateSequenceDiagramFailure, GenerateSequenceDiagramSuccess, RuntimeIssue } from "../../src/runtime/index.js";
import {
  describeCancellation,
  describeFailure,
  describeIssue,
  describeModelListFailure,
  describeSettingsProblems,
  describeSuccess,
  messageLimits
} from "../../vscode-extension/src/user-messages.js";

const baseUrl = "http://127.0.0.1:1234/v1";

function failure(stage: GenerateSequenceDiagramFailure["stage"], issues: readonly RuntimeIssue[], extra: Partial<GenerateSequenceDiagramFailure> = {}): GenerateSequenceDiagramFailure {
  return { status: "failed", stage, issues, ambiguities: [], unconfirmedNewParticipants: [], ...extra };
}

describe("describeIssue", () => {
  it("prints the code, the position, the message and identifier details only", () => {
    const line = describeIssue({
      severity: "error",
      code: "ambiguous-reference",
      message: "A reference matches several knowledge-pack elements and needs an explicit selection.",
      file: "flow.md",
      line: 8,
      column: 5,
      details: { mention: "controller", candidates: ["dome-controller", "telescope-scheduler"] }
    });

    expect(line).toBe(
      "[ambiguous-reference] flow.md, line 8, column 5: A reference matches several knowledge-pack elements and needs an explicit selection. " +
        "(mention controller; candidates dome-controller, telescope-scheduler)"
    );
  });

  it("prints schema paths and pack column labels", () => {
    expect(describeIssue({ severity: "error", code: "schema-violation", message: "Rejected.", path: "messages.2.to", details: { problem: "unknown-key" } })).toBe(
      "[schema-violation] messages.2.to: Rejected. (problem unknown-key)"
    );
    expect(describeIssue({ severity: "error", code: "invalid-value", message: "Bad cell.", file: "systems.md", line: 3, column: "kind" })).toBe(
      "[invalid-value] systems.md, line 3, kind: Bad cell."
    );
  });

  it("bounds the length of a line", () => {
    const line = describeIssue({ severity: "warning", code: "x", message: "m", details: { long: "y".repeat(1000) } });
    expect(line.length).toBe(messageLimits.maxDetailChars);
    expect(line.endsWith("...")).toBe(true);
  });
});

describe("describeFailure", () => {
  it("explains a flow rejection and lists the issues", () => {
    const message = describeFailure(failure("flow", [{ severity: "error", code: "front-matter:invalid-front-matter", message: "Front matter missing.", line: 1 }]), { baseUrl });

    expect(message.level).toBe("error");
    expect(message.text).toContain("flow document was rejected");
    expect(message.details).toEqual(["[front-matter:invalid-front-matter] line 1: Front matter missing."]);
    expect(message.suggestSettings).toBe(false);
  });

  it("points to the settings for Knowledge Pack and model configuration problems", () => {
    expect(describeFailure(failure("knowledge-pack", [{ severity: "error", code: "missing-file", message: "Missing.", file: "rules.md" }]), { baseUrl }).suggestSettings).toBe(true);
    expect(describeFailure(failure("generator-configuration", [{ severity: "error", code: "non-loopback-host", message: "Rejected." }]), { baseUrl }).suggestSettings).toBe(true);
  });

  it("distinguishes ambiguity, unconfirmed new participants and other grounding blocks", () => {
    const choice = { mention: "controller", lines: [8], candidates: [] };

    expect(describeFailure(failure("grounding-blocked", [], { ambiguities: [choice] }), { baseUrl }).text).toContain("ambiguous");
    expect(describeFailure(failure("grounding-blocked", [], { unconfirmedNewParticipants: ["weather station"] }), { baseUrl }).text).toContain("[NEW: ...]");
    expect(describeFailure(failure("grounding-blocked", [{ severity: "error", code: "no-participants", message: "None." }]), { baseUrl }).text).toContain("Grounding was blocked");
  });

  it("names the loopback endpoint when the local server did not answer", () => {
    const message = describeFailure(
      failure("invalid-generator-output", [{ severity: "error", code: "generator-failed", message: "The generator failed.", details: { problem: "connection-failed" } }]),
      { baseUrl }
    );

    expect(message.text).toBe("The local model server at http://127.0.0.1:1234/v1 did not answer (connection-failed). Is the server running with the model loaded?");
    expect(message.suggestSettings).toBe(true);
  });

  it("reports a rejected answer without any answer text", () => {
    const schema = describeFailure(
      failure("invalid-generator-output", [{ severity: "error", code: "schema-violation", message: "Rejected.", path: "participants.0.kind", details: { problem: "invalid-enum" } }]),
      { baseUrl }
    );
    expect(schema.text).toContain("strict model schema");
    expect(schema.details).toEqual(["[schema-violation] participants.0.kind: Rejected. (problem invalid-enum)"]);

    const parser = describeFailure(
      failure("invalid-generator-output", [{ severity: "error", code: "generator-failed", message: "Failed.", details: { problem: "not-a-json-object" } }]),
      { baseUrl }
    );
    expect(parser.text).toContain("(not-a-json-object)");
    expect(parser.suggestSettings).toBe(false);

    expect(describeFailure(failure("semantic-validation-failed", []), { baseUrl }).text).toContain("grounded architecture");
    expect(describeFailure(failure("render-validation-failed", []), { baseUrl }).text).toContain("structural check");
  });

  it("distinguishes reviewer and PlantUML structure failures without exposing model data", () => {
    const secret = "synthetic-secret";
    const review = describeFailure(failure("semantic-validation-failed", [{ severity: "error", code: "review-rejected", message: "The semantic reviewer rejected the diagram.", details: { count: 1 } }]), { baseUrl });
    expect(review.text).toContain("semantic review rejected");
    expect(JSON.stringify(review)).not.toContain(secret);
    const structure = describeFailure(failure("semantic-validation-failed", [{ severity: "error", code: "plantuml-structure", message: "The emitted PlantUML failed structural validation.", line: 6 }]), { baseUrl });
    expect(structure.text).toContain("PlantUML structure");
    expect(structure.details[0]).toContain("line 6");
    const timeout = describeFailure(failure("invalid-generator-output", [{ severity: "error", code: "reviewer-failed", message: "The semantic reviewer did not complete.", details: { problem: "timeout" } }]), { baseUrl });
    expect(timeout.text).toContain("did not answer (timeout)");
  });

  it("bounds the number of detail lines", () => {
    const issues = Array.from({ length: messageLimits.maxDetailLines + 5 }, (_, index) => ({ severity: "error" as const, code: `code-${index}`, message: "m" }));
    const message = describeFailure(failure("semantic-validation-failed", issues), { baseUrl });

    expect(message.details).toHaveLength(messageLimits.maxDetailLines + 1);
    expect(message.details.at(-1)).toBe("... 5 more issues omitted");
  });
});

describe("describeSuccess and the other messages", () => {
  const success: GenerateSequenceDiagramSuccess = {
    status: "success",
    diagramName: "observation-run",
    generatorType: "openai-compatible-local",
    digest: "ab".repeat(32),
    plantUml: "@startuml\n@enduml\n",
    diagramFileName: "observation-run.puml",
    groundingReport: "{}",
    reportFileName: "observation-run.grounding.json",
    summary: {
      participantCount: 4,
      knownParticipantCount: 3,
      newParticipantCount: 1,
      messageCount: 5,
      synchronousCount: 3,
      asynchronousCount: 1,
      responseCount: 1,
      selfMessageCount: 0,
      warningCount: 1
    },
    warnings: [{ severity: "warning", code: "ungrounded-new-interaction", message: "Not grounded.", details: { order: 5 } }]
  };

  it("summarizes counts and lists warnings without the diagram text", () => {
    const message = describeSuccess(success);

    expect(message.level).toBe("warning");
    expect(message.text).toBe('Archi Agent generated "observation-run": 4 participants (3 grounded, 1 new), 5 messages, 1 warning.');
    expect(message.details).toEqual([
      `Grounding digest: sha256:${"ab".repeat(32)}`,
      "Generator: openai-compatible-local",
      "[ungrounded-new-interaction] Not grounded. (order 5)"
    ]);
    expect(message.details.join("\n")).not.toContain("@startuml");
    expect(describeSuccess({ ...success, summary: { ...success.summary, warningCount: 0 }, warnings: [] }).level).toBe("info");
  });

  it("describes settings problems, model listing failures and cancellation", () => {
    const single = describeSettingsProblems([{ code: "knowledge-pack-path-missing", setting: "archiAgent.knowledgePackPath", message: "Set it." }]);
    expect(single.text).toBe("archiAgent.knowledgePackPath: Set it.");
    expect(single.suggestSettings).toBe(true);

    const several = describeSettingsProblems([
      { code: "knowledge-pack-path-missing", setting: "archiAgent.knowledgePackPath", message: "Set it." },
      { code: "local-model-timeout-invalid", setting: "archiAgent.localModel.timeoutSeconds", message: "Range." }
    ]);
    expect(several.details).toHaveLength(2);

    const listing = describeModelListFailure("connection-failed", baseUrl);
    expect(listing.text).toContain(baseUrl);
    expect(listing.text).toContain("connection-failed");

    expect(describeCancellation().level).toBe("info");
  });
});
