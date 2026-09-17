import { normalizeGroundingReference } from "../grounding/reference-key.js";
import { stableCompare } from "../util/ordering.js";
import { ActorIndex } from "./index/actor-index.js";
import { AliasIndex } from "./index/alias-index.js";
import { ElementIndex } from "./index/element-index.js";
import { RelationshipIndex } from "./index/relationship-index.js";
import { RuleIndex } from "./index/rule-index.js";
import {
  knowledgePackFileNames,
  validateRelativePath,
  type CancellationSignal,
  type KnowledgePackFileName,
  type KnowledgePackSource
} from "./knowledge-pack-source.js";
import {
  parseKnowledgePackTable,
  type ActorRecord,
  type AliasRecord,
  type KnowledgePack,
  type KnowledgePackTableKind,
  type RelationshipRecord,
  type RuleRecord,
  type SystemRecord,
  type TableValidationResult
} from "./knowledge-pack.schema.js";
import {
  KnowledgePackError,
  safeMessageFor,
  type IssueLocation,
  type KnowledgePackErrorCode
} from "./source-errors.js";
import { knowledgePackLimits } from "./source-limits.js";

/**
 * Loads a complete knowledge pack from a source port: exactly five Markdown files, parsed and
 * validated per file, then checked across files. A pack is returned only when there are no errors;
 * warnings never block a valid pack. The loader reads each expected file at most once, never reads
 * any other file and never logs or reports source content.
 */

/** The exact file names of a pack, in reporting order. */
export const requiredKnowledgePackFiles = knowledgePackFileNames;

export const knowledgePackLoadCodes = [
  "unexpected-file",
  "ignored-file",
  "read-failed",
  "identifier-collision",
  "unknown-reference",
  "conflicting-rules",
  "forbidden-relationship",
  "required-relationship-missing"
] as const;

export type KnowledgePackLoadCode = (typeof knowledgePackLoadCodes)[number];
export type KnowledgePackLoadIssueCode = KnowledgePackErrorCode | KnowledgePackLoadCode;
export type KnowledgePackLoadSeverity = "error" | "warning";

export interface KnowledgePackLoadIssue extends IssueLocation {
  readonly severity: KnowledgePackLoadSeverity;
  readonly code: KnowledgePackLoadIssueCode;
  readonly message: string;
}

export interface KnowledgePackIndexes {
  readonly elements: ElementIndex;
  readonly actors: ActorIndex;
  readonly aliases: AliasIndex;
  readonly relationships: RelationshipIndex;
  readonly rules: RuleIndex;
}

export type KnowledgePackLoadResult =
  | {
      readonly ok: true;
      readonly pack: KnowledgePack;
      readonly indexes: KnowledgePackIndexes;
      readonly warnings: readonly KnowledgePackLoadIssue[];
    }
  | {
      readonly ok: false;
      readonly issues: readonly KnowledgePackLoadIssue[];
      readonly truncated: boolean;
    };

export interface LoadKnowledgePackOptions {
  readonly signal?: CancellationSignal;
  /** Upper bound of reported issues for the whole pack; defaults to the central limit. */
  readonly maxIssues?: number;
}

const loadMessages: Readonly<Record<KnowledgePackLoadCode, string>> = Object.freeze({
  "unexpected-file": "The pack contains a Markdown file that is not one of the five pack files.",
  "ignored-file": "A file that is not Markdown was ignored and not read.",
  "read-failed": "A pack file could not be read.",
  "identifier-collision": "A system and an actor use the same identifier.",
  "unknown-reference": "The identifier does not refer to a declared system or actor.",
  "conflicting-rules": "The same directed pair is both forbidden and required.",
  "forbidden-relationship": "A declared relationship is forbidden by a rule.",
  "required-relationship-missing": "A required relationship is not declared."
});

/**
 * Pack files in reading order with their table kind and whether a table without data rows is
 * accepted. A pack always needs at least one system; the other four tables may be empty.
 */
const tableByFile: ReadonlyArray<readonly [KnowledgePackFileName, KnowledgePackTableKind, boolean]> = Object.freeze([
  ["systems.md", "systems", false],
  ["actors.md", "actors", true],
  ["relationships.md", "relationships", true],
  ["aliases.md", "aliases", true],
  ["rules.md", "rules", true]
] as const);

function messageFor(code: KnowledgePackLoadIssueCode): string {
  return (knowledgePackLoadCodes as readonly string[]).includes(code)
    ? loadMessages[code as KnowledgePackLoadCode]
    : safeMessageFor(code as KnowledgePackErrorCode);
}

function issue(
  severity: KnowledgePackLoadSeverity,
  code: KnowledgePackLoadIssueCode,
  location: IssueLocation = {}
): KnowledgePackLoadIssue {
  const result: {
    severity: KnowledgePackLoadSeverity;
    code: KnowledgePackLoadIssueCode;
    message: string;
    file?: string;
    line?: number;
    column?: string;
    limit?: number;
  } = { severity, code, message: messageFor(code) };

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

  return Object.freeze(result);
}

function fileRank(file: string | undefined): number {
  if (file === undefined) {
    return knowledgePackFileNames.length + 1;
  }

  const index = (knowledgePackFileNames as readonly string[]).indexOf(file);
  return index === -1 ? knowledgePackFileNames.length : index;
}

/** Order: the five pack files in fixed order, other files by name, then line, column, code, limit. */
export function compareLoadIssues(left: KnowledgePackLoadIssue, right: KnowledgePackLoadIssue): number {
  return (
    fileRank(left.file) - fileRank(right.file) ||
    stableCompare(left.file ?? "", right.file ?? "") ||
    (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
    stableCompare(left.column ?? "", right.column ?? "") ||
    stableCompare(left.code, right.code) ||
    (left.limit ?? 0) - (right.limit ?? 0) ||
    stableCompare(left.severity, right.severity)
  );
}

function sortAndCap(
  issues: readonly KnowledgePackLoadIssue[],
  maxIssues: number
): { readonly issues: readonly KnowledgePackLoadIssue[]; readonly truncated: boolean } {
  const sorted = [...issues].sort(compareLoadIssues);

  if (sorted.length <= maxIssues) {
    return { issues: Object.freeze(sorted), truncated: false };
  }

  return {
    issues: Object.freeze([...sorted.slice(0, maxIssues), issue("error", "too-many-issues", { limit: maxIssues })]),
    truncated: true
  };
}

function failure(issues: readonly KnowledgePackLoadIssue[], maxIssues: number): KnowledgePackLoadResult {
  const capped = sortAndCap(issues, maxIssues);
  return Object.freeze({ ok: false, issues: capped.issues, truncated: capped.truncated });
}

/** Maps a source failure to a safe code; the error message of the source is never used. */
function sourceFailure(error: unknown, file: string | undefined): KnowledgePackLoadIssue {
  const location = file === undefined ? {} : { file };

  if (error instanceof KnowledgePackError) {
    return issue("error", error.code, error.code === "limit-exceeded" && error.limit !== undefined ? { ...location, limit: error.limit } : location);
  }

  return issue("error", "read-failed", location);
}

function isMarkdownFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function isCancelled(signal: CancellationSignal | undefined): boolean {
  return signal?.aborted === true;
}

interface ParsedTables {
  systems?: TableValidationResult<SystemRecord>;
  actors?: TableValidationResult<ActorRecord>;
  relationships?: TableValidationResult<RelationshipRecord>;
  aliases?: TableValidationResult<AliasRecord>;
  rules?: TableValidationResult<RuleRecord>;
}

export async function loadKnowledgePack(
  source: KnowledgePackSource,
  options: LoadKnowledgePackOptions = {}
): Promise<KnowledgePackLoadResult> {
  const maxIssues = options.maxIssues ?? knowledgePackLimits.maxReportedIssues;
  const signal = options.signal;
  const signalOption = signal === undefined ? {} : { signal };
  const cancelled = (): KnowledgePackLoadResult => failure([issue("error", "cancelled")], maxIssues);

  if (isCancelled(signal)) {
    return cancelled();
  }

  let listing: readonly string[];

  try {
    listing = await source.listFiles(signalOption);
  } catch (error) {
    const failed = sourceFailure(error, undefined);
    return failed.code === "cancelled" ? cancelled() : failure([failed], maxIssues);
  }

  const issues: KnowledgePackLoadIssue[] = [];
  const present = new Set<string>();
  const extraMarkdown = new Set<string>();
  const ignored = new Set<string>();
  let invalidEntries = false;

  for (const entry of Array.isArray(listing) ? listing : []) {
    const check = typeof entry === "string" ? validateRelativePath(entry) : undefined;

    if (check === undefined || !check.ok) {
      invalidEntries = true;
      continue;
    }

    if ((knowledgePackFileNames as readonly string[]).includes(check.path)) {
      present.add(check.path);
    } else if (isMarkdownFile(check.path)) {
      extraMarkdown.add(check.path);
    } else {
      ignored.add(check.path);
    }
  }

  if (invalidEntries) {
    issues.push(issue("error", "invalid-path"));
  }

  for (const file of extraMarkdown) {
    issues.push(issue("error", "unexpected-file", { file }));
  }

  for (const file of ignored) {
    issues.push(issue("warning", "ignored-file", { file }));
  }

  const tables: ParsedTables = {};

  for (const [file, kind, allowEmpty] of tableByFile) {
    if (!present.has(file)) {
      issues.push(issue("error", "missing-file", { file }));
      continue;
    }

    if (isCancelled(signal)) {
      return cancelled();
    }

    let text: unknown;

    try {
      text = await source.readTextFile(file, { maxBytes: knowledgePackLimits.maxFileBytes, ...signalOption });
    } catch (error) {
      const failed = sourceFailure(error, file);

      if (failed.code === "cancelled") {
        return cancelled();
      }

      issues.push(failed);
      continue;
    }

    if (typeof text !== "string") {
      issues.push(issue("error", "read-failed", { file }));
      continue;
    }

    const result = parseKnowledgePackTable(kind, text, { maxIssues, allowEmpty });

    for (const found of result.issues) {
      issues.push(issue("error", found.code, found));
    }

    (tables as Record<KnowledgePackTableKind, unknown>)[kind] = result;
  }

  const { systems, actors, relationships, aliases, rules } = tables;

  if (
    issues.some((found) => found.severity === "error") ||
    systems === undefined ||
    actors === undefined ||
    relationships === undefined ||
    aliases === undefined ||
    rules === undefined
  ) {
    return failure(issues, maxIssues);
  }

  const pack: KnowledgePack = Object.freeze({
    systems: systems.records,
    actors: actors.records,
    relationships: relationships.records,
    aliases: aliases.records,
    rules: rules.records
  });

  issues.push(...crossFileIssues(pack));

  if (issues.some((found) => found.severity === "error")) {
    return failure(issues, maxIssues);
  }

  const warnings = sortAndCap(issues, maxIssues).issues;
  return Object.freeze({ ok: true, pack, indexes: buildKnowledgePackIndexes(pack), warnings });
}

/**
 * Checks that need more than one file. Assumes every file already passed its own validation,
 * so identifiers are well formed and unique within their file.
 */
export function crossFileIssues(pack: KnowledgePack): KnowledgePackLoadIssue[] {
  const issues: KnowledgePackLoadIssue[] = [];
  const systemIds = new Set(pack.systems.map((record) => record.id));
  const actorIds = new Set(pack.actors.map((record) => record.id));
  const isDeclared = (id: string): boolean => systemIds.has(id) || actorIds.has(id);
  const at = (record: { readonly location: { readonly file: string; readonly line: number } }, column: string) => ({
    file: record.location.file,
    line: record.location.line,
    column
  });

  for (const actor of pack.actors) {
    if (systemIds.has(actor.id)) {
      issues.push(issue("error", "identifier-collision", at(actor, "id")));
    }
  }

  for (const alias of pack.aliases) {
    if (!isDeclared(alias.targetId)) {
      issues.push(issue("error", "unknown-reference", at(alias, "target_id")));
    }

    if (normalizeGroundingReference(alias.alias) === "") {
      issues.push(issue("error", "invalid-value", at(alias, "alias")));
    }
  }

  const endpointsKnown = (record: RelationshipRecord | RuleRecord): boolean => {
    let known = true;

    if (!isDeclared(record.fromId)) {
      issues.push(issue("error", "unknown-reference", at(record, "from_id")));
      known = false;
    }

    if (!isDeclared(record.toId)) {
      issues.push(issue("error", "unknown-reference", at(record, "to_id")));
      known = false;
    }

    return known;
  };

  for (const relationship of pack.relationships) {
    endpointsKnown(relationship);
  }

  const relationshipIndex = RelationshipIndex.from(pack.relationships);
  const ruleIndex = RuleIndex.from(pack.rules);

  for (const rule of pack.rules) {
    if (!endpointsKnown(rule)) {
      continue;
    }

    if (rule.rule === "forbid") {
      for (const relationship of relationshipIndex.find(rule.fromId, rule.toId)) {
        issues.push(issue("error", "forbidden-relationship", at(relationship, "from_id")));
      }

      continue;
    }

    if (ruleIndex.isForbidden(rule.fromId, rule.toId)) {
      issues.push(issue("error", "conflicting-rules", at(rule, "rule")));
    } else if (!relationshipIndex.has(rule.fromId, rule.toId)) {
      issues.push(issue("warning", "required-relationship-missing", at(rule, "rule")));
    }
  }

  return issues;
}

/** Builds all indexes of a validated pack. */
export function buildKnowledgePackIndexes(pack: KnowledgePack): KnowledgePackIndexes {
  return Object.freeze({
    elements: ElementIndex.from(pack.systems),
    actors: ActorIndex.from(pack.actors),
    aliases: AliasIndex.from(pack.aliases, {
      systemIds: pack.systems.map((record) => record.id),
      actorIds: pack.actors.map((record) => record.id)
    }),
    relationships: RelationshipIndex.from(pack.relationships),
    rules: RuleIndex.from(pack.rules)
  });
}
