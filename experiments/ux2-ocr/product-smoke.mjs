import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const [extension, fixtures, office] = process.argv.slice(2).map((value) => path.resolve(value));
if (!extension || !fixtures || !office) throw new Error('usage: product-smoke.mjs <extracted-extension> <pdf-fixtures> <office-fixtures>');
const require = createRequire(import.meta.url);
const { convertDocument } = require(path.join(extension, 'dist/archi-agent-runtime.js'));
const pdf = (name) => path.join(fixtures, name);
const run = (name, mode, options = {}) => convertDocument(pdf(name), { pdfOcrMode: mode, ...options });

const text = await run('text-only.pdf', 'none');
assert.equal(text.status, 'success');
assert.match(text.markdown, /TEXT LAYER FIRST/);
const noOcrScan = await run('pl-clean-200.pdf', 'none');
assert.deepEqual(noOcrScan, { status: 'failed', code: 'no-text-layer' });
for (const language of ['pl', 'en']) {
  const result = await run(`${language}-clean-200.pdf`, 'auto');
  assert.equal(result.status, 'success');
  assert.match(result.markdown, /## Page 1 \(OCR\)/);
}
const mixed = await run('mixed.pdf', 'auto');
assert.equal(mixed.status, 'success');
assert.match(mixed.markdown, /## Page 1[\s\S]*TEXT LAYER FIRST[\s\S]*## Page 2 \(OCR\)[\s\S]*## Page 3 \(blank\)/);
const all = await run('mixed.pdf', 'all');
assert.equal(all.status, 'success');
assert.equal(all.counts.pages, 3);
const blank = await run('blank-only.pdf', 'auto');
assert.equal(blank.status, 'success');
const limit = await run('image-over-16mp.pdf', 'auto');
assert.deepEqual(limit, { status: 'failed', code: 'embedded-image-limit' });
const controller = new AbortController();
const cancelled = await run('pl-clean-200.pdf', 'auto', {
  signal: controller.signal,
  onProgress: (stage) => { if (stage === 'recognize') controller.abort(); }
});
assert.deepEqual(cancelled, { status: 'cancelled' });
assert.equal((await run('pl-clean-200.pdf', 'auto')).status, 'success');
for (const [file, format] of [['structured.docx', 'docx'], ['two-sheets.xlsx', 'xlsx']]) {
  const result = await convertDocument(path.join(office, file), { pdfOcrMode: 'none' });
  assert.equal(result.status, 'success');
  assert.equal(result.format, format);
}
console.log('product-smoke PASS: text, PL/EN, mixed, all, blank, limit, Cancel, retry, DOCX, XLSX');
