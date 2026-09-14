import { createIssue, KnowledgePackError, type KnowledgePackIssue } from "./source-errors.js";
import { containsControlCharacter, countUnicodeCharacters, knowledgePackLimits } from "./source-limits.js";

/** Minimal cancellation signal, structurally compatible with the platform abort signal. */
export interface CancellationSignal {
  readonly aborted: boolean;
}

export interface ReadTextFileOptions {
  /** Upper bound in bytes that an adapter must enforce before decoding. */
  readonly maxBytes?: number;
  readonly signal?: CancellationSignal;
}

export interface ListFilesOptions {
  readonly signal?: CancellationSignal;
}

/**
 * Port for reading knowledge-pack files. This module defines the contract only; file-system and
 * editor adapters implement it elsewhere.
 *
 * Implementations must:
 * - accept only paths that pass validateRelativePath, using forward slashes;
 * - resolve every path strictly inside the pack directory and never follow links out of it;
 * - enforce maxBytes (default knowledgePackLimits.maxFileBytes) before decoding text;
 * - decode UTF-8 and reject undecodable content;
 * - honour the cancellation signal and fail with the cancelled error code;
 * - report failures with KnowledgePackError and safe codes, never with file contents.
 */
export interface KnowledgePackSource {
  readTextFile(relativePath: string, options?: ReadTextFileOptions): Promise<string>;
  listFiles(options?: ListFilesOptions): Promise<readonly string[]>;
}

export const knowledgePackFileNames = Object.freeze([
  "systems.md",
  "actors.md",
  "relationships.md",
  "aliases.md",
  "rules.md"
] as const);

export type KnowledgePackFileName = (typeof knowledgePackFileNames)[number];

export type RelativePathCheck =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly issue: KnowledgePackIssue };

const backslash = String.fromCharCode(92);

/**
 * Accepts a non-empty relative path with forward slashes. Rejects absolute paths, drive letters,
 * backslashes, colons, control characters, empty segments and current or parent segments.
 */
export function validateRelativePath(relativePath: string): RelativePathCheck {
  const reject: RelativePathCheck = { ok: false, issue: createIssue("invalid-path") };

  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return reject;
  }

  if (countUnicodeCharacters(relativePath) > knowledgePackLimits.maxRelativePathChars) {
    return {
      ok: false,
      issue: createIssue("limit-exceeded", { limit: knowledgePackLimits.maxRelativePathChars })
    };
  }

  if (
    relativePath.startsWith("/") ||
    relativePath.includes(backslash) ||
    relativePath.includes(":") ||
    containsControlCharacter(relativePath)
  ) {
    return reject;
  }

  const segments = relativePath.split("/");

  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return reject;
  }

  return { ok: true, path: relativePath };
}

export function throwIfCancelled(signal: CancellationSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new KnowledgePackError(createIssue("cancelled"));
  }
}
