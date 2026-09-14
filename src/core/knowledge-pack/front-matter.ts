import { isFilenameSafeDiagramId } from "../output/naming.js";
import { IssueCollector, type KnowledgePackIssue } from "./source-errors.js";
import { containsControlCharacter, countUnicodeCharacters, knowledgePackLimits } from "./source-limits.js";

/**
 * Restricted front matter for flow descriptions. It is not YAML: only four single-line
 * key: value entries are understood, and every YAML feature beyond that is rejected.
 */

export const frontMatterKeys = ["diagram_name", "flow_name", "author", "language"] as const;
export type FrontMatterKey = (typeof frontMatterKeys)[number];

export const requiredFrontMatterKeys = ["diagram_name", "flow_name", "author"] as const;

export const flowLanguages = ["en", "pl"] as const;
export type FlowLanguage = (typeof flowLanguages)[number];
export const defaultFlowLanguage: FlowLanguage = "en";

export interface FlowMetadata {
  readonly diagramName: string;
  readonly flowName: string;
  readonly author: string;
  readonly language: FlowLanguage;
}

export interface FrontMatterOptions {
  /** Logical file name used in issue locations. */
  readonly file?: string;
  readonly maxIssues?: number;
}

export interface FrontMatterResult {
  readonly ok: boolean;
  readonly metadata: FlowMetadata | undefined;
  /** Document text after the closing delimiter, unchanged. */
  readonly body: string;
  /** One-based line number of the first body line in the original text. */
  readonly bodyStartLine: number;
  readonly issues: readonly KnowledgePackIssue[];
  readonly truncated: boolean;
}

const DELIMITER = "---";
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const keyPattern = /^[a-z][a-z_]*$/;
const forbiddenLeadingCharacters = new Set(["&", "*", "!", "[", "]", "{", "}", "|", ">", "'", '"', "%", "@", "`", "-", "?", ","]);

export function parseFrontMatter(text: string, options: FrontMatterOptions = {}): FrontMatterResult {
  const issues = new IssueCollector(options.maxIssues ?? knowledgePackLimits.maxReportedIssues, options.file);
  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;

  if (countUnicodeCharacters(source) > knowledgePackLimits.maxFlowSourceChars) {
    issues.add("limit-exceeded", { limit: knowledgePackLimits.maxFlowSourceChars });
    return finish(issues, undefined, "", 1);
  }

  const lines = source.split(LF);
  const lineAt = (index: number): string => {
    const raw = lines[index] ?? "";
    return raw.endsWith(CR) ? raw.slice(0, -1) : raw;
  };

  if (lineAt(0) !== DELIMITER) {
    issues.add("invalid-front-matter", { line: 1 });
    return finish(issues, undefined, source, 1);
  }

  let closing = -1;

  for (let index = 1; index < lines.length; index += 1) {
    if (lineAt(index) === DELIMITER) {
      closing = index;
      break;
    }
  }

  if (closing === -1) {
    issues.add("invalid-front-matter", { line: 1 });
    return finish(issues, undefined, source, 1);
  }

  const values = new Map<FrontMatterKey, string>();
  const seen = new Set<FrontMatterKey>();

  for (let index = 1; index < closing; index += 1) {
    parseEntry(lineAt(index), index + 1, values, seen, issues);
  }

  for (const key of requiredFrontMatterKeys) {
    if (!seen.has(key)) {
      issues.add("missing-front-matter-key", { line: 1, column: key });
    }
  }

  const diagramName = values.get("diagram_name");

  if (diagramName !== undefined && !isFilenameSafeDiagramId(diagramName)) {
    issues.add("invalid-value", { line: lineOfKey(lines, closing, "diagram_name"), column: "diagram_name" });
  }

  const language = values.get("language") ?? defaultFlowLanguage;

  if (!(flowLanguages as readonly string[]).includes(language)) {
    issues.add("invalid-enum-value", { line: lineOfKey(lines, closing, "language"), column: "language" });
  }

  let offset = 0;

  for (let index = 0; index <= closing; index += 1) {
    offset += (lines[index] ?? "").length + 1;
  }

  const body = source.slice(Math.min(offset, source.length));
  const bodyStartLine = closing + 2;

  if (issues.count > 0) {
    return finish(issues, undefined, body, bodyStartLine);
  }

  const metadata: FlowMetadata = Object.freeze({
    diagramName: values.get("diagram_name") ?? "",
    flowName: values.get("flow_name") ?? "",
    author: values.get("author") ?? "",
    language: language as FlowLanguage
  });

  return finish(issues, metadata, body, bodyStartLine);
}

function parseEntry(
  line: string,
  lineNumber: number,
  values: Map<FrontMatterKey, string>,
  seen: Set<FrontMatterKey>,
  issues: IssueCollector
): void {
  if (line.trim() === "") {
    return;
  }

  if (containsControlCharacter(line)) {
    issues.add("control-character", { line: lineNumber });
    return;
  }

  if (line.startsWith(" ") || line.startsWith("-") || line.startsWith("#")) {
    issues.add("invalid-front-matter", { line: lineNumber });
    return;
  }

  const colon = line.indexOf(":");

  if (colon <= 0) {
    issues.add("invalid-front-matter", { line: lineNumber });
    return;
  }

  const key = line.slice(0, colon);

  if (!keyPattern.test(key)) {
    issues.add("invalid-front-matter", { line: lineNumber });
    return;
  }

  if (!(frontMatterKeys as readonly string[]).includes(key)) {
    issues.add("unknown-front-matter-key", { line: lineNumber });
    return;
  }

  const knownKey = key as FrontMatterKey;

  if (seen.has(knownKey)) {
    issues.add("duplicate-front-matter-key", { line: lineNumber, column: knownKey });
    return;
  }

  seen.add(knownKey);
  const rest = line.slice(colon + 1);

  if (rest !== "" && !rest.startsWith(" ")) {
    issues.add("invalid-front-matter", { line: lineNumber, column: knownKey });
    return;
  }

  const value = rest.trim();

  if (value === "") {
    issues.add("empty-required-value", { line: lineNumber, column: knownKey });
    return;
  }

  if (countUnicodeCharacters(value) > knowledgePackLimits.maxFrontMatterValueChars) {
    issues.add("limit-exceeded", {
      line: lineNumber,
      column: knownKey,
      limit: knowledgePackLimits.maxFrontMatterValueChars
    });
    return;
  }

  if (usesUnsupportedSyntax(value)) {
    issues.add("invalid-front-matter", { line: lineNumber, column: knownKey });
    return;
  }

  values.set(knownKey, value);
}

/**
 * Rejects YAML constructs instead of interpreting them: anchors, aliases, tags, flow collections,
 * block scalars, quoting, directives, comments, nested mappings and template interpolation.
 */
function usesUnsupportedSyntax(value: string): boolean {
  const first = value[0] ?? "";

  return (
    forbiddenLeadingCharacters.has(first) ||
    value.includes(" #") ||
    value.includes(": ") ||
    value.endsWith(":") ||
    value.includes("{{") ||
    value.includes("$" + "{")
  );
}

function lineOfKey(lines: readonly string[], closing: number, key: FrontMatterKey): number {
  for (let index = 1; index < closing; index += 1) {
    if ((lines[index] ?? "").startsWith(`${key}:`)) {
      return index + 1;
    }
  }

  return 1;
}

function finish(
  issues: IssueCollector,
  metadata: FlowMetadata | undefined,
  body: string,
  bodyStartLine: number
): FrontMatterResult {
  const sorted = issues.sorted();

  return Object.freeze({
    ok: sorted.length === 0 && metadata !== undefined,
    metadata,
    body,
    bodyStartLine,
    issues: sorted,
    truncated: issues.truncated
  });
}
