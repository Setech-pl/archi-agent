import { describe, expect, it } from "vitest";
import { artifactExtensions, baseNameFor, outputPlanLimits, planArtifactPair, type OutputPlanResult } from "../../../src/core/output/output-planner.js";

const directory = "architecture-diagrams/space-mission/sequence";

function plan(existingEntries: readonly string[] = [], diagramName = "telemetry-command-flow", outputDirectory = directory): OutputPlanResult {
  return planArtifactPair({ outputDirectory, diagramName, existingEntries });
}

function versionOf(result: OutputPlanResult): number {
  if (!result.ok) {
    throw new Error(`Expected a plan, got ${result.issue.code}.`);
  }

  return result.plan.version;
}

describe("planArtifactPair - first version", () => {
  it("plans one shared file-name base with fixed extensions and project-relative paths", () => {
    expect(plan()).toEqual({
      ok: true,
      plan: {
        directory,
        baseName: "telemetry-command-flow",
        version: 1,
        diagramFileName: "telemetry-command-flow.puml",
        reportFileName: "telemetry-command-flow.grounding.json",
        diagramPath: `${directory}/telemetry-command-flow.puml`,
        reportPath: `${directory}/telemetry-command-flow.grounding.json`
      }
    });
    expect(artifactExtensions).toEqual({ diagram: ".puml", report: ".grounding.json" });
    expect(baseNameFor("flow", 1)).toBe("flow");
    expect(baseNameFor("flow", 3)).toBe("flow-v3");
  });

  it("normalizes a trailing slash of the output directory", () => {
    const result = plan([], "telemetry-command-flow", `${directory}/`);

    expect(result.ok && result.plan.diagramPath).toBe(`${directory}/telemetry-command-flow.puml`);
  });
});

describe("planArtifactPair - paired versioning", () => {
  it("moves to -v2 when the first pair exists", () => {
    const result = plan(["telemetry-command-flow.puml", "telemetry-command-flow.grounding.json"]);

    expect(result.ok && [result.plan.baseName, result.plan.diagramFileName, result.plan.reportFileName]).toEqual([
      "telemetry-command-flow-v2",
      "telemetry-command-flow-v2.puml",
      "telemetry-command-flow-v2.grounding.json"
    ]);
  });

  it("keeps both files on one version when only one artifact of a pair exists", () => {
    expect(versionOf(plan(["telemetry-command-flow.puml"]))).toBe(2);
    expect(versionOf(plan(["telemetry-command-flow.grounding.json"]))).toBe(2);
    expect(versionOf(plan(["telemetry-command-flow.puml", "telemetry-command-flow-v2.grounding.json"]))).toBe(3);
  });

  it("uses one more than the highest existing version, also across gaps", () => {
    expect(versionOf(plan(["telemetry-command-flow.puml", "telemetry-command-flow-v2.puml", "telemetry-command-flow-v5.grounding.json"]))).toBe(6);
  });

  it("compares names without letter case, as the primary platform does", () => {
    expect(versionOf(plan(["TELEMETRY-COMMAND-FLOW.PUML"]))).toBe(2);
    expect(versionOf(plan(["Telemetry-Command-Flow-V4.Grounding.Json"]))).toBe(5);
  });

  it("ignores unrelated entries, temporary files and malformed versions", () => {
    expect(
      versionOf(
        plan([
          "telemetry-command-flow-notes.puml",
          "other-flow.puml",
          "telemetry-command-flow.txt",
          ".telemetry-command-flow.puml.tmp",
          "telemetry-command-flow-v02.puml",
          "telemetry-command-flow-v0.puml",
          "telemetry-command-flow-vx.puml"
        ])
      )
    ).toBe(1);
  });

  it("stops at the version limit", () => {
    expect(plan([`telemetry-command-flow-v${outputPlanLimits.maxVersion}.puml`])).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: "version-limit", path: directory })
    });
    expect(versionOf(plan([`telemetry-command-flow-v${outputPlanLimits.maxVersion - 1}.puml`]))).toBe(outputPlanLimits.maxVersion);
  });

  it("does not modify the supplied listing", () => {
    const entries = Object.freeze(["telemetry-command-flow.puml"]);

    expect(versionOf(plan(entries))).toBe(2);
    expect(entries).toEqual(["telemetry-command-flow.puml"]);
  });
});

describe("planArtifactPair - rejected input", () => {
  it.each(["", "../outside", "/absolute", "C:/drive", "a\\b", "a/./b", "a//b", "a/../b", "a:b"])("rejects the output directory %j", (outputDirectory) => {
    expect(plan([], "telemetry-command-flow", outputDirectory)).toEqual({ ok: false, issue: expect.objectContaining({ code: "invalid-output-directory" }) });
  });

  it.each(["Telemetry Flow", "../flow", "flow/child", "con", "-flow", "flow.puml", "x".repeat(65)])("rejects the diagram name %j", (diagramName) => {
    expect(plan([], diagramName)).toEqual({ ok: false, issue: expect.objectContaining({ code: "invalid-diagram-name" }) });
  });

  it("bounds the listing it is willing to inspect", () => {
    const entries = Array.from({ length: outputPlanLimits.maxListedEntries + 1 }, (_, index) => `entry-${index}.txt`);

    expect(plan(entries)).toEqual({ ok: false, issue: expect.objectContaining({ code: "list-failed" }) });
  });
});
