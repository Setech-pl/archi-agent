import { knowledgePackLimits } from "./source-limits.js";

/** Stable, neutral error codes for knowledge-pack sources, tables and front matter. */
export const knowledgePackErrorCodes = [
  "missing-file",
  "invalid-path",
  "limit-exceeded",
  "missing-table",
  "multiple-tables",
  "unexpected-content",
  "invalid-header",
  "unknown-column",
  "missing-column",
  "duplicate-column",
  "column-order",
  "malformed-separator",
  "malformed-row",
  "cell-count-mismatch",
  "no-data-rows",
  "empty-required-value",
  "invalid-identifier",
  "invalid-enum-value",
  "invalid-value",
  "unknown-field",
  "duplicate-record",
  "forbidden-markdown",
  "control-character",
  "invalid-front-matter",
  "unknown-front-matter-key",
  "duplicate-front-matter-key",
  "missing-front-matter-key",
  "too-many-issues",
  "cancelled"
] as const;

export type KnowledgePackErrorCode = (typeof knowledgePackErrorCodes)[number];

/** Messages never contain source content; locations are carried in separate fields. */
const safeMessages: Readonly<Record<KnowledgePackErrorCode, string>> = Object.freeze({
  "missing-file": "The requested knowledge-pack file does not exist.",
  "invalid-path": "The path must be a relative path inside the knowledge pack.",
  "limit-exceeded": "A source limit was exceeded.",
  "missing-table": "The file must contain exactly one Markdown table.",
  "multiple-tables": "The file contains more than one table.",
  "unexpected-content": "Only one optional level-1 heading and one table are allowed.",
  "invalid-header": "The table header row is malformed.",
  "unknown-column": "The table contains a column that is not part of the schema.",
  "missing-column": "A required column is missing.",
  "duplicate-column": "A column appears more than once.",
  "column-order": "Columns must appear in the documented order.",
  "malformed-separator": "The separator row is malformed.",
  "malformed-row": "A table row must start and end with an unescaped pipe.",
  "cell-count-mismatch": "A row has a different number of cells than the header.",
  "no-data-rows": "The table must contain at least one data row.",
  "empty-required-value": "A required value is empty.",
  "invalid-identifier":
    "An identifier must start with a lower-case ASCII letter and contain only lower-case ASCII letters, digits and hyphens.",
  "invalid-enum-value": "The value is not one of the allowed values.",
  "invalid-value": "The value is not valid.",
  "unknown-field": "The record contains an unknown field.",
  "duplicate-record": "The record duplicates an earlier record in the same file.",
  "forbidden-markdown": "HTML, code fences, images, templates and embedded directives are not allowed.",
  "control-character": "Control characters are not allowed.",
  "invalid-front-matter": "The front matter block is malformed or uses unsupported syntax.",
  "unknown-front-matter-key": "The front matter contains an unsupported key.",
  "duplicate-front-matter-key": "A front matter key appears more than once.",
  "missing-front-matter-key": "A required front matter key is missing.",
  "too-many-issues": "Further issues were omitted after reaching the reporting limit.",
  "cancelled": "The operation was cancelled."
});

export interface IssueLocation {
  /** Logical file name such as systems.md; never an absolute path. */
  readonly file?: string;
  readonly line?: number;
  /** Schema column name or a position label; never a value from the source. */
  readonly column?: string;
  readonly limit?: number;
}

export interface KnowledgePackIssue extends IssueLocation {
  readonly code: KnowledgePackErrorCode;
  readonly message: string;
}

type MutableLocation = { file?: string; line?: number; column?: string; limit?: number };

function definedLocation(location: IssueLocation): IssueLocation {
  const result: MutableLocation = {};

  if (location.file !== undefined) {
    result.file = location.file;
  }

  if (location.line !== undefined) {
    result.line = location.line;
  }

  if (location.column !== undefined) {
    result.column = location.column;
  }

  if (location.limit !== undefined) {
    result.limit = location.limit;
  }

  return result;
}

export function safeMessageFor(code: KnowledgePackErrorCode): string {
  return safeMessages[code];
}

export function createIssue(code: KnowledgePackErrorCode, location: IssueLocation = {}): KnowledgePackIssue {
  return Object.freeze({ code, message: safeMessages[code], ...definedLocation(location) });
}

export function formatIssue(issue: KnowledgePackIssue): string {
  const parts: string[] = [];

  if (issue.file !== undefined) {
    parts.push(`file ${issue.file}`);
  }

  if (issue.line !== undefined) {
    parts.push(`line ${issue.line}`);
  }

  if (issue.column !== undefined) {
    parts.push(`column ${issue.column}`);
  }

  if (issue.limit !== undefined) {
    parts.push(`limit ${issue.limit}`);
  }

  return parts.length === 0
    ? `${issue.code}: ${issue.message}`
    : `${issue.code}: ${issue.message} (${parts.join(", ")})`;
}

export class KnowledgePackError extends Error {
  public readonly code: KnowledgePackErrorCode;
  public readonly file: string | undefined;
  public readonly line: number | undefined;
  public readonly column: string | undefined;
  public readonly limit: number | undefined;

  public constructor(issue: KnowledgePackIssue) {
    super(formatIssue(issue));
    this.name = "KnowledgePackError";
    this.code = issue.code;
    this.file = issue.file;
    this.line = issue.line;
    this.column = issue.column;
    this.limit = issue.limit;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Deterministic order: line, then column, then code, then limit. */
export function compareIssues(left: KnowledgePackIssue, right: KnowledgePackIssue): number {
  const leftLine = left.line ?? Number.MAX_SAFE_INTEGER;
  const rightLine = right.line ?? Number.MAX_SAFE_INTEGER;

  if (leftLine !== rightLine) {
    return leftLine - rightLine;
  }

  return (
    compareText(left.column ?? "", right.column ?? "") ||
    compareText(left.code, right.code) ||
    (left.limit ?? 0) - (right.limit ?? 0)
  );
}

/**
 * Collects issues up to a limit. After the limit, one too-many-issues marker is recorded and
 * everything else is ignored, so hostile input cannot produce an unbounded report.
 */
export class IssueCollector {
  readonly #issues: KnowledgePackIssue[] = [];
  #marker: KnowledgePackIssue | undefined;

  public constructor(
    private readonly maxIssues: number = knowledgePackLimits.maxReportedIssues,
    private readonly file?: string
  ) {}

  public add(code: KnowledgePackErrorCode, location: Omit<IssueLocation, "file"> = {}): void {
    if (this.#marker !== undefined) {
      return;
    }

    if (this.#issues.length >= this.maxIssues) {
      this.#marker = createIssue("too-many-issues", { file: this.file, limit: this.maxIssues });
      return;
    }

    this.#issues.push(createIssue(code, { file: this.file, ...location }));
  }

  public get count(): number {
    return this.#issues.length + (this.#marker === undefined ? 0 : 1);
  }

  public get truncated(): boolean {
    return this.#marker !== undefined;
  }

  /** Sorted issues; the truncation marker, if any, is always last. */
  public sorted(): readonly KnowledgePackIssue[] {
    const ordered = [...this.#issues].sort(compareIssues);
    return Object.freeze(this.#marker === undefined ? ordered : [...ordered, this.#marker]);
  }
}
