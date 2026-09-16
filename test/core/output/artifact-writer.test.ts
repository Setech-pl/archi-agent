import { describe, expect, it } from "vitest";
import {
  ArtifactFileSystemError,
  type ArtifactFileSystem,
  type ArtifactOutputCode
} from "../../../src/core/output/artifact-file-system.js";
import { temporaryPathFor, writeArtifactPair } from "../../../src/core/output/artifact-writer.js";
import { planArtifactPair, type ArtifactPairPlan } from "../../../src/core/output/output-planner.js";

type Operation = "ensureDirectory" | "exists" | "writeNewFile" | "publishNewFile" | "removeFile";

/** In-memory file system with failure injection; it enforces the no-overwrite rules of the port. */
class MemoryFileSystem implements ArtifactFileSystem {
  public readonly files = new Map<string, string>();
  public readonly directories = new Set<string>();
  public readonly log: string[] = [];
  readonly #failures = new Map<string, unknown>();

  public failOn(operation: Operation, path: string, error: unknown = new ArtifactFileSystemError("write-failed")): this {
    this.#failures.set(`${operation} ${path}`, error);
    return this;
  }

  #check(operation: Operation, path: string): void {
    this.log.push(`${operation} ${path}`);
    const failure = this.#failures.get(`${operation} ${path}`);

    if (failure !== undefined) {
      throw failure;
    }
  }

  public async listDirectory(relativeDirectory: string): Promise<readonly string[]> {
    const prefix = `${relativeDirectory}/`;
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map((path) => path.slice(prefix.length))
      .sort();
  }

  public async ensureDirectory(relativeDirectory: string): Promise<void> {
    this.#check("ensureDirectory", relativeDirectory);
    this.directories.add(relativeDirectory);
  }

  public async exists(relativePath: string): Promise<boolean> {
    this.#check("exists", relativePath);
    return this.files.has(relativePath) || this.directories.has(relativePath);
  }

  public async writeNewFile(relativePath: string, content: string): Promise<void> {
    this.#check("writeNewFile", relativePath);

    if (this.files.has(relativePath)) {
      throw new ArtifactFileSystemError("destination-exists");
    }

    this.files.set(relativePath, content);
  }

  public async publishNewFile(temporaryRelativePath: string, finalRelativePath: string): Promise<void> {
    this.#check("publishNewFile", finalRelativePath);
    const content = this.files.get(temporaryRelativePath);

    if (this.files.has(finalRelativePath)) {
      throw new ArtifactFileSystemError("destination-exists");
    }

    if (content === undefined) {
      throw new ArtifactFileSystemError("publish-failed");
    }

    this.files.set(finalRelativePath, content);
  }

  public async removeFile(relativePath: string): Promise<void> {
    this.#check("removeFile", relativePath);
    this.files.delete(relativePath);
  }
}

const directory = "architecture-diagrams/space-mission/sequence";
const contents = { diagram: "@startuml\n' diagram\n@enduml\n", report: "{}\n" };

async function planFor(fileSystem: MemoryFileSystem): Promise<ArtifactPairPlan> {
  const result = planArtifactPair({ outputDirectory: directory, diagramName: "telemetry-command-flow", existingEntries: await fileSystem.listDirectory(directory) });

  if (!result.ok) {
    throw new Error("A plan is expected.");
  }

  return result.plan;
}

function codes(result: Awaited<ReturnType<typeof writeArtifactPair>>): ArtifactOutputCode[] {
  return result.status === "output-failed" ? result.issues.map((issue) => issue.code) : [];
}

describe("writeArtifactPair - success", () => {
  it("writes both temporary files in the target directory before giving either its final name", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    const result = await writeArtifactPair(fileSystem, plan, contents);
    const diagramTemp = temporaryPathFor(directory, plan.diagramFileName);
    const reportTemp = temporaryPathFor(directory, plan.reportFileName);

    expect(result).toEqual({ status: "written", diagramPath: plan.diagramPath, reportPath: plan.reportPath });
    expect(diagramTemp).toBe(`${directory}/.telemetry-command-flow.puml.tmp`);
    expect(fileSystem.log.filter((entry) => !entry.startsWith("exists"))).toEqual([
      `ensureDirectory ${directory}`,
      `writeNewFile ${diagramTemp}`,
      `writeNewFile ${reportTemp}`,
      `publishNewFile ${plan.diagramPath}`,
      `publishNewFile ${plan.reportPath}`,
      `removeFile ${diagramTemp}`,
      `removeFile ${reportTemp}`
    ]);
    expect([...fileSystem.files.entries()]).toEqual([
      [plan.diagramPath, contents.diagram],
      [plan.reportPath, contents.report]
    ]);
  });

  it("returns paths relative to the output root", async () => {
    const fileSystem = new MemoryFileSystem();
    const result = await writeArtifactPair(fileSystem, await planFor(fileSystem), contents);

    expect(result.status === "written" && [result.diagramPath, result.reportPath].every((path) => path.startsWith(`${directory}/`))).toBe(true);
  });
});

describe("writeArtifactPair - never overwrites", () => {
  it("fails before writing anything when a destination already exists and leaves it untouched", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.files.set(plan.reportPath, "user content");

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(result).toEqual({ status: "output-failed", issues: [expect.objectContaining({ code: "destination-exists", path: plan.reportPath })] });
    expect([...fileSystem.files.entries()]).toEqual([[plan.reportPath, "user content"]]);
    expect(fileSystem.log.some((entry) => entry.startsWith("writeNewFile") || entry.startsWith("removeFile"))).toBe(false);
  });

  it("fails without touching a stale temporary file", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    const reportTemp = temporaryPathFor(directory, plan.reportFileName);
    fileSystem.files.set(reportTemp, "stale");

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(codes(result)).toEqual(["temporary-exists"]);
    expect([...fileSystem.files.entries()]).toEqual([[reportTemp, "stale"]]);
  });
});

describe("writeArtifactPair - cleanup after failure", () => {
  it("removes the first temporary file when the second temporary write fails", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.failOn("writeNewFile", temporaryPathFor(directory, plan.reportFileName));

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(codes(result)).toEqual(["write-failed"]);
    expect(fileSystem.files.size).toBe(0);
  });

  it("removes the already published diagram and both temporary files when the report cannot be finalized", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.files.set(`${directory}/unrelated-user-file.puml`, "keep me");
    fileSystem.failOn("publishNewFile", plan.reportPath, new ArtifactFileSystemError("publish-failed"));

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(codes(result)).toEqual(["publish-failed"]);
    expect([...fileSystem.files.entries()]).toEqual([[`${directory}/unrelated-user-file.puml`, "keep me"]]);
    expect(fileSystem.log).toContain(`removeFile ${plan.diagramPath}`);
  });

  it("reports a destination that appears between the check and the final rename, and removes only its own files", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.failOn("publishNewFile", plan.reportPath, new ArtifactFileSystemError("destination-exists"));

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(codes(result)).toEqual(["destination-exists"]);
    expect(fileSystem.files.size).toBe(0);
  });

  it("reports cleanup failures in addition to the original failure", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.failOn("publishNewFile", plan.reportPath, new ArtifactFileSystemError("publish-failed"));
    fileSystem.failOn("removeFile", plan.diagramPath);

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(result.status === "output-failed" && result.issues).toEqual([
      expect.objectContaining({ code: "publish-failed", path: plan.reportPath }),
      expect.objectContaining({ code: "cleanup-failed", path: plan.diagramPath })
    ]);
  });

  it("reports a temporary file that cannot be removed after both artifacts were published", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.failOn("removeFile", temporaryPathFor(directory, plan.diagramFileName));

    const result = await writeArtifactPair(fileSystem, plan, contents);

    expect(codes(result)).toEqual(["cleanup-failed"]);
    expect(fileSystem.files.get(plan.diagramPath)).toBe(contents.diagram);
    expect(fileSystem.files.get(plan.reportPath)).toBe(contents.report);
  });

  it("maps a failure to create the directory and unexpected errors to safe codes", async () => {
    const fileSystem = new MemoryFileSystem();
    const plan = await planFor(fileSystem);
    fileSystem.failOn("ensureDirectory", directory, new ArtifactFileSystemError("symbolic-link"));

    expect(codes(await writeArtifactPair(fileSystem, plan, contents))).toEqual(["symbolic-link"]);

    const unexpected = new MemoryFileSystem().failOn("writeNewFile", temporaryPathFor(directory, plan.diagramFileName), new Error("disk said something"));
    const result = await writeArtifactPair(unexpected, plan, contents);

    expect(codes(result)).toEqual(["write-failed"]);
    expect(JSON.stringify(result)).not.toContain("disk said something");
    expect(unexpected.files.size).toBe(0);
  });
});
