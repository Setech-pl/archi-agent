import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MiB = 1024 * 1024;
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const memory = () => {
  const { rss, heapUsed, heapTotal, external, arrayBuffers } = process.memoryUsage();
  return { rss, heapUsed, heapTotal, external, arrayBuffers };
};
const gone = (pid) => {
  try { process.kill(pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true; throw error; }
};

export async function runSeries({ trial, pdf, output, count = 300 }) {
  const { convertPdfIsolated } = await import(pathToFileURL(path.join(trial, 'ocr-parent.mjs')));
  const report = { kind: 'ocr-process-series', runtime: { node: process.versions.node,
    electron: process.versions.electron ?? null, arch: process.arch, execPath: process.execPath,
    pid: process.pid }, trial, pdf, count, sampleMethod: '25 ms settle; no forced GC; points 0, 1, 25..300',
    samples: [], runs: [], status: 'running' };
  const started = performance.now();
  const sample = async (conversions) => {
    await settle();
    report.samples.push({ conversions, wallMs: performance.now() - started, ...memory(), liveOcrChildren: 0 });
    write(output, report);
  };
  await sample(0);
  for (let index = 1; index <= count; index++) {
    const result = await convertPdfIsolated(pdf);
    if (result.pages.length !== 1 || result.pages[0].source !== 'ocr' || !gone(result.childPid))
      throw new Error(`unexpected-result-or-child-${index}`);
    report.runs.push({ index, processingMs: result.processingMs, cleanupMs: result.cleanupMs,
      startupMs: result.startupMs, parentCpuMs: result.parentCpuMs, childCpuMs: result.childCpuMs,
      peakCombinedRss: result.peakCombinedRss, peakParentRss: result.peakParentRss,
      peakChildRss: result.peakChildRss });
    if (index === 1 || index % 25 === 0 || index === count) await sample(index);
  }
  const at = (n) => report.samples.find((item) => item.conversions === n);
  const growth = count === 300 ? Object.fromEntries(['rss', 'external', 'arrayBuffers'].map((key) => [key, at(300)[key] - at(200)[key]])) : null;
  report.summary = { growth200to300: growth, endRss: at(count).rss,
    wallMs: performance.now() - started,
    maxSimultaneousCombinedRss: Math.max(...report.runs.map((run) => run.peakCombinedRss)),
    totalParentCpuMs: report.runs.reduce((sum, run) => sum + run.parentCpuMs, 0),
    totalChildCpuMs: report.runs.reduce((sum, run) => sum + run.childCpuMs, 0),
    meanStartupMs: report.runs.reduce((sum, run) => sum + run.startupMs, 0) / count,
    meanProcessingMs: report.runs.reduce((sum, run) => sum + run.processingMs, 0) / count,
    meanCleanupMs: report.runs.reduce((sum, run) => sum + run.cleanupMs, 0) / count,
    stabilityPass: growth ? Object.values(growth).every((value) => value <= 32 * MiB) : null };
  report.status = 'complete';
  write(output, report);
  return report.summary;
}

export async function runCancelSeries({ trial, pdf, output, repeats = 10 }) {
  const { convertPdfIsolated } = await import(pathToFileURL(path.join(trial, 'ocr-parent.mjs')));
  const report = { kind: 'ocr-process-cancel-series', runtime: { node: process.versions.node,
    electron: process.versions.electron ?? null, arch: process.arch, execPath: process.execPath,
    pid: process.pid }, trial, pdf, repeats, sampleMethod: '25 ms settle after each sample; no forced GC',
    before: memory(), rows: [], status: 'running' };
  for (const stage of ['text-init', 'render', 'ocr-init', 'recognize', 'timeout']) {
    for (let index = 1; index <= repeats; index++) {
      const controller = new AbortController();
      let error;
      try {
        await convertPdfIsolated(pdf, stage === 'timeout' ? { deadlineMs: 1 }
          : { signal: controller.signal, onStage: (seen) => { if (seen === stage) controller.abort(); } });
      } catch (caught) { error = caught; }
      const expected = stage === 'timeout' ? 'timeout' : 'cancelled';
      if (error?.message !== expected || !gone(error.childPid)) throw new Error(`cancel-failed-${stage}-${index}`);
      await settle();
      report.rows.push({ stage, index, code: error.message, processingMs: error.processingMs,
        cleanupMs: error.cleanupMs, startupMs: error.startupMs, parentCpuMs: error.parentCpuMs,
        childCpuMs: error.childCpuMs ?? null, peakCombinedRss: error.peakCombinedRss,
        ...memory(), liveOcrChildren: 0 });
      write(output, report);
    }
  }
  report.after = memory();
  report.status = 'complete';
  write(output, report);
  return { before: report.before, after: report.after, rows: report.rows.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [mode, trial, pdf, output] = process.argv.slice(2);
  const summary = mode === 'series' ? await runSeries({ trial, pdf, output })
    : mode === 'cancel' ? await runCancelSeries({ trial, pdf, output })
      : (() => { throw new Error('usage: measure-process-series.mjs series|cancel <trial> <pdf> <output>'); })();
  console.log(JSON.stringify(summary));
}
