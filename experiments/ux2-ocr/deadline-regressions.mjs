import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(process.argv[2] ?? '');
if (!fixtures || !path.isAbsolute(fixtures)) throw new Error('usage: deadline-regressions.mjs <fixtures>');
const testDir = await mkdtemp(path.join(tmpdir(), 'archi-ux2-deadline-'));
const source = await readFile(process.argv[3] ?? path.join(here, 'ocr-parent.mjs'), 'utf8');
if (!source.includes('120_000') || !source.includes('300_000')) throw new Error('budget-source-mismatch');
await writeFile(path.join(testDir, 'ocr-parent.mjs'), source.replaceAll('120_000', '250').replaceAll('300_000', '700'));
await writeFile(path.join(testDir, 'package.json'), '{"type":"module"}\n');
await writeFile(path.join(testDir, 'ocr-child.mjs'), `
let started = false;
const send = (stage) => process.send({ type: 'stage', stage });
const finish = () => {
  process.send({ type: 'result', pages: [{ page: 1, source: 'blank' }],
    markdown: '## Page 1', childCpuMs: 0 }, () => process.disconnect());
};
process.on('message', (message) => {
  if (message?.type === 'cancel') process.exit(1);
  if (message?.type !== 'start' || started) return;
  started = true;
  const name = message.file.split('/').pop();
  send('text-init');
  if (name !== 'text-only.pdf' && name !== 'oversize-image.pdf') setTimeout(() => send('ocr-candidate'), 20);
  if (name === 'oversize-image.pdf') setTimeout(() => send('ocr-candidate'), 300);
  if (name === 'mixed.pdf' || name === 'blank-only.pdf') {
    setTimeout(() => send('render'), 340);
    setTimeout(finish, 440);
  }
  if (name === 'twenty.pdf') {
    setTimeout(() => send('ocr-candidate'), 310);
    setTimeout(() => send('ocr-candidate'), 550);
  }
  if (name === 'mask.pdf') {
    setTimeout(() => send('render'), 100);
    setTimeout(finish, 120);
  }
  if (name === 'corrupt.pdf') {
    setTimeout(() => send('render'), 100);
    setTimeout(finish, 160);
  }
  if (name === 'good-and-corrupt.pdf') {
    setTimeout(() => { send('render'); finish(); }, 100);
  }
  if (name === 'real-image-over-16mp.pdf') setTimeout(finish, 560);
  if (name === 'good-then-oversize.pdf') setTimeout(finish, 760);
});
`);
const { convertPdfIsolated } = await import(pathToFileURL(path.join(testDir, 'ocr-parent.mjs')));
const input = (name) => path.join(fixtures, `${name}.pdf`);
let passed = 0;
async function check(name, file, options, accept) {
  const start = performance.now();
  let value;
  try { value = await convertPdfIsolated(input(file), options); }
  catch (error) { value = error.message; }
  const elapsed = performance.now() - start;
  const okay = accept(value, elapsed);
  console.log(JSON.stringify({ name, pass: !!okay, actual: typeof value === 'string' ? value : 'success',
    elapsedMs: Math.round(elapsed) }));
  if (!okay) process.exitCode = 1;
  else passed++;
}
const success = (value) => value.pages?.[0]?.source === 'blank';
const timeoutNear = (value, elapsed, target) => value === 'timeout' && elapsed >= target - 20 && elapsed < target + 350;
await check('auto-scan-slow-operator', 'mixed', {}, success);
await check('auto-blank-slow-operator', 'blank-only', {}, success);
await check('auto-candidate-timeout-t0-plus-ocr', 'image-over-16mp', {},
  (value, elapsed) => timeoutNear(value, elapsed, 700));
await check('auto-text-timeout-t0-plus-text', 'text-only', {},
  (value, elapsed) => timeoutNear(value, elapsed, 250));
await check('late-candidate-cannot-reverse-timeout', 'oversize-image', {},
  (value, elapsed) => timeoutNear(value, elapsed, 250));
await check('auto-many-pages-absolute-deadline', 'twenty', {},
  (value, elapsed) => timeoutNear(value, elapsed, 700));
await check('all-starts-with-ocr-deadline', 'text-only', { fullPage: true },
  (value, elapsed) => timeoutNear(value, elapsed, 700));
const cancelled = new AbortController();
await check('cancel-before-final-result', 'corrupt', {
  signal: cancelled.signal, onStage: (stage) => { if (stage === 'render') cancelled.abort(); }
}, (value) => value === 'cancelled');
const candidateCancel = new AbortController();
await check('candidate-cannot-reverse-cancel', 'image-over-16mp', {
  signal: candidateCancel.signal, onStage: (stage) => { if (stage === 'ocr-candidate') candidateCancel.abort(); }
}, (value) => value === 'cancelled');
const closeRace = new AbortController();
await check('cancel-result-race', 'good-and-corrupt', {
  signal: closeRace.signal, onStage: (stage) => { if (stage === 'render') closeRace.abort(); }
}, (value) => value === 'cancelled');
const timeoutRace = new AbortController();
await check('cancel-before-timeout', 'image-over-16mp', {
  signal: timeoutRace.signal, onStage: (stage) => {
    if (stage === 'ocr-candidate') setTimeout(() => timeoutRace.abort(), 500);
  }
}, (value) => value === 'cancelled');
const late = new AbortController();
await check('cancel-after-result', 'mask', { signal: late.signal },
  (value) => { late.abort(); return success(value); });
await check('result-before-ocr-timeout', 'real-image-over-16mp', {}, success);
await check('result-after-ocr-timeout', 'good-then-oversize', {},
  (value, elapsed) => timeoutNear(value, elapsed, 700));
console.log(JSON.stringify({ checks: 14, passed, failed: 14 - passed, testDir }));
