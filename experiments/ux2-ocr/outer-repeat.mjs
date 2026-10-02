import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const [modulePath, pdf, countText = '100'] = process.argv.slice(2);
if (!modulePath || !pdf) throw new Error('usage: outer-repeat.mjs <packaged-convert.mjs> <pdf> [count]');
const samples = [];
for (let i = 0; i < Number(countText); i++) {
  const worker = new Worker(path.join(here, 'outer-worker.mjs'), { workerData: { moduleUrl: pathToFileURL(modulePath).href, pdf } });
  let status;
  worker.on('message', (message) => { if (message.status) status = message.status; });
  const code = await new Promise((resolve, reject) => { worker.once('exit', resolve); worker.once('error', reject); });
  if (code !== 0 || status !== 'success') throw new Error(`outer-worker-failed-${i + 1}`);
  global.gc?.();
  if ((i + 1) % 25 === 0) samples.push({ conversions: i + 1, rssMiB: Math.round(process.memoryUsage().rss / 1048576) });
}
console.log(JSON.stringify(samples));
