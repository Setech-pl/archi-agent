import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { knowledgePackLimits } from "../../src/core/knowledge-pack/source-limits.js";
import { BoundedReadError, maxFlowFileBytes, readBoundedTextFile, type BoundedReadCode } from "../../src/node/bounded-file-reader.js";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

/** A temporary project directory with a sibling directory outside it. */
function workspace(): { readonly project: string; readonly outside: string } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-reader-")));
  workspaces.push(root);
  const project = path.join(root, "project");
  const outside = path.join(root, "outside");
  mkdirSync(project);
  mkdirSync(outside);
  return { project, outside };
}

async function codeOf(promise: Promise<unknown>): Promise<BoundedReadCode> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BoundedReadError) {
      return error.code;
    }

    throw error;
  }

  throw new Error("Expected a rejection.");
}

describe("readBoundedTextFile - accepted files", () => {
  it("reads a UTF-8 file below the root and returns the requested relative path", async () => {
    const { project } = workspace();
    const text = `Flow with Polish letters: ${String.fromCharCode(0x142, 0x105)}\n`;
    mkdirSync(path.join(project, "flows"));
    writeFileSync(path.join(project, "flows", "flow.md"), text, "utf8");

    const file = await readBoundedTextFile(project, "flows/flow.md", { maxBytes: 1024 });

    expect(file).toEqual({ relativePath: "flows/flow.md", text, byteLength: Buffer.byteLength(text, "utf8") });
    expect(Object.isFrozen(file)).toBe(true);
  });

  it("accepts a file of exactly the byte limit", async () => {
    const { project } = workspace();
    writeFileSync(path.join(project, "exact.md"), "a".repeat(64));

    expect((await readBoundedTextFile(project, "exact.md", { maxBytes: 64 })).byteLength).toBe(64);
  });

  it("uses the existing flow-size limit, four bytes per allowed character", () => {
    expect(maxFlowFileBytes).toBe(knowledgePackLimits.maxFlowSourceChars * 4);
  });
});

describe("readBoundedTextFile - rejected content", () => {
  it("rejects a file above the byte limit", async () => {
    const { project } = workspace();
    writeFileSync(path.join(project, "large.md"), "a".repeat(65));

    const error = await readBoundedTextFile(project, "large.md", { maxBytes: 64 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BoundedReadError);
    expect((error as BoundedReadError).code).toBe("too-large");
    expect((error as BoundedReadError).limit).toBe(64);
  });

  it("rejects NUL bytes as binary content and invalid UTF-8", async () => {
    const { project } = workspace();
    writeFileSync(path.join(project, "binary.md"), Buffer.from([0x61, 0x00, 0x62]));
    writeFileSync(path.join(project, "latin.md"), Buffer.from([0x61, 0xff, 0xfe, 0x62]));
    writeFileSync(path.join(project, "truncated.md"), Buffer.from([0x61, 0xc5]));

    expect(await codeOf(readBoundedTextFile(project, "binary.md", { maxBytes: 64 }))).toBe("binary-content");
    expect(await codeOf(readBoundedTextFile(project, "latin.md", { maxBytes: 64 }))).toBe("invalid-utf8");
    expect(await codeOf(readBoundedTextFile(project, "truncated.md", { maxBytes: 64 }))).toBe("invalid-utf8");
  });

  it("rejects an invalid byte limit as a programming error", async () => {
    const { project } = workspace();

    await expect(readBoundedTextFile(project, "x.md", { maxBytes: 0 })).rejects.toThrow("positive integer");
    await expect(readBoundedTextFile(project, "x.md", { maxBytes: 1.5 })).rejects.toThrow("positive integer");
  });
});

describe("readBoundedTextFile - containment", () => {
  it.each(["../outside/secret.md", "/secret.md", "C:/secret.md", "flows\\flow.md", "flows/../flow.md", "", "nul.md", "flow.md."])(
    "rejects the path %j",
    async (relativePath) => {
      const { project } = workspace();

      expect(await codeOf(readBoundedTextFile(project, relativePath, { maxBytes: 64 }))).toBe("invalid-path");
    }
  );

  it("reports missing files and directories without following them", async () => {
    const { project } = workspace();
    mkdirSync(path.join(project, "folder"));

    expect(await codeOf(readBoundedTextFile(project, "missing.md", { maxBytes: 64 }))).toBe("not-found");
    expect(await codeOf(readBoundedTextFile(project, "folder", { maxBytes: 64 }))).toBe("not-a-file");
  });

  it("rejects a junction or symbolic link that leads out of the root", async () => {
    const { project, outside } = workspace();
    writeFileSync(path.join(outside, "secret.md"), "outside content");
    symlinkSync(outside, path.join(project, "linked"), "junction");

    const error = await readBoundedTextFile(project, "linked/secret.md", { maxBytes: 64 }).catch((caught: unknown) => caught);

    expect((error as BoundedReadError).code).toBe("symbolic-link");
    expect((error as Error).message).not.toContain("outside content");
    expect((error as Error).message).not.toContain(outside);
  });

  it("rejects a junction even when it points inside the root", async () => {
    const { project } = workspace();
    mkdirSync(path.join(project, "real"));
    writeFileSync(path.join(project, "real", "flow.md"), "inside");
    symlinkSync(path.join(project, "real"), path.join(project, "alias"), "junction");

    expect(await codeOf(readBoundedTextFile(project, "alias/flow.md", { maxBytes: 64 }))).toBe("symbolic-link");
    expect((await readBoundedTextFile(project, "real/flow.md", { maxBytes: 64 })).text).toBe("inside");
  });
});
