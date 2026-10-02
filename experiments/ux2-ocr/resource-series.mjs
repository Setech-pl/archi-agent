import { createHook } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';

const [modulePath, pdf, countText = '300'] = process.argv.slice(2);
if (!modulePath || !pdf) throw new Error('usage: resource-series.mjs <convert.mjs> <pdf> [count]');
const count = Number(countText);
if (!Number.isInteger(count) || count < 1) throw new Error('invalid-count');

const workers = new Set();
const hook = createHook({
  init(id, type) { if (type === 'WORKER') workers.add(id); },
  destroy(id) { workers.delete(id); }
}).enable();
const { convert } = await import(pathToFileURL(modulePath));
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
async function sample(conversions, wallMs) {
  await settle();
  global.gc?.(); // Diagnostic only; conversion never depends on exposed GC.
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  return { conversions, wallMs, rss, heapUsed, heapTotal, external, arrayBuffers, liveWorkers: workers.size };
}
const samples = [await sample(0, 0)];
const start = process.hrtime.bigint();
for (let index = 1; index <= count; index++) {
  const pages = await convert(pdf);
  if (pages.length === 0 || pages.some((page) => !['text', 'ocr'].includes(page.source))) throw new Error(`unexpected-result-${index}`);
  if (index === 1 || index % 25 === 0) {
    const point = await sample(index, Number(process.hrtime.bigint() - start) / 1e6);
    samples.push(point);
    process.stdout.write(JSON.stringify(point) + '\n');
    if (point.liveWorkers) throw new Error(`worker-retained-after-${index}`);
  }
}
hook.disable();
process.stdout.write(JSON.stringify({ status: 'complete', conversions: count, samples }) + '\n');
