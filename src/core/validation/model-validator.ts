import type { GroundedFlowMetadata } from "../grounding/grounded-context.js";
import {
  fragmentProblems,
  participantKey,
  participantRefKey,
  sequenceModelLimits,
  type GeneratedSequenceModel
} from "../model/sequence-diagram-model.schema.js";
import { newParticipantPrefix } from "../model/types.js";
import { displayTextProblem, messageLabelTextOptions, type DisplayTextOptions } from "../render/plantuml-escape.js";
import { stableCompare } from "../util/ordering.js";

/**
 * Issue contract of the generation pipeline and the structural validation stage of a generated model.
 *
 * The grounding issue contract has a closed code list, so the stages after grounding use this
 * sibling contract. Every code has a fixed severity and a fixed message. An issue carries at most a
 * schema path and bounded details (identifiers, message order numbers, counts); it never carries
 * generator text, flow text or pack content.
 */

export type ModelIssueSeverity = "error" | "warning";

interface ModelIssueDefinition {
  readonly severity: ModelIssueSeverity;
  readonly message: string;
}

const definitions = {
  "generator-failed": { severity: "error", message: "The sequence-model generator failed without a usable result." },
  "generation-cancelled": { severity: "error", message: "The generation was cancelled." },
  "invalid-generator-type": { severity: "error", message: "The generator does not declare a valid generator type." },
  "schema-violation": {
    severity: "error",
    message: "The generator output does not match the strict sequence-model schema."
  },
  "empty-diagram": { severity: "error", message: "The diagram has no participants or no messages." },
  "duplicate-participant": { severity: "error", message: "A participant is declared more than once." },
  "undeclared-endpoint": { severity: "error", message: "A message endpoint is not a declared participant." },
  "unused-participant": { severity: "error", message: "A declared participant takes part in no message." },
  "self-message-not-internal": {
    severity: "error",
    message: "A message from a participant to itself must use the INTERNAL interface type."
  },
  "internal-endpoint-mismatch": {
    severity: "error",
    message: "An INTERNAL message between two different participants has no matching grounded INTERNAL relationship."
  },
  "invalid-fragment": {
    severity: "error",
    message: "A combined fragment has an invalid range, branch or nesting."
  },
  "response-mode-invalid": { severity: "error", message: "A response message cannot be asynchronous." },
  "response-without-request": {
    severity: "error",
    message: "A response message does not follow a matching request between the same participants."
  },
  "unsafe-text": { severity: "error", message: "A display text is not allowed in PlantUML output." },
  "unsafe-metadata": { severity: "error", message: "A flow metadata value is not allowed in PlantUML output." },
  "unknown-participant": {
    severity: "error",
    message: "A known participant does not refer to an element of the grounded context."
  },
  "participant-kind-mismatch": {
    severity: "error",
    message: "The participant kind does not match the grounded element kind."
  },
  "canonical-name-mismatch": {
    severity: "error",
    message: "The participant name is not the canonical name from the grounded context."
  },
  "unknown-new-participant": {
    severity: "error",
    message: "A new participant does not refer to a confirmed new participant of the grounded context."
  },
  "new-participant-display-mismatch": {
    severity: "error",
    message: "The display name of a new participant does not match its confirmed name."
  },
  "missing-relationship": {
    severity: "error",
    message: "A message between known participants has no grounded relationship."
  },
  "relationship-direction": {
    severity: "error",
    message: "A grounded relationship exists only in the opposite direction."
  },
  "interface-type-mismatch": {
    severity: "error",
    message: "The interface type does not match any grounded relationship between the participants."
  },
  "interaction-mode-mismatch": {
    severity: "error",
    message: "The synchronous or asynchronous mode does not match the grounded relationship."
  },
  "forbidden-interaction": { severity: "error", message: "A grounded rule forbids this interaction." },
  "required-interaction-missing": {
    severity: "warning",
    message: "A grounded rule requires an interaction that the diagram does not contain."
  },
  "unverified-new-participant-interaction": {
    severity: "warning",
    message: "An interaction with a confirmed new participant cannot be verified against the Knowledge Pack."
  },
  "interface-name-removed": {
    severity: "warning",
    message: "An interface name that is not grounded for the interaction was removed."
  },
  "interface-name-unverified": { severity: "error", message: "The final PlantUML contains an interface name without matching grounded evidence." },
  "render-failed": { severity: "error", message: "The validated model could not be rendered safely." },
  "plantuml-structure": { severity: "error", message: "The emitted PlantUML failed structural validation." },
  "review-schema-violation": { severity: "error", message: "The semantic reviewer returned an invalid verdict." },
  "reviewer-failed": { severity: "error", message: "The semantic reviewer did not complete." },
  "review-rejected": { severity: "error", message: "The semantic reviewer rejected the diagram." },
  "report-failed": { severity: "error", message: "The grounding report could not be produced." },
  "too-many-issues": { severity: "warning", message: "Further issues were omitted after reaching the reporting limit." }
} as const satisfies Readonly<Record<string, ModelIssueDefinition>>;

export type ModelIssueCode = keyof typeof definitions;

export const modelIssueCodes: readonly ModelIssueCode[] = Object.freeze(Object.keys(definitions) as ModelIssueCode[]);

export type ModelIssueDetailValue = string | number;

export interface ModelIssue {
  readonly severity: ModelIssueSeverity;
  readonly code: ModelIssueCode;
  readonly message: string;
  /** Schema path such as messages.2.to; never a value. */
  readonly path?: string;
  readonly details?: Readonly<Record<string, ModelIssueDetailValue>>;
}

export const modelIssueLimits = Object.freeze({ defaultMaxIssues: 100, maxDetailKeys: 6, maxDetailTextChars: 128 });

const pathPattern = /^(?:\(root\)|[A-Za-z][A-Za-z0-9]*(?:\.(?:[A-Za-z][A-Za-z0-9]*|\d+))*)$/;
const detailKeyPattern = /^[a-z][A-Za-z0-9]*$/;
const detailTextPattern = /^[A-Za-z0-9 ._:()-]+$/;

export function severityOfModelIssue(code: ModelIssueCode): ModelIssueSeverity {
  return definitions[code].severity;
}

/** Creates a frozen issue. Unsafe paths or details are programming errors and throw. */
export function createModelIssue(
  code: ModelIssueCode,
  options: { readonly path?: string; readonly details?: Readonly<Record<string, ModelIssueDetailValue>> } = {}
): ModelIssue {
  const definition = definitions[code];

  if (options.path !== undefined && (options.path.length > 128 || !pathPattern.test(options.path))) {
    throw new Error("A model issue path must be a schema path.");
  }

  let details: Record<string, ModelIssueDetailValue> | undefined;

  if (options.details !== undefined) {
    const keys = Object.keys(options.details).sort(stableCompare);

    if (keys.length > modelIssueLimits.maxDetailKeys) {
      throw new Error("Model issue details have too many keys.");
    }

    details = {};

    for (const key of keys) {
      const value = options.details[key];
      const safe =
        (typeof value === "number" && Number.isSafeInteger(value)) ||
        (typeof value === "string" &&
          value.length <= modelIssueLimits.maxDetailTextChars &&
          detailTextPattern.test(value));

      if (!detailKeyPattern.test(key) || value === undefined || !safe) {
        throw new Error("Model issue details must be identifiers, codes or integers.");
      }

      details[key] = value;
    }
  }

  return Object.freeze({
    severity: definition.severity,
    code,
    message: definition.message,
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(details === undefined || Object.keys(details).length === 0 ? {} : { details: Object.freeze(details) })
  });
}

function comparePathParts(left: string | undefined, right: string | undefined): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  const leftParts = left.split(".");
  const rightParts = right.split(".");

  for (let index = 0; index < Math.min(leftParts.length, rightParts.length); index += 1) {
    const a = leftParts[index] ?? "";
    const b = rightParts[index] ?? "";

    if (a !== b) {
      return /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : stableCompare(a, b);
    }
  }

  return leftParts.length - rightParts.length;
}

/** Deterministic order: path (numeric segments compared as numbers, missing last), code, details. */
export function compareModelIssues(left: ModelIssue, right: ModelIssue): number {
  return (
    comparePathParts(left.path, right.path) ||
    stableCompare(left.code, right.code) ||
    stableCompare(JSON.stringify(left.details ?? {}), JSON.stringify(right.details ?? {}))
  );
}

/** Sorts, removes exact duplicates and caps issues; a capped list ends with one too-many-issues marker. */
export function sortModelIssues(
  issues: readonly ModelIssue[],
  maxIssues: number = modelIssueLimits.defaultMaxIssues
): readonly ModelIssue[] {
  const sorted = [...issues].sort(compareModelIssues).filter((issue, index, all) => {
    const previous = all[index - 1];
    return previous === undefined || compareModelIssues(previous, issue) !== 0 || previous.severity !== issue.severity;
  });

  if (sorted.length <= maxIssues) {
    return Object.freeze(sorted);
  }

  return Object.freeze([...sorted.slice(0, maxIssues), createModelIssue("too-many-issues", { details: { limit: maxIssues } })]);
}

export function hasModelErrors(issues: readonly ModelIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/**
 * Structural validation of a schema-valid, normalized model: non-empty, unique participants, declared
 * endpoints, no orphan participants, self-messages only as INTERNAL, no asynchronous response, valid
 * fragment ranges and nesting (re-checked after normalization), and every display text, including
 * fragment conditions, still inside the PlantUML text policy.
 */
export function validateModelStructure(model: GeneratedSequenceModel): readonly ModelIssue[] {
  const issues: ModelIssue[] = [];

  if (model.participants.length === 0 || model.messages.length === 0) {
    issues.push(createModelIssue("empty-diagram"));
  }

  const declared = new Set<string>();

  model.participants.forEach((participant, index) => {
    const key = participantKey(participant);

    if (declared.has(key)) {
      issues.push(createModelIssue("duplicate-participant", { path: `participants.${index}` }));
    }

    declared.add(key);
    const shown =
      participant.origin === "knowledge-pack"
        ? participant.canonicalName
        : participant.displayName.slice(newParticipantPrefix.length + 1);

    if (displayTextProblem(shown, { maxChars: sequenceModelLimits.maxCanonicalNameChars }) !== undefined) {
      issues.push(createModelIssue("unsafe-text", { path: `participants.${index}` }));
    }
  });

  const used = new Set<string>();

  model.messages.forEach((message, index) => {
    const path = `messages.${index}`;
    const fromKey = participantRefKey(message.from);
    const toKey = participantRefKey(message.to);
    const details = { order: message.order };

    for (const [end, key] of [
      ["from", fromKey],
      ["to", toKey]
    ] as const) {
      used.add(key);

      if (!declared.has(key)) {
        issues.push(createModelIssue("undeclared-endpoint", { path: `${path}.${end}`, details }));
      }
    }

    if (fromKey === toKey && message.interfaceType !== "INTERNAL") {
      issues.push(createModelIssue("self-message-not-internal", { path, details }));
    }

    if (message.isResponse === true && message.async === true) {
      issues.push(createModelIssue("response-mode-invalid", { path, details }));
    }

    const texts: ReadonlyArray<readonly [string, string | undefined, DisplayTextOptions]> = [
      ["label", message.label, messageLabelTextOptions],
      ["interfaceName", message.interfaceName, { maxChars: sequenceModelLimits.maxInterfaceNameChars }],
      ["businessDescription", message.businessDescription, { maxChars: sequenceModelLimits.maxBusinessDescriptionChars, rejectStatementKeywords: true }]
    ];

    for (const [field, value, options] of texts) {
      if (value !== undefined && displayTextProblem(value, options) !== undefined) {
        issues.push(createModelIssue("unsafe-text", { path: `${path}.${field}`, details }));
      }
    }
  });

  model.participants.forEach((participant, index) => {
    if (!used.has(participantKey(participant))) {
      const reference: Readonly<Record<string, string>> =
        participant.origin === "knowledge-pack" ? { elementId: participant.elementId } : { newName: participant.newName };
      const printable = Object.values(reference).every(
        (value) => value.length <= modelIssueLimits.maxDetailTextChars && detailTextPattern.test(value)
      );
      issues.push(createModelIssue("unused-participant", { path: `participants.${index}`, ...(printable ? { details: reference } : {}) }));
    }
  });

  const conditionOptions = { maxChars: sequenceModelLimits.maxLabelChars, rejectStatementKeywords: true };

  model.fragments.forEach((fragment, index) => {
    if (displayTextProblem(fragment.condition, conditionOptions) !== undefined) {
      issues.push(createModelIssue("unsafe-text", { path: `fragments.${index}.condition` }));
    }

    fragment.elseBranches.forEach((branch, branchIndex) => {
      if (displayTextProblem(branch.condition, conditionOptions) !== undefined) {
        issues.push(createModelIssue("unsafe-text", { path: `fragments.${index}.elseBranches.${branchIndex}.condition` }));
      }
    });
  });

  for (const problem of fragmentProblems(model)) {
    issues.push(createModelIssue("invalid-fragment", { path: problem.path, details: { problem: problem.code } }));
  }

  return sortModelIssues(issues);
}

/** Flow metadata is emitted in PlantUML comments, so it must satisfy the same text policy. */
export function validateMetadataText(metadata: GroundedFlowMetadata): readonly ModelIssue[] {
  const issues: ModelIssue[] = [];

  for (const field of ["diagramName", "flowName", "author"] as const) {
    if (displayTextProblem(metadata[field]) !== undefined) {
      issues.push(createModelIssue("unsafe-metadata", { path: `metadata.${field}` }));
    }
  }

  return sortModelIssues(issues);
}
