import path from "node:path";
import { Worker } from "node:worker_threads";
import { conversionLimits, type ConvertOutcome } from "../core/document-conversion/contract.js";

export interface ConvertDocumentOptions {
  readonly signal?: AbortSignal;
  /** Allows an embedding host or isolated test to point at its sibling worker bundle. */
  readonly workerFile?: string;
  readonly timeoutMs?: number;
}

/** One disposable worker makes Cancel and the 30-second timeout enforceable for synchronous parsers. */
export async function convertDocument(filePath: string, options: ConvertDocumentOptions = {}): Promise<ConvertOutcome> {
  if (options.signal?.aborted) return { status: "cancelled" };
  const workerFile = options.workerFile ?? path.join(__dirname, "archi-agent-converter-worker.js");
  const timeoutMs = Math.min(conversionLimits.timeoutMs, Math.max(1, options.timeoutMs ?? conversionLimits.timeoutMs));
  return await new Promise<ConvertOutcome>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(workerFile, {
        workerData: { filePath },
        resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 }
      });
    } catch {
      resolve({ status: "failed", code: "conversion-failed" });
      return;
    }
    let settled = false;
    const finish = (outcome: ConvertOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      void worker.terminate();
      resolve(outcome);
    };
    const cancel = (): void => finish({ status: "cancelled" });
    const timer = setTimeout(() => finish({ status: "failed", code: "timeout" }), timeoutMs);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    worker.once("message", (message: ConvertOutcome) => finish(message));
    worker.once("error", () => finish({ status: "failed", code: "conversion-failed" }));
    worker.once("exit", () => finish({ status: "failed", code: "conversion-failed" }));
  });
}
