/**
 * Port for writing generated artifacts. The core defines the contract; file-system and editor
 * adapters implement it.
 *
 * Paths are relative POSIX paths below the root selected by the adapter. Implementations must:
 * - accept only safe relative paths and resolve them strictly inside the selected root;
 * - reject symbolic links and junctions anywhere on the way, and never follow one out of the root;
 * - never overwrite: writeNewFile and publishNewFile fail with destination-exists when the target
 *   exists in any form;
 * - remove only regular files in removeFile;
 * - report failures as ArtifactFileSystemError with a safe code, never with file contents or
 *   absolute paths.
 */

export const artifactOutputCodes = [
  "invalid-output-directory",
  "invalid-diagram-name",
  "version-limit",
  "filename-too-long",
  "destination-exists",
  "temporary-exists",
  "containment-violation",
  "symbolic-link",
  "not-a-directory",
  "list-failed",
  "write-failed",
  "publish-failed",
  "cleanup-failed"
] as const;

export type ArtifactOutputCode = (typeof artifactOutputCodes)[number];

const messages: Readonly<Record<ArtifactOutputCode, string>> = Object.freeze({
  "invalid-output-directory": "The output directory must be a safe relative directory.",
  "invalid-diagram-name": "The diagram name cannot be used as a file name.",
  "version-limit": "No free artifact version is left for this diagram.",
  "filename-too-long": "The planned artifact file name exceeds the length limit.",
  "destination-exists": "An artifact destination already exists and is never overwritten.",
  "temporary-exists": "A temporary artifact file already exists.",
  "containment-violation": "A path resolves outside the selected output root.",
  "symbolic-link": "Symbolic links and junctions are not allowed in output paths.",
  "not-a-directory": "An output path component is not a directory.",
  "list-failed": "The output directory could not be listed.",
  "write-failed": "An artifact file could not be written.",
  "publish-failed": "An artifact file could not be moved to its final name.",
  "cleanup-failed": "A temporary or partial artifact could not be removed."
});

export function outputMessageOf(code: ArtifactOutputCode): string {
  return messages[code];
}

export interface OutputIssue {
  readonly code: ArtifactOutputCode;
  readonly message: string;
  /** Relative path below the selected output root, when the issue concerns one path. */
  readonly path?: string;
}

export function createOutputIssue(code: ArtifactOutputCode, path?: string): OutputIssue {
  return Object.freeze({ code, message: messages[code], ...(path === undefined ? {} : { path }) });
}

export class ArtifactFileSystemError extends Error {
  public readonly code: ArtifactOutputCode;

  public constructor(code: ArtifactOutputCode) {
    super(messages[code]);
    this.name = "ArtifactFileSystemError";
    this.code = code;
  }
}

export interface ArtifactFileSystem {
  /** Entry names directly inside a directory; an empty list when the directory does not exist. */
  listDirectory(relativeDirectory: string): Promise<readonly string[]>;
  /** Creates missing directories one level at a time; existing links or files fail. */
  ensureDirectory(relativeDirectory: string): Promise<void>;
  /** Whether any entry (file, directory or link) exists at the path, without following links. */
  exists(relativePath: string): Promise<boolean>;
  /** Creates a new file exclusively with UTF-8 content. */
  writeNewFile(relativePath: string, content: string): Promise<void>;
  /** Gives a written temporary file its final name without ever replacing an existing entry. */
  publishNewFile(temporaryRelativePath: string, finalRelativePath: string): Promise<void>;
  /** Removes a regular file. */
  removeFile(relativePath: string): Promise<void>;
}
