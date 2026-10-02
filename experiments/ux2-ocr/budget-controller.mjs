import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const [nodeBin, childFile] = process.argv.slice(2);
if (!nodeBin || !childFile) throw new Error('usage: budget-controller.mjs <node> <probe-child.mjs>');
const start = performance.now();
let budgetMs = 120_000, timer, timedOut = false;
const stages = [];
const child = spawn(nodeBin, [childFile], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, Math.max(0, budgetMs - (performance.now() - start)));
}
schedule();
child.on('message', (message) => {
  if (message.stage) stages.push({ stage: message.stage, atMs: Math.round(performance.now() - start) });
  if (message.stage === 'ocr-init' && budgetMs === 120_000) {
    budgetMs = 300_000;
    schedule();
  }
});
child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(JSON.stringify({ timedOut, budgetMs, elapsedMs: Math.round(performance.now() - start), code, signal, stages }));
});
