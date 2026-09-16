import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { knowledgePackFileNames } from "../../src/core/knowledge-pack/knowledge-pack-source.js";
import { loadKnowledgePack } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { knowledgePackLimits } from "../../src/core/knowledge-pack/source-limits.js";
import { KnowledgePackError, type KnowledgePackErrorCode } from "../../src/core/knowledge-pack/source-errors.js";
import { NodeKnowledgePackSource } from "../../src/node/node-knowledge-pack-source.js";

const samplePack = fileURLToPath(new URL("../../samples/space-mission/architecture/", import.meta.url));
const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

/** A temporary project with a copy of the Space Mission pack in <project>/pack and a sibling outside directory. */
function workspace(): { readonly project: string; readonly pack: string; readonly outside: string } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-pack-")));
  workspaces.push(root);
  const project = path.join(root, "project");
  const pack = path.join(project, "pack");
  const outside = path.join(root, "outside");
  mkdirSync(pack, { recursive: true });
  mkdirSync(outside);

  for (const file of knowledgePackFileNames) {
    copyFileSync(path.join(samplePack, file), path.join(pack, file));
  }

  return { project, pack, outside };
}

async function codeOf(promise: Promise<unknown>): Promise<KnowledgePackErrorCode> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof KnowledgePackError) {
      return error.code;
    }

    throw error;
  }

  throw new Error("Expected a rejection.");
}

describe("NodeKnowledgePackSource - loading", () => {
  it("implements the source port for the loader with the real Space Mission pack", async () => {
    const { project } = workspace();
    const source = await NodeKnowledgePackSource.open(project, "pack");
    const result = await loadKnowledgePack(source);

    expect(source.packDirectory).toBe("pack");
    expect(result.ok).toBe(true);
    expect(result.ok && result.pack.systems.map((system) => system.id)).toContain("telemetry-store");
  });

  it("considers exactly the five pack files in a fixed order and never enumerates or expands patterns", async () => {
    const { project, pack } = workspace();
    writeFileSync(path.join(pack, "extra.md"), "| not | a | pack |");
    writeFileSync(path.join(pack, "notes.txt"), "notes");
    writeFileSync(path.join(pack, "systems.md.bak"), "backup");
    mkdirSync(path.join(pack, "nested"));
    copyFileSync(path.join(pack, "systems.md"), path.join(pack, "nested", "systems.md"));
    const source = await NodeKnowledgePackSource.open(project, "pack");

    expect(await source.listFiles()).toEqual([...knowledgePackFileNames]);
    expect((await loadKnowledgePack(source)).ok).toBe(true);

    for (const other of ["extra.md", "notes.txt", "nested/systems.md", "../pack/systems.md", "*.md", "systems.*", "pack/systems.md", "SYSTEMS.md"]) {
      expect(await codeOf(source.readTextFile(other))).toBe("invalid-path");
    }
  });

  it("omits a missing file from the listing so the loader reports it", async () => {
    const { project, pack } = workspace();
    unlinkSync(path.join(pack, "rules.md"));
    const source = await NodeKnowledgePackSource.open(project, "pack");
    const result = await loadKnowledgePack(source);

    expect(await source.listFiles()).toEqual(knowledgePackFileNames.filter((file) => file !== "rules.md"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((issue) => [issue.code, issue.file])).toContainEqual(["missing-file", "rules.md"]);
  });

  it("rejects a pack entry that is not a regular file", async () => {
    const { project, pack } = workspace();
    unlinkSync(path.join(pack, "aliases.md"));
    mkdirSync(path.join(pack, "aliases.md"));
    const source = await NodeKnowledgePackSource.open(project, "pack");

    expect(await codeOf(source.listFiles())).toBe("invalid-path");
  });
});

describe("NodeKnowledgePackSource - limits and encoding", () => {
  it("enforces the pack byte limit and a smaller caller limit", async () => {
    const { project, pack } = workspace();
    writeFileSync(path.join(pack, "systems.md"), "a".repeat(knowledgePackLimits.maxFileBytes + 1));
    const source = await NodeKnowledgePackSource.open(project, "pack");

    const error = await source.readTextFile("systems.md").catch((caught: unknown) => caught);
    expect((error as KnowledgePackError).code).toBe("limit-exceeded");
    expect((error as KnowledgePackError).limit).toBe(knowledgePackLimits.maxFileBytes);

    const small = await source.readTextFile("actors.md", { maxBytes: 10 }).catch((caught: unknown) => caught);
    expect((small as KnowledgePackError).limit).toBe(10);
  });

  it("accepts UTF-8 only and rejects NUL and binary content", async () => {
    const { project, pack } = workspace();
    writeFileSync(path.join(pack, "aliases.md"), Buffer.from([0x7c, 0x00, 0x7c]));
    writeFileSync(path.join(pack, "rules.md"), Buffer.from([0x7c, 0xff, 0xfe, 0x7c]));
    const source = await NodeKnowledgePackSource.open(project, "pack");

    expect(await codeOf(source.readTextFile("aliases.md"))).toBe("control-character");
    expect(await codeOf(source.readTextFile("rules.md"))).toBe("invalid-value");
  });

  it("honours cancellation", async () => {
    const { project } = workspace();
    const source = await NodeKnowledgePackSource.open(project, "pack");

    expect(await codeOf(source.readTextFile("systems.md", { signal: { aborted: true } }))).toBe("cancelled");
    expect(await codeOf(source.listFiles({ signal: { aborted: true } }))).toBe("cancelled");
  });
});

describe("NodeKnowledgePackSource - containment", () => {
  it("rejects traversal, missing directories and a pack directory reached through a junction", async () => {
    const { project, pack, outside } = workspace();

    for (const file of knowledgePackFileNames) {
      copyFileSync(path.join(pack, file), path.join(outside, file));
    }

    symlinkSync(outside, path.join(project, "linked-pack"), "junction");

    expect(await codeOf(NodeKnowledgePackSource.open(project, "../outside"))).toBe("invalid-path");
    expect(await codeOf(NodeKnowledgePackSource.open(project, "linked-pack"))).toBe("invalid-path");
    expect(await codeOf(NodeKnowledgePackSource.open(project, "missing-pack"))).toBe("missing-file");
    expect(await codeOf(NodeKnowledgePackSource.open(project, "pack/systems.md"))).toBe("invalid-path");
    expect(await codeOf(NodeKnowledgePackSource.open(path.join(project, "missing-root"), "pack"))).toBe("missing-file");
  });

  it("reports failures without file contents or absolute paths", async () => {
    const { project, pack } = workspace();
    writeFileSync(path.join(pack, "aliases.md"), Buffer.from([...Buffer.from("| secret-alias-value |"), 0]));
    const source = await NodeKnowledgePackSource.open(project, "pack");
    const error = (await source.readTextFile("aliases.md").catch((caught: unknown) => caught)) as KnowledgePackError;

    expect(error.file).toBe("aliases.md");
    expect(error.message).not.toContain("secret-alias-value");
    expect(error.message).not.toContain(project);
  });
});
