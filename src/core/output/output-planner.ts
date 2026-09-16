import { validateRelativePath } from "../knowledge-pack/knowledge-pack-source.js";
import { isFilenameSafeDiagramId, normalizeOutputDirectory } from "./naming.js";
import { createOutputIssue, type OutputIssue } from "./artifact-file-system.js";

/**
 * Plans one shared file-name base for the diagram and its grounding report.
 *
 * The base is the validated diagram name for the first version and <name>-v<N> afterwards. N is one
 * more than the highest version present for either artifact, so both files always carry the same
 * version and an existing file is never reused. Comparison is case-insensitive, because the primary
 * target platform has a case-insensitive file system. The planner is pure: the caller supplies the
 * directory listing, and the writer re-checks both destinations before anything is written.
 */

export const artifactExtensions = Object.freeze({ diagram: ".puml", report: ".grounding.json" });

export const outputPlanLimits = Object.freeze({ maxVersion: 999, maxFileNameChars: 128, maxListedEntries: 10_000 });

export interface ArtifactPairPlan {
  readonly directory: string;
  readonly baseName: string;
  readonly version: number;
  readonly diagramFileName: string;
  readonly reportFileName: string;
  readonly diagramPath: string;
  readonly reportPath: string;
}

export type OutputPlanResult =
  | { readonly ok: true; readonly plan: ArtifactPairPlan }
  | { readonly ok: false; readonly issue: OutputIssue };

export interface OutputPlanRequest {
  /** Relative directory below the selected output root. */
  readonly outputDirectory: string;
  readonly diagramName: string;
  /** Names of the entries already present in the output directory. */
  readonly existingEntries: readonly string[];
}

export function baseNameFor(diagramName: string, version: number): string {
  return version === 1 ? diagramName : `${diagramName}-v${version}`;
}

function versionOf(entry: string, diagramName: string): number | undefined {
  const lower = entry.toLowerCase();

  for (const extension of Object.values(artifactExtensions)) {
    if (!lower.endsWith(extension)) {
      continue;
    }

    const stem = lower.slice(0, -extension.length);

    if (stem === diagramName) {
      return 1;
    }

    const prefix = `${diagramName}-v`;

    if (stem.startsWith(prefix) && /^[1-9][0-9]{0,8}$/.test(stem.slice(prefix.length))) {
      return Number(stem.slice(prefix.length));
    }
  }

  return undefined;
}

export function planArtifactPair(request: OutputPlanRequest): OutputPlanResult {
  let directory: string;

  try {
    directory = normalizeOutputDirectory(request.outputDirectory);
  } catch {
    return { ok: false, issue: createOutputIssue("invalid-output-directory") };
  }

  if (!validateRelativePath(directory).ok) {
    return { ok: false, issue: createOutputIssue("invalid-output-directory") };
  }

  if (!isFilenameSafeDiagramId(request.diagramName)) {
    return { ok: false, issue: createOutputIssue("invalid-diagram-name") };
  }

  if (request.existingEntries.length > outputPlanLimits.maxListedEntries) {
    return { ok: false, issue: createOutputIssue("list-failed", directory) };
  }

  const taken = new Set(request.existingEntries.map((entry) => entry.toLowerCase()));
  let highest = 0;

  for (const entry of request.existingEntries) {
    highest = Math.max(highest, versionOf(entry, request.diagramName) ?? 0);
  }

  let version = highest + 1;

  while (
    version <= outputPlanLimits.maxVersion &&
    [artifactExtensions.diagram, artifactExtensions.report].some((extension) =>
      taken.has(`${baseNameFor(request.diagramName, version)}${extension}`)
    )
  ) {
    version += 1;
  }

  if (version > outputPlanLimits.maxVersion) {
    return { ok: false, issue: createOutputIssue("version-limit", directory) };
  }

  const baseName = baseNameFor(request.diagramName, version);
  const diagramFileName = `${baseName}${artifactExtensions.diagram}`;
  const reportFileName = `${baseName}${artifactExtensions.report}`;

  if (reportFileName.length > outputPlanLimits.maxFileNameChars) {
    return { ok: false, issue: createOutputIssue("filename-too-long") };
  }

  const diagramPath = `${directory}/${diagramFileName}`;
  const reportPath = `${directory}/${reportFileName}`;

  if (!validateRelativePath(reportPath).ok || !validateRelativePath(diagramPath).ok) {
    return { ok: false, issue: createOutputIssue("filename-too-long") };
  }

  return {
    ok: true,
    plan: Object.freeze({ directory, baseName, version, diagramFileName, reportFileName, diagramPath, reportPath })
  };
}
