import type {
  GenerateSequenceDiagramFailure,
  GenerateSequenceDiagramSuccess,
  RuntimeIssue,
  RuntimeIssueDetailValue
} from "../../src/runtime/index.js";
import type { SettingsProblem } from "./settings.js";

/**
 * Maps runtime results to text a person can act on. Every string is built from stable codes,
 * fixed messages, positions, identifiers and counts. Flow text, pack content, prompts, model
 * answers and machine paths never appear here, so the messages can be shown and logged freely.
 */

export type UserMessageLevel = "error" | "warning" | "info";

export interface UserMessage {
  readonly level: UserMessageLevel;
  /** One sentence for the notification. */
  readonly text: string;
  /** Bounded diagnostic lines for the output channel. */
  readonly details: readonly string[];
  /** Whether opening the Archi Agent settings is a useful next step. */
  readonly suggestSettings: boolean;
}

export const messageLimits = Object.freeze({ maxDetailLines: 20, maxDetailChars: 400 });

const describedKeys = ["order", "fromId", "toId", "elementId", "newName", "newParticipant", "mention", "candidates", "expected", "actual", "expectedKind", "problem", "limit"];

function detailText(value: RuntimeIssueDetailValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** One line per issue: code, position, message and the safe identifier details. */
export function describeIssue(issue: RuntimeIssue): string {
  const where: string[] = [];

  if (issue.file !== undefined) {
    where.push(issue.file);
  }

  if (issue.line !== undefined) {
    where.push(`line ${issue.line}`);
  }

  if (issue.column !== undefined) {
    where.push(typeof issue.column === "number" ? `column ${issue.column}` : String(issue.column));
  }

  if (issue.path !== undefined) {
    where.push(issue.path);
  }

  const details = issue.details ?? {};
  const parts: string[] = [];

  for (const key of describedKeys) {
    const value = details[key];

    if (value !== undefined) {
      parts.push(`${key} ${detailText(value)}`);
    }
  }

  for (const key of Object.keys(details).sort()) {
    const value = details[key];

    if (!describedKeys.includes(key) && value !== undefined) {
      parts.push(`${key} ${detailText(value)}`);
    }
  }

  const line = `[${issue.code}]${where.length === 0 ? "" : ` ${where.join(", ")}:`} ${issue.message}${parts.length === 0 ? "" : ` (${parts.join("; ")})`}`;
  return line.length > messageLimits.maxDetailChars ? `${line.slice(0, messageLimits.maxDetailChars - 3)}...` : line;
}

function boundedLines(lines: readonly string[]): readonly string[] {
  const shown = lines.slice(0, messageLimits.maxDetailLines);
  const omitted = lines.length - shown.length;
  return Object.freeze([...shown, ...(omitted > 0 ? [`... ${omitted} more issue${omitted === 1 ? "" : "s"} omitted`] : [])]);
}

function generatorProblem(failure: GenerateSequenceDiagramFailure): string | undefined {
  const generatorIssue = failure.issues.find((issue) => issue.code === "generator-failed");
  const problem = generatorIssue?.details?.["problem"];
  return typeof problem === "string" ? problem : generatorIssue === undefined ? undefined : "generator-failed";
}

const transportProblems = new Set(["connection-failed", "timeout", "http-status", "redirect-rejected", "unexpected-content-type", "cancelled"]);

export interface FailureContext {
  /** Loopback base URL of the configured local server; safe to show. */
  readonly baseUrl: string;
}

export function describeFailure(failure: GenerateSequenceDiagramFailure, context: FailureContext): UserMessage {
  const details = boundedLines(failure.issues.map(describeIssue));
  let text: string;
  let suggestSettings = false;

  switch (failure.stage) {
    case "flow":
      text = "The flow document was rejected. It needs the restricted front matter (diagram_name, flow_name, author) followed by the description.";
      break;
    case "knowledge-pack":
      text = "The Architecture Knowledge Pack could not be loaded. Check the configured directory and the five pack files.";
      suggestSettings = true;
      break;
    case "generator-configuration":
      text = "The local model settings were rejected.";
      suggestSettings = true;
      break;
    case "grounding-blocked":
      if (failure.ambiguities.length > 0) {
        text = "The flow refers to ambiguous architecture elements and no candidate was selected. Nothing was generated.";
      } else if (failure.unconfirmedNewParticipants.length > 0) {
        text = "The flow declares [NEW: ...] participants that were not confirmed. Nothing was generated.";
      } else {
        text = "Grounding was blocked: the flow does not refer to known participants in a way the Knowledge Pack supports.";
      }
      break;
    case "invalid-generator-output": {
      const problem = generatorProblem(failure);

      if (problem !== undefined && transportProblems.has(problem)) {
        text = `The local model server at ${context.baseUrl} did not answer (${problem}). Is the server running with the model loaded?`;
        suggestSettings = true;
      } else if (problem !== undefined) {
        text = `The local model answer could not be used (${problem}). No diagram was produced.`;
      } else {
        text = "The local model answer violates the strict model schema. No diagram was produced.";
      }

      break;
    }
    case "semantic-validation-failed":
      text = "The local model answer violates the grounded architecture (participants, relationships or modes). No diagram was produced.";
      break;
    case "render-validation-failed":
      text = "The rendered PlantUML failed the structural check. No diagram was produced.";
      break;
  }

  return Object.freeze({ level: "error", text, details, suggestSettings });
}

export function describeSuccess(result: GenerateSequenceDiagramSuccess): UserMessage {
  const summary = result.summary;
  const warnings = boundedLines(result.warnings.map(describeIssue));
  const warningText = summary.warningCount === 0 ? "no warnings" : `${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}`;

  return Object.freeze({
    level: summary.warningCount === 0 ? "info" : "warning",
    text:
      `Archi Agent generated "${result.diagramName}": ${summary.participantCount} participants ` +
      `(${summary.knownParticipantCount} grounded, ${summary.newParticipantCount} new), ${summary.messageCount} messages, ${warningText}.`,
    details: Object.freeze([`Grounding digest: sha256:${result.digest}`, `Generator: ${result.generatorType}`, ...warnings]),
    suggestSettings: false
  });
}

export function describeSettingsProblems(problems: readonly SettingsProblem[]): UserMessage {
  return Object.freeze({
    level: "error",
    text: problems.length === 1 ? `${problems[0]?.setting}: ${problems[0]?.message}` : "The Archi Agent settings are incomplete or invalid.",
    details: Object.freeze(problems.map((problem) => `[${problem.code}] ${problem.setting}: ${problem.message}`)),
    suggestSettings: true
  });
}

export function describeModelListFailure(code: string, baseUrl: string): UserMessage {
  return Object.freeze({
    level: "error",
    text: `The local server at ${baseUrl} did not report its models (${code}). Start the selected provider or run Archi Agent: Select Local Model again.`,
    details: Object.freeze([`[${code}] model listing failed`]),
    suggestSettings: true
  });
}

export function describeCancellation(): UserMessage {
  return Object.freeze({ level: "info", text: "Archi Agent: generation cancelled. Nothing was generated.", details: Object.freeze([]), suggestSettings: false });
}
