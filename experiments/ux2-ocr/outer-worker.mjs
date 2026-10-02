import { parentPort, workerData } from 'node:worker_threads';
const { convert } = await import(workerData.moduleUrl);
try {
  const pages = await convert(workerData.pdf, { onStage: (stage) => parentPort.postMessage({ stage }) });
  parentPort.postMessage({ status: 'success', pages });
} catch (error) {
  parentPort.postMessage({ status: 'error', error: error instanceof Error ? error.message : String(error) });
} finally {
  parentPort.close();
}
