import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
const { convertPdfIsolated } = await import(pathToFileURL(workerData.parentModule));
try {
  await convertPdfIsolated(workerData.file, { onSpawn: (pid) => parentPort.postMessage({ pid }) });
} catch (error) { parentPort.postMessage({ error: error.message }); }
