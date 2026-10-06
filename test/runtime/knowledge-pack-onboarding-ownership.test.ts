import { afterEach, describe, it, vi } from "vitest";
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
  it.each(scenarioIds)("%s preserves exact bytes and identity without foreign unlink", async (scenario) => {
    const memory = controlledFilesystem(scenario);
    control.fs = memory.fs;
    await runScenario(scenario, runtime, memory);
  });
});
