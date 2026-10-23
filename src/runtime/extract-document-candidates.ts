import { prepareDocumentBundle } from "./document-source-bundle.js";
import type { StructuredChatClient } from "../core/llm/structured-chat-client.js";
import { safeErrorCode } from "../core/llm/structured-chat-client.js";
import { type ConvertDocumentOptions, type PdfOcrMode } from "./convert-document.js";
import type { GeneratorConfig } from "./runtime-types.js";
import {
  documentCandidateLimits as limits, DocumentCandidateError, candidateCanonical, candidateDigest,
  validateDocumentCandidates, documentCandidateJsonSchema,
  documentCandidateSystemPrompt, documentEvidenceSlices, type DocumentCandidateResult
} from "../core/knowledge-pack/builder/document-candidates.js";

export type DocumentInput = { readonly path: string; readonly pdfOcrMode?: PdfOcrMode } |
  { readonly kind: "editor-buffer"; readonly uri: string; readonly type: "md" | "txt"; readonly content: string };
export interface ExtractDocumentCandidatesRequest {
  readonly documents: readonly DocumentInput[];
  /** Closed stage names only; no document text or provider response. */
  readonly onStage?: (stage: string) => void;
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
  readonly conversion?: Pick<ConvertDocumentOptions, "workerFile" | "ocrParentFile" | "distributionDirectory">;
}
const size = (value: unknown): number => Buffer.byteLength(candidateCanonical(value));

/** Frozen bounded read, one conversion per explicit source and exactly one structured generation. */
export async function extractDocumentCandidates(
  request: ExtractDocumentCandidatesRequest,
  resolveClient: (signal: AbortSignal) => Promise<{ readonly ok: true; readonly client: StructuredChatClient } | { readonly ok: false; readonly issues: readonly { readonly code: string }[] }> | { readonly ok: true; readonly client: StructuredChatClient } | { readonly ok: false; readonly issues: readonly { readonly code: string }[] },
  options: DocumentExtractionOptions = {}
): Promise<ExtractDocumentCandidatesOutcome> {
  let logicalRequests: 0 | 1 = 0;
  let stage = "input";
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
    check(); stage = next; request.onStage?.(stage); clearTimeout(stageTimer); stageTimer = setTimeout(timeout, budget);
  };
  try {
    check();
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > limits.operationMs ||
        !Array.isArray(request.documents) || request.documents.length < 1 || request.documents.length > limits.documents)
      throw new DocumentCandidateError("invalid-document-input", stage);
    const bundle = await prepareDocumentBundle(request.documents, { ...options, signal:controller.signal,
      onStage: next => { stage=next;request.onStage?.(next); } });
    const prepared = { messages: [{ role: "system" as const, content: documentCandidateSystemPrompt },
      { role: "user" as const, content: candidateCanonical({ ...bundle, sources: bundle.sources.map(({ editorUri: _localIdentity, ...source }) => ({ ...source, evidenceSlices: documentEvidenceSlices(source.text) })) }) }], schemaName: "archi_document_candidates_v1",
      schema: documentCandidateJsonSchema, maxTokens: limits.maxTokens };
    if (size(prepared) > limits.requestBytes) throw new DocumentCandidateError("request-too-large", stage);
    enter("provider-selection", limits.operationMs);
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
    enter("generation", limits.generationMs);
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

  }
}
