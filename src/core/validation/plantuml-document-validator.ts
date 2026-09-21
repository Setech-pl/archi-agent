import { isForbiddenControlCodePoint } from "../knowledge-pack/source-limits.js";
import { stableCompare } from "../util/ordering.js";

/** Shared, profile-independent document boundary. No PlantUML engine or network is invoked. */
export const plantUmlDocumentLimits = Object.freeze({ maxChars: 256 * 1024, maxLines: 2_000, maxLineChars: 1_000 });
export type PlantUmlDocumentRule = "too-large" | "too-many-lines" | "line-too-long" | "missing-final-newline" | "carriage-return" | "control-character" | "start-marker" | "end-marker" | "marker-order" | "content-after-end" | "forbidden-directive" | "remote-url";
export interface PlantUmlDocumentIssue { readonly rule: PlantUmlDocumentRule; readonly line?: number }

const directive = /^\s*!|!\s*(?:include|includeurl|includesub|includedef|define|definelong|undef|pragma|function|procedure|unquoted|import|theme|log|dump|assert|return)\b|^\s*(?:skinparam|hide|show|<style>|style\b)/iu;
const remoteUrl = /[A-Za-z][A-Za-z0-9+.-]*:\/\/|\bwww\./iu;

export function validatePlantUmlDocument(text: unknown): readonly PlantUmlDocumentIssue[] {
  if (typeof text !== "string" || text.length > plantUmlDocumentLimits.maxChars) return [{ rule: "too-large" }];
  const issues: PlantUmlDocumentIssue[] = [];
  if (!text.endsWith("\n")) issues.push({ rule: "missing-final-newline" });
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (lines.length > plantUmlDocumentLimits.maxLines) return [{ rule: "too-many-lines" }];
  if (lines[0] !== "@startuml" || text.toLowerCase().split("@startuml").length !== 2) issues.push({ rule: "start-marker" });
  if (text.toLowerCase().split("@enduml").length !== 2 || !lines.includes("@enduml")) issues.push({ rule: "end-marker" });
  const start = lines.indexOf("@startuml");
  const end = lines.indexOf("@enduml");
  if (start >= 0 && end >= 0 && end < start) issues.push({ rule: "marker-order" });
  if (end >= 0 && end !== lines.length - 1) issues.push({ rule: "content-after-end", line: end + 2 });
  lines.forEach((line, index) => {
    const at = index + 1;
    if (line.length > plantUmlDocumentLimits.maxLineChars) issues.push({ rule: "line-too-long", line: at });
    if (line.includes("\r")) issues.push({ rule: "carriage-return", line: at });
    if ([...line].some((char) => isForbiddenControlCodePoint(char.codePointAt(0) ?? 0))) issues.push({ rule: "control-character", line: at });
    if (directive.test(line)) issues.push({ rule: "forbidden-directive", line: at });
    if (remoteUrl.test(line)) issues.push({ rule: "remote-url", line: at });
  });
  return Object.freeze(issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || stableCompare(a.rule, b.rule)).slice(0, 100));
}
