#!/usr/bin/env node
import { createHash, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const canvasPlatforms = Object.freeze([
  'darwin-arm64', 'darwin-x64', 'linux-x64-gnu', 'linux-arm64-gnu',
  'linux-x64-musl', 'linux-arm64-musl', 'win32-x64-msvc', 'win32-arm64-msvc'
]);

export function canvasBindings(root) {
  const lock = JSON.parse(readFileSync(path.join(root, 'experiments/ux2-ocr/package-lock.json'), 'utf8'));
  return canvasPlatforms.map((platform) => {
    const name = `@napi-rs/canvas-${platform}`;
    const entry = lock.packages?.[`node_modules/${name}`];
    if (entry?.version !== '0.1.97' || typeof entry.resolved !== 'string' ||
        !entry.resolved.startsWith('https://') || typeof entry.integrity !== 'string' ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity)) {
      throw new Error(`invalid-canvas-lock-entry: ${name}`);
    }
    return { name, platform, version: entry.version, resolved: entry.resolved, integrity: entry.integrity,
      filename: `napi-rs-canvas-${platform}-${entry.version}.tgz` };
  });
}

export function verifyCanvasTarball(file, binding) {
  const bytes = readFileSync(file);
  const actual = createHash('sha512').update(bytes).digest();
  const expected = Buffer.from(binding.integrity.slice('sha512-'.length), 'base64');
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
    throw new Error(`canvas-integrity-mismatch: ${binding.name}`);
  }
  console.log(`Verified ${binding.name}@${binding.version}: ${bytes.length} bytes, ${binding.integrity}`);
}

// Only the product stage is repaired. Upstream #1278 copies the same ICU data to both
// Windows architectures; no native binding or original archive may be changed here.
export function supplementWindowsArm64Icu(targetModules, tarballDirectory, bindings) {
  const source = bindings.find((binding) => binding.platform === 'win32-x64-msvc');
  const target = bindings.find((binding) => binding.platform === 'win32-arm64-msvc');
  if (source?.version !== '0.1.97' || target?.version !== source.version) throw new Error('canvas-icu-version-mismatch');
  const targetPath = path.join(targetModules, target.name, 'icudtl.dat');
  if (existsSync(targetPath)) return [];
  const tarball = path.join(tarballDirectory, source.filename);
  verifyCanvasTarball(tarball, source);
  const bytes = execFileSync('tar', ['-xOf', tarball, 'package/icudtl.dat'], { maxBuffer: 50 * 1024 * 1024 });
  const sourcePath = path.join(targetModules, source.name, 'icudtl.dat');
  if (bytes.length === 0 || !bytes.equals(readFileSync(sourcePath))) throw new Error('canvas-icu-source-mismatch');
  writeFileSync(targetPath, bytes, { flag: 'wx' });
  const copied = readFileSync(targetPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!bytes.equals(copied) || createHash('sha256').update(copied).digest('hex') !== sha256) {
    throw new Error('canvas-icu-copy-mismatch');
  }
  return [{
    reason: 'missing-declared-windows-arm64-icu',
    upstream: 'https://github.com/Brooooooklyn/canvas/pull/1278',
    upstreamCommit: 'e1a75d1aa888dcdf44467875829d58ea19c6cdd7',
    source: { package: source.name, version: source.version, resolved: source.resolved, integrity: source.integrity,
      tarball: source.filename, entry: 'package/icudtl.dat', path: `node_modules/${source.name}/icudtl.dat` },
    target: { package: target.name, version: target.version, path: `node_modules/${target.name}/icudtl.dat` },
    bytes: bytes.length, sourceSha256: sha256, targetSha256: sha256
  }];
}

function prepare(root) {
  // Validate the complete lock contract before downloads or starting the builder.
  const bindings = canvasBindings(root);
  const destination = path.join(root, 'build/ux2-ocr/platform-tarballs');
  mkdirSync(destination, { recursive: true });
  for (const binding of bindings) {
    const target = path.join(destination, binding.filename);
    if (existsSync(target)) {
      verifyCanvasTarball(target, binding);
      continue;
    }
    const temporary = mkdtempSync(path.join(destination, '.download-'));
    try {
      execFileSync('npm', ['pack', binding.resolved, '--pack-destination', temporary, '--ignore-scripts'],
        { cwd: root, stdio: 'inherit' });
      const downloaded = path.join(temporary, binding.filename);
      verifyCanvasTarball(downloaded, binding);
      renameSync(downloaded, target);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  // No builder invocation is possible after a partial or failed preparation.
  execFileSync(process.execPath, [path.join(root, 'experiments/ux2-ocr/build-trial.mjs'), '--product-assets'],
    { cwd: root, stdio: 'inherit' });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepare(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
