import { constants } from "node:fs";
import { lstat, open, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { convertDocument } from "./convert-document.js";
import {
  documentCandidateLimits as limits, DocumentCandidateError, candidateCanonical, candidateDigest,
  freezeDocumentValue, normalizeDocumentText,
  type DocumentSource, type DocumentSourceBundle
} from "../core/knowledge-pack/builder/document-candidates.js";

import type { DocumentInput, DocumentExtractionOptions } from "./extract-document-candidates.js";
const sha = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const size = (value: unknown): number => Buffer.byteLength(candidateCanonical(value));
/** Shared bounded conversion, explicitly selected sources only. No provider access. */
export async function prepareDocumentBundle(documentsInput: readonly DocumentInput[], options: DocumentExtractionOptions & {
  signal: AbortSignal; preserveText?: boolean; onStage?: (stage:string)=>void;
  onSource?: (source:DocumentSource,document:DocumentInput)=>void;
}): Promise<DocumentSourceBundle> {
  let temporary: string | undefined, stage = "input";
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener("abort", abort, {once:true});
  if(options.signal.aborted)abort();
  let timer: ReturnType<typeof setTimeout> | undefined, timedOut=false;
  const check=()=>{if(controller.signal.aborted)throw new DocumentCandidateError(timedOut?"timeout":"cancelled",stage);};
  const enter=(next:string,budget:number)=>{check();stage=next;options.onStage?.(stage);clearTimeout(timer);timer=setTimeout(()=>{timedOut=true;abort();},budget);};
  const cleanText=(text:string)=>options.preserveText?text:normalizeDocumentText(text);
  try {
    check();
    if(!Array.isArray(documentsInput)||!documentsInput.length||documentsInput.length>limits.documents)throw new DocumentCandidateError("invalid-document-input",stage);
    const documents = documentsInput.map(d => ({ ...d }));
    const paths = new Set<string>();
    const types = documents.map((d) => {
      if ("kind" in d) {
        if (d.kind !== "editor-buffer" || !["md", "txt"].includes(d.type) || typeof d.content !== "string" ||
          typeof d.uri !== "string" || d.uri.length > 8192 || !/^(file|untitled):/u.test(d.uri) || paths.has(d.uri))
          throw new DocumentCandidateError("invalid-document-input", stage);
        paths.add(d.uri); return d.type;
      }
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
    for (let index = 0; index < documents.length; index++) {
      const d = documents[index]!;
      const type = types[index]!;
      enter("read", limits.readMs);
      let bytes: Buffer;
      if ("kind" in d) {
        if (Buffer.byteLength(d.content, "utf8") > limits.inputBytes) throw new DocumentCandidateError("input-too-large", stage);
        if(/[\uD800-\uDFFF]/u.test(d.content))throw new DocumentCandidateError("unreadable-source",stage);
        bytes = Buffer.from(d.content, "utf8");
      } else {
      // A regular descriptor, no final symlink or device, bounded chunk reads with cancellation checks.
      const initial = await lstat(d.path);
      check();
      if (!initial.isFile()) throw new DocumentCandidateError("not-a-file", stage);
      if (initial.size > limits.inputBytes) throw new DocumentCandidateError("input-too-large", stage);
      const handle = await open(d.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      try {
        check();
        const stat = await handle.stat();
        if(stat.dev!==initial.dev||stat.ino!==initial.ino||stat.ctimeMs!==initial.ctimeMs||stat.mtimeMs!==initial.mtimeMs)throw new DocumentCandidateError("source-changed",stage);
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
        const after=await handle.stat(),current=await lstat(d.path);
        if([after,current].some(v=>!v.isFile()||v.dev!==stat.dev||v.ino!==stat.ino||v.size!==stat.size||v.ctimeMs!==stat.ctimeMs||v.mtimeMs!==stat.mtimeMs)||used!==stat.size)throw new DocumentCandidateError("source-changed",stage);
        bytes = Buffer.concat(chunks, used);
      } finally { await handle.close(); }
      }
      totalBytes += bytes.length;
      if (totalBytes > limits.totalInputBytes) throw new DocumentCandidateError("input-too-large", stage);
      if (!bytes.length) throw new DocumentCandidateError("empty-source", stage);
      const originalDigest = sha(bytes);
      let text: string;
      let conversion: DocumentSource["conversion"];
      const mode = "kind" in d ? "none" : d.pdfOcrMode ?? "none";
      if (type === "md" || type === "txt") {
        text = cleanText(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
        conversion = { engine: "utf8", ocrMode: "none", counts: {}, pages: [], warnings: [], locations: options.preserveText?"captured-text-offsets":"normalized-text-offsets" };
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
        text = cleanText(converted.markdown);
        conversion = { engine: "local-converter", ocrMode: mode, counts: { ...converted.counts },
          pages: converted.coverage?.pages ?? [], warnings: converted.coverage?.warnings ?? ["conversion-coverage-unavailable"], locations: options.preserveText?"captured-text-offsets":"normalized-text-offsets" };
      }
      check();
      if (!text.trim()) throw new DocumentCandidateError("empty-source", stage);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) throw new DocumentCandidateError("unreadable-source", stage);
      if (Buffer.byteLength(text) > limits.textBytes) throw new DocumentCandidateError("text-too-large", stage);
      const textDigest = sha(text);
      const origin = "kind" in d ? { scope: "editor-buffer" as const, editorUri: d.uri } : { scope: "explicit-file" as const };
      const sourceId = "source-" + candidateDigest({ originalDigest, type, conversion, ...(origin.scope === "editor-buffer" ? origin : {}) });
      if (sources.some((s) => s.sourceId === sourceId)) throw new DocumentCandidateError("duplicate-source", stage);
      const source:DocumentSource={ sourceId, originalDigest, textDigest, type, ...origin, knowledgeCoverage: "partial", text, conversion };
      sources.push(source);options.onSource?.(source,d);
    }
    sources.sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0);
    const payload = { version: 1 as const, sources };
    const bundle = freezeDocumentValue({ ...payload, digest: candidateDigest(payload) });
    if (size(bundle) > limits.bundleBytes) throw new DocumentCandidateError("bundle-too-large", stage);
    return bundle;
  } finally {
    clearTimeout(timer);options.signal.removeEventListener("abort",abort);
    if(temporary)await rm(temporary,{recursive:true,force:true});
  }
}
