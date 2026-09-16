import { isForbiddenControlCodePoint } from "../knowledge-pack/source-limits.js";
import { isSafeAlias } from "../render/alias-allocator.js";
import { knownLegendBlocks, legendClosing, legendOpening } from "../render/legend.js";
import { displayTextProblem } from "../render/plantuml-escape.js";
import { sequenceModelLimits } from "../model/sequence-diagram-model.schema.js";
import { newParticipantPrefix } from "../model/types.js";
import { stableCompare } from "../util/ordering.js";

/**
 * Bounded structural validator for the exact PlantUML subset emitted by the ArchGround renderer.
 *
 * It does not parse PlantUML in general and does not replace the official PlantUML engine; it only
 * confirms that a text consists of the statements this renderer emits: one @startuml first line,
 * single-line comments, participant declarations with unique aliases, arrow messages between
 * declared aliases, balanced alt/else/opt/loop/group fragments that each contain a message, one
 * legend block equal to a known local legend, and one @enduml last line followed only by the final
 * newline. Anything else - preprocessor directives, includes, remote URLs, skin parameters, other
 * fragment kinds, control characters or unknown statements - is rejected.
 */

export const plantUmlSubsetLimits = Object.freeze({
  maxChars: 256 * 1024,
  maxLines: 2_000,
  maxLineChars: 1_000,
  maxFragmentDepth: sequenceModelLimits.maxFragmentDepth,
  maxReportedIssues: 100
});

export const plantUmlStructureRules = [
  "too-large",
  "too-many-lines",
  "line-too-long",
  "missing-final-newline",
  "carriage-return",
  "control-character",
  "start-marker",
  "end-marker",
  "marker-order",
  "content-after-end",
  "forbidden-directive",
  "remote-url",
  "invalid-alias",
  "duplicate-alias",
  "declaration-after-message",
  "undeclared-endpoint",
  "unsafe-text",
  "unsupported-fragment",
  "empty-fragment",
  "fragment-too-deep",
  "unbalanced-block",
  "unknown-legend",
  "unknown-statement",
  "empty-diagram"
] as const;

export type PlantUmlStructureRule = (typeof plantUmlStructureRules)[number];

export interface PlantUmlStructureIssue {
  readonly rule: PlantUmlStructureRule;
  /** One-based line number, when the issue belongs to a line. */
  readonly line?: number;
}

export interface PlantUmlValidationResult {
  readonly ok: boolean;
  readonly issues: readonly PlantUmlStructureIssue[];
  readonly truncated: boolean;
}

const declarationPattern = /^(actor|participant|database|queue) "([^"]*)" as ([A-Za-z][A-Za-z0-9_]*)$/;
const messagePattern = /^([A-Za-z][A-Za-z0-9_]*) (->>|-->|->) ([A-Za-z][A-Za-z0-9_]*) : (.+)$/;
const commentPattern = /^' (.+)$/;
const directivePattern =
  /^\s*!|!\s*(?:include|includeurl|includesub|includedef|define|definelong|undef|pragma|function|procedure|unquoted|import|theme|log|dump|assert|return)\b|^\s*(?:skinparam|hide|show|<style>|style\b)/iu;
const remoteUrlPattern = /[A-Za-z][A-Za-z0-9+.-]*:\/\/|\bwww\./iu;
const fragmentPattern = /^\s*(?:alt|else|opt|loop|group|par|break|critical|end)(?![A-Za-z0-9_])/iu;
const fragmentOpenPattern = /^(alt|opt|loop|group) (.+)$/;
const fragmentElsePattern = /^else (.+)$/;
const fragmentEnd = "end";
const newLabelPrefix = `${newParticipantPrefix} `;
const conditionOptions = Object.freeze({ maxChars: sequenceModelLimits.maxLabelChars, rejectStatementKeywords: true });

interface OpenFragment {
  readonly kind: string;
  readonly line: number;
  sectionHasMessage: boolean;
}

function countOccurrences(text: string, needle: string): number {
  return text.toLowerCase().split(needle).length - 1;
}

function finish(issues: PlantUmlStructureIssue[]): PlantUmlValidationResult {
  const sorted = issues.sort(
    (left, right) => (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) || stableCompare(left.rule, right.rule)
  );
  const limit = plantUmlSubsetLimits.maxReportedIssues;
  return Object.freeze({
    ok: sorted.length === 0,
    issues: Object.freeze(sorted.slice(0, limit).map((issue) => Object.freeze(issue))),
    truncated: sorted.length > limit
  });
}

export function validatePlantUmlSubset(text: string): PlantUmlValidationResult {
  const issues: PlantUmlStructureIssue[] = [];

  if (typeof text !== "string" || text.length > plantUmlSubsetLimits.maxChars) {
    return finish([{ rule: "too-large" }]);
  }

  if (!text.endsWith("\n")) {
    issues.push({ rule: "missing-final-newline" });
  }

  const lines = text.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  if (lines.length > plantUmlSubsetLimits.maxLines) {
    return finish([{ rule: "too-many-lines" }]);
  }

  if (countOccurrences(text, "@startuml") !== 1 || lines[0] !== "@startuml") {
    issues.push({ rule: "start-marker" });
  }

  if (countOccurrences(text, "@enduml") !== 1) {
    issues.push({ rule: "end-marker" });
  }

  const endIndex = lines.findIndex((line) => line.toLowerCase().includes("@enduml"));
  const startIndex = lines.findIndex((line) => line.toLowerCase().includes("@startuml"));

  if (endIndex !== -1 && startIndex !== -1 && endIndex < startIndex) {
    issues.push({ rule: "marker-order" });
  }

  if (endIndex === -1) {
    issues.push({ rule: "end-marker" });
  } else if (endIndex !== lines.length - 1) {
    issues.push({ rule: "content-after-end", line: endIndex + 2 });
  }

  const aliases = new Set<string>();
  const aliasesLower = new Set<string>();
  const legends = knownLegendBlocks();
  let messages = 0;
  let bodyStarted = false;
  const openFragments: OpenFragment[] = [];
  let legendSeen = false;
  let legendBlock: string[] | undefined;
  let legendStart = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.length > plantUmlSubsetLimits.maxLineChars) {
      issues.push({ rule: "line-too-long", line: lineNumber });
      return;
    }

    if (line.includes("\r")) {
      issues.push({ rule: "carriage-return", line: lineNumber });
      return;
    }

    for (const character of line) {
      if (isForbiddenControlCodePoint(character.codePointAt(0) ?? 0)) {
        issues.push({ rule: "control-character", line: lineNumber });
        return;
      }
    }

    if (directivePattern.test(line)) {
      issues.push({ rule: "forbidden-directive", line: lineNumber });
      return;
    }

    if (remoteUrlPattern.test(line)) {
      issues.push({ rule: "remote-url", line: lineNumber });
      return;
    }

    if (index === 0 || index === endIndex) {
      return;
    }

    if (legendBlock !== undefined) {
      legendBlock.push(line);

      if (line === legendClosing) {
        const block = legendBlock;

        if (!legends.some((known) => known.length === block.length && known.every((entry, position) => entry === block[position]))) {
          issues.push({ rule: "unknown-legend", line: legendStart });
        }

        legendBlock = undefined;
      }

      return;
    }

    if (line === "") {
      return;
    }

    if (line === legendOpening) {
      if (legendSeen || openFragments.length > 0) {
        issues.push({ rule: "unbalanced-block", line: lineNumber });
      }

      legendSeen = true;
      legendBlock = [line];
      legendStart = lineNumber;
      return;
    }

    if (line === legendClosing) {
      issues.push({ rule: "unbalanced-block", line: lineNumber });
      return;
    }

    const comment = commentPattern.exec(line);

    if (comment !== null) {
      if (displayTextProblem(comment[1], { maxChars: plantUmlSubsetLimits.maxLineChars }) !== undefined) {
        issues.push({ rule: "unsafe-text", line: lineNumber });
      }

      return;
    }

    const declaration = declarationPattern.exec(line);

    if (declaration !== null) {
      const label = declaration[2] ?? "";
      const alias = declaration[3] ?? "";
      const shown = label.startsWith(newLabelPrefix) ? label.slice(newLabelPrefix.length) : label;

      if (messages > 0 || bodyStarted || legendSeen) {
        issues.push({ rule: "declaration-after-message", line: lineNumber });
      }

      if (displayTextProblem(shown) !== undefined) {
        issues.push({ rule: "unsafe-text", line: lineNumber });
      }

      if (!isSafeAlias(alias)) {
        issues.push({ rule: "invalid-alias", line: lineNumber });
      } else if (aliasesLower.has(alias.toLowerCase())) {
        issues.push({ rule: "duplicate-alias", line: lineNumber });
      }

      aliases.add(alias);
      aliasesLower.add(alias.toLowerCase());
      return;
    }

    const message = messagePattern.exec(line);

    if (message !== null) {
      messages += 1;
      bodyStarted = true;

      for (const fragment of openFragments) {
        fragment.sectionHasMessage = true;
      }

      if (legendSeen) {
        issues.push({ rule: "unknown-statement", line: lineNumber });
      }

      if (!aliases.has(message[1] ?? "") || !aliases.has(message[3] ?? "")) {
        issues.push({ rule: "undeclared-endpoint", line: lineNumber });
      }

      if (displayTextProblem(message[4], { maxChars: plantUmlSubsetLimits.maxLineChars }) !== undefined) {
        issues.push({ rule: "unsafe-text", line: lineNumber });
      }

      return;
    }

    const opening = fragmentOpenPattern.exec(line);

    if (opening !== null) {
      bodyStarted = true;

      if (legendSeen) {
        issues.push({ rule: "unknown-statement", line: lineNumber });
      }

      if (openFragments.length >= plantUmlSubsetLimits.maxFragmentDepth) {
        issues.push({ rule: "fragment-too-deep", line: lineNumber });
      }

      if (displayTextProblem(opening[2], conditionOptions) !== undefined) {
        issues.push({ rule: "unsafe-text", line: lineNumber });
      }

      openFragments.push({ kind: opening[1] ?? "", line: lineNumber, sectionHasMessage: false });
      return;
    }

    const branch = fragmentElsePattern.exec(line);

    if (branch !== null) {
      const top = openFragments.at(-1);

      if (top === undefined || top.kind !== "alt") {
        issues.push({ rule: "unsupported-fragment", line: lineNumber });
      } else {
        if (!top.sectionHasMessage) {
          issues.push({ rule: "empty-fragment", line: lineNumber });
        }

        top.sectionHasMessage = false;
      }

      if (displayTextProblem(branch[1], conditionOptions) !== undefined) {
        issues.push({ rule: "unsafe-text", line: lineNumber });
      }

      return;
    }

    if (line === fragmentEnd) {
      const top = openFragments.pop();

      if (top === undefined) {
        issues.push({ rule: "unbalanced-block", line: lineNumber });
      } else if (!top.sectionHasMessage) {
        issues.push({ rule: "empty-fragment", line: lineNumber });
      }

      return;
    }

    issues.push({ rule: fragmentPattern.test(line) ? "unsupported-fragment" : "unknown-statement", line: lineNumber });
  });

  if (legendBlock !== undefined) {
    issues.push({ rule: "unbalanced-block", line: legendStart });
  }

  const unclosed = openFragments[0];

  if (unclosed !== undefined) {
    issues.push({ rule: "unbalanced-block", line: unclosed.line });
  }

  if (messages === 0) {
    issues.push({ rule: "empty-diagram" });
  }

  return finish(issues);
}
