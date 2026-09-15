import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactFileSystemError, type ArtifactOutputCode } from "../../src/core/output/artifact-file-system.js";
import { writeArtifactPair } from "../../src/core/output/artifact-writer.js";
import { planArtifactPair } from "../../src/core/output/output-planner.js";
import { NodeArtifactFileSystem } from "../../src/node/node-artifact-file-system.js";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function workspace(): { readonly output: string; readonly outside: string } {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archground-output-")));
  workspaces.push(root);
  const output = path.join(root, "output");
  const outside = path.join(root, "outside");
  mkdirSync(output);
  mkdirSync(outside);
  return { output, outside };
}

async function codeOf(promise: Promise<unknown>): Promise<ArtifactOutputCode> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ArtifactFileSystemError) {
      return error.code;
    }

    throw error;
  }

  throw new Error("Expected a rejection.");
}

describe("NodeArtifactFileSystem.open", () => {
  it("opens an existing directory and rejects missing, file and linked roots", async () => {
    const { output, outside } = workspace();
    writeFileSync(path.join(output, "file.txt"), "x");
    symlinkSync(outside, path.join(output, "linked"), "junction");

    await expect(NodeArtifactFileSystem.open(output)).resolves.toBeInstanceOf(NodeArtifactFileSystem);
    expect(await codeOf(NodeArtifactFileSystem.open(path.join(output, "missing")))).toBe("invalid-output-directory");
    expect(await codeOf(NodeArtifactFileSystem.open(path.join(output, "file.txt")))).toBe("not-a-directory");
    expect(await codeOf(NodeArtifactFileSystem.open(path.join(output, "linked")))).toBe("symbolic-link");
  });
});

describe("NodeArtifactFileSystem - directories", () => {
  it("lists entries sorted and treats a missing directory as empty without creating it", async () => {
    const { output } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    mkdirSync(path.join(output, "seq"));
    writeFileSync(path.join(output, "seq", "b.puml"), "b");
    writeFileSync(path.join(output, "seq", "a.puml"), "a");

    expect(await fileSystem.listDirectory("seq")).toEqual(["a.puml", "b.puml"]);
    expect(await fileSystem.listDirectory("missing/dir")).toEqual([]);
    expect(existsSync(path.join(output, "missing"))).toBe(false);
    expect(await codeOf(fileSystem.listDirectory("seq/a.puml"))).toBe("not-a-directory");
  });

  it("creates nested directories one level at a time and rejects files and junctions on the way", async () => {
    const { output, outside } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    writeFileSync(path.join(output, "file"), "x");
    symlinkSync(outside, path.join(output, "linked"), "junction");

    await fileSystem.ensureDirectory("a/b/c");
    await fileSystem.ensureDirectory("a/b/c");

    expect(existsSync(path.join(output, "a", "b", "c"))).toBe(true);
    expect(await codeOf(fileSystem.ensureDirectory("file/child"))).toBe("not-a-directory");
    expect(await codeOf(fileSystem.ensureDirectory("linked/child"))).toBe("symbolic-link");
    expect(readdirSync(outside)).toEqual([]);
  });

  it.each(["../escape", "/absolute", "C:/drive", "a\\b", "a/../../b", "con/x"])("rejects the unsafe directory %j", async (directory) => {
    const { output } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);

    expect(await codeOf(fileSystem.ensureDirectory(directory))).toBe("invalid-output-directory");
    expect(await codeOf(fileSystem.listDirectory(directory))).toBe("containment-violation");
  });
});

describe("NodeArtifactFileSystem - files", () => {
  it("creates files exclusively and never overwrites an existing file", async () => {
    const { output } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    writeFileSync(path.join(output, "existing.puml"), "user content");

    await fileSystem.writeNewFile("new.puml", "generated");

    expect(readFileSync(path.join(output, "new.puml"), "utf8")).toBe("generated");
    expect(await codeOf(fileSystem.writeNewFile("existing.puml", "generated"))).toBe("destination-exists");
    expect(readFileSync(path.join(output, "existing.puml"), "utf8")).toBe("user content");
    expect(await codeOf(fileSystem.writeNewFile("missing-dir/new.puml", "generated"))).toBe("containment-violation");
  });

  it("publishes a temporary file under its final name without replacing an existing entry", async () => {
    const { output } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    await fileSystem.writeNewFile(".a.puml.tmp", "generated");
    writeFileSync(path.join(output, "taken.puml"), "user content");

    await fileSystem.publishNewFile(".a.puml.tmp", "a.puml");

    expect(readFileSync(path.join(output, "a.puml"), "utf8")).toBe("generated");
    expect(await codeOf(fileSystem.publishNewFile(".a.puml.tmp", "taken.puml"))).toBe("destination-exists");
    expect(readFileSync(path.join(output, "taken.puml"), "utf8")).toBe("user content");
    expect(await codeOf(fileSystem.publishNewFile("missing.tmp", "b.puml"))).toBe("containment-violation");
  });

  it("detects entries without following links and removes only regular files", async () => {
    const { output, outside } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    writeFileSync(path.join(output, "file.puml"), "x");
    mkdirSync(path.join(output, "folder"));
    writeFileSync(path.join(outside, "victim.puml"), "outside");
    symlinkSync(outside, path.join(output, "linked"), "junction");

    expect(await fileSystem.exists("file.puml")).toBe(true);
    expect(await fileSystem.exists("absent.puml")).toBe(false);
    expect(await codeOf(fileSystem.exists("linked/victim.puml"))).toBe("symbolic-link");

    await fileSystem.removeFile("file.puml");
    await fileSystem.removeFile("absent.puml");

    expect(existsSync(path.join(output, "file.puml"))).toBe(false);
    expect(await codeOf(fileSystem.removeFile("folder"))).toBe("cleanup-failed");
    expect(await codeOf(fileSystem.removeFile("linked/victim.puml"))).toBe("symbolic-link");
    expect(readFileSync(path.join(outside, "victim.puml"), "utf8")).toBe("outside");
  });

  it("never writes through a junction out of the output root", async () => {
    const { output, outside } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    symlinkSync(outside, path.join(output, "linked"), "junction");

    expect(await codeOf(fileSystem.writeNewFile("linked/escape.puml", "x"))).toBe("symbolic-link");
    expect(await codeOf(fileSystem.writeNewFile("../escape.puml", "x"))).toBe("containment-violation");
    expect(readdirSync(outside)).toEqual([]);
  });

  it("errors carry safe codes, never absolute paths or content", async () => {
    const { output } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    writeFileSync(path.join(output, "existing.puml"), "user content");

    const error = await fileSystem.writeNewFile("existing.puml", "secret generated content").catch((caught: unknown) => caught);

    expect((error as Error).message).not.toContain(output);
    expect((error as Error).message).not.toContain("secret generated content");
  });
});

describe("NodeArtifactFileSystem with the artifact writer", () => {
  it("writes a pair atomically and plans -v2 for the next run without touching the first pair", async () => {
    const { output } = workspace();
    const fileSystem = await NodeArtifactFileSystem.open(output);
    const directory = "architecture-diagrams/space-mission/sequence";
    const planNext = async () => {
      const result = planArtifactPair({ outputDirectory: directory, diagramName: "telemetry-command-flow", existingEntries: await fileSystem.listDirectory(directory) });

      if (!result.ok) {
        throw new Error("A plan is expected.");
      }

      return result.plan;
    };

    const first = await writeArtifactPair(fileSystem, await planNext(), { diagram: "first diagram\n", report: "first report\n" });
    const second = await writeArtifactPair(fileSystem, await planNext(), { diagram: "second diagram\n", report: "second report\n" });
    const target = path.join(output, ...directory.split("/"));

    expect(first).toMatchObject({ status: "written", diagramPath: `${directory}/telemetry-command-flow.puml` });
    expect(second).toMatchObject({ status: "written", reportPath: `${directory}/telemetry-command-flow-v2.grounding.json` });
    expect(readdirSync(target).sort()).toEqual([
      "telemetry-command-flow-v2.grounding.json",
      "telemetry-command-flow-v2.puml",
      "telemetry-command-flow.grounding.json",
      "telemetry-command-flow.puml"
    ]);
    expect(readFileSync(path.join(target, "telemetry-command-flow.puml"), "utf8")).toBe("first diagram\n");
  });
});
