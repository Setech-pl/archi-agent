import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [trial, fixtures] = process.argv.slice(2);
if (!trial || !fixtures) throw new Error('usage: orphan-regression.mjs <trial-dir> <fixtures>');
const worker = new Worker(path.join(here, 'orphan-worker.mjs'), { workerData: {
  parentModule: path.join(trial, 'ocr-parent.mjs'), file: path.join(fixtures, 'twenty.pdf')
} });
const result = await new Promise((resolve, reject) => {
  worker.once('message', resolve);
  worker.once('error', reject);
});
await worker.terminate();
const pass = result?.error === 'ocr-parent-requires-main-thread' && result.pid === undefined;
console.log(JSON.stringify({ outerWorkerTerminated: true, childSpawned: result.pid !== undefined, pass }));
if (!pass) process.exitCode = 1;
