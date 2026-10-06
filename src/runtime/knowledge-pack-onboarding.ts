import { createHash } from "node:crypto";
import { open, lstat, mkdir, readFile, readdir, rmdir, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadKnowledgePack, type KnowledgePackLoadIssue } from "../core/knowledge-pack/knowledge-pack-loader.js";
import { NodeKnowledgePackSource } from "../node/node-knowledge-pack-source.js";
import { KnowledgePackError } from "../core/knowledge-pack/source-errors.js";

export interface FirstSystem {
  readonly id: string;
  readonly canonicalName: string;
  readonly kind: "system" | "service" | "database" | "queue" | "external";
  readonly description: string;
}

interface CreatedFile {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
  readonly expectedSize: number;
  readonly expectedDigest: string;
  readonly content?: FileContentProof;
}

interface FileContentProof {
  readonly ctimeMs: number;
  readonly mtimeMs: number;
  readonly size: number;
  readonly digest: string;
}

interface CreatedDirectory {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
}

export interface StarterPackReceipt {
  readonly directory: string;
  readonly files: readonly CreatedFile[];
  readonly directories: readonly CreatedDirectory[];
}

/** Narrow fault seam for deterministic transaction tests; production calls omit it. */
export interface StarterPackCreateOptions {
  readonly onStep?: (step: "after-open" | "after-write" | "before-close" | "before-verify", file: string, handle: FileHandle) => Promise<void> | void;
  readonly closeHandle?: (handle: FileHandle) => Promise<void>;
  readonly requireNewDirectory?: boolean;
  readonly signal?: AbortSignal;
  readonly verify?: () => Promise<void>;
}

export type StarterPackCreateCode = "invalid-location" | "location-exists" | "symbolic-link" |
  "permission-denied" | "storage-full" | "file-changed" | "write-failed" | "cancelled";

const cleanupRecovery = "Some files were preserved because safe cleanup could not be confirmed. Inspect the chosen directory, keep any edits, and move the preserved files before retrying there, or choose another location.";

export class StarterPackCreateError extends Error {
  public readonly recovery: string;
  public constructor(public readonly code: StarterPackCreateCode, public readonly cleanupIncomplete = false, cause?: unknown) {
    super(`Knowledge Pack creation failed (${code}).`, { cause });
    this.name = "StarterPackCreateError";
    this.recovery = cleanupIncomplete ? cleanupRecovery : "";
  }
}

function createCode(error: unknown): StarterPackCreateCode {
  if (error instanceof StarterPackCreateError) return error.code;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "EEXIST") return "location-exists";
  if (code === "EACCES" || code === "EPERM") return "permission-denied";
  if (code === "ENOSPC" || code === "EDQUOT") return "storage-full";
  if (code === "ELOOP") return "symbolic-link";
  if (code === "ENOTDIR" || code === "EINVAL") return "invalid-location";
  return "write-failed";
}

const names = ["systems.md", "actors.md", "relationships.md", "aliases.md", "rules.md"] as const;

export function defaultKnowledgePackPath(projectPath: string | undefined, homeDirectory = os.homedir()): string {
  return projectPath === undefined ? path.join(homeDirectory, "Documents", "ArchiAgent", "knowledge") :
    path.join(projectPath, ".archi-agent", "knowledge");
}

function cell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

function filesFor(system: FirstSystem): readonly string[] {
  return [
    `# Systems\n\n| id | canonical_name | kind | description |\n| --- | --- | --- | --- |\n| ${cell(system.id)} | ${cell(system.canonicalName)} | ${system.kind} | ${cell(system.description)} |\n`,
    "# Actors\n\n| id | canonical_name | kind | description |\n| --- | --- | --- | --- |\n",
    "# Relationships\n\n| from_id | to_id | interface_type | interface_name | mode | purpose |\n| --- | --- | --- | --- | --- | --- |\n",
    "# Aliases\n\n| alias | target_id |\n| --- | --- |\n",
    "# Rules\n\n| rule | from_id | to_id | reason |\n| --- | --- | --- | --- |\n"
  ];
}

async function recordedFile(file: string): Promise<FileContentProof & { dev: number; ino: number }> {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new StarterPackCreateError("file-changed");
  const data = await readFile(file);
  const info = await lstat(file);
  if (info.dev !== before.dev || info.ino !== before.ino || info.size !== before.size || info.ctimeMs !== before.ctimeMs || info.mtimeMs !== before.mtimeMs) throw new StarterPackCreateError("file-changed");
  return { dev: info.dev, ino: info.ino, ctimeMs: info.ctimeMs, mtimeMs: info.mtimeMs, size: info.size,
    digest: createHash("sha256").update(data).digest("hex") };
}

async function createdDirectory(directory: string): Promise<CreatedDirectory> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new StarterPackCreateError("file-changed");
  return { path: directory, dev: info.dev, ino: info.ino };
}

async function makeDirectories(directory: string, created: CreatedDirectory[]): Promise<void> {
  const parent = path.dirname(directory);
  if (parent !== directory) await makeDirectories(parent, created);
  try {
    await mkdir(directory);
    created.push(await createdDirectory(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new StarterPackCreateError("symbolic-link");
    if (!info.isDirectory()) throw new StarterPackCreateError("invalid-location");
  }
}

/** Creates exactly five files with exclusive opens. The receipt authorizes only conditional cleanup. */
export async function createStarterKnowledgePack(directory: string, system: FirstSystem,
  options: StarterPackCreateOptions = {}): Promise<StarterPackReceipt> {
  return createKnowledgePackFiles(directory, filesFor(system), options);
}

/** Shared exclusive writer. K3 requires a new directory; UX3 retains its existing contract. */
export async function createKnowledgePackFiles(directory: string, contents: readonly string[],
  options: StarterPackCreateOptions = {}): Promise<StarterPackReceipt> {
  const check = () => { if (options.signal?.aborted) throw new StarterPackCreateError("cancelled"); };
  check();
  if (contents.length !== 5) throw new StarterPackCreateError("write-failed");
  if (!path.isAbsolute(directory) || /[\x00-\x1f\x7f]/u.test(directory) || path.parse(directory).root === directory) {
    throw new StarterPackCreateError("invalid-location");
  }
  const createdDirectories: CreatedDirectory[] = [];
  const createdFiles: CreatedFile[] = [];
  try {
    await makeDirectories(path.dirname(directory), createdDirectories);
    try {
      await mkdir(directory);
      createdDirectories.push(await createdDirectory(directory));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (options.requireNewDirectory) throw new StarterPackCreateError("location-exists");
      const info = await lstat(directory);
      if (info.isSymbolicLink()) throw new StarterPackCreateError("symbolic-link");
      if (!info.isDirectory()) throw new StarterPackCreateError("invalid-location");
      if ((await readdir(directory)).length > 0) throw new StarterPackCreateError("location-exists");
      // A pre-existing empty destination belongs to its owner, including after a failed write.
    }
    for (let index = 0; index < names.length; index += 1) {
      check();
      // Refuse to write through a directory replaced since exclusive creation.
      for (const ownedDirectory of createdDirectories) {
        const current = await createdDirectory(ownedDirectory.path);
        if (current.dev !== ownedDirectory.dev || current.ino !== ownedDirectory.ino) throw new StarterPackCreateError("file-changed");
      }
      const file = path.join(directory, names[index]!);
      const expectedBytes = Buffer.from(contents[index]!, "utf8");
      const expectedDigest = createHash("sha256").update(expectedBytes).digest("hex");
      const handle = await open(file, "wx+", 0o600);
      // The path enters the receipt immediately; metadata is required before cleanup may unlink it.
      createdFiles.push({ path: file, dev: -1, ino: -1, expectedSize: expectedBytes.length, expectedDigest });
      let initial;
      try { initial = await handle.stat(); }
      catch (error) { try { await handle.close(); } catch { /* Best effort. */ } throw error; }
      // Ownership is registered immediately after exclusive creation, before any content write.
      const owned: CreatedFile = { path: file, dev: initial.dev, ino: initial.ino,
        expectedSize: expectedBytes.length, expectedDigest,
        ...(initial.size === 0 ? { content: { ctimeMs: initial.ctimeMs, mtimeMs: initial.mtimeMs,
          size: 0, digest: createHash("sha256").update(Buffer.alloc(0)).digest("hex") } } : {}) };
      createdFiles[createdFiles.length - 1] = owned;
      let operationError: unknown;
      try {
        await options.onStep?.("after-open", file, handle);
        const beforeWrite = await handle.stat();
        if (beforeWrite.size !== initial.size || beforeWrite.ctimeMs !== initial.ctimeMs || beforeWrite.mtimeMs !== initial.mtimeMs)
          throw new StarterPackCreateError("file-changed");
        await handle.writeFile(expectedBytes);
        await options.onStep?.("after-write", file, handle);
      } catch (error) { operationError = error; }
      try {
        const info = await handle.stat();
        if (info.dev !== owned.dev || info.ino !== owned.ino || info.size !== owned.expectedSize) throw new StarterPackCreateError("file-changed");
        const bytes = Buffer.alloc(expectedBytes.length);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (bytesRead === 0) throw new StarterPackCreateError("file-changed");
          offset += bytesRead;
        }
        const after = await handle.stat();
        if (after.dev !== info.dev || after.ino !== info.ino || after.ctimeMs !== info.ctimeMs ||
          after.mtimeMs !== info.mtimeMs || after.size !== info.size) throw new StarterPackCreateError("file-changed");
        if (!bytes.equals(expectedBytes)) throw new StarterPackCreateError("file-changed");
        // Reads confirm the precomputed content; they never adopt arbitrary observed bytes.
        createdFiles[createdFiles.length - 1] = { ...owned, content: {
          ctimeMs: info.ctimeMs, mtimeMs: info.mtimeMs, size: owned.expectedSize, digest: owned.expectedDigest } };
      } catch (error) { operationError ??= error; }
      try { await options.onStep?.("before-close", file, handle); }
      catch (error) { operationError ??= error; }
      try { await (options.closeHandle?.(handle) ?? handle.close()); }
      catch (error) { operationError ??= error; try { await handle.close(); } catch { /* Best effort. */ } }
      if (operationError !== undefined) throw operationError;
      await options.onStep?.("before-verify", file, handle);
      const recorded = await recordedFile(file);
      if (recorded.dev !== owned.dev || recorded.ino !== owned.ino) throw new StarterPackCreateError("file-changed");
      const proof = createdFiles[createdFiles.length - 1]!.content;
      if (proof === undefined || recorded.digest !== owned.expectedDigest || recorded.size !== owned.expectedSize ||
        recorded.ctimeMs !== proof.ctimeMs || recorded.mtimeMs !== proof.mtimeMs) throw new StarterPackCreateError("file-changed");
    }
    check();
    await options.verify?.();
    for (const owned of createdDirectories) {
      const current = await createdDirectory(owned.path);
      if (current.dev !== owned.dev || current.ino !== owned.ino) throw new StarterPackCreateError("file-changed");
    }
    for (const owned of createdFiles) {
      const current = await recordedFile(owned.path);
      if (!owned.content || current.dev !== owned.dev || current.ino !== owned.ino ||
          current.digest !== owned.expectedDigest || current.ctimeMs !== owned.content.ctimeMs || current.mtimeMs !== owned.content.mtimeMs)
        throw new StarterPackCreateError("file-changed");
    }
    check();
    return { directory, files: createdFiles, directories: createdDirectories };
  } catch (error) {
    const cleanup = await cleanupStarterKnowledgePack({ directory, files: createdFiles, directories: createdDirectories });
    throw new StarterPackCreateError(createCode(error), cleanup.preservedFiles.length > 0, error);
  }
}

/** Removes only files whose identity, timestamps and bytes still match this attempt. */
export async function cleanupStarterKnowledgePack(receipt: StarterPackReceipt): Promise<{ readonly preservedFiles: readonly string[]; readonly recovery: string }> {
  const preservedFiles: string[] = [];
  for (const file of [...receipt.files].reverse()) {
    try {
      // Every owned ancestor must still be the same directory before any unlink.
      for (const ancestor of receipt.directories) {
        const currentDirectory = await createdDirectory(ancestor.path);
        if (currentDirectory.dev !== ancestor.dev || currentDirectory.ino !== ancestor.ino) throw new StarterPackCreateError("file-changed");
      }
      const current = await recordedFile(file.path);
      const proof = file.content;
      if (proof !== undefined && current.dev === file.dev && current.ino === file.ino &&
        current.ctimeMs === proof.ctimeMs && current.mtimeMs === proof.mtimeMs && current.size === proof.size && current.digest === proof.digest) {
        await unlink(file.path);
      } else preservedFiles.push(file.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") preservedFiles.push(file.path);
    }
  }
  for (const directory of [...receipt.directories].reverse()) {
    try {
      const current = await lstat(directory.path);
      if (current.isDirectory() && !current.isSymbolicLink() && current.dev === directory.dev && current.ino === directory.ino)
        await rmdir(directory.path);
      else if (!preservedFiles.some((f) => f.startsWith(directory.path + path.sep))) preservedFiles.push(directory.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !preservedFiles.some((f) => f.startsWith(directory.path + path.sep))) preservedFiles.push(directory.path);
    }
  }
  return { preservedFiles, recovery: preservedFiles.length > 0 ? cleanupRecovery : "" };
}

export async function validateKnowledgePackDirectory(directory: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly code: string; readonly issues: readonly KnowledgePackLoadIssue[] }> {
  try {
    if (!path.isAbsolute(directory)) return { ok: false, code: "invalid-path", issues: [] };
    const source = await NodeKnowledgePackSource.open(path.dirname(directory), path.basename(directory));
    const result = await loadKnowledgePack(source);
    return result.ok ? { ok: true } : { ok: false, code: result.issues[0]?.code ?? "invalid-pack", issues: result.issues };
  } catch (error) {
    return { ok: false, code: error instanceof KnowledgePackError ? error.code : "read-failed", issues: [] };
  }
}
