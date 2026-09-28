import { parentPort, workerData } from "node:worker_threads";
import { convertLocalDocument } from "./convert.js";

// Third-party parsers must not print warnings that could contain document content or paths.
console.log = () => undefined;
console.info = () => undefined;
console.warn = () => undefined;
console.error = () => undefined;

const filePath = (workerData as { readonly filePath?: unknown } | undefined)?.filePath;
const result = typeof filePath === "string"
  ? convertLocalDocument(filePath)
  : Promise.resolve({ status: "failed" as const, code: "non-local-source" as const });
void result.then((outcome) => {
  parentPort?.postMessage(outcome);
  parentPort?.close();
}, () => {
  parentPort?.postMessage({ status: "failed", code: "conversion-failed" });
  parentPort?.close();
});
