import {
  knowledgePackFileNames,
  throwIfCancelled,
  type KnowledgePackSource,
  type ListFilesOptions,
  type ReadTextFileOptions
} from "../core/knowledge-pack/knowledge-pack-source.js";
import { createIssue, KnowledgePackError, type KnowledgePackErrorCode } from "../core/knowledge-pack/source-errors.js";
import { knowledgePackLimits } from "../core/knowledge-pack/source-limits.js";
import { BoundedReadError, readBoundedTextFile, type BoundedReadCode } from "./bounded-file-reader.js";
import { canonicalDirectory, LocalPathError, resolveContainedPath } from "./local-file-path.js";

/**
 * Node implementation of the KnowledgePackSource port.
 *
 * Only the five fixed pack file names are ever considered: the directory is not enumerated, no
 * wildcard or pattern is expanded, and no other file is read. Paths are resolved below the project
 * root without following links; each file is read with the pack byte limit as strict UTF-8 without
 * NUL bytes. Failures are KnowledgePackError values with safe codes and pack file names only.
 */

const readCodes: Readonly<Record<BoundedReadCode, KnowledgePackErrorCode | undefined>> = Object.freeze({
  "invalid-path": "invalid-path",
  "not-found": "missing-file",
  "symbolic-link": "invalid-path",
  "not-a-directory": "invalid-path",
  "containment-violation": "invalid-path",
  "not-a-file": "invalid-path",
  "too-large": "limit-exceeded",
  "binary-content": "control-character",
  "invalid-utf8": "invalid-value",
  "read-failed": undefined
});

function packError(code: KnowledgePackErrorCode, file?: string, limit?: number): KnowledgePackError {
  return new KnowledgePackError(
    createIssue(code, { ...(file === undefined ? {} : { file }), ...(limit === undefined ? {} : { limit }) })
  );
}

export class NodeKnowledgePackSource implements KnowledgePackSource {
  readonly #root: string;
  readonly #directory: string;

  private constructor(canonicalRoot: string, packDirectory: string) {
    this.#root = canonicalRoot;
    this.#directory = packDirectory;
  }

  /** Opens a pack directory given relative to the project root; both must be real directories. */
  public static async open(projectRoot: string, packDirectory: string): Promise<NodeKnowledgePackSource> {
    try {
      const root = await canonicalDirectory(projectRoot);
      const resolved = await resolveContainedPath(root, packDirectory);

      if (!resolved.isDirectory) {
        throw packError("invalid-path");
      }

      return new NodeKnowledgePackSource(root, packDirectory);
    } catch (error) {
      throw error instanceof KnowledgePackError ? error : packError(error instanceof LocalPathError && error.code === "not-found" ? "missing-file" : "invalid-path");
    }
  }

  public get packDirectory(): string {
    return this.#directory;
  }

  /** The pack files that exist as regular files, in the fixed pack order. */
  public async listFiles(options?: ListFilesOptions): Promise<readonly string[]> {
    throwIfCancelled(options?.signal);
    const present: string[] = [];

    for (const file of knowledgePackFileNames) {
      let resolved;

      try {
        resolved = await resolveContainedPath(this.#root, `${this.#directory}/${file}`, { allowMissing: true });
      } catch {
        throw packError("invalid-path", file);
      }

      if (resolved.exists) {
        if (!resolved.isFile) {
          throw packError("invalid-path", file);
        }

        present.push(file);
      }
    }

    return Object.freeze(present);
  }

  public async readTextFile(relativePath: string, options?: ReadTextFileOptions): Promise<string> {
    if (!(knowledgePackFileNames as readonly string[]).includes(relativePath)) {
      throw packError("invalid-path");
    }

    throwIfCancelled(options?.signal);
    const maxBytes = Math.min(options?.maxBytes ?? knowledgePackLimits.maxFileBytes, knowledgePackLimits.maxFileBytes);

    try {
      const file = await readBoundedTextFile(this.#root, `${this.#directory}/${relativePath}`, { maxBytes });
      throwIfCancelled(options?.signal);
      return file.text;
    } catch (error) {
      if (error instanceof KnowledgePackError) {
        throw error;
      }

      const code = error instanceof BoundedReadError ? readCodes[error.code] : undefined;

      if (code === undefined) {
        throw new Error("A pack file could not be read.");
      }

      throw packError(code, relativePath, code === "limit-exceeded" ? maxBytes : undefined);
    }
  }
}
