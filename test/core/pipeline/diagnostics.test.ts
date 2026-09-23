import { describe, expect, it } from "vitest";
import { DiagnosticRun, diagnosticLineLimit } from "../../../src/core/pipeline/diagnostics.js";

describe("safe pipeline diagnostics", () => {
  it("writes one bounded JSON line per event and one completion", () => {
    const lines: string[] = [];
    const run = new DiagnosticRun((line) => lines.push(line));
    run.emit("plan.rejected", { rule: "unknown-operation-id", stepIndex: 2, operationId: "op-0002",
      label: "SECRET_LABEL", prompt: "SECRET_PROMPT", path: "/private/tmp/secret", error: "SECRET_ERROR",
      code: "bad\ncontrol" });
    run.complete("rejected", "diagram-plan-invalid", "unknown-operation-id");
    run.complete("rejected", "another-error");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line).event)).toEqual(["plan.rejected", "run.completed"]);
    expect(JSON.parse(lines[1]!)).toMatchObject({ generatorCalls: 0, reviewerCalls: 0, totalModelCalls: 0,
      code: "diagram-plan-invalid", rule: "unknown-operation-id" });
    expect(lines.every((line) => line.length <= diagnosticLineLimit && !/[\u0000-\u001f\u007f-\u009f]/.test(line))).toBe(true);
    for (const forbidden of ["SECRET_LABEL", "SECRET_PROMPT", "/private/tmp/secret", "SECRET_ERROR", "bad\\ncontrol"])
      expect(lines.join("\n")).not.toContain(forbidden);
  });

  it("has no output without a sink and ignores sink failure", () => {
    const silent = new DiagnosticRun();
    silent.emit("command.started", { diagramType: "sequence" });
    silent.complete("success");
    const failing = new DiagnosticRun(() => { throw new Error("sink-failed"); });
    expect(() => { failing.emit("command.started"); failing.complete("failed"); }).not.toThrow();
  });

  it("preserves a bounded renderer rule and physical line without PlantUML", () => {
    const lines: string[] = [];
    const run = new DiagnosticRun((line) => lines.push(line));
    run.emit("renderer.rejected", { rule: "forbidden-directive", line: 4, plantUml: "SECRET_PLANTUML" });
    run.complete("rejected", "plantuml-structure", "forbidden-directive");
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: "renderer.rejected", rule: "forbidden-directive", line: 4 });
    expect(lines.join("\n")).not.toContain("SECRET_PLANTUML");
  });

  it("redacts absolute paths in every allowed string field on every host", () => {
    for (const candidate of ["/Users/Alice/model.gguf", "/home/alice/model.gguf", "C:\\Users\\Alice\\model.gguf",
      "C:/Users/Alice/model.gguf", "\\\\server\\share\\model.gguf", "file:/home/alice/model.gguf",
      "FILE:/home/alice/model.gguf", "file:/C:/Users/Alice/model.gguf", "file:///home/alice/model.gguf",
      "file://server/share/model.gguf", "  file:/home/alice/model.gguf  "]) {
      const lines: string[] = [];
      const fields = Object.fromEntries(["diagramType", "flowSourceKind", "profileId", "modelId", "generatorType",
        "digest", "list", "rule", "operationId", "flowEvidenceId", "verdict", "status", "finalPhase", "code"]
        .map((key) => [key, candidate]));
      new DiagnosticRun((line) => lines.push(line)).emit("provider.resolved", fields);
      const entry = JSON.parse(lines[0]!);
      for (const key of Object.keys(fields)) expect(entry[key]).toBe("<local-model-path-redacted>");
      expect(lines[0]).not.toContain("model.gguf");
      expect(lines[0]).not.toContain("Alice");
    }
    for (const modelId of ["qwen3:30b", "openai/gpt-4.1", "anthropic/claude-3.7"]) {
      const lines: string[] = [];
      new DiagnosticRun((line) => lines.push(line)).emit("provider.resolved", { modelId });
      expect(JSON.parse(lines[0]!).modelId).toBe(modelId);
    }
  });
});
