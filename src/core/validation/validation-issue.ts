import { validateRelativePath } from "../knowledge-pack/knowledge-pack-source.js";
import { containsControlCharacter, countUnicodeCharacters } from "../knowledge-pack/source-limits.js";
import { stableCompare } from "../util/ordering.js";

/**
 * Unified issue contract for grounding and the later validation pipeline.
 *
 * Every code has a fixed severity and a fixed message. Messages never contain source text; the
 * optional location and details carry only positions, identifiers, counts and other bounded values
 * without control characters. Knowledge-pack and front-matter issues can be mapped into this
 * contract with fromExternalIssue, without changing their own types.
 */

export const validationSeverities = ["error", "warning"] as const;
export type ValidationSeverity = (typeof validationSeverities)[number];

interface IssueDefinition {
  readonly severity: ValidationSeverity;
  readonly message: string;
}

const issueDefinitions = {
  "flow-too-large": { severity: "error", message: "The flow document exceeds the source size limit." },
  "flow-control-character": {
    severity: "error",
    message: "The flow document contains a control or bidirectional formatting character."
  },
  "no-participants": {
    severity: "error",
    message: "The flow document does not refer to any known or confirmed new participant."
  },
  "ambiguous-reference": {
    severity: "error",
    message: "A reference matches several knowledge-pack elements and needs an explicit selection."
  },
  "invalid-ambiguity-selection": {
    severity: "error",
    message: "The selection for an ambiguous reference is not one of its candidates."
  },
  "unused-ambiguity-selection": {
    severity: "warning",
    message: "A selection was supplied for a reference that is not ambiguous in this flow."
  },
  "overlapping-reference": {
    severity: "warning",
    message: "A reference partly overlaps a longer reference and was not used."
  },
  "new-participant-malformed": {
    severity: "error",
    message: "A new-participant marker is malformed; the only supported form is [NEW: Name]."
  },
  "new-participant-empty": { severity: "error", message: "A new-participant marker has an empty name." },
  "new-participant-too-long": { severity: "error", message: "A new-participant name exceeds the length limit." },
  "new-participant-unsafe": {
    severity: "error",
    message: "A new-participant name contains characters that are not allowed."
  },
  "new-participant-conflict": {
    severity: "error",
    message: "A new-participant name matches an existing knowledge-pack element."
  },
  "new-participant-unconfirmed": { severity: "error", message: "A new participant must be confirmed explicitly." },
  "unused-new-participant-confirmation": {
    severity: "warning",
    message: "A confirmation was supplied for a new participant that the flow does not declare."
  },
  "invalid-grounded-context": { severity: "error", message: "The grounded context failed schema validation." },
  "too-many-issues": {
    severity: "warning",
    message: "Further issues were omitted after reaching the reporting limit."
  }
} as const satisfies Readonly<Record<string, IssueDefinition>>;

export type ValidationIssueCode = keyof typeof issueDefinitions;

export const validationIssueCodes: readonly ValidationIssueCode[] = Object.freeze(
  Object.keys(issueDefinitions) as ValidationIssueCode[]
);

/** Components whose own issues can be mapped into this contract. */
export const externalIssueSources = ["front-matter", "knowledge-pack"] as const;
export type ExternalIssueSource = (typeof externalIssueSources)[number];
export type ExternalIssueCode = `${ExternalIssueSource}:${string}`;
export type AnyValidationIssueCode = ValidationIssueCode | ExternalIssueCode;

export interface ValidationLocation {
  /** Logical relative file name; never an absolute path. */
  readonly file?: string;
  readonly line?: number;
  /** One-based column in UTF-16 code units. */
  readonly column?: number;
  readonly length?: number;
  /** Schema field or column name; never a value from the source. */
  readonly field?: string;
}

export type ValidationDetailValue = string | number | boolean | readonly string[];
export type ValidationDetails = Readonly<Record<string, ValidationDetailValue>>;

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: AnyValidationIssueCode;
  readonly message: string;
  readonly location?: ValidationLocation;
  readonly details?: ValidationDetails;
}

export interface ValidationIssueOptions {
  readonly location?: ValidationLocation;
  readonly details?: ValidationDetails;
}

export const validationIssueLimits = Object.freeze({
  maxDetailKeys: 8,
  maxDetailTextChars: 256,
  maxDetailListItems: 50,
  maxFieldChars: 64,
  maxExternalMessageChars: 512,
  defaultMaxIssues: 100
});

const detailKeyPattern = /^[a-z][A-Za-z0-9]*$/;
const fieldPattern = /^[a-z][a-z0-9_ -]*$/;
const externalCodePattern = /^[a-z][a-z0-9-]*$/;
const genericExternalMessage = "An upstream component reported an issue.";

export function isSafeDetailText(value: string): boolean {
  return (
    value.length > 0 &&
    countUnicodeCharacters(value) <= validationIssueLimits.maxDetailTextChars &&
    !containsControlCharacter(value)
  );
}

export function severityOf(code: ValidationIssueCode): ValidationSeverity {
  return issueDefinitions[code].severity;
}

export function messageOf(code: ValidationIssueCode): string {
  return issueDefinitions[code].message;
}

function checkedLocation(location: ValidationLocation): ValidationLocation | undefined {
  const result: { file?: string; line?: number; column?: number; length?: number; field?: string } = {};

  if (location.file !== undefined) {
    if (!validateRelativePath(location.file).ok) {
      throw new Error("An issue location file must be a safe relative path.");
    }

    result.file = location.file;
  }

  for (const key of ["line", "column", "length"] as const) {
    const value = location[key];

    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error("Issue location numbers must be positive integers.");
      }

      result[key] = value;
    }
  }

  if (location.field !== undefined) {
    if (location.field.length > validationIssueLimits.maxFieldChars || !fieldPattern.test(location.field)) {
      throw new Error("An issue location field must be a schema field name.");
    }

    result.field = location.field;
  }

  return Object.keys(result).length === 0 ? undefined : Object.freeze(result);
}

function checkedDetails(details: ValidationDetails): ValidationDetails | undefined {
  const keys = Object.keys(details).sort(stableCompare);

  if (keys.length > validationIssueLimits.maxDetailKeys) {
    throw new Error("Issue details have too many keys.");
  }

  const result: Record<string, ValidationDetailValue> = {};

  for (const key of keys) {
    const value = details[key];

    if (!detailKeyPattern.test(key) || value === undefined) {
      throw new Error("Issue detail keys must be simple names with a value.");
    }

    if (typeof value === "string") {
      if (!isSafeDetailText(value)) {
        throw new Error("Issue detail text must be short and free of control characters.");
      }

      result[key] = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error("Issue detail numbers must be finite.");
      }

      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else {
      if (value.length > validationIssueLimits.maxDetailListItems || !value.every(isSafeDetailText)) {
        throw new Error("Issue detail lists must be short lists of safe text.");
      }

      result[key] = Object.freeze([...value]);
    }
  }

  return keys.length === 0 ? undefined : Object.freeze(result);
}

function assemble(
  severity: ValidationSeverity,
  code: AnyValidationIssueCode,
  message: string,
  options: ValidationIssueOptions
): ValidationIssue {
  const location = options.location === undefined ? undefined : checkedLocation(options.location);
  const details = options.details === undefined ? undefined : checkedDetails(options.details);
  return Object.freeze({
    severity,
    code,
    message,
    ...(location === undefined ? {} : { location }),
    ...(details === undefined ? {} : { details })
  });
}

/** Creates a frozen issue with the fixed severity and message of its code. Invalid input is a programming error. */
export function createValidationIssue(code: ValidationIssueCode, options: ValidationIssueOptions = {}): ValidationIssue {
  return assemble(severityOf(code), code, messageOf(code), options);
}

/** Minimal shape shared by the knowledge-pack, loader and front-matter issue types. */
export interface ExternalIssueLike {
  readonly code: string;
  readonly message: string;
  readonly severity?: ValidationSeverity;
  readonly file?: string;
  readonly line?: number;
  readonly column?: string | number;
  readonly limit?: number;
}

/**
 * Maps an issue of another component into this contract. The code is prefixed with its source, the
 * fixed upstream message is kept when it is safe, and only safe location parts are carried over.
 */
export function fromExternalIssue(source: ExternalIssueSource, issue: ExternalIssueLike): ValidationIssue {
  if (!externalCodePattern.test(issue.code)) {
    throw new Error("An external issue code must be a simple code.");
  }

  const location: { file?: string; line?: number; column?: number; field?: string } = {};

  if (issue.file !== undefined && validateRelativePath(issue.file).ok) {
    location.file = issue.file;
  }

  if (issue.line !== undefined && Number.isSafeInteger(issue.line) && issue.line >= 1) {
    location.line = issue.line;
  }

  if (typeof issue.column === "number" && Number.isSafeInteger(issue.column) && issue.column >= 1) {
    location.column = issue.column;
  } else if (
    typeof issue.column === "string" &&
    issue.column.length <= validationIssueLimits.maxFieldChars &&
    fieldPattern.test(issue.column)
  ) {
    location.field = issue.column;
  }

  const safeMessage =
    issue.message.length > 0 &&
    countUnicodeCharacters(issue.message) <= validationIssueLimits.maxExternalMessageChars &&
    !containsControlCharacter(issue.message);

  return assemble(issue.severity ?? "error", `${source}:${issue.code}`, safeMessage ? issue.message : genericExternalMessage, {
    location,
    ...(issue.limit !== undefined && Number.isFinite(issue.limit) ? { details: { limit: issue.limit } } : {})
  });
}

function compareOptionalText(left: string | undefined, right: string | undefined): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return stableCompare(left, right);
}

function compareOptionalNumber(left: number | undefined, right: number | undefined): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return left - right;
}

function detailsKey(issue: ValidationIssue): string {
  return issue.details === undefined ? "" : JSON.stringify(issue.details);
}

/** Deterministic order: file, line, column, length, code, field, severity, details; missing parts last. */
export function compareValidationIssues(left: ValidationIssue, right: ValidationIssue): number {
  return (
    compareOptionalText(left.location?.file, right.location?.file) ||
    compareOptionalNumber(left.location?.line, right.location?.line) ||
    compareOptionalNumber(left.location?.column, right.location?.column) ||
    compareOptionalNumber(left.location?.length, right.location?.length) ||
    stableCompare(left.code, right.code) ||
    compareOptionalText(left.location?.field, right.location?.field) ||
    stableCompare(left.severity, right.severity) ||
    stableCompare(detailsKey(left), detailsKey(right))
  );
}

export interface SortedValidationIssues {
  readonly issues: readonly ValidationIssue[];
  readonly truncated: boolean;
}

/** Sorts issues and caps them; a capped list ends with one too-many-issues marker. */
export function sortValidationIssues(
  issues: readonly ValidationIssue[],
  maxIssues: number = validationIssueLimits.defaultMaxIssues
): SortedValidationIssues {
  if (!Number.isSafeInteger(maxIssues) || maxIssues < 1) {
    throw new Error("The issue limit must be a positive integer.");
  }

  const sorted = [...issues].sort(compareValidationIssues);

  if (sorted.length <= maxIssues) {
    return Object.freeze({ issues: Object.freeze(sorted), truncated: false });
  }

  return Object.freeze({
    issues: Object.freeze([
      ...sorted.slice(0, maxIssues),
      createValidationIssue("too-many-issues", { details: { limit: maxIssues } })
    ]),
    truncated: true
  });
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
