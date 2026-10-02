import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [modulePath, pdf, cancelStage, delayText = '0', repeatText = '1'] = process.argv.slice(2);
const worker = new Worker(path.join(here, 'outer-worker.mjs'), { workerData: { moduleUrl: pathToFileURL(modulePath).href, pdf } });
let cancelled = false;
worker.on('message', (message) => {
  if (message.stage === cancelStage && !cancelled) {
    cancelled = true;
    setTimeout(() => {
      const exit = new Promise((resolve) => worker.once('exit', resolve));
      for (let i = 0; i < Number(repeatText); i++) worker.terminate();
      void exit.then((code) => console.log(JSON.stringify({ cancelStage, outerExit: code, cancelled, delayMs: Number(delayText), repeats: Number(repeatText) })));
    }, Number(delayText));
  } else if (message.status) console.log(JSON.stringify(message));
});
worker.on('error', (error) => console.log(JSON.stringify({ workerError: error.message })));
