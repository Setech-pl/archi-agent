const MAX_MARKDOWN = 8 * 1024 * 1024;
const MAX_IPC = 9 * 1024 * 1024;
let started = false;
let intentionalDisconnect = false;
let sampleTimer;
let lastHeartbeat = Date.now();
const heartbeatWatchdog = setInterval(() => {
  if (Date.now() - lastHeartbeat > 5000) process.exit(1);
}, 250);
heartbeatWatchdog.unref();

function send(message) {
  if (!process.connected) return;
  if (Buffer.byteLength(JSON.stringify(message)) > MAX_IPC) throw new Error('ipc-limit');
  process.send(message);
}

function cleanText(value) {
  return value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, ' ');
}
function escapeMarkdown(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([`*_{}\[\]()#+.!|~>-])/g, '\\$1');
}
function markdownOf(pages) {
  const chunks = [];
  let bytes = 0;
  for (const { page, source, text } of pages) {
    const provenance = source === 'ocr' ? ' (OCR)' : source === 'blank' ? ' (blank)' : '';
    const part = `${page === 1 ? '' : '\n\n'}## Page ${page}${provenance}\n\n${text.split('\n').map(escapeMarkdown).join('\n')}`;
    bytes += Buffer.byteLength(part);
    if (bytes > MAX_MARKDOWN) throw new Error('output-too-large');
    chunks.push(part);
  }
  return cleanText(chunks.join('')).trimEnd();
}

process.on('disconnect', () => { if (!intentionalDisconnect) process.exit(1); });
process.on('message', async (message) => {
  if (message?.type === 'heartbeat') { lastHeartbeat = Date.now(); return; }
  if (message?.type === 'cancel') process.exit(1);
  if (started || !message || message.type !== 'start' || typeof message.file !== 'string' ||
    !message.options || typeof message.options.fullPage !== 'boolean' ||
    ![200, 300].includes(message.options.dpi)) process.exit(2);
  started = true;
  lastHeartbeat = Date.now();
  const cpuStart = process.cpuUsage();
  sampleTimer = setInterval(() => send({ type: 'sample', rss: process.memoryUsage.rss() }), 50);
  sampleTimer.unref();
  send({ type: 'sample', rss: process.memoryUsage.rss() });
  try {
    const { convert } = await import('./convert.mjs');
    const pages = await convert(message.file, { ...message.options,
      onStage: (stage) => send({ type: 'stage', stage }) });
    const markdown = markdownOf(pages);
    clearInterval(sampleTimer);
    send({ type: 'sample', rss: process.memoryUsage.rss() });
    const cpu = process.cpuUsage(cpuStart);
    send({ type: 'result', markdown, childCpuMs: (cpu.user + cpu.system) / 1000,
      pages: pages.map(({ page, source, imageCount }) => ({ page, source, imageCount })) });
  } catch (error) {
    clearInterval(sampleTimer);
    const code = error instanceof Error && /^[a-z][a-z0-9-]{0,63}$/.test(error.message)
      ? error.message : 'conversion-failed';
    const cpu = process.cpuUsage(cpuStart);
    send({ type: 'error', code, childCpuMs: (cpu.user + cpu.system) / 1000 });
  } finally {
    intentionalDisconnect = true;
    process.disconnect();
  }
});
