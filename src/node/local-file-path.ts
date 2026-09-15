import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { validateRelativePath } from "../core/knowledge-pack/knowledge-pack-source.js";

/**
 * Safe resolution of project-relative paths for the Node adapters.
 *
 * A path must pass the core relative-path check (forward slashes, no absolute path, drive letter,
 * colon, backslash, empty, current or parent segment). Every existing component below the canonical
 * root is inspected with lstat, so symbolic links and junctions are rejected instead of followed, and
 * the real path of an existing target must stay inside the root. Segments that Windows would silently
 * rewrite (trailing dot or space, reserved device names) are rejected as well.
 */

export const localPathCodes = ["invalid-path", "not-found", "symbolic-link", "not-a-directory", "containment-violation"] as const;

export type LocalPathCode = (typeof localPathCodes)[number];

export class LocalPathError extends Error {
  public readonly code: LocalPathCode;

  public constructor(code: LocalPathCode) {
    super(`Local path rejected (${code}).`);
    this.name = "LocalPathError";
    this.code = code;
  }
}

const reservedDeviceName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function errorCode(error: unknown): string {
  return error !== null && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
}

export function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Canonical form of an existing directory that is not itself a link. */
export async function canonicalDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory);
  let info;

  try {
    info = await lstat(absolute);
  } catch {
    throw new LocalPathError("not-found");
  }

  if (info.isSymbolicLink()) {
    throw new LocalPathError("symbolic-link");
  }

  if (!info.isDirectory()) {
    throw new LocalPathError("not-a-directory");
  }

  return realpath(absolute);
}

export function relativeSegments(relativePath: string): readonly string[] {
  if (!validateRelativePath(relativePath).ok) {
    throw new LocalPathError("invalid-path");
  }

  const segments = relativePath.split("/");

  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" ") || reservedDeviceName.test(segment))) {
    throw new LocalPathError("invalid-path");
  }

  return segments;
}

export interface ResolvedLocalPath {
  readonly absolutePath: string;
  /** Whether the complete path exists. */
  readonly exists: boolean;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
}

/**
 * Resolves a relative path below a canonical root without following links. Missing components are
 * allowed only when allowMissing is set; they are never created here.
 */
export async function resolveContainedPath(
  canonicalRoot: string,
  relativePath: string,
  options: { readonly allowMissing?: boolean } = {}
): Promise<ResolvedLocalPath> {
  const segments = relativeSegments(relativePath);
  let current = canonicalRoot;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index] ?? "");

    if (!isInsideRoot(canonicalRoot, current)) {
      throw new LocalPathError("containment-violation");
    }

    let info;

    try {
      info = await lstat(current);
    } catch (error) {
      if (errorCode(error) === "ENOENT" && options.allowMissing === true) {
        const absolutePath = path.join(canonicalRoot, ...segments);
        return Object.freeze({ absolutePath, exists: false, isFile: false, isDirectory: false });
      }

      throw new LocalPathError(errorCode(error) === "ENOENT" ? "not-found" : "invalid-path");
    }

    if (info.isSymbolicLink()) {
      throw new LocalPathError("symbolic-link");
    }

    const last = index === segments.length - 1;

    if (!last && !info.isDirectory()) {
      throw new LocalPathError("not-a-directory");
    }

    if (last) {
      const real = await realpath(current);

      if (!isInsideRoot(canonicalRoot, real)) {
        throw new LocalPathError("containment-violation");
      }

      return Object.freeze({ absolutePath: current, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() });
    }
  }

  throw new LocalPathError("invalid-path");
}
