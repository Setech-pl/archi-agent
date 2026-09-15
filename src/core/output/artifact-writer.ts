import type { OutputFailedOutcome } from "../pipeline/generation-outcome.js";
import {
  ArtifactFileSystemError,
  createOutputIssue,
  type ArtifactFileSystem,
  type ArtifactOutputCode,
  type OutputIssue
} from "./artifact-file-system.js";
import type { ArtifactPairPlan } from "./output-planner.js";

/**
 * Writes a validated artifact pair through the file-system port, all or nothing.
 *
 * 1. Create the output directory if needed and re-check that neither destination exists.
 * 2. Write both contents to exclusive temporary files in the target directory.
 * 3. Give each temporary file its final name without replacing anything.
 * 4. Remove the temporary files.
 *
 * On any failure the files created by this operation (temporary files and an already published
 * first artifact) are removed. A file that existed before is never touched: every write is
 * exclusive, so a pre-existing path makes the operation fail before it is modified.
 */

export interface ArtifactPairContents {
  readonly diagram: string;
  readonly report: string;
}

export interface ArtifactsWritten {
  readonly status: "written";
  /** Paths relative to the selected output root. */
  readonly diagramPath: string;
  readonly reportPath: string;
}

export type ArtifactWriteResult = ArtifactsWritten | OutputFailedOutcome;

export function temporaryPathFor(directory: string, fileName: string): string {
  return `${directory}/.${fileName}.tmp`;
}

function codeOf(error: unknown, fallback: ArtifactOutputCode): ArtifactOutputCode {
  return error instanceof ArtifactFileSystemError ? error.code : fallback;
}

function failed(issues: readonly OutputIssue[]): OutputFailedOutcome {
  return Object.freeze({ status: "output-failed", issues: Object.freeze([...issues]) });
}

export async function writeArtifactPair(
  fileSystem: ArtifactFileSystem,
  plan: ArtifactPairPlan,
  contents: ArtifactPairContents
): Promise<ArtifactWriteResult> {
  const created: string[] = [];
  const issues: OutputIssue[] = [];

  const cleanUp = async (): Promise<void> => {
    for (const path of [...created].reverse()) {
      try {
        await fileSystem.removeFile(path);
      } catch {
        issues.push(createOutputIssue("cleanup-failed", path));
      }
    }

    created.length = 0;
  };

  try {
    await fileSystem.ensureDirectory(plan.directory);
  } catch (error) {
    return failed([createOutputIssue(codeOf(error, "write-failed"), plan.directory)]);
  }

  try {
    for (const path of [plan.diagramPath, plan.reportPath]) {
      if (await fileSystem.exists(path)) {
        return failed([createOutputIssue("destination-exists", path)]);
      }
    }
  } catch (error) {
    return failed([createOutputIssue(codeOf(error, "list-failed"), plan.directory)]);
  }

  const steps: ReadonlyArray<readonly [string, string, string]> = [
    [temporaryPathFor(plan.directory, plan.diagramFileName), plan.diagramPath, contents.diagram],
    [temporaryPathFor(plan.directory, plan.reportFileName), plan.reportPath, contents.report]
  ];

  for (const [temporary, , content] of steps) {
    try {
      if (await fileSystem.exists(temporary)) {
        issues.push(createOutputIssue("temporary-exists", temporary));
        await cleanUp();
        return failed(issues);
      }

      await fileSystem.writeNewFile(temporary, content);
      created.push(temporary);
    } catch (error) {
      issues.push(createOutputIssue(codeOf(error, "write-failed"), temporary));
      await cleanUp();
      return failed(issues);
    }
  }

  for (const [temporary, destination] of steps) {
    try {
      await fileSystem.publishNewFile(temporary, destination);
      created.push(destination);
    } catch (error) {
      issues.push(createOutputIssue(codeOf(error, "publish-failed"), destination));
      await cleanUp();
      return failed(issues);
    }
  }

  for (const [temporary] of steps) {
    try {
      await fileSystem.removeFile(temporary);
    } catch {
      issues.push(createOutputIssue("cleanup-failed", temporary));
    }
  }

  if (issues.length > 0) {
    return failed(issues);
  }

  return Object.freeze({ status: "written", diagramPath: plan.diagramPath, reportPath: plan.reportPath });
}
