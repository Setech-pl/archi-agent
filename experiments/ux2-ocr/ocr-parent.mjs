import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';

const childFile = fileURLToPath(new URL('./ocr-child.mjs', import.meta.url));
const MAX_INPUT = 50 * 1024 * 1024;
const MAX_IPC = 9 * 1024 * 1024;
const MAX_LOG = 64 * 1024;
const GRACE_MS = 500;
const CLEANUP_MS = 2000;
const HEARTBEAT_MS = 250;
let active = false;

export async function convertPdfIsolated(file, { fullPage = false, dpi = 200, signal, onStage = () => {}, onSpawn = () => {},
  deadlineMs } = {}) {
  if (!isMainThread) throw new Error('ocr-parent-requires-main-thread');
  const started = performance.now();
  const parentCpuStart = process.cpuUsage();
  if (active) throw new Error('ocr-busy');
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('invalid-input-path');
  if (typeof fullPage !== 'boolean' || ![200, 300].includes(dpi)) throw new Error('invalid-options');
  if (signal?.aborted) throw new Error('cancelled');
  let info;
  try { info = await stat(file); } catch { throw new Error('invalid-input-path'); }
  if (!info.isFile()) throw new Error('invalid-input-path');
  if (info.size > MAX_INPUT) throw new Error('input-too-large');
  if (signal?.aborted) throw new Error('cancelled');
  if (active) throw new Error('ocr-busy');
  active = true;
  const budget = deadlineMs ?? (fullPage ? 300_000 : 120_000);
  if (!Number.isInteger(budget) || budget < 1 || budget > 300_000) { active = false; throw new Error('invalid-deadline'); }
  const env = { ...process.env };
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  let child;
  try {
    child = spawn(process.execPath, [childFile], {
      env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true
    });
  } catch {
    active = false;
    throw new Error('child-spawn-error');
  }
  let finishReason, result, exitCode, exitSignal, sawExit = false, sawClose = false, sawDisconnect = false;
  let logBytes = 0, processingMs, resultAt, terminationStarted, startupMs;
  let peakCombinedRss = 0, peakParentRss = 0, peakChildRss = 0;
  let deadlineTimer, graceTimer, cleanupTimer, heartbeatTimer;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const fail = (code) => { finishReason ??= code; };
  const stop = (code) => {
    fail(code);
    if (terminationStarted !== undefined) return;
    terminationStarted = performance.now();
    if (child.connected) { try { child.send({ type: 'cancel' }); } catch { /* exit path handles it */ } }
    graceTimer = setTimeout(() => { if (!sawClose) child.kill('SIGKILL'); }, GRACE_MS);
    cleanupTimer = setTimeout(() => { fail('cleanup-unconfirmed'); resolveDone(); }, GRACE_MS + CLEANUP_MS);
  };
  const scheduleDeadline = (ms) => {
    clearTimeout(deadlineTimer);
    const remaining = ms - (performance.now() - started);
    deadlineTimer = setTimeout(() => stop('timeout'), Math.max(0, remaining));
  };
  const onAbort = () => stop('cancelled');
  signal?.addEventListener('abort', onAbort, { once: true });
  scheduleDeadline(budget);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      logBytes += chunk.length;
      if (logBytes > MAX_LOG) stop('log-limit');
    });
  }
  child.on('message', (message) => {
    if (sawClose || finishReason || !message || typeof message !== 'object') { stop('invalid-ipc'); return; }
    let size;
    try { size = Buffer.byteLength(JSON.stringify(message)); } catch { stop('invalid-ipc'); return; }
    if (size > MAX_IPC) { stop('ipc-limit'); return; }
    if (message.type === 'sample' && Number.isSafeInteger(message.rss) && message.rss >= 0) {
      const parentRss = process.memoryUsage.rss();
      peakParentRss = Math.max(peakParentRss, parentRss);
      peakChildRss = Math.max(peakChildRss, message.rss);
      peakCombinedRss = Math.max(peakCombinedRss, parentRss + message.rss);
      return;
    }
    if (message.type === 'stage' && typeof message.stage === 'string' &&
      ['text-init', 'ocr-candidate', 'render-init', 'render', 'ocr-init', 'recognize', 'tesseract-exit'].includes(message.stage)) {
      startupMs ??= performance.now() - started;
      try { onStage(message.stage); } catch { stop('stage-callback-failed'); return; }
      if (message.stage === 'ocr-candidate' && !fullPage && deadlineMs === undefined &&
        !finishReason && !result) scheduleDeadline(300_000);
      return;
    }
    if (result) { stop('duplicate-result'); return; }
    if (message.type === 'error' && typeof message.code === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(message.code) &&
      Number.isFinite(message.childCpuMs) && message.childCpuMs >= 0) {
      result = { type: 'error', code: message.code, childCpuMs: message.childCpuMs };
      processingMs = performance.now() - started;
      resultAt = performance.now();
      return;
    }
    if (message.type === 'result' && typeof message.markdown === 'string' &&
      Buffer.byteLength(message.markdown) <= 8 * 1024 * 1024 &&
      Array.isArray(message.pages) && message.pages.length <= 300 &&
      Number.isFinite(message.childCpuMs) && message.childCpuMs >= 0 &&
      message.pages.every((p, i) => p && Number.isInteger(p.page) && p.page === i + 1 &&
        ['text', 'ocr', 'blank'].includes(p.source) && (p.imageCount === undefined ||
        (Number.isInteger(p.imageCount) && p.imageCount >= 0)))) {
      result = { type: 'result', pages: message.pages, markdown: message.markdown, childCpuMs: message.childCpuMs };
      processingMs = performance.now() - started;
      resultAt = performance.now();
      return;
    }
    stop('invalid-ipc');
  });
  child.on('error', () => stop('child-spawn-error'));
  child.on('disconnect', () => { sawDisconnect = true; });
  child.on('exit', (code, signalName) => { sawExit = true; exitCode = code; exitSignal = signalName; });
  child.on('close', () => { sawClose = true; resolveDone(); });
  try {
    try { onSpawn(child.pid); } catch { stop('spawn-callback-failed'); }
    try {
      child.send({ type: 'start', file, options: { fullPage, dpi } }, (error) => { if (error) stop('ipc-send-error'); });
    } catch { stop('ipc-send-error'); }
    heartbeatTimer = setInterval(() => {
      if (child.connected && !sawClose) {
        try { child.send({ type: 'heartbeat' }); } catch { stop('ipc-send-error'); }
      }
    }, HEARTBEAT_MS);
    heartbeatTimer.unref();
    if (signal?.aborted) stop('cancelled');
    await done;
    const cleanupMs = performance.now() - (terminationStarted ?? resultAt ?? started);
    const parentCpu = process.cpuUsage(parentCpuStart);
    const parentCpuMs = (parentCpu.user + parentCpu.system) / 1000;
    const failure = !sawClose || !sawExit || !sawDisconnect ? 'cleanup-unconfirmed'
      : finishReason ?? (exitCode !== 0 || exitSignal ? 'unexpected-child-exit'
        : !result ? 'missing-result' : result.type === 'error' ? result.code : undefined);
    if (failure) {
      const error = new Error(failure);
      error.processingMs = processingMs ?? (terminationStarted ?? performance.now()) - started;
      error.cleanupMs = cleanupMs;
      error.childPid = child.pid;
      error.peakCombinedRss = peakCombinedRss;
      error.parentCpuMs = parentCpuMs;
      error.childCpuMs = result?.childCpuMs;
      error.startupMs = startupMs;
      throw error;
    }
    return { pages: result.pages, markdown: result.markdown, processingMs, cleanupMs,
      childPid: child.pid, startupMs, parentCpuMs, childCpuMs: result.childCpuMs,
      peakCombinedRss, peakParentRss, peakChildRss };
  } finally {
    clearTimeout(deadlineTimer); clearTimeout(graceTimer); clearTimeout(cleanupTimer); clearInterval(heartbeatTimer);
    signal?.removeEventListener('abort', onAbort);
    active = false;
  }
}
