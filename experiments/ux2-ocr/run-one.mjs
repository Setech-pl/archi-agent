import { pathToFileURL } from 'node:url';

const [modulePath, pdfPath, optionsJson = '{}'] = process.argv.slice(2);
if (!modulePath || !pdfPath) throw new Error('usage: run-one.mjs <packaged-convert.mjs> <pdf> [options-json]');
const start = process.hrtime.bigint();
const cpuStart = process.cpuUsage();
let peakRss = process.memoryUsage().rss;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
const stages = [];
try {
  const { convert } = await import(pathToFileURL(modulePath));
  const pages = await convert(pdfPath, {
    ...JSON.parse(optionsJson),
    onStage(stage) { stages.push(stage); process.send?.({ stage }); }
  });
  const cpu = process.cpuUsage(cpuStart);
  console.log(JSON.stringify({ status: 'success', pages, stages, wallMs: Number(process.hrtime.bigint() - start) / 1e6,
    cpuMs: (cpu.user + cpu.system) / 1000, peakRss }));
} catch (error) {
  const cpu = process.cpuUsage(cpuStart);
  console.log(JSON.stringify({ status: 'error', error: error instanceof Error ? error.message : String(error), stages,
    wallMs: Number(process.hrtime.bigint() - start) / 1e6, cpuMs: (cpu.user + cpu.system) / 1000, peakRss }));
  process.exitCode = 1;
} finally {
  clearInterval(sampler);
}
