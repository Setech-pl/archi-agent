import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";
import { controlledFilesystem, runScenario, scenarioIds } from "../../scripts/ux3-onboarding-ownership-fixture.cjs";
import * as runtime from "../../src/runtime/knowledge-pack-onboarding.js";

const control = vi.hoisted(() => ({ fs: undefined as Record<string, (...args: any[]) => Promise<any>> | undefined }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, ...Object.fromEntries(["open", "lstat", "mkdir", "readFile", "readdir", "rmdir", "unlink"].map((name) =>
    [name, (...args: any[]) => (control.fs ?? actual as unknown as Record<string, (...args: any[]) => unknown>)[name]!(...args)])) };
});
afterEach(() => { control.fs = undefined; });
describe("starter Knowledge Pack ownership regression", () => {
  it("keeps cleanup uncertain when removing the shared parent fails for a reason other than non-empty", async () => {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const root = await actual.realpath(await actual.mkdtemp(path.join(tmpdir(), "art1-cleanup-error-")));
    const parent = path.join(root, "archi-agent-results"), destination = path.join(parent, "bundle-a");
    control.fs = { open: actual.open, lstat: actual.lstat, mkdir: actual.mkdir, readFile: actual.readFile,
      readdir: actual.readdir, unlink: actual.unlink, rmdir: async (directory: string) => {
      if (directory === parent) throw Object.assign(new Error("controlled permission failure"), { code: "EACCES" });
      return actual.rmdir(directory);
    } };
    try {
      await expect(runtime.createExclusiveArtifactFiles(destination, ["diagram.puml", "report.json"], ["diagram\n", "{}\n"], {
        projectRoot: root, requireNewDirectory: true, verify: async () => { throw new Error("injected A failure"); }
      })).rejects.toMatchObject({ code: "write-failed", cleanupIncomplete: true, recovery: expect.stringContaining("safe cleanup could not be confirmed") });
      await expect(actual.lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await actual.readdir(parent)).toEqual([]);
    } finally { control.fs = undefined; await actual.rm(root, { recursive: true, force: true }); }
  });
  it.each(scenarioIds)("%s preserves exact bytes and identity without foreign unlink", async (scenario) => {
    const memory = controlledFilesystem(scenario);
    control.fs = memory.fs;
    await runScenario(scenario, runtime, memory);
  });
});
