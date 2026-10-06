import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

describe("scoped Mammoth argparse override", () => {
  it("installs the published dependency-free 2.0.1 and preserves CLI conversion and errors", () => {
    const require = createRequire(import.meta.url);
    const fromMammoth = createRequire(require.resolve("mammoth/package.json"));
    const parser = fromMammoth("argparse/package.json") as { version: string; dependencies?: unknown };
    expect(parser.version).toBe("2.0.1");
    expect(parser.dependencies).toBeUndefined();
    expect(() => fromMammoth.resolve("sprintf-js")).toThrow();
    const root = mkdtempSync(path.join(tmpdir(), "archi-cli-check-"));
    try {
      const report = path.join(root, "cli.json");
      const result = spawnSync(process.execPath, ["scripts/mammoth-cli-compatibility.mjs", report], { encoding: "utf8", timeout: 30000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      const checks = JSON.parse(readFileSync(report, "utf8")) as { results: { status: string }[] };
      expect(checks.results).toHaveLength(11);
      expect(checks.results.every(r => r.status === "PASS")).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
