import { constants } from "node:fs";
import { lstat, open, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import type { StructuredChatClient } from "../core/llm/structured-chat-client.js";
import { safeErrorCode } from "../core/llm/structured-chat-client.js";
import { convertDocument, type ConvertDocumentOptions, type PdfOcrMode } from "./convert-document.js";
import type { GeneratorConfig } from "./runtime-types.js";
import {
  documentCandidateLimits as limits, DocumentCandidateError, candidateCanonical, candidateDigest,
  freezeDocumentValue, normalizeDocumentText, validateDocumentCandidates, documentCandidateJsonSchema,
  documentCandidateSystemPrompt, type DocumentSource, type DocumentCandidateResult
} from "../core/knowledge-pack/builder/document-candidates.js";

export interface ExtractDocumentCandidatesRequest {
  readonly documents: readonly { readonly path: string; readonly pdfOcrMode?: PdfOcrMode }[];
  readonly generator: GeneratorConfig | ((signal: AbortSignal) => Promise<GeneratorConfig | undefined>);
  readonly signal?: AbortSignal;
  /** May only lower the absolute K2 deadline. */
  readonly timeoutMs?: number;
}
export type ExtractDocumentCandidatesOutcome =
  | { readonly status: "success"; readonly result: DocumentCandidateResult; readonly logicalRequests: 1 }
  | { readonly status: "failed" | "cancelled"; readonly stage: string; readonly code: string; readonly logicalRequests: 0 | 1 };
export interface DocumentExtractionOptions {
  /** Existing converter composition seam; production resolves sibling packaged resources. */
  readonly conversion?: Pick<ConvertDocumentOptions, "workerFile" | "ocrParentFile">;
}
const sha = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const size = (value: unknown): number => Buffer.byteLength(candidateCanonical(value));

/** Frozen bounded read, one conversion per explicit source and exactly one structured generation. */
export async function extractDocumentCandidates(
  request: ExtractDocumentCandidatesRequest,
  resolveClient: (signal: AbortSignal) => Promise<{ readonly ok: true; readonly client: StructuredChatClient } | { readonly ok: false; readonly issues: readonly { readonly code: string }[] }> | { readonly ok: true; readonly client: StructuredChatClient } | { readonly ok: false; readonly issues: readonly { readonly code: string }[] },
  options: DocumentExtractionOptions = {}
): Promise<ExtractDocumentCandidatesOutcome> {
  let logicalRequests: 0 | 1 = 0;
  let stage = "input";
  let temporary: string | undefined;
  const controller = new AbortController();
  let timedOut = false;
  let stageTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  if (request.signal?.aborted) controller.abort();
  const timeout = () => { timedOut = true; controller.abort(); };
  const duration = request.timeoutMs ?? limits.operationMs;
  const timer = setTimeout(timeout, Number.isSafeInteger(duration) && duration > 0 ? Math.min(duration, limits.operationMs) : 1);
  const check = () => {
    if (controller.signal.aborted) throw new DocumentCandidateError(timedOut ? "timeout" : "cancelled", stage);
  };
  const enter = (next: string, budget: number) => {
    check(); stage = next; clearTimeout(stageTimer); stageTimer = setTimeout(timeout, budget);
  };
  try {
    check();
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > limits.operationMs ||
        !Array.isArray(request.documents) || request.documents.length < 1 || request.documents.length > limits.documents)
      throw new DocumentCandidateError("invalid-document-input", stage);
    const paths = new Set<string>();
    const types = request.documents.map((d) => {
      const type = typeof d?.path === "string" ? path.extname(d.path).slice(1).toLowerCase() : "";
      if (!d || !path.isAbsolute(d.path) || !["md", "txt", "pdf", "docx", "xlsx"].includes(type) ||
          paths.has(d.path) || (d.pdfOcrMode !== undefined && (!(["none", "auto", "all"] as unknown[]).includes(d.pdfOcrMode) || type !== "pdf")))
        throw new DocumentCandidateError("invalid-document-input", stage);
      paths.add(d.path);
      return type as DocumentSource["type"];
    });
    temporary = await mkdtemp(path.join(tmpdir(), "archi-k2-"));
    const sources: DocumentSource[] = [];
    let totalBytes = 0;
    for (let index = 0; index < request.documents.length; index++) {
      const d = request.documents[index]!;
      const type = types[index]!;
      enter("read", limits.readMs);
      // A regular descriptor, no final symlink or device, bounded chunk reads with cancellation checks.
      const initial = await lstat(d.path);
      check();
      if (!initial.isFile()) throw new DocumentCandidateError("not-a-file", stage);
      if (initial.size > limits.inputBytes) throw new DocumentCandidateError("input-too-large", stage);
      const handle = await open(d.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      let bytes: Buffer;
      try {
        check();
        const stat = await handle.stat();
        if (!stat.isFile()) throw new DocumentCandidateError("not-a-file", stage);
        if (stat.size > limits.inputBytes) throw new DocumentCandidateError("input-too-large", stage);
        const chunks: Buffer[] = [];
        let used = 0;
        for (;;) {
          check();
          const chunk = Buffer.alloc(Math.min(64 * 1024, limits.inputBytes + 1 - used));
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, used);
          check();
          if (!bytesRead) break;
          used += bytesRead;
          if (used > limits.inputBytes || totalBytes + used > limits.totalInputBytes)
            throw new DocumentCandidateError("input-too-large", stage);
          chunks.push(chunk.subarray(0, bytesRead));
        }
        bytes = Buffer.concat(chunks, used);
      } finally { await handle.close(); }
      totalBytes += bytes.length;
      if (!bytes.length) throw new DocumentCandidateError("empty-source", stage);
      const originalDigest = sha(bytes);
      let text: string;
      let conversion: DocumentSource["conversion"];
      const mode = d.pdfOcrMode ?? "none";
      if (type === "md" || type === "txt") {
        text = normalizeDocumentText(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
        conversion = { engine: "utf8", ocrMode: "none", counts: {}, pages: [], warnings: [], locations: "normalized-text-offsets" };
      } else {
        enter("conversion", type === "pdf" && mode !== "none" ? limits.ocrMs : limits.conversionMs);
        const copy = path.join(temporary, `${index}.${type}`);
        await writeFile(copy, bytes, { flag: "wx", mode: 0o600, signal: controller.signal });
        check();
        const converted = await convertDocument(copy, { ...options.conversion, signal: controller.signal, pdfOcrMode: mode, timeoutMs: limits.conversionMs });
        check();
        if (converted.status !== "success") throw new DocumentCandidateError(converted.status === "failed" ? converted.code : "cancelled", stage);
        if ((type === "xlsx" && !converted.counts.cells) || (type === "pdf" && converted.coverage?.pages?.every((page) => page.source === "blank")))
          throw new DocumentCandidateError("empty-source", stage);
        text = normalizeDocumentText(converted.markdown);
        conversion = { engine: "local-converter", ocrMode: mode, counts: { ...converted.counts },
          pages: converted.coverage?.pages ?? [], warnings: converted.coverage?.warnings ?? ["conversion-coverage-unavailable"], locations: "normalized-text-offsets" };
      }
      check();
      if (!text.trim()) throw new DocumentCandidateError("empty-source", stage);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) throw new DocumentCandidateError("unreadable-source", stage);
      if (Buffer.byteLength(text) > limits.textBytes) throw new DocumentCandidateError("text-too-large", stage);
      const textDigest = sha(text);
      const sourceId = "source-" + candidateDigest({ originalDigest, type, conversion });
      if (sources.some((s) => s.sourceId === sourceId)) throw new DocumentCandidateError("duplicate-source", stage);
      sources.push({ sourceId, originalDigest, textDigest, type, scope: "explicit-file", knowledgeCoverage: "partial", text, conversion });
    }
    sources.sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
    const payload = { version: 1 as const, sources };
    const bundle = freezeDocumentValue({ ...payload, digest: candidateDigest(payload) });
    if (size(bundle) > limits.bundleBytes) throw new DocumentCandidateError("bundle-too-large", stage);
    const prepared = { messages: [{ role: "system" as const, content: documentCandidateSystemPrompt },
      { role: "user" as const, content: candidateCanonical(bundle) }], schemaName: "archi_document_candidates_v1",
      schema: documentCandidateJsonSchema, maxTokens: limits.maxTokens };
    if (size(prepared) > limits.requestBytes) throw new DocumentCandidateError("request-too-large", stage);
    enter("generation", limits.generationMs);
    // Model selection/credential lookup may remain pending; abort must release this operation.
    let stop: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      stop = () => reject(new DocumentCandidateError(timedOut ? "timeout" : "cancelled", stage));
      controller.signal.addEventListener("abort", stop, { once: true });
      if (controller.signal.aborted) stop();
    });
    let resolved: Awaited<ReturnType<typeof resolveClient>>;
    try { resolved = await Promise.race([resolveClient(controller.signal), aborted]); }
    finally { if (stop) controller.signal.removeEventListener("abort", stop); }
    if (!resolved.ok) throw new DocumentCandidateError(resolved.issues[0]?.code ?? "generator-unavailable", stage);
    check();
    logicalRequests = 1;
    const answer = await resolved.client.complete({ ...prepared, signal: controller.signal });
    check();
    enter("validation", limits.validationMs);
    if (size(answer.value) > limits.responseBytes) throw new DocumentCandidateError("response-too-large", stage);
    const result = await validateDocumentCandidates(answer.value, bundle, controller.signal);
    check();
    return { status: "success", result, logicalRequests: 1 };
  } catch (error) {
    const code = controller.signal.aborted ? timedOut ? "timeout" : "cancelled"
      : error instanceof DocumentCandidateError ? error.code
      : stage === "generation" ? safeErrorCode(error) ?? "provider-failed" : stage === "read" ? "read-failed" : stage === "validation" ? "invalid-response" : "document-extraction-failed";
    return { status: code === "cancelled" ? "cancelled" : "failed", code, stage, logicalRequests };
  } finally {
    clearTimeout(timer); clearTimeout(stageTimer);
    request.signal?.removeEventListener("abort", abort);
    if (temporary) {
      try { await rm(temporary, { recursive: true, force: true }); }
      catch { return { status: "failed", stage: "cleanup", code: "cleanup-failed", logicalRequests }; }
    }
  }
}
