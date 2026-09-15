import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactFileSystemError, type ArtifactFileSystem } from "../../src/core/output/artifact-file-system.js";
import type { SequenceModelGenerator } from "../../src/core/pipeline/sequence-model-generator.js";
import { validatePlantUmlSubset } from "../../src/core/validation/plantuml-validator.js";
import { describeDemoResult, main, runSpaceMissionDemo, spaceMissionDemoPaths, type SpaceMissionDemoResult } from "../../src/demo/space-mission-demo.js";
import { NodeArtifactFileSystem } from "../../src/node/node-artifact-file-system.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const expectedDir = new URL("../../samples/space-mission/expected/", import.meta.url);
const goldenDiagram = readFileSync(new URL("telemetry-command-flow.puml", expectedDir));
const goldenReport = readFileSync(new URL("telemetry-command-flow.grounding.json", expectedDir));
const sequenceDirectory = spaceMissionDemoPaths.outputDirectory;
const workspaces: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function outputRoot(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-demo-")));
  workspaces.push(root);
  return root;
}

function artifactDirectory(root: string): string {
  return path.join(root, ...sequenceDirectory.split("/"));
}

function listTree(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { recursive: true }).map(String).sort();
}

function expectWritten(result: SpaceMissionDemoResult): Extract<SpaceMissionDemoResult, { status: "written" }> {
  if (result.status !== "written") {
    throw new Error(`Expected written artifacts, got ${JSON.stringify(result)}.`);
  }

  return result;
}

describe("offline Space Mission demo - dry run", () => {
  it("runs the complete pipeline and creates no directory or file", async () => {
    const root = outputRoot();
    const result = await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: true });

    expect(result.status).toBe("dry-run");
    expect(result.status === "dry-run" && result.plan.diagramPath).toBe(`${sequenceDirectory}/telemetry-command-flow.puml`);
    expect(listTree(root)).toEqual([]);
  });

  it("writes nothing into the project either", async () => {
    const before = listTree(path.join(projectRoot, "architecture-diagrams"));
    const result = await runSpaceMissionDemo({ projectRoot, dryRun: true });

    expect(result.status).toBe("dry-run");
    expect(listTree(path.join(projectRoot, "architecture-diagrams"))).toEqual(before);
  });

  it("produces the committed golden outputs byte for byte", async () => {
    const result = await runSpaceMissionDemo({ projectRoot, outputRoot: outputRoot(), dryRun: true });

    if (result.status !== "dry-run") {
      throw new Error("Expected a dry run.");
    }

    expect(Buffer.from(result.outcome.diagram.content, "utf8").equals(goldenDiagram)).toBe(true);
    expect(Buffer.from(result.outcome.report.content, "utf8").equals(goldenReport)).toBe(true);
  });
});

describe("offline Space Mission demo - physical output", () => {
  it("writes the first pair, then a -v2 pair without touching the first", async () => {
    const root = outputRoot();
    const first = expectWritten(await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false }));
    const directory = artifactDirectory(root);

    expect([first.diagramPath, first.reportPath]).toEqual([
      `${sequenceDirectory}/telemetry-command-flow.puml`,
      `${sequenceDirectory}/telemetry-command-flow.grounding.json`
    ]);
    expect(readFileSync(path.join(directory, "telemetry-command-flow.puml")).equals(goldenDiagram)).toBe(true);
    expect(readFileSync(path.join(directory, "telemetry-command-flow.grounding.json")).equals(goldenReport)).toBe(true);

    const second = expectWritten(await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false }));

    expect(second.plan.version).toBe(2);
    expect([second.diagramPath, second.reportPath]).toEqual([
      `${sequenceDirectory}/telemetry-command-flow-v2.puml`,
      `${sequenceDirectory}/telemetry-command-flow-v2.grounding.json`
    ]);
    expect(readdirSync(directory).sort()).toEqual([
      "telemetry-command-flow-v2.grounding.json",
      "telemetry-command-flow-v2.puml",
      "telemetry-command-flow.grounding.json",
      "telemetry-command-flow.puml"
    ]);
    expect(readFileSync(path.join(directory, "telemetry-command-flow.puml")).equals(goldenDiagram)).toBe(true);
    expect(readFileSync(path.join(directory, "telemetry-command-flow.grounding.json")).equals(goldenReport)).toBe(true);

    const secondReport = JSON.parse(readFileSync(path.join(directory, "telemetry-command-flow-v2.grounding.json"), "utf8"));
    expect(secondReport.outputs).toEqual({ diagram: "telemetry-command-flow-v2.puml", report: "telemetry-command-flow-v2.grounding.json" });
    expect(validatePlantUmlSubset(readFileSync(path.join(directory, "telemetry-command-flow-v2.puml"), "utf8")).ok).toBe(true);
  });

  it("skips a version that a user file already occupies and leaves that file untouched", async () => {
    const root = outputRoot();
    const directory = artifactDirectory(root);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "telemetry-command-flow.grounding.json"), "user notes");

    const result = expectWritten(await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false }));

    expect(result.plan.version).toBe(2);
    expect(readFileSync(path.join(directory, "telemetry-command-flow.grounding.json"), "utf8")).toBe("user notes");
    expect(existsSync(path.join(directory, "telemetry-command-flow.puml"))).toBe(false);
  });

  it("contains no absolute path of the machine in the written artifacts", async () => {
    const root = outputRoot();
    expectWritten(await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false }));
    const text = readdirSync(artifactDirectory(root))
      .map((name) => readFileSync(path.join(artifactDirectory(root), name), "utf8"))
      .join("\n");

    for (const forbidden of [root, projectRoot, projectRoot.split(path.sep).join("/"), tmpdir()]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("offline Space Mission demo - failures", () => {
  it("leaves no partial output when the second artifact cannot be finalized", async () => {
    const root = outputRoot();
    const real = await NodeArtifactFileSystem.open(root);
    const failing: ArtifactFileSystem = {
      listDirectory: (directory) => real.listDirectory(directory),
      ensureDirectory: (directory) => real.ensureDirectory(directory),
      exists: (target) => real.exists(target),
      writeNewFile: (target, content) => real.writeNewFile(target, content),
      publishNewFile: async (temporary, final) => {
        if (final.endsWith(".grounding.json")) {
          throw new ArtifactFileSystemError("publish-failed");
        }

        return real.publishNewFile(temporary, final);
      },
      removeFile: (target) => real.removeFile(target)
    };

    const result = await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false, fileSystem: failing });

    expect(result).toEqual({ status: "failed", stage: "output-failed", codes: ["publish-failed"] });
    expect(readdirSync(artifactDirectory(root))).toEqual([]);
  });

  it("writes nothing when the generator output is invalid", async () => {
    const root = outputRoot();
    const generator: SequenceModelGenerator = { generatorType: "test-stub", generate: async () => ({ participants: [], messages: [] }) };
    const result = await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false, generator });

    expect(result).toMatchObject({ status: "failed", stage: "invalid-generator-output" });
    expect(listTree(root)).toEqual([]);
  });

  it("fails safely when the project root or the output root is unusable", async () => {
    const missing = path.join(outputRoot(), "missing");

    expect(await runSpaceMissionDemo({ projectRoot: missing, dryRun: true })).toEqual({ status: "failed", stage: "flow", codes: ["not-found"] });
    expect(await runSpaceMissionDemo({ projectRoot, outputRoot: missing, dryRun: true })).toEqual({
      status: "failed",
      stage: "output-planning",
      codes: ["invalid-output-directory"]
    });
  });
});

describe("offline Space Mission demo - console", () => {
  it("prints a concise summary with project-relative paths and never the flow, pack or report", async () => {
    const root = outputRoot();
    const lines = describeDemoResult(expectWritten(await runSpaceMissionDemo({ projectRoot, outputRoot: root, dryRun: false })));
    const text = lines.join("\n");

    expect(lines).toContain("Generator: scripted-demo (deterministic script; no LLM request, no network access)");
    expect(lines).toContain(`Written: ${sequenceDirectory}/telemetry-command-flow.puml`);
    expect(text).not.toContain(root);
    expect(text).not.toContain("prepares a command");
    expect(text).not.toContain("Console application");
    expect(text).not.toContain("knownParticipants");
    expect(lines.length).toBeLessThanOrEqual(12);
  });

  it("describes a dry run and a failure", async () => {
    const dryRun = describeDemoResult(await runSpaceMissionDemo({ projectRoot, outputRoot: outputRoot(), dryRun: true }));

    expect(dryRun).toContain("Dry run: no directory or file was created.");
    expect(describeDemoResult({ status: "failed", stage: "flow", codes: ["not-found"] }).slice(-2)).toEqual(["Result: FAILED at flow", "Issue codes: not-found"]);
  });

  it("rejects unknown command-line arguments before doing anything", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(await main(["--overwrite"])).toBe(2);
    expect(await main(["--dry-run", "extra"])).toBe(2);
    expect(stderr).toHaveBeenCalledWith("usage: node dist/demo/space-mission-demo.js [--dry-run]\n");
  });

  it("uses fixed project-relative sample paths", () => {
    expect(spaceMissionDemoPaths).toEqual({
      flowFile: "samples/space-mission/flows/telemetry-command-flow.md",
      knowledgePackDirectory: "samples/space-mission/architecture",
      outputDirectory: "architecture-diagrams/space-mission/sequence"
    });
  });
});

describe("core boundary", () => {
  it("keeps every core module free of Node.js, editor, file-system, network and process access", () => {
    const coreDir = fileURLToPath(new URL("../../src/core/", import.meta.url));
    const files = readdirSync(coreDir, { recursive: true }).map(String).filter((name) => name.endsWith(".ts"));
    const forbidden = [
      /from\s+["'](?:node:[^"']*|fs|path|os|child_process|vscode|http|https|net)["']/,
      /\brequire\s*\(/,
      /\bimport\s*\(/,
      /\bprocess\s*\./,
      /\bfetch\s*\(/,
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
      /\bFunction\s*\(\s*["'`]/
    ];

    expect(files.length).toBeGreaterThan(40);

    for (const name of files) {
      const text = readFileSync(path.join(coreDir, name), "utf8");

      for (const pattern of forbidden) {
        expect({ name, match: pattern.test(text) }).toEqual({ name, match: false });
      }
    }
  });
});
