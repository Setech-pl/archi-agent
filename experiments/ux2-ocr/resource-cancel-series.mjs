import { createHook } from 'node:async_hooks';
import { Worker } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const [modulePath, pdf, repeatsText = '10'] = process.argv.slice(2);
if (!modulePath || !pdf) throw new Error('usage: resource-cancel-series.mjs <convert.mjs> <pdf> [repeats-per-stage]');
const repeats = Number(repeatsText);
if (!Number.isInteger(repeats) || repeats < 1) throw new Error('invalid-repeats');
const here = path.dirname(fileURLToPath(import.meta.url));
const liveWorkers = new Set();
const hook = createHook({ init(id, type) { if (type === 'WORKER') liveWorkers.add(id); }, destroy(id) { liveWorkers.delete(id); } }).enable();
const stages = ['text-init', 'render', 'ocr-init', 'recognize'];
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
const memory = () => ({ ...process.memoryUsage(), liveWorkers: liveWorkers.size });
const rows = [];
const before = memory();
for (const stage of stages) for (let index = 0; index < repeats; index++) {
  const worker = new Worker(path.join(here, 'outer-worker.mjs'), { workerData: { moduleUrl: pathToFileURL(modulePath).href, pdf } });
  let result, seen = false;
  const exit = new Promise((resolve, reject) => { worker.once('exit', resolve); worker.once('error', reject); });
  worker.on('message', (message) => {
    if (message.status) result = message.status;
    if (message.stage !== stage || seen) return;
    seen = true;
    for (let repeat = 0; repeat < 3; repeat++) void worker.terminate();
  });
  const code = await exit;
  await pause();
  if (!seen || liveWorkers.size) throw new Error(`cancel-failed-${stage}-${index + 1}`);
  rows.push({ stage, index: index + 1, exitCode: code, result: result ?? null, ...memory() });
}
// A timeout uses the same outer-worker termination path, triggered by a deadline.
for (let index = 0; index < repeats; index++) {
  const worker = new Worker(path.join(here, 'outer-worker.mjs'), { workerData: { moduleUrl: pathToFileURL(modulePath).href, pdf } });
  const exit = new Promise((resolve, reject) => { worker.once('exit', resolve); worker.once('error', reject); });
  const timer = setTimeout(() => { void worker.terminate(); }, 15);
  const code = await exit;
  clearTimeout(timer);
  await pause();
  if (liveWorkers.size) throw new Error(`timeout-worker-retained-${index + 1}`);
  rows.push({ stage: 'timeout', index: index + 1, exitCode: code, ...memory() });
}
hook.disable();
console.log(JSON.stringify({ before, after: memory(), rows }));
