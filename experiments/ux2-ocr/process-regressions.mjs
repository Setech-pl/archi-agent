import { readFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [trial, fixtures] = process.argv.slice(2);
if (!trial || !fixtures) throw new Error('usage: process-regressions.mjs <trial-dir> <fixtures>');
const { convertPdfIsolated } = await import(pathToFileURL(path.join(trial, 'ocr-parent.mjs')));
const input = (name) => path.join(fixtures, `${name}.pdf`);
let checks = 0;
async function check(name, run, expected) {
  let actual;
  try { actual = await run(); } catch (error) { actual = error.message; }
  const pass = expected(actual);
  console.log(JSON.stringify({ name, pass, actual: typeof actual === 'string' ? actual : 'success' }));
  checks++;
  if (!pass) process.exitCode = 1;
}
const sources = ['mixed', 'text-only', 'image-over-16mp', 'good-then-oversize',
  'real-image-over-16mp', 'good-then-corrupt', 'repeat-corrupt', 'shared-corrupt'];
const sourceHashes = await Promise.all(sources.map(async (name) => createHash('sha256').update(await readFile(input(name))).digest('hex')));
await check('success', () => convertPdfIsolated(input('mixed')), (result) => result.pages?.map((p) => p.source).join(',') === 'text,ocr,blank');
await check('text', () => convertPdfIsolated(input('text-only')), (result) => result.pages?.every((p) => p.source === 'text'));
const blankStages = [];
await check('blank-no-ocr', () => convertPdfIsolated(input('blank-only'), { onStage: (stage) => blankStages.push(stage) }),
  (result) => result.pages?.[0]?.source === 'blank' && blankStages.includes('ocr-candidate') &&
    !blankStages.includes('ocr-init'));
for (const name of ['image-over-16mp', 'good-then-oversize', 'real-image-over-16mp'])
  await check(name, () => convertPdfIsolated(input(name)), (result) => result === 'embedded-image-limit');
for (const name of ['good-then-corrupt', 'repeat-corrupt', 'shared-corrupt'])
  await check(name, () => convertPdfIsolated(input(name)), (result) => result === 'image-decode-failed');
await check('twenty-ocr', () => convertPdfIsolated(input('twenty')), (result) => result.pages?.length === 20);
await check('twenty-one-ocr', () => convertPdfIsolated(input('twenty-one')), (result) => result === 'too-many-ocr-pages');
await check('single-active-process', async () => {
  const [first, second] = await Promise.allSettled([
    convertPdfIsolated(input('mixed')), convertPdfIsolated(input('mixed'))
  ]);
  return [first, second].map((item) => item.status === 'fulfilled' ? 'success' : item.reason.message).sort().join(',');
}, (result) => result === 'ocr-busy,success');
for (const stage of ['text-init', 'render', 'ocr-init', 'recognize']) {
  const controller = new AbortController();
  await check(`cancel-${stage}`, () => convertPdfIsolated(input('mixed'), { signal: controller.signal,
    onStage: (seen) => { if (seen === stage) controller.abort(); } }), (result) => result === 'cancelled');
}
await check('timeout', () => convertPdfIsolated(input('mixed'), { deadlineMs: 1 }), (result) => result === 'timeout');
let killedPid;
await check('killed-child', () => convertPdfIsolated(input('mixed'), {
  onSpawn: (pid) => { killedPid = pid; process.kill(pid, 'SIGKILL'); }
}), (result) => result === 'unexpected-child-exit' || result === 'ipc-send-error');
await check('killed-child-reaped', async () => {
  try { process.kill(killedPid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}, (result) => result === true);
const afterSuccess = new AbortController();
await check('late-cancel', async () => {
  const result = await convertPdfIsolated(input('text-only'), { signal: afterSuccess.signal });
  afterSuccess.abort();
  return result;
}, (result) => result.pages?.length === 2);
const binding = path.join(trial, 'node_modules/@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node');
await rename(binding, `${binding}.hidden`);
try { await check('missing-binding', () => convertPdfIsolated(input('mixed')), (result) => result === 'canvas-binding-unavailable'); }
finally { await rename(`${binding}.hidden`, binding); }
const model = path.join(trial, 'assets/lang/pol.traineddata');
await rename(model, `${model}.hidden`);
try { await check('missing-model', () => convertPdfIsolated(input('mixed')), (result) => result === 'ocr-model-unavailable'); }
finally { await rename(`${model}.hidden`, model); }
for (let i = 0; i < sources.length; i++) {
  const digest = createHash('sha256').update(await readFile(input(sources[i]))).digest('hex');
  await check(`source-sha-${sources[i]}`, async () => digest, (value) => value === sourceHashes[i]);
}
console.log(JSON.stringify({ checks, failed: process.exitCode ? 1 : 0 }));
