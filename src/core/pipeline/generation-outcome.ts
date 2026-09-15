import type { AmbiguityReport, ContextDigest, GroundingWarning } from "../grounding/grounded-context.js";
import type { SchemaProblem } from "../model/sequence-diagram-model.schema.js";
import type { OutputIssue } from "../output/artifact-file-system.js";
import type { ModelIssue } from "../validation/model-validator.js";
import type { PlantUmlStructureIssue } from "../validation/plantuml-validator.js";
import type { ValidationIssue } from "../validation/validation-issue.js";

/**
 * Discriminated outcome of one generation. Normal validation results are values, not exceptions.
 * Issues carry codes, paths, identifiers and counts only; complete untrusted content never appears.
 */

export interface GeneratedArtifact {
  readonly fileName: string;
  readonly content: string;
}

export interface GenerationSummary {
  readonly participantCount: number;
  readonly knownParticipantCount: number;
  readonly newParticipantCount: number;
  readonly messageCount: number;
  readonly synchronousCount: number;
  readonly asynchronousCount: number;
  readonly responseCount: number;
  /**
   * Structural metric: messages whose sender and receiver are the same participant. It is not an
   * interaction-mode bucket and overlaps the synchronous, asynchronous and response counts.
   */
  readonly selfMessageCount: number;
  readonly warningCount: number;
}

export interface GenerationSuccess {
  readonly status: "success";
  readonly diagramName: string;
  readonly generatorType: string;
  readonly digest: ContextDigest;
  readonly diagram: GeneratedArtifact;
  readonly report: GeneratedArtifact;
  readonly groundingWarnings: readonly GroundingWarning[];
  readonly warnings: readonly ModelIssue[];
  readonly summary: GenerationSummary;
}

export interface GroundingBlockedOutcome {
  readonly status: "grounding-blocked";
  readonly issues: readonly ValidationIssue[];
  readonly truncated: boolean;
  readonly ambiguityReport: AmbiguityReport;
}

export interface InvalidGeneratorOutputOutcome {
  readonly status: "invalid-generator-output";
  readonly issues: readonly ModelIssue[];
  readonly schemaProblems: readonly SchemaProblem[];
}

export interface SemanticValidationFailedOutcome {
  readonly status: "semantic-validation-failed";
  readonly issues: readonly ModelIssue[];
}

export interface RenderValidationFailedOutcome {
  readonly status: "render-validation-failed";
  readonly issues: readonly ModelIssue[];
  readonly structureIssues: readonly PlantUmlStructureIssue[];
}

export interface OutputFailedOutcome {
  readonly status: "output-failed";
  readonly issues: readonly OutputIssue[];
}

/** Outcomes of the in-memory pipeline; no artifact has been written for any of them. */
export type PipelineOutcome =
  | GenerationSuccess
  | GroundingBlockedOutcome
  | InvalidGeneratorOutputOutcome
  | SemanticValidationFailedOutcome
  | RenderValidationFailedOutcome;

export type GenerationOutcome = PipelineOutcome | OutputFailedOutcome;

export type GenerationStatus = GenerationOutcome["status"];
