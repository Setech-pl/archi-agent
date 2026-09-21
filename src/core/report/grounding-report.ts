import type {
  AmbiguityReport,
  ContextDigest,
  FlowReference,
  GroundedContext,
  GroundingWarning,
  PackSourceReference
} from "../grounding/grounded-context.js";
import { validateRelativePath } from "../knowledge-pack/knowledge-pack-source.js";
import { participantKey, participantRefKey, type GeneratedSequenceModel } from "../model/sequence-diagram-model.schema.js";
import { isSafeModelGenerationMetadata, type ModelGenerationMetadata } from "../pipeline/sequence-model-generator.js";
import { stableCompare } from "../util/ordering.js";
import { participantKindOf } from "../validation/grounding-validator.js";
import type { ModelIssue } from "../validation/model-validator.js";
import type { MessageRelationshipMatch } from "../validation/relationship-validator.js";

/**
 * Deterministic grounding report written next to each diagram.
 *
 * It records the evidence behind the diagram: participants with pack source lines and flow mention
 * positions, the relationships and rules of the minimal context, which messages each relationship
 * supports, ambiguity selections, warnings and the validation summary. It contains no flow body, no
 * pack file content, no prompt, no generator response or message label, no timestamp, no absolute
 * path and no environment value. Keys are written in a fixed order and every array has a fixed sort
 * order; the text is UTF-8 JSON with two-space indentation and a final newline.
 *
 * A model-backed generator adds an optional modelGeneration block (model identifier, temperature,
 * seed, attempt count, structured output). It never contains the endpoint, request, prompt, response,
 * headers or timing. Reports of the scripted demo generator have no such block.
 */

export const groundingReportSchemaVersion = 1 as const;

export interface GroundingReportSources {
  /** Project-relative path of the flow document. */
  readonly flowFile: string;
  /** Project-relative directory of the Knowledge Pack. */
  readonly knowledgePackDirectory: string;
}

export interface GroundingReportOutputs {
  readonly diagramFile: string;
  readonly reportFile: string;
}

export interface GroundingReportInput {
  readonly context: GroundedContext;
  readonly digest: ContextDigest;
  readonly ambiguityReport: AmbiguityReport;
  readonly generatorType: string;
  /** Safe model-generation metadata; absent for generators that are not model-backed. */
  readonly modelGeneration?: ModelGenerationMetadata;
  readonly model: GeneratedSequenceModel;
  readonly matches: readonly MessageRelationshipMatch[];
  readonly groundingWarnings: readonly GroundingWarning[];
  readonly pipelineWarnings: readonly ModelIssue[];
  readonly sources: GroundingReportSources;
  readonly outputs: GroundingReportOutputs;
  /** D1 uses final validated PlantUML and has no intermediate model normalization step. */
  readonly validationMode?: "final-plantuml";
}

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

const artifactFileNamePattern = /^[a-z0-9][a-z0-9-]*\.(?:puml|grounding\.json)$/;

function checkedRelative(value: string): string {
  if (!validateRelativePath(value).ok) {
    throw new Error("Report source paths must be safe project-relative paths.");
  }

  return value;
}

function source(directory: string, reference: PackSourceReference): Json {
  return { file: `${directory}/${reference.file}`, line: reference.line };
}

function mentions(references: readonly FlowReference[]): Json {
  return references.map((reference) => ({ line: reference.line, column: reference.column, length: reference.length }));
}

function issueJson(origin: "grounding" | "pipeline", issue: GroundingWarning | ModelIssue): Json {
  const result: Record<string, Json> = { origin, code: issue.code, severity: issue.severity, message: issue.message };

  if ("path" in issue && issue.path !== undefined) {
    result["path"] = issue.path;
  }

  if ("location" in issue && issue.location !== undefined) {
    const location: Record<string, Json> = {};

    for (const key of ["file", "line", "column", "length", "field"] as const) {
      const value = issue.location[key];

      if (value !== undefined) {
        location[key] = value;
      }
    }

    result["location"] = location;
  }

  if (issue.details !== undefined) {
    const details: Record<string, Json> = {};

    for (const key of Object.keys(issue.details).sort(stableCompare)) {
      const value = issue.details[key];

      if (value !== undefined) {
        details[key] = Array.isArray(value) ? [...(value as readonly string[])] : (value as string | number | boolean);
      }
    }

    result["details"] = details;
  }

  return result;
}

export function buildGroundingReport(input: GroundingReportInput): Json {
  const { context, model } = input;
  const packDirectory = checkedRelative(input.sources.knowledgePackDirectory);
  const flowFile = checkedRelative(input.sources.flowFile);

  for (const name of [input.outputs.diagramFile, input.outputs.reportFile]) {
    if (!artifactFileNamePattern.test(name)) {
      throw new Error("Report output names must be planned artifact file names.");
    }
  }

  const modelGeneration = input.modelGeneration;

  if (modelGeneration !== undefined && !isSafeModelGenerationMetadata(modelGeneration)) {
    throw new Error("Model generation metadata must be safe.");
  }

  const used = new Set(model.participants.map(participantKey));
  const ordersByRelationship = new Map<object, number[]>();

  for (const match of input.matches) {
    for (const relationship of match.relationships) {
      const orders = ordersByRelationship.get(relationship) ?? [];
      orders.push(match.order);
      ordersByRelationship.set(relationship, orders);
    }
  }

  const verificationByOrder = new Map(input.matches.map((match) => [match.order, match.verification]));
  const knownElements = [...context.actors, ...context.systems].sort((left, right) => stableCompare(left.id, right.id));
  const pipelineIssues = [...input.pipelineWarnings];

  return {
    reportSchemaVersion: groundingReportSchemaVersion,
    diagramName: context.metadata.diagramName,
    flowName: context.metadata.flowName,
    author: context.metadata.author,
    language: context.metadata.language,
    groundingDigest: { algorithm: input.digest.algorithm, value: input.digest.value },
    generatorType: input.generatorType,
    ...(modelGeneration === undefined
      ? {}
      : {
          modelGeneration: {
            modelId: modelGeneration.modelId,
            temperature: modelGeneration.temperature,
            seed: modelGeneration.seed,
            attemptCount: modelGeneration.attemptCount,
            structuredOutput: modelGeneration.structuredOutput
          }
        }),
    sources: { flow: flowFile, knowledgePack: packDirectory },
    knownParticipants: knownElements.map((element) => ({
      elementId: element.id,
      participantType: element.participantType,
      elementKind: element.participantType === "actor" ? element.actorKind : element.systemKind,
      diagramKind: participantKindOf(element),
      canonicalName: element.canonicalName,
      usedInDiagram: used.has(`kp:${element.id}`),
      resolution: element.resolution,
      matchKinds: [...element.matchKinds],
      source: source(packDirectory, element.source),
      flowMentions: mentions(element.mentions)
    })),
    newParticipants: context.newParticipants.map((participant) => ({
      key: participant.key,
      displayName: participant.displayName,
      grounded: false,
      usedInDiagram: used.has(`new:${participant.key}`),
      flowMentions: mentions(participant.mentions)
    })),
    relationships: context.relationships.map((relationship) => ({
      fromId: relationship.fromId,
      toId: relationship.toId,
      interfaceType: relationship.interfaceType,
      interfaceName: relationship.interfaceName,
      mode: relationship.mode,
      purpose: relationship.purpose,
      source: source(packDirectory, relationship.source),
      supportsMessages: [...(ordersByRelationship.get(relationship) ?? [])].sort((left, right) => left - right)
    })),
    rules: context.rules.map((rule) => ({
      rule: rule.rule,
      fromId: rule.fromId,
      toId: rule.toId,
      reason: rule.reason,
      source: source(packDirectory, rule.source)
    })),
    ambiguitySelections: input.ambiguityReport.entries.map((entry) => ({
      mention: entry.mention,
      selectedId: entry.selectedId,
      candidates: entry.candidates.map((candidate) => candidate.id)
    })),
    messages: model.messages.map((message) => ({
      order: message.order,
      from: participantRefKey(message.from),
      to: participantRefKey(message.to),
      interfaceType: message.interfaceType,
      interfaceName: message.interfaceName ?? null,
      mode: message.async === true ? "asynchronous" : "synchronous",
      response: message.isResponse === true,
      verification: verificationByOrder.get(message.order) ?? "unverified-new"
    })),
    fragments: model.fragments.map((fragment) => ({
      kind: fragment.kind,
      firstOrder: fragment.firstOrder,
      lastOrder: fragment.lastOrder,
      elseBranchFirstOrders: fragment.elseBranches.map((branch) => branch.firstOrder)
    })),
    warnings: [
      ...input.groundingWarnings.map((warning) => issueJson("grounding", warning)),
      ...pipelineIssues.map((warning) => issueJson("pipeline", warning))
    ],
    validation: {
      schema: "passed",
      normalization: input.validationMode === "final-plantuml" ? "not-applicable" : "passed",
      participantGrounding: "passed",
      relationships: "passed",
      interfaceNamePolicy: pipelineIssues.some((issue) => issue.code === "interface-name-removed") ? "names-removed" : "passed",
      plantUmlSubset: "passed",
      officialPlantUmlRendering: "not-executed",
      errorCount: 0,
      warningCount: input.groundingWarnings.length + pipelineIssues.length
    },
    outputs: { diagram: input.outputs.diagramFile, report: input.outputs.reportFile }
  };
}

export function serializeGroundingReport(report: Json): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
