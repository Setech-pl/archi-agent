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

async function icuFixture(includeIcu = true) {
  const { root } = fixture();
  const moduleUrl = new URL("../../scripts/prepare-ci-ocr.mjs", import.meta.url).href;
  const helper = await import(moduleUrl) as {
    canvasBindings(root: string): unknown[];
    supplementWindowsArm64Icu(modules: string, tarballs: string, bindings: unknown[]): {
      bytes: number; sourceSha256: string; targetSha256: string;
      source: { integrity: string; version: string }; target: { version: string }
    }[];
  };
  const modules = path.join(root, "product/node_modules");
  const tarballs = path.join(root, "build/ux2-ocr/platform-tarballs");
  const source = path.join(modules, "@napi-rs/canvas-win32-x64-msvc/icudtl.dat");
  const target = path.join(modules, "@napi-rs/canvas-win32-arm64-msvc/icudtl.dat");
  mkdirSync(path.dirname(source), { recursive: true });
  mkdirSync(path.dirname(target), { recursive: true });
  const native = path.join(path.dirname(target), "skia.win32-arm64-msvc.node");
  writeFileSync(native, "synthetic native binding");
  const input = path.join(root, "input/package");
  mkdirSync(input, { recursive: true });
  writeFileSync(path.join(input, "package.json"), "{}");
  const bytes = Buffer.from([0, 1, 2, 255, 128, 42]);
  if (includeIcu) writeFileSync(path.join(input, "icudtl.dat"), bytes);
  writeFileSync(source, bytes);
  const tarball = path.join(tarballs, "napi-rs-canvas-win32-x64-msvc-0.1.97.tgz");
  expect(spawnSync("tar", ["-czf", tarball, "-C", path.dirname(input), "package"]).status).toBe(0);
  const lockPath = path.join(root, "experiments/ux2-ocr/package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
  lock.packages["node_modules/@napi-rs/canvas-win32-x64-msvc"].integrity = integrity;
  writeFileSync(lockPath, JSON.stringify(lock));
  return { source, target, tarball, native, bytes, integrity,
    run: () => helper.supplementWindowsArm64Icu(modules, tarballs, helper.canvasBindings(root)) };
}

it("supplements only product ICU from the SRI-verified same-version donor with identical bytes and provenance", async () => {
  const { run, source, target, tarball, native, bytes, integrity } = await icuFixture();
  const originalTarball = readFileSync(tarball);
  const originalNative = readFileSync(native);
  const result = run();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ bytes: bytes.length, sourceSha256: sha256, targetSha256: sha256,
    source: { integrity, version: "0.1.97" }, target: { version: "0.1.97" } });
  expect(readFileSync(target)).toEqual(readFileSync(source));
  expect(readFileSync(target)).toEqual(bytes);
  expect(readFileSync(tarball)).toEqual(originalTarball);
  expect(readFileSync(native)).toEqual(originalNative);
});

it("fails when the verified donor tarball has no ICU, without creating a replacement", async () => {
  const { run, target } = await icuFixture(false);
  expect(run).toThrow();
  expect(existsSync(target)).toBe(false);
});

it("rejects a corrupt ICU donor before extraction or writing the product replacement", async () => {
  const { run, target, tarball } = await icuFixture();
  writeFileSync(tarball, "corrupt donor archive");
  expect(run).toThrow("canvas-integrity-mismatch: @napi-rs/canvas-win32-x64-msvc");
  expect(existsSync(target)).toBe(false);
});
