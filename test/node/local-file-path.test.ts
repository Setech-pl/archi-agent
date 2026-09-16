import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalDirectory,
  isInsideRoot,
  LocalPathError,
  relativeSegments,
  resolveContainedPath,
  type LocalPathCode
} from "../../src/node/local-file-path.js";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function workspace(): { readonly root: string; readonly project: string; readonly outside: string } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-path-")));
  workspaces.push(root);
  const project = path.join(root, "project");
  const outside = path.join(root, "outside");
  mkdirSync(project);
  mkdirSync(outside);
  return { root, project, outside };
}

async function codeOf(promise: Promise<unknown>): Promise<LocalPathCode> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LocalPathError) {
      return error.code;
    }

    throw error;
  }

  throw new Error("Expected a rejection.");
}

describe("isInsideRoot", () => {
  it("accepts the root and its descendants and rejects everything else", () => {
    const root = path.resolve("sandbox-root");

    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, path.join(root, "a", "b"))).toBe(true);
    expect(isInsideRoot(root, path.join(root, ".."))).toBe(false);
    expect(isInsideRoot(root, path.join(root, "..", "sandbox-root-sibling"))).toBe(false);
    expect(isInsideRoot(root, path.resolve("elsewhere"))).toBe(false);
  });
});

describe("relativeSegments", () => {
  it("splits a safe relative path", () => {
    expect(relativeSegments("samples/space-mission/flows/flow.md")).toEqual(["samples", "space-mission", "flows", "flow.md"]);
  });

  it.each([
    "",
    "/absolute",
    "C:/drive",
    "a\\b",
    "a/../b",
    "..",
    "a/./b",
    "a//b",
    "a/",
    "dir./file",
    "dir /file",
    "con",
    "NUL.txt",
    "a/COM1",
    "lpt9.md",
    "a:b"
  ])("rejects %j", (value) => {
    expect(() => relativeSegments(value)).toThrow(LocalPathError);
  });
});

describe("canonicalDirectory", () => {
  it("returns the real path of an existing directory", async () => {
    const { project } = workspace();

    expect(await canonicalDirectory(project)).toBe(realpathSync.native(project));
  });

  it("rejects missing paths, files and linked directories", async () => {
    const { project, outside } = workspace();
    writeFileSync(path.join(project, "file.txt"), "x");
    symlinkSync(outside, path.join(project, "linked"), "junction");

    expect(await codeOf(canonicalDirectory(path.join(project, "missing")))).toBe("not-found");
    expect(await codeOf(canonicalDirectory(path.join(project, "file.txt")))).toBe("not-a-directory");
    expect(await codeOf(canonicalDirectory(path.join(project, "linked")))).toBe("symbolic-link");
  });
});

describe("resolveContainedPath", () => {
  it("resolves existing files and directories below the root", async () => {
    const { project } = workspace();
    mkdirSync(path.join(project, "a"));
    writeFileSync(path.join(project, "a", "b.md"), "x");

    expect(await resolveContainedPath(project, "a/b.md")).toEqual({ absolutePath: path.join(project, "a", "b.md"), exists: true, isFile: true, isDirectory: false });
    expect((await resolveContainedPath(project, "a")).isDirectory).toBe(true);
  });

  it("reports a missing path only when allowed, and never creates it", async () => {
    const { project } = workspace();

    expect(await resolveContainedPath(project, "new/dir/file.md", { allowMissing: true })).toEqual({
      absolutePath: path.join(project, "new", "dir", "file.md"),
      exists: false,
      isFile: false,
      isDirectory: false
    });
    expect(await codeOf(resolveContainedPath(project, "new/dir/file.md"))).toBe("not-found");
    expect(await codeOf(canonicalDirectory(path.join(project, "new")))).toBe("not-found");
  });

  it("rejects a file used as a directory", async () => {
    const { project } = workspace();
    writeFileSync(path.join(project, "file.md"), "x");

    expect(await codeOf(resolveContainedPath(project, "file.md/child"))).toBe("not-a-directory");
  });

  it("rejects traversal and junctions anywhere on the way", async () => {
    const { project, outside } = workspace();
    writeFileSync(path.join(outside, "secret.md"), "x");
    symlinkSync(outside, path.join(project, "escape"), "junction");
    mkdirSync(path.join(project, "inner"));
    symlinkSync(path.join(project, "inner"), path.join(project, "loop"), "junction");

    expect(await codeOf(resolveContainedPath(project, "../outside/secret.md"))).toBe("invalid-path");
    expect(await codeOf(resolveContainedPath(project, "escape/secret.md"))).toBe("symbolic-link");
    expect(await codeOf(resolveContainedPath(project, "escape", { allowMissing: true }))).toBe("symbolic-link");
    expect(await codeOf(resolveContainedPath(project, "loop/missing.md", { allowMissing: true }))).toBe("symbolic-link");
  });
});
