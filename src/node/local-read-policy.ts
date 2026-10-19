import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { isInsideRoot, LocalPathError, resolveContainedPath } from "./local-file-path.js";

/** Process-owned authority. Request data never supplies or changes this policy. */
export interface LocalReadPolicy {
  readonly readRoots: readonly { readonly path: string; readonly dev: bigint; readonly ino: bigint }[];
}

async function linkFreeAbsolute(absolute: string): Promise<void> {
  if (!path.isAbsolute(absolute) || /[\x00-\x1f\x7f]/.test(absolute)) throw new LocalPathError("invalid-path");
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new LocalPathError("symbolic-link");
  }
}

export async function createLocalReadPolicy(readRoots: readonly string[]): Promise<LocalReadPolicy> {
  if (!readRoots.length || readRoots.length > 16) throw new LocalPathError("invalid-path");
  const roots = [];
  for (const value of readRoots) {
    await linkFreeAbsolute(value);
    const canonical = await realpath(value), stat = await lstat(canonical, { bigint: true });
    if (!stat.isDirectory()) throw new LocalPathError("not-a-directory");
    roots.push(Object.freeze({ path: canonical, dev: stat.dev, ino: stat.ino }));
  }
  return Object.freeze({ readRoots: Object.freeze(roots) });
}

/** Rechecked at the actual read, including freshness reads of frozen sessions. */
export async function assertLocalReadPath(absolute: string, policy: LocalReadPolicy, options:{allowMissing?:boolean}={}): Promise<void> {
  if (!path.isAbsolute(absolute)) throw new LocalPathError("invalid-path");
  const root = [...policy.readRoots].sort((a,b) => b.path.length-a.path.length).find(r => isInsideRoot(r.path, absolute));
  if (!root) throw new LocalPathError("containment-violation");
  await linkFreeAbsolute(root.path);
  const stat = await lstat(root.path, { bigint: true });
  if (!stat.isDirectory() || stat.dev !== root.dev || stat.ino !== root.ino || await realpath(root.path) !== root.path)
    throw new LocalPathError("containment-violation");
  const relative = path.relative(root.path, absolute).split(path.sep).join("/");
  if (relative) await resolveContainedPath(root.path, relative, options);
}
