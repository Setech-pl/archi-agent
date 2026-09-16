import { lstat, open } from "node:fs/promises";
import { knowledgePackLimits } from "../core/knowledge-pack/source-limits.js";
import { LocalPathError, resolveContainedPath } from "./local-file-path.js";

/**
 * Reads one UTF-8 text file below a canonical root with a hard byte limit.
 *
 * The file must be a regular file reached without links. It is opened, checked against the entry
 * that was inspected (so a link swapped in between is detected), read up to the limit plus one byte,
 * and rejected when it is larger, contains a NUL byte or is not valid UTF-8. Errors carry codes only,
 * never content or absolute paths. The caller receives the project-relative path it asked for.
 */

export const boundedReadCodes = [
  "invalid-path",
  "not-found",
  "symbolic-link",
  "not-a-directory",
  "containment-violation",
  "not-a-file",
  "too-large",
  "binary-content",
  "invalid-utf8",
  "read-failed"
] as const;

export type BoundedReadCode = (typeof boundedReadCodes)[number];

export class BoundedReadError extends Error {
  public readonly code: BoundedReadCode;
  public readonly limit: number | undefined;

  public constructor(code: BoundedReadCode, limit?: number) {
    super(`File read rejected (${code}).`);
    this.name = "BoundedReadError";
    this.code = code;
    this.limit = limit;
  }
}

/** A flow may hold maxFlowSourceChars characters; four bytes per character bound its UTF-8 size. */
export const maxFlowFileBytes = knowledgePackLimits.maxFlowSourceChars * 4;

export interface BoundedTextFile {
  readonly relativePath: string;
  readonly text: string;
  readonly byteLength: number;
}

export async function readBoundedTextFile(
  canonicalRoot: string,
  relativePath: string,
  options: { readonly maxBytes: number }
): Promise<BoundedTextFile> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) {
    throw new Error("The byte limit must be a positive integer.");
  }

  let resolved;

  try {
    resolved = await resolveContainedPath(canonicalRoot, relativePath);
  } catch (error) {
    throw new BoundedReadError(error instanceof LocalPathError ? error.code : "read-failed");
  }

  if (!resolved.isFile) {
    throw new BoundedReadError("not-a-file");
  }

  let handle;

  try {
    handle = await open(resolved.absolutePath, "r");
  } catch {
    throw new BoundedReadError("read-failed");
  }

  try {
    const opened = await handle.stat({ bigint: true });
    const entry = await lstat(resolved.absolutePath, { bigint: true });
    const { ino: openedInode, dev: openedDevice } = opened;
    const { ino: entryInode, dev: entryDevice } = entry;

    if (entry.isSymbolicLink() || !opened.isFile() || openedInode !== entryInode || openedDevice !== entryDevice) {
      throw new BoundedReadError("symbolic-link");
    }

    if (opened.size > BigInt(options.maxBytes)) {
      throw new BoundedReadError("too-large", options.maxBytes);
    }

    const buffer = Buffer.alloc(options.maxBytes + 1);
    let length = 0;

    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);

      if (bytesRead === 0) {
        break;
      }

      length += bytesRead;
    }

    if (length > options.maxBytes) {
      throw new BoundedReadError("too-large", options.maxBytes);
    }

    const bytes = buffer.subarray(0, length);

    if (bytes.includes(0)) {
      throw new BoundedReadError("binary-content");
    }

    let text: string;

    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new BoundedReadError("invalid-utf8");
    }

    return Object.freeze({ relativePath, text, byteLength: length });
  } catch (error) {
    throw error instanceof BoundedReadError ? error : new BoundedReadError("read-failed");
  } finally {
    await handle.close();
  }
}
