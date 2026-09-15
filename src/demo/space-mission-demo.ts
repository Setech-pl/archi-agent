import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlowDocument } from "../core/grounding/grounded-context-builder.js";
import { loadKnowledgePack } from "../core/knowledge-pack/knowledge-pack-loader.js";
import type { ArtifactFileSystem } from "../core/output/artifact-file-system.js";
import { ArtifactFileSystemError } from "../core/output/artifact-file-system.js";
import { writeArtifactPair } from "../core/output/artifact-writer.js";
import { planArtifactPair, type ArtifactPairPlan } from "../core/output/output-planner.js";
import { generateSequenceDiagram } from "../core/pipeline/generate-sequence-diagram.js";
import type { GenerationSuccess, GenerationStatus } from "../core/pipeline/generation-outcome.js";
import type { SequenceModelGenerator } from "../core/pipeline/sequence-model-generator.js";
import { validatePlantUmlSubset } from "../core/validation/plantuml-validator.js";
import { BoundedReadError, maxFlowFileBytes, readBoundedTextFile } from "../node/bounded-file-reader.js";
import { canonicalDirectory, LocalPathError } from "../node/local-file-path.js";
import { NodeArtifactFileSystem } from "../node/node-artifact-file-system.js";
import { NodeKnowledgePackSource } from "../node/node-knowledge-pack-source.js";
import { ScriptedSpaceMissionGenerator } from "./scripted-space-mission-generator.js";

/**
 * Offline Space Mission demo: the complete local pipeline from the synthetic sample flow and
 * Knowledge Pack to a validated PlantUML file and grounding report.
 *
 * The model generator is the deterministic SCRIPTED DEMO GENERATOR. No language model is called and
 * no network connection is made. A dry run executes every stage, including output planning, but
 * creates no directory and no file. Output paths are reported relative to the selected output root.
 */

export const spaceMissionDemoPaths = Object.freeze({
  flowFile: "samples/space-mission/flows/telemetry-command-flow.md",
  knowledgePackDirectory: "samples/space-mission/architecture",
  outputDirectory: "architecture-diagrams/space-mission/sequence"
});

export interface SpaceMissionDemoOptions {
  /** Project root holding the samples. */
  readonly projectRoot: string;
  /** Root for the output directory; defaults to the project root. */
  readonly outputRoot?: string;
  readonly dryRun: boolean;
  /** Test seam: another generator. The demo itself always uses the scripted generator. */
  readonly generator?: SequenceModelGenerator;
  /** Test seam: another artifact file system, for example one that injects failures. */
  readonly fileSystem?: ArtifactFileSystem;
}

export type DemoFailureStage = "flow" | "knowledge-pack" | "output-planning" | "verification" | GenerationStatus;

export type SpaceMissionDemoResult =
  | { readonly status: "dry-run"; readonly outcome: GenerationSuccess; readonly plan: ArtifactPairPlan }
  | {
      readonly status: "written";
      readonly outcome: GenerationSuccess;
      readonly plan: ArtifactPairPlan;
      readonly diagramPath: string;
      readonly reportPath: string;
    }
  | { readonly status: "failed"; readonly stage: DemoFailureStage; readonly codes: readonly string[] };

function failed(stage: DemoFailureStage, codes: readonly string[]): SpaceMissionDemoResult {
  return Object.freeze({ status: "failed", stage, codes: Object.freeze([...new Set(codes)]) });
}

function artifactsVerified(outcome: GenerationSuccess, plan: ArtifactPairPlan): boolean {
  if (!validatePlantUmlSubset(outcome.diagram.content).ok) {
    return false;
  }

  try {
    const report = JSON.parse(outcome.report.content) as {
      reportSchemaVersion?: unknown;
      outputs?: { diagram?: unknown; report?: unknown };
      groundingDigest?: { value?: unknown };
    };
    return (
      report.reportSchemaVersion === 1 &&
      report.outputs?.diagram === plan.diagramFileName &&
      report.outputs.report === plan.reportFileName &&
      report.groundingDigest?.value === outcome.digest.value &&
      outcome.diagram.fileName === plan.diagramFileName &&
      outcome.report.fileName === plan.reportFileName
    );
  } catch {
    return false;
  }
}

export async function runSpaceMissionDemo(options: SpaceMissionDemoOptions): Promise<SpaceMissionDemoResult> {
  const paths = spaceMissionDemoPaths;
  let projectRoot: string;
  let flowText: string;

  try {
    projectRoot = await canonicalDirectory(options.projectRoot);
    flowText = (await readBoundedTextFile(projectRoot, paths.flowFile, { maxBytes: maxFlowFileBytes })).text;
  } catch (error) {
    return failed("flow", [error instanceof BoundedReadError || error instanceof LocalPathError ? error.code : "read-failed"]);
  }

  const flow = parseFlowDocument(flowText, { file: paths.flowFile });

  if (!flow.ok) {
    return failed("flow", flow.issues.map((issue) => issue.code));
  }

  let loaded;

  try {
    loaded = await loadKnowledgePack(await NodeKnowledgePackSource.open(projectRoot, paths.knowledgePackDirectory));
  } catch {
    return failed("knowledge-pack", ["read-failed"]);
  }

  if (!loaded.ok) {
    return failed("knowledge-pack", loaded.issues.map((issue) => issue.code));
  }

  let fileSystem: ArtifactFileSystem;
  let existing: readonly string[];

  try {
    fileSystem = options.fileSystem ?? (await NodeArtifactFileSystem.open(options.outputRoot ?? projectRoot));
    existing = await fileSystem.listDirectory(paths.outputDirectory);
  } catch (error) {
    return failed("output-planning", [error instanceof ArtifactFileSystemError ? error.code : "list-failed"]);
  }

  const planned = planArtifactPair({
    outputDirectory: paths.outputDirectory,
    diagramName: flow.flow.metadata.diagramName,
    existingEntries: existing
  });

  if (!planned.ok) {
    return failed("output-planning", [planned.issue.code]);
  }

  const outcome = await generateSequenceDiagram({
    flow: flow.flow,
    knowledgePack: { pack: loaded.pack, indexes: loaded.indexes },
    generator: options.generator ?? new ScriptedSpaceMissionGenerator(),
    artifactBaseName: planned.plan.baseName,
    sources: { flowFile: paths.flowFile, knowledgePackDirectory: paths.knowledgePackDirectory }
  });

  if (outcome.status !== "success") {
    return failed(outcome.status, outcome.issues.map((issue) => issue.code));
  }

  if (!artifactsVerified(outcome, planned.plan)) {
    return failed("verification", ["artifact-verification-failed"]);
  }

  if (options.dryRun) {
    return Object.freeze({ status: "dry-run", outcome, plan: planned.plan });
  }

  const written = await writeArtifactPair(fileSystem, planned.plan, {
    diagram: outcome.diagram.content,
    report: outcome.report.content
  });

  if (written.status !== "written") {
    return failed("output-failed", written.issues.map((issue) => issue.code));
  }

  return Object.freeze({
    status: "written",
    outcome,
    plan: planned.plan,
    diagramPath: written.diagramPath,
    reportPath: written.reportPath
  });
}

/** Concise console summary; never prints the flow, the pack or the report. */
export function describeDemoResult(result: SpaceMissionDemoResult): readonly string[] {
  const lines = [
    "ArchGround offline demo - Space Mission telemetry command flow",
    "Generator: scripted-demo (deterministic script; no LLM request, no network access)"
  ];

  if (result.status === "failed") {
    return [...lines, `Result: FAILED at ${result.stage}`, `Issue codes: ${result.codes.join(", ") || "none"}`];
  }

  const summary = result.outcome.summary;
  lines.push(
    "Result: all validation stages passed",
    `Participants: ${summary.participantCount} (${summary.knownParticipantCount} grounded, ${summary.newParticipantCount} new)`,
    `Messages: ${summary.messageCount} (${summary.synchronousCount} synchronous, ${summary.asynchronousCount} asynchronous, ` +
      `${summary.responseCount} response, ${summary.internalCount} internal)`,
    `Warnings: ${summary.warningCount}`,
    `Grounding digest: sha256:${result.outcome.digest.value}`
  );

  if (result.status === "dry-run") {
    return [
      ...lines,
      "Dry run: no directory or file was created.",
      `Planned: ${result.plan.diagramPath}`,
      `Planned: ${result.plan.reportPath}`
    ];
  }

  return [...lines, `Written: ${result.diagramPath}`, `Written: ${result.reportPath}`];
}

export async function main(argv: readonly string[]): Promise<number> {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--dry-run")) {
    process.stderr.write("usage: node dist/demo/space-mission-demo.js [--dry-run]\n");
    return 2;
  }

  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const result = await runSpaceMissionDemo({ projectRoot, dryRun: argv[0] === "--dry-run" });
  process.stdout.write(`${describeDemoResult(result).join("\n")}\n`);
  return result.status === "failed" ? 1 : 0;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];

  if (entry === undefined) {
    return false;
  }

  const normalize = (value: string): string => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };

  return normalize(fileURLToPath(import.meta.url)) === normalize(entry);
}

if (invokedDirectly()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.stderr.write("ArchGround offline demo failed unexpectedly.\n");
      process.exitCode = 1;
    }
  );
}
