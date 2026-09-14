import { IssueCollector, type KnowledgePackIssue } from "./source-errors.js";
import {
  containsControlCharacter,
  countUnicodeCharacters,
  knowledgePackLimits,
  textExceedsFileLimit
} from "./source-limits.js";

/**
 * Strict parser for one Markdown table per file. It does not render Markdown and does not
 * interpret links; it returns cell text with source locations or typed issues.
 */

export type ParseIssue = KnowledgePackIssue;

export interface MarkdownTableOptions {
  /** Logical file name used in issue locations, for example systems.md. */
  readonly file: string;
  /** Exact expected columns in their required order. */
  readonly columns: readonly string[];
  /** Columns whose cells may be empty; all other cells are required. */
  readonly optionalColumns?: readonly string[];
  readonly maxRows?: number;
  readonly maxCellChars?: number;
  readonly maxIssues?: number;
}

export interface ParsedCell {
  readonly column: string;
  readonly index: number;
  readonly value: string;
}

export interface ParsedTableRow {
  readonly line: number;
  readonly cells: readonly ParsedCell[];
  readonly values: Readonly<Record<string, string>>;
}

export interface ParsedTable {
  readonly file: string;
  readonly columns: readonly string[];
  readonly headerLine: number;
  readonly rows: readonly ParsedTableRow[];
}

export type MarkdownTableResult =
  | { readonly ok: true; readonly table: ParsedTable; readonly issues: readonly ParseIssue[]; readonly truncated: false }
  | { readonly ok: false; readonly issues: readonly ParseIssue[]; readonly truncated: boolean };

interface SourceLine {
  readonly number: number;
  readonly text: string;
}

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BACKSLASH = String.fromCharCode(92);
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const PIPE = "|";
const separatorCellPattern = /^-{3,}$/;

export function parseMarkdownTable(text: string, options: MarkdownTableOptions): MarkdownTableResult {
  assertOptions(options);
  const issues = new IssueCollector(options.maxIssues ?? knowledgePackLimits.maxReportedIssues, options.file);
  const maxRows = options.maxRows ?? knowledgePackLimits.maxTableRows;
  const maxCellChars = options.maxCellChars ?? knowledgePackLimits.maxCellChars;

  if (textExceedsFileLimit(text)) {
    issues.add("limit-exceeded", { limit: knowledgePackLimits.maxFileBytes });
    return failure(issues);
  }

  const lines = splitLines(text);

  for (const line of lines) {
    if (containsControlCharacter(line.text)) {
      issues.add("control-character", { line: line.number });
    }
  }

  if (issues.count > 0) {
    return failure(issues);
  }

  const layout = locateTable(lines, issues);

  if (layout === undefined || issues.count > 0) {
    return failure(issues);
  }

  const tableLines = lines.slice(layout.start, layout.end);
  const header = tableLines[0]!;
  const headerCells = splitRow(header.text);

  if (headerCells === undefined) {
    issues.add("invalid-header", { line: header.number });
    return failure(issues);
  }

  const separator = tableLines[1];

  if (separator === undefined) {
    issues.add("malformed-separator", { line: header.number });
    return failure(issues);
  }

  const separatorCells = splitRow(separator.text);

  if (
    separatorCells === undefined ||
    separatorCells.length !== headerCells.length ||
    !separatorCells.every((cell) => separatorCellPattern.test(cell.trim()))
  ) {
    issues.add("malformed-separator", { line: separator.number });
  }

  checkHeader(
    headerCells.map((cell) => cell.trim()),
    options.columns,
    header.number,
    issues
  );

  if (issues.count > 0) {
    return failure(issues);
  }

  const dataLines = tableLines.slice(2);

  if (dataLines.length === 0) {
    issues.add("no-data-rows", { line: separator.number });
    return failure(issues);
  }

  if (dataLines.length > maxRows) {
    issues.add("limit-exceeded", { line: dataLines[maxRows]!.number, limit: maxRows });
    return failure(issues);
  }

  const optional = new Set(options.optionalColumns ?? []);
  const rows: ParsedTableRow[] = [];

  for (const line of dataLines) {
    const row = parseDataRow(line, options.columns, optional, maxCellChars, issues);

    if (row !== undefined) {
      rows.push(row);
    }
  }

  if (issues.count > 0) {
    return failure(issues);
  }

  return {
    ok: true,
    issues: Object.freeze([]),
    truncated: false,
    table: Object.freeze({
      file: options.file,
      columns: Object.freeze([...options.columns]),
      headerLine: header.number,
      rows: Object.freeze(rows)
    })
  };
}

function assertOptions(options: MarkdownTableOptions): void {
  const columns = options.columns;
  const unique = new Set(columns);

  if (
    columns.length === 0 ||
    columns.length > knowledgePackLimits.maxTableColumns ||
    unique.size !== columns.length ||
    columns.some((column) => column.length === 0)
  ) {
    throw new Error("Invalid table schema options.");
  }

  for (const column of options.optionalColumns ?? []) {
    if (!unique.has(column)) {
      throw new Error("Invalid table schema options.");
    }
  }
}

function failure(issues: IssueCollector): MarkdownTableResult {
  return { ok: false, issues: issues.sorted(), truncated: issues.truncated };
}

function splitLines(text: string): SourceLine[] {
  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;

  return source.split(LF).map((raw, index) => ({
    number: index + 1,
    text: raw.endsWith(CR) ? raw.slice(0, -1) : raw
  }));
}

function locateTable(
  lines: readonly SourceLine[],
  issues: IssueCollector
): { start: number; end: number } | undefined {
  let headingSeen = false;
  let start = -1;
  let end = -1;
  let multipleReported = false;

  lines.forEach((line, index) => {
    const trimmed = line.text.trim();

    if (trimmed === "") {
      return;
    }

    if (trimmed.startsWith(PIPE)) {
      if (start === -1) {
        start = index;
        end = index + 1;
      } else if (end === index) {
        end = index + 1;
      } else if (!multipleReported) {
        issues.add("multiple-tables", { line: line.number });
        multipleReported = true;
      }

      return;
    }

    if (isFence(trimmed) || containsForbiddenMarkup(trimmed)) {
      issues.add("forbidden-markdown", { line: line.number });
      return;
    }

    if (isLevelOneHeading(trimmed) && !headingSeen && start === -1) {
      headingSeen = true;
      return;
    }

    issues.add("unexpected-content", { line: line.number });
  });

  if (start === -1) {
    issues.add("missing-table");
    return undefined;
  }

  return { start, end };
}

function checkHeader(
  names: readonly string[],
  expected: readonly string[],
  line: number,
  issues: IssueCollector
): void {
  if (names.length > knowledgePackLimits.maxTableColumns) {
    issues.add("limit-exceeded", { line, limit: knowledgePackLimits.maxTableColumns });
    return;
  }

  const seen = new Set<string>();
  let problems = 0;

  names.forEach((name, index) => {
    const position = `position ${index + 1}`;

    if (name === "") {
      issues.add("invalid-header", { line, column: position });
      problems += 1;
      return;
    }

    if (seen.has(name)) {
      issues.add("duplicate-column", { line, column: expected.includes(name) ? name : position });
      problems += 1;
      return;
    }

    seen.add(name);

    if (!expected.includes(name)) {
      issues.add("unknown-column", { line, column: position });
      problems += 1;
    }
  });

  for (const column of expected) {
    if (!seen.has(column)) {
      issues.add("missing-column", { line, column });
      problems += 1;
    }
  }

  if (problems === 0 && names.some((name, index) => name !== expected[index])) {
    issues.add("column-order", { line });
  }
}

function parseDataRow(
  line: SourceLine,
  columns: readonly string[],
  optional: ReadonlySet<string>,
  maxCellChars: number,
  issues: IssueCollector
): ParsedTableRow | undefined {
  const rawCells = splitRow(line.text);

  if (rawCells === undefined) {
    issues.add("malformed-row", { line: line.number });
    return undefined;
  }

  if (rawCells.length !== columns.length) {
    issues.add("cell-count-mismatch", { line: line.number, limit: columns.length });
    return undefined;
  }

  const cells: ParsedCell[] = [];
  const values: Record<string, string> = {};
  let valid = true;

  rawCells.forEach((raw, index) => {
    const column = columns[index]!;
    const value = raw.trim();

    if (countUnicodeCharacters(value) > maxCellChars) {
      issues.add("limit-exceeded", { line: line.number, column, limit: maxCellChars });
      valid = false;
      return;
    }

    if (containsForbiddenMarkup(value)) {
      issues.add("forbidden-markdown", { line: line.number, column });
      valid = false;
      return;
    }

    if (value === "" && !optional.has(column)) {
      issues.add("empty-required-value", { line: line.number, column });
      valid = false;
      return;
    }

    cells.push(Object.freeze({ column, index, value }));
    values[column] = value;
  });

  if (!valid) {
    return undefined;
  }

  return Object.freeze({ line: line.number, cells: Object.freeze(cells), values: Object.freeze(values) });
}

/**
 * Splits a table row on unescaped pipes. A backslash before a pipe yields a literal pipe and a
 * doubled backslash yields one backslash; every other character is kept as written. The row must
 * start and end with an unescaped pipe.
 */
function splitRow(lineText: string): string[] | undefined {
  const trimmed = lineText.trim();

  if (!trimmed.startsWith(PIPE)) {
    return undefined;
  }

  const cells: string[] = [];
  let current = "";
  let closed = false;

  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index]!;
    closed = false;

    if (character === BACKSLASH) {
      const next = trimmed[index + 1];

      if (next === PIPE || next === BACKSLASH) {
        current += next;
        index += 1;
      } else {
        current += character;
      }

      continue;
    }

    if (character === PIPE) {
      cells.push(current);
      current = "";
      closed = true;
      continue;
    }

    current += character;
  }

  return closed ? cells : undefined;
}

function isFence(trimmed: string): boolean {
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}

function isLevelOneHeading(trimmed: string): boolean {
  return trimmed.startsWith("# ") && trimmed.slice(2).trim().length > 0;
}

function isAsciiLetter(character: string): boolean {
  return character >= "a" && character <= "z";
}

/**
 * Detects content that could render, fetch or execute: HTML-like tags and autolinks, images,
 * code fences, template interpolation and embedded diagram directives.
 */
export function containsForbiddenMarkup(value: string): boolean {
  const lower = value.toLowerCase();

  if (
    lower.includes("```") ||
    lower.includes("~~~") ||
    lower.includes("![") ||
    lower.includes("{{") ||
    lower.includes("$" + "{") ||
    lower.includes("@start") ||
    lower.includes("@end")
  ) {
    return true;
  }

  for (let index = 0; index < lower.length - 1; index += 1) {
    const current = lower[index];
    const next = lower[index + 1] ?? "";

    if (current === "<" && (isAsciiLetter(next) || next === "/" || next === "!" || next === "?")) {
      return true;
    }

    if (current === "!" && isAsciiLetter(next) && (index === 0 || lower[index - 1] === " ")) {
      return true;
    }
  }

  return false;
}
