import type { AmbiguitySelections } from "../grounding/ambiguity-report.js";
import { buildGroundedContext, type FlowDocument, type GroundingKnowledgePack } from "../grounding/grounded-context-builder.js";
import type { CancellationSignal } from "../knowledge-pack/knowledge-pack-source.js";
import { parseGeneratedSequenceModel, participantRefKey, type GeneratedSequenceModel } from "../model/sequence-diagram-model.schema.js";
import { normalizeGeneratedModel } from "../normalization/model-normalizer.js";
import { artifactExtensions } from "../output/output-planner.js";
import { isSafeGeneratorType } from "../render/metadata-header.js";
import { renderPlantUml } from "../render/plantuml-renderer.js";
import { buildGroundingReport, serializeGroundingReport, type GroundingReportSources } from "../report/grounding-report.js";
import { validateParticipantGrounding } from "../validation/grounding-validator.js";
import { applyInterfaceNamePolicy } from "../validation/interface-name-guard.js";
import {
  createModelIssue,
  hasModelErrors,
  sortModelIssues,
  validateMetadataText,
  validateModelStructure,
  type ModelIssue
} from "../validation/model-validator.js";
import { validatePlantUmlSubset } from "../validation/plantuml-validator.js";
import { validateRelationships } from "../validation/relationship-validator.js";
import type { GenerationSummary, InvalidGeneratorOutputOutcome, PipelineOutcome } from "./generation-outcome.js";
import { isSafeModelGenerationMetadata, type ModelGenerationMetadata, type SequenceModelGenerator } from "./sequence-model-generator.js";

/**
 * The application-level generation pipeline. It owns the order of the stages:
 *
 *  1. receive a validated flow document and a loaded Knowledge Pack;
 *  2. build the minimal grounded context and 3. stop when grounding is blocked;
 *  4. call the injected generator;
 *  5. validate the untrusted result against the strict schema;
 *  6. normalize it;
 *  7. validate structure, metadata text and participant grounding;
 *  8. validate relationships, directions and modes;
 *  9. apply the interface-name policy;
 * 10. render PlantUML from the cleaned model;
 * 11. validate the emitted PlantUML subset;
 * 12. build the grounding report;
 * 13. return everything in memory.
 *
 * The pipeline never writes: an output adapter may write the returned artifacts afterwards.
 */

export interface GenerateSequenceDiagramRequest {
  readonly flow: FlowDocument;
  readonly knowledgePack: GroundingKnowledgePack;
  readonly generator: SequenceModelGenerator;
  /** Planned shared file-name base of the artifact pair, for example telemetry-command-flow-v2. */
  readonly artifactBaseName: string;
  readonly sources: GroundingReportSources;
  readonly selections?: AmbiguitySelections;
  readonly confirmedNewParticipants?: readonly string[];
  readonly signal?: CancellationSignal;
}

const baseNamePattern = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const schemaPathPattern = /^(?:\(root\)|[A-Za-z][A-Za-z0-9]*(?:\.(?:[A-Za-z][A-Za-z0-9]*|\d+))*)$/;
const problemCodePattern = /^[A-Za-z0-9_-]{1,64}$/;

const failureCodePattern = /^[a-z][a-z0-9-]{0,63}$/;

/** The stable code of a generator failure, when the error carries one; never its message. */
function failureCodeOf(error: unknown): string | undefined {
  const code = error !== null && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
  return typeof code === "string" && failureCodePattern.test(code) ? code : undefined;
}

/** A signal can be aborted while the generator runs, so every check reads the current state. */
function isAborted(signal: CancellationSignal | undefined): boolean {
  return signal?.aborted === true;
}

function invalidOutput(issues: readonly ModelIssue[], schemaProblems: InvalidGeneratorOutputOutcome["schemaProblems"] = []): InvalidGeneratorOutputOutcome {
  return Object.freeze({ status: "invalid-generator-output", issues: sortModelIssues(issues), schemaProblems: Object.freeze([...schemaProblems]) });
}

function summarize(model: GeneratedSequenceModel, warningCount: number): GenerationSummary {
  const messages = model.messages;
  const selfMessage = (message: (typeof messages)[number]): boolean => participantRefKey(message.from) === participantRefKey(message.to);

  return Object.freeze({
    participantCount: model.participants.length,
    knownParticipantCount: model.participants.filter((participant) => participant.origin === "knowledge-pack").length,
    newParticipantCount: model.participants.filter((participant) => participant.origin === "new").length,
    messageCount: messages.length,
    synchronousCount: messages.filter((message) => message.isResponse !== true && message.async !== true).length,
    asynchronousCount: messages.filter((message) => message.isResponse !== true && message.async === true).length,
    responseCount: messages.filter((message) => message.isResponse === true).length,
    selfMessageCount: messages.filter(selfMessage).length,
    warningCount
  });
}

export async function generateSequenceDiagram(request: GenerateSequenceDiagramRequest): Promise<PipelineOutcome> {
  if (!baseNamePattern.test(request.artifactBaseName)) {
    throw new Error("The artifact base name must come from the output planner.");
  }

  const grounding = buildGroundedContext({
    flow: request.flow,
    knowledgePack: request.knowledgePack,
    ...(request.selections === undefined ? {} : { selections: request.selections }),
    ...(request.confirmedNewParticipants === undefined ? {} : { confirmedNewParticipants: request.confirmedNewParticipants })
  });

  if (grounding.status === "blocked") {
    return Object.freeze({
      status: "grounding-blocked",
      issues: grounding.issues,
      truncated: grounding.truncated,
      ambiguityReport: grounding.ambiguityReport
    });
  }

  const { context, digest } = grounding;
  const generatorType = request.generator.generatorType;

  if (!isSafeGeneratorType(generatorType)) {
    return invalidOutput([createModelIssue("invalid-generator-type")]);
  }

  const declaredMetadata = request.generator.generationMetadata;

  if (declaredMetadata !== undefined && !isSafeModelGenerationMetadata(declaredMetadata)) {
    return invalidOutput([createModelIssue("invalid-generator-type")]);
  }

  const modelGeneration: ModelGenerationMetadata | undefined =
    declaredMetadata === undefined
      ? undefined
      : Object.freeze({
          modelId: declaredMetadata.modelId,
          temperature: declaredMetadata.temperature,
          seed: declaredMetadata.seed,
          attemptCount: declaredMetadata.attemptCount,
          structuredOutput: declaredMetadata.structuredOutput
        });

  if (isAborted(request.signal)) {
    return invalidOutput([createModelIssue("generation-cancelled")]);
  }

  let untrusted: unknown;

  try {
    untrusted = await request.generator.generate({
      flow: request.flow,
      context,
      digest,
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });
  } catch (error) {
    if (isAborted(request.signal)) {
      return invalidOutput([createModelIssue("generation-cancelled")]);
    }

    const problem = failureCodeOf(error);
    return invalidOutput([createModelIssue("generator-failed", problem === undefined ? {} : { details: { problem } })]);
  }

  if (isAborted(request.signal)) {
    return invalidOutput([createModelIssue("generation-cancelled")]);
  }

  const parsed = parseGeneratedSequenceModel(untrusted);

  if (!parsed.ok) {
    const issues = parsed.problems.map((problem) =>
      createModelIssue("schema-violation", {
        ...(schemaPathPattern.test(problem.path) && problem.path.length <= 128 ? { path: problem.path } : {}),
        ...(problemCodePattern.test(problem.code) ? { details: { problem: problem.code } } : {})
      })
    );
    return invalidOutput(issues, parsed.problems);
  }

  const normalized = normalizeGeneratedModel(parsed.model);
  const semanticIssues = [
    ...validateModelStructure(normalized),
    ...validateMetadataText(context.metadata),
    ...validateParticipantGrounding(normalized, context)
  ];

  if (hasModelErrors(semanticIssues)) {
    return Object.freeze({ status: "semantic-validation-failed", issues: sortModelIssues(semanticIssues) });
  }

  const relationships = validateRelationships(normalized, context);

  if (hasModelErrors(relationships.issues)) {
    return Object.freeze({
      status: "semantic-validation-failed",
      issues: sortModelIssues([...semanticIssues, ...relationships.issues])
    });
  }

  const cleaned = applyInterfaceNamePolicy(normalized, relationships.matches);
  const warnings = sortModelIssues([...semanticIssues, ...relationships.issues, ...cleaned.issues]);
  const rendered = renderPlantUml({ context, model: cleaned.model, digest, generatorType });

  if (!rendered.ok) {
    return Object.freeze({ status: "render-validation-failed", issues: rendered.issues, structureIssues: Object.freeze([]) });
  }

  const structure = validatePlantUmlSubset(rendered.text);

  if (!structure.ok) {
    return Object.freeze({
      status: "render-validation-failed",
      issues: Object.freeze([createModelIssue("plantuml-structure", { details: { count: structure.issues.length } })]),
      structureIssues: structure.issues
    });
  }

  const diagramFileName = `${request.artifactBaseName}${artifactExtensions.diagram}`;
  const reportFileName = `${request.artifactBaseName}${artifactExtensions.report}`;
  let reportText: string;

  try {
    reportText = serializeGroundingReport(
      buildGroundingReport({
        context,
        digest,
        ambiguityReport: grounding.ambiguityReport,
        generatorType,
        ...(modelGeneration === undefined ? {} : { modelGeneration }),
        model: cleaned.model,
        matches: relationships.matches,
        groundingWarnings: grounding.warnings,
        pipelineWarnings: warnings,
        sources: request.sources,
        outputs: { diagramFile: diagramFileName, reportFile: reportFileName }
      })
    );
  } catch {
    return Object.freeze({
      status: "render-validation-failed",
      issues: Object.freeze([createModelIssue("report-failed")]),
      structureIssues: Object.freeze([])
    });
  }

  return Object.freeze({
    status: "success",
    diagramName: context.metadata.diagramName,
    generatorType,
    digest,
    diagram: Object.freeze({ fileName: diagramFileName, content: rendered.text }),
    report: Object.freeze({ fileName: reportFileName, content: reportText }),
    groundingWarnings: grounding.warnings,
    warnings,
    summary: summarize(cleaned.model, grounding.warnings.length + warnings.length)
  });
}
