import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openVsix } from '../../vscode-extension/scripts/vsix-zip.mjs';
import { canvasBindings, canvasPlatforms, supplementWindowsArm64Icu, verifyCanvasTarball } from '../../scripts/prepare-ci-ocr.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const build = path.join(root, 'build/ux2-ocr');
const productAssets = process.argv[2] === '--product-assets';
const stage = path.join(build, productAssets ? 'phase2/stage' : 'review-findings/stage');
const trial = path.join(stage, productAssets ? 'extension/ux2-ocr' : 'extension/ux2-trial');
const sourceModules = path.join(here, 'node_modules');
const targetModules = path.join(trial, 'node_modules');
const baseline = path.join(root, 'vscode-extension/build/cl1-final-alpha.3/archi-agent-0.3.0-alpha.3.vsix');
const candidate = path.join(build, 'review-findings/archi-agent-0.3.0-alpha.3-ux2-review-findings.vsix');
const externalManifest = productAssets ? path.join(build, 'phase2/resource-manifest.json') : path.join(here, 'trial-manifest.json');
const patchFile = path.join(here, 'patches/pdfjs-dist-4.10.38-operator-list-error.patch');
const originalPdfHash = '081d3b6f426d38a8029766f8839f505e9cbf2c81a71d62c26eada142e6c21ae4';
const originalWorkerHash = '5e9f76bd5e65fbd1602b29fc50e50490aeeacd34a715b2282b73f7e8029242e0';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bindings = canvasBindings(root);
// Direct packaging calls must also reject missing/corrupt inputs before clearing the stage.
for (const binding of bindings) {
  verifyCanvasTarball(path.join(build, 'platform-tarballs', binding.filename), binding);
}
if (!productAssets && hash(readFileSync(baseline)) !== '7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056') throw new Error('baseline-hash-mismatch');
const alpha = productAssets ? undefined : openVsix(baseline);
rmSync(stage, { recursive: true, force: true });
mkdirSync(targetModules, { recursive: true });
copyFileSync(path.join(here, 'convert.mjs'), path.join(trial, 'convert.mjs'));
copyFileSync(path.join(here, 'ocr-parent.mjs'), path.join(trial, 'ocr-parent.mjs'));
copyFileSync(path.join(here, 'ocr-child.mjs'), path.join(trial, 'ocr-child.mjs'));
copyFileSync(path.join(here, 'TRIAL_NOTICES.md'), path.join(trial, 'TRIAL_NOTICES.md'));
mkdirSync(path.join(trial, 'licenses'), { recursive: true });
copyFileSync(path.join(here, 'licenses/SKIA-LICENSE'), path.join(trial, 'licenses/SKIA-LICENSE'));
cpSync(path.join(here, 'assets/lang'), path.join(trial, 'assets/lang'), { recursive: true });

const copyPackage = (name, pieces) => {
  const src = path.join(sourceModules, name), dest = path.join(targetModules, name);
  mkdirSync(dest, { recursive: true });
  for (const piece of pieces) {
    const from = path.join(src, piece);
    if (!existsSync(from)) throw new Error(`ocr-resource-missing: ${name}/${piece}`);
    cpSync(from, path.join(dest, piece), { recursive: true });
  }
};
copyPackage('pdfjs-dist', ['package.json', 'LICENSE', 'cmaps', 'standard_fonts', 'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs']);
const pdfPackage = JSON.parse(readFileSync(path.join(targetModules, 'pdfjs-dist/package.json'), 'utf8'));
if (pdfPackage.version !== '4.10.38') throw new Error('pdfjs-version-mismatch');
const pdfFile = path.join(targetModules, 'pdfjs-dist/legacy/build/pdf.mjs');
const workerFile = path.join(targetModules, 'pdfjs-dist/legacy/build/pdf.worker.mjs');
if (hash(readFileSync(pdfFile)) !== originalPdfHash) throw new Error('pdfjs-original-hash-mismatch');
if (hash(readFileSync(workerFile)) !== originalWorkerHash) throw new Error('pdfjs-worker-hash-mismatch');
execFileSync('patch', ['--batch', '--fuzz=0', '-p1', '-d', path.dirname(pdfFile), '-i', patchFile]);
rmSync(`${pdfFile}.orig`, { force: true });
const patchedPdfHash = hash(readFileSync(pdfFile));
if (patchedPdfHash === originalPdfHash) throw new Error('pdfjs-patch-no-change');
copyPackage('unpdf', ['package.json', 'LICENSE', 'dist']);
copyPackage('@napi-rs/canvas', ['package.json', 'LICENSE', 'index.js', 'js-binding.js', 'geometry.js', 'load-image.js', 'node-canvas.js']);
copyPackage('tesseract.js', ['package.json', 'LICENSE.md', 'src']);
copyPackage('tesseract.js-core', ['package.json', 'LICENSE', 'index.js',
  'tesseract-core.js', 'tesseract-core.wasm.js', 'tesseract-core.wasm',
  'tesseract-core-simd.js', 'tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm',
  'tesseract-core-lstm.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm']);
for (const name of ['bmp-js', 'idb-keyval', 'is-url', 'node-fetch', 'regenerator-runtime',
  'wasm-feature-detect', 'zlibjs', 'whatwg-url', 'tr46', 'webidl-conversions']) {
  cpSync(path.join(sourceModules, name), path.join(targetModules, name), { recursive: true });
}
for (const binding of bindings) {
  const dest = path.join(targetModules, binding.name);
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', path.join(build, 'platform-tarballs', binding.filename), '-C', dest, '--strip-components=1']);
  const pkg = JSON.parse(readFileSync(path.join(dest, 'package.json'), 'utf8'));
  if (pkg.name !== binding.name || pkg.version !== binding.version) throw new Error(`canvas-package-mismatch: ${binding.name}`);
  if (!Array.isArray(pkg.files) || !pkg.files.includes(`skia.${binding.platform}.node`)) {
    throw new Error(`canvas-binding-not-declared: ${binding.name}`);
  }
}
const canvasResourceSupplements = productAssets
  ? supplementWindowsArm64Icu(targetModules, path.join(build, 'platform-tarballs'), bindings) : [];
// The single approved repair must precede the unchanged completeness check for all platforms.
for (const binding of bindings) {
  const dest = path.join(targetModules, binding.name);
  const pkg = JSON.parse(readFileSync(path.join(dest, 'package.json'), 'utf8'));
  for (const resource of pkg.files) {
    if (typeof resource !== 'string' || path.basename(resource) !== resource ||
        !statSync(path.join(dest, resource)).isFile() || statSync(path.join(dest, resource)).size === 0) {
      throw new Error(`canvas-resource-missing: ${binding.name}/${resource}`);
    }
  }
}

for (const [name, version] of Object.entries({ 'pdfjs-dist': '4.10.38', 'tesseract.js': '6.0.1',
  'tesseract.js-core': '6.1.2', '@napi-rs/canvas': '0.1.97', unpdf: '1.7.0' })) {
  const pkg = JSON.parse(readFileSync(path.join(targetModules, name, 'package.json'), 'utf8'));
  if (pkg.name !== name || pkg.version !== version) throw new Error(`ocr-package-mismatch: ${name}`);
}
for (const resource of ['assets/lang/pol.traineddata', 'assets/lang/eng.traineddata', 'assets/lang/LICENSE-tessdata-fast']) {
  if (statSync(path.join(trial, resource)).size === 0) throw new Error(`ocr-resource-empty: ${resource}`);
}

function filesUnder(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? filesUnder(path.join(dir, entry.name), relative) : [relative];
  });
}
const files = filesUnder(trial).sort().map((relative) => {
  const bytes = readFileSync(path.join(trial, relative));
  return { path: relative, bytes: bytes.length, sha256: hash(bytes) };
});
const manifest = {
  schema: 2,
  baselineSha256: '7b9cc84b9ce7070abee33fe08cc19636efe2c2271d9aea3f4cd6bd0a1bad1056',
  pdfjsPatch: { version: '4.10.38', originalSha256: originalPdfHash,
    patchSha256: hash(readFileSync(patchFile)), patchedSha256: patchedPdfHash,
    workerSha256: originalWorkerHash },
  baselineEntries: alpha?.entries.map((entry) => ({ path: entry.name, bytes: alpha.read(entry.name).length, sha256: hash(alpha.read(entry.name)) })) ?? [],
  versions: { 'pdfjs-dist': '4.10.38', 'tesseract.js': '6.0.1', 'tesseract.js-core': '6.1.2', '@napi-rs/canvas': '0.1.97', unpdf: '1.7.0', tessdata_fast: '4.1.0' },
  platforms: canvasPlatforms,
  canvasResourceSupplements,
  files
};
mkdirSync(path.dirname(externalManifest), { recursive: true });
writeFileSync(externalManifest, JSON.stringify(manifest, null, 2) + '\n');
copyFileSync(externalManifest, path.join(trial, 'resource-manifest.json'));
const fixedTime = new Date('2024-01-01T00:00:00Z');
for (const relative of filesUnder(trial)) utimesSync(path.join(trial, relative), fixedTime, fixedTime);
if (process.argv[2] === '--prepare-only' || productAssets) {
  console.log(JSON.stringify({ trial, manifest: externalManifest, patchedPdfHash }));
  process.exit(0);
}
mkdirSync(path.dirname(candidate), { recursive: true });
copyFileSync(baseline, candidate);
execFileSync('zip', ['-q', '-r', '-D', '-X', candidate, 'extension/ux2-trial'], { cwd: stage });
console.log(JSON.stringify({ candidate, bytes: statSync(candidate).size, sha256: hash(readFileSync(candidate)), resources: files.length, resourceBytes: files.reduce((n, f) => n + f.bytes, 0) }));
