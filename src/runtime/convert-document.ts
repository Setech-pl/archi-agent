import { getDocumentConversionCapabilities, distributionDirectory } from "./document-conversion-capabilities.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { conversionLimits, formatFromPath, type ConvertErrorCode, type ConvertOutcome } from "../core/document-conversion/contract.js";

export type PdfOcrMode = "none" | "auto" | "all";
const ocrErrors = new Set<ConvertErrorCode>([
  "input-too-large", "too-many-pages", "too-many-ocr-pages", "canvas-limit", "embedded-image-limit",
  "image-decode-failed", "canvas-binding-unavailable", "ocr-model-unavailable", "ocr-model-corrupt",
  "ocr-busy", "output-too-large", "timeout"
]);

export interface ConvertDocumentOptions {
  readonly signal?: AbortSignal;
  /** Trusted installation composition seam; never supplied by a source/tool argument. */
  readonly distributionDirectory?: string;
  /** Allows an embedding host or isolated test to point at its sibling worker bundle. */
  readonly workerFile?: string;
  readonly timeoutMs?: number;
  readonly pdfOcrMode?: PdfOcrMode;
  readonly onProgress?: (stage: string) => void;
  /** Test seam for the separately packaged local OCR parent. */
  readonly ocrParentFile?: string;
}

/** One disposable worker makes Cancel and timeout enforceable for synchronous parsers. */
export async function convertDocument(filePath: string, options: ConvertDocumentOptions = {}): Promise<ConvertOutcome> {
  if (options.signal?.aborted) return { status: "cancelled" };
  const mode = options.pdfOcrMode ?? "none";
  if (mode !== "none" && mode !== "auto" && mode !== "all") return { status: "failed", code: "conversion-failed" };
  if (formatFromPath(filePath) === "pdf" && mode !== "none") {
    const capabilities=await getDocumentConversionCapabilities({distributionDirectory:options.distributionDirectory,validateOcr:true,signal:options.signal});
    if(options.signal?.aborted)return {status:"cancelled"};
    if(capabilities.ocr==="installation-error")return {status:"failed",code:capabilities.code==="installation-invalid"?"installation-invalid":"ocr-installation-invalid"};
    if(capabilities.profile==="core") {
      if(mode==="all")return {status:"failed",code:"ocr-unavailable",reason:"not-installed"};
      const text=await convertDocument(filePath,{...options,pdfOcrMode:"none"});
      if(text.status!=="success")return text;
      const pages=text.coverage?.pages??[];const missing=pages.filter(p=>p.source==="requires-ocr").map(p=>p.page);
      return missing.length?{status:"failed",code:"ocr-unavailable",reason:"not-installed",pagesRequiringOcr:missing,coverage:{pages:pages.map(p=>({page:p.page,source:p.source==="text"?"text":"requires-ocr",...(p.source==="requires-ocr"?{reason:"no-extractable-text" as const}:{})})),warnings:["no-extractable-text"]}}:text;
    }
    try {
      const parentFile = options.ocrParentFile ?? path.join(options.distributionDirectory ?? distributionDirectory(), "ux2-ocr", "ocr-parent.mjs");
      const module = await import(pathToFileURL(parentFile).href) as {
        convertPdfIsolated: (file: string, settings: { fullPage: boolean; signal?: AbortSignal; onStage?: (stage: string) => void }) =>
          Promise<{ markdown: string; pages: readonly { page: number; source: "text" | "ocr" | "blank" }[] }>;
      };
      if (options.signal?.aborted) return { status: "cancelled" };
      const result = await module.convertPdfIsolated(filePath, {
        fullPage: mode === "all", signal: options.signal, onStage: options.onProgress
      });
      return { status: "success", format: "pdf", markdown: result.markdown, counts: { pages: result.pages.length }, coverage: { pages: result.pages.map(({ page, source }) => ({ page, source })), warnings: ["layout-not-preserved", "ocr-confidence-unavailable"] } };
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.message === "cancelled")) return { status: "cancelled" };
      const code = error instanceof Error ? error.message : "";
      return { status: "failed", code: ocrErrors.has(code as ConvertErrorCode) ? code as ConvertErrorCode : "conversion-failed" };
    }
  }
  const workerFile = options.workerFile ?? path.join(__dirname, "archi-agent-converter-worker.js");
  const timeoutMs = Math.min(conversionLimits.timeoutMs, Math.max(1, options.timeoutMs ?? conversionLimits.timeoutMs));
  return await new Promise<ConvertOutcome>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(workerFile, {
        workerData: { filePath },
        resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 }
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
      void worker.terminate().then(() => resolve(outcome), () => resolve({ status: "failed", code: "conversion-failed" }));
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
