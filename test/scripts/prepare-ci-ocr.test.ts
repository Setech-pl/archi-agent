import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const platforms = ["darwin-arm64", "darwin-x64", "linux-x64-gnu", "linux-arm64-gnu",
  "linux-x64-musl", "linux-arm64-musl", "win32-x64-msvc", "win32-arm64-msvc"];
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "archi-ci-ocr-"));
  roots.push(root);
  for (const directory of ["scripts", "experiments/ux2-ocr", "build/ux2-ocr/platform-tarballs"]) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  const script = path.join(root, "scripts/prepare-ci-ocr.mjs");
  copyFileSync(fileURLToPath(new URL("../../scripts/prepare-ci-ocr.mjs", import.meta.url)), script);
  const packages: Record<string, unknown> = {};
  const tarballs = platforms.map((platform) => {
    const name = `@napi-rs/canvas-${platform}`;
    const bytes = Buffer.from(`synthetic locked archive: ${platform}`);
    packages[`node_modules/${name}`] = { version: "0.1.97", resolved: `https://invalid.example/${platform}.tgz`,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
    const file = path.join(root, `build/ux2-ocr/platform-tarballs/napi-rs-canvas-${platform}-0.1.97.tgz`);
    writeFileSync(file, bytes);
    return file;
  });
  writeFileSync(path.join(root, "experiments/ux2-ocr/package-lock.json"), JSON.stringify({ packages }));
  const marker = path.join(root, "builder-invocations.txt");
  writeFileSync(path.join(root, "experiments/ux2-ocr/build-trial.mjs"),
    'import { appendFileSync } from "node:fs";\n' +
    'if (process.argv[2] !== "--product-assets") process.exit(2);\n' +
    `appendFileSync(${JSON.stringify(marker)}, "built\\n");\n`);
  // No npm executable is available: these cases must use verified existing inputs without networking.
  const run = () => spawnSync(process.execPath, [script], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8" });
  return { run, marker, tarballs, root };
}

it("rejects a corrupt eighth tarball before invoking the builder, without network access", () => {
  const { run, marker, tarballs } = fixture();
  writeFileSync(tarballs[7]!, "corrupt archive");
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("canvas-integrity-mismatch: @napi-rs/canvas-win32-arm64-msvc");
  expect(result.stdout.match(/Verified /g)).toHaveLength(7);
  expect(existsSync(marker)).toBe(false);
});

it("verifies all eight existing tarballs on each safe rerun before invoking the builder", () => {
  const { run, marker, tarballs } = fixture();
  const before = tarballs.map((file) => readFileSync(file));
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.match(/Verified /g)).toHaveLength(8);
  }
  expect(readFileSync(marker, "utf8")).toBe("built\nbuilt\n");
  expect(tarballs.map((file) => readFileSync(file))).toEqual(before);
});

it("rejects a missing lock entry before using any tarball or invoking the builder", () => {
  const { run, marker, root } = fixture();
  writeFileSync(path.join(root, "experiments/ux2-ocr/package-lock.json"), '{"packages":{}}');
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("invalid-canvas-lock-entry");
  expect(result.stdout).toBe("");
  expect(existsSync(marker)).toBe(false);
});
