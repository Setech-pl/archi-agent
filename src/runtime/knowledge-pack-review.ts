import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { readFile, lstat, realpath } from "node:fs/promises";
import { buildKnowledgePack, validateKnowledgePackCandidateRows, type KnowledgePackBuildResult } from "../core/knowledge-pack/builder/knowledge-pack-builder.js";
import { knowledgePackDraftEntrySchema, type CandidateDecision, type KnowledgePackDraft, type KnowledgePackCandidate } from "../core/knowledge-pack/builder/knowledge-pack-candidate.js";
import { candidateCanonical, freezeDocumentValue, type DocumentCandidateResult } from "../core/knowledge-pack/builder/document-candidates.js";
import { appendDocumentProvenance, type DocumentProvenance } from "../core/knowledge-pack/document-provenance.js";
import { loadKnowledgePack } from "../core/knowledge-pack/knowledge-pack-loader.js";
import { NodeKnowledgePackSource } from "../node/node-knowledge-pack-source.js";
import { createKnowledgePackFiles, cleanupStarterKnowledgePack, StarterPackCreateError, type StarterPackCreateOptions } from "./knowledge-pack-onboarding.js";
import type { KnowledgePackDocument } from "../core/knowledge-pack/builder/knowledge-pack-renderer.js";
import type { KnowledgePack } from "../core/knowledge-pack/knowledge-pack.schema.js";

export interface PackReviewState {
  readonly revision: number;
  readonly draft: KnowledgePackDraft;
  readonly edited: readonly boolean[];
  readonly validation: KnowledgePackBuildResult;
}
export interface PackPreview {
  readonly revision: number;
  readonly documents: readonly KnowledgePackDocument[];
  readonly accepted: number;
  readonly rejected: number;
}
export class PackReviewError extends Error {
  constructor(readonly code: string) { super(code); }
}
const plain = (candidate: DocumentCandidateResult["candidates"][number]): KnowledgePackCandidate => ({
  table: candidate.table, row: candidate.row, basis: candidate.basis,
  evidence: candidate.evidence.map((e) => ({ sourceId: e.sourceId, excerpt: e.excerpt,
    location: { startLine: e.location.startLine, endLine: e.location.endLine } }))
} as KnowledgePackCandidate);

/** One in-memory operation; KPB-A remains the only review-decision model and validator. */
export class KnowledgePackReviewSession {
  private draft: KnowledgePackDraft;
  private edited: boolean[];
  private revision = 0;
  private previewValue: PackPreview | undefined;
  private busy = false;
  private completed = false;
  readonly result: DocumentCandidateResult;
  constructor(result: DocumentCandidateResult) {
    this.result = freezeDocumentValue(structuredClone(result));
    this.draft = freezeDocumentValue({ entries: this.result.candidates.map((c) => ({ candidate: plain(c), decision: "pending" as const })) });
    this.edited = result.candidates.map(() => false);
  }
  private enter() {
    if (this.busy || this.completed) throw new PackReviewError("session-unavailable");
    this.busy = true;
  }
  private evidenceValid(): boolean {
    return this.result.candidates.every((c) => c.evidence.every((e) => {
      const s = this.result.bundle.sources.find((v) => v.sourceId === e.sourceId);
      return s && s.originalDigest === e.originalDigest && s.textDigest === e.textDigest &&
        createHash("sha256").update(s.text).digest("hex") === s.textDigest &&
        s.text.slice(e.location.startOffset, e.location.endOffset) === e.excerpt &&
        s.text.slice(0, e.location.startOffset).split("\n").length === e.location.startLine &&
        s.text.slice(0, e.location.endOffset - 1).split("\n").length === e.location.endLine;
    }));
  }
  async state(): Promise<PackReviewState> {
    const draft = this.draft;
    const revision = this.revision;
    let validation = await buildKnowledgePack(draft);
    if (!validation.ok && draft.entries.some((e) => e.decision === "pending")) {
      const accepted = await buildKnowledgePack({ entries: draft.entries.map((e) => e.decision === "pending" ? { ...e, decision: "rejected" } : e) });
      if (!accepted.ok) validation = { ...validation, issues: [...validation.issues, ...accepted.issues] };
    }
    return freezeDocumentValue({ draft, revision, edited: [...this.edited], validation });
  }
  async decide(indices: readonly number[], decision: CandidateDecision): Promise<PackReviewState> {
    this.enter();
    try {
      if (!["pending", "accepted", "rejected"].includes(decision) || indices.some((i) => !Number.isInteger(i) || !this.draft.entries[i])) throw new PackReviewError("invalid-selection");
      const selected = new Set(indices);
      this.draft = freezeDocumentValue({ entries: this.draft.entries.map((e, i) => selected.has(i) ? { ...e, decision } : e) });
      this.revision++; this.previewValue = undefined;
      return await this.state();
    } finally { this.busy = false; }
  }
  /** Row fields only. Entity IDs, basis and evidence never become editable text. */
  async edit(index: number, changes: Readonly<Record<string, string>>): Promise<PackReviewState> {
    this.enter();
    try {
      const entry = this.draft.entries[index];
      if (!entry || Object.keys(changes).some((key) => key === "id" || !(key in entry.candidate.row) || typeof changes[key] !== "string")) throw new PackReviewError("invalid-edit-field");
      const candidate = { ...entry.candidate, row: { ...entry.candidate.row, ...changes } } as KnowledgePackCandidate;
      if (!knowledgePackDraftEntrySchema.safeParse({ candidate, decision: entry.decision }).success) throw new PackReviewError("invalid-edit");
      // Validate each changed row with its real endpoint candidates; report cross-row conflicts in state.
      const entities = this.draft.entries.map((e) => e.candidate).filter((c) => c.table === "systems" || c.table === "actors");
      const single = candidate.table === "systems" || candidate.table === "actors" ? [candidate] : [...entities, candidate];
      if (!validateKnowledgePackCandidateRows(single).ok) throw new PackReviewError("invalid-edit-row-or-reference");
      this.draft = freezeDocumentValue({ entries: this.draft.entries.map((e, i) => i === index ? { candidate, decision: e.decision } : e) });
      this.edited[index] = true; this.revision++; this.previewValue = undefined;
      return await this.state();
    } finally { this.busy = false; }
  }
  async prepare(signal?: AbortSignal): Promise<PackPreview> {
    this.enter();
    try {
      this.previewValue = undefined;
      if (!this.evidenceValid()) throw new PackReviewError("invalid-frozen-evidence");
      const built = await buildKnowledgePack(this.draft, signal ? { signal } : {});
      if (!built.ok) throw new PackReviewError(built.issues[0]?.code ?? "invalid-draft");
      const documents = built.documents.map((d) => {
        const entries: DocumentProvenance["entries"] = this.draft.entries.flatMap((entry, i) => {
          if (entry.decision !== "accepted" || `${entry.candidate.table}.md` !== d.file) return [];
          const original = this.result.candidates[i]!;
          return [{ candidateId: original.id, candidate: entry.candidate, editedByUser: this.edited[i]!, reasoning: original.reasoning, evidence: original.evidence }];
        });
        const sources = this.result.bundle.sources.filter((s) => entries.some((e) => e.evidence.some((v) => v.sourceId === s.sourceId))).map(({ text: _text, ...s }) => s);
        return { file: d.file, text: appendDocumentProvenance(d.text, { version: 1, bundleDigest: this.result.bundle.digest, sources, entries }) };
      });
      // Physical staged files → production loader → exact records and metadata → owned cleanup.
      const staging = path.join(await realpath(tmpdir()), `archi-k3-stage-${randomUUID()}`);
      const receipt = await createKnowledgePackFiles(staging, documents.map((d) => d.text), { requireNewDirectory: true, ...(signal ? { signal } : {}),
        verify: () => this.verify(staging, documents, built.pack) });
      const cleanup = await cleanupStarterKnowledgePack(receipt);
      if (cleanup.recovery) throw new PackReviewError("staging-cleanup-incomplete");
      this.previewValue = freezeDocumentValue({ revision: this.revision, documents,
        accepted: this.draft.entries.filter((e) => e.decision === "accepted").length,
        rejected: this.draft.entries.filter((e) => e.decision === "rejected").length });
      return this.previewValue;
    } finally { this.busy = false; }
  }
  private async verify(directory: string, documents: readonly KnowledgePackDocument[], expected?: KnowledgePack): Promise<void> {
    const source = await NodeKnowledgePackSource.open(path.dirname(directory), path.basename(directory));
    const loaded = await loadKnowledgePack(source);
    if (!loaded.ok) throw new PackReviewError(loaded.issues[0]?.code ?? "invalid-pack");
    for (const d of documents) if (await readFile(path.join(directory, d.file), "utf8") !== d.text) throw new PackReviewError("preview-mismatch");
    if (expected) {
      const withoutLocations = (pack: KnowledgePack) => Object.fromEntries(["systems", "actors", "relationships", "aliases", "rules"].map((k) =>
        [k, pack[k as keyof Omit<KnowledgePack, "documentProvenance">].map(({ location: _location, ...r }) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)))]));
      if (candidateCanonical(withoutLocations(loaded.pack)) !== candidateCanonical(withoutLocations(expected))) throw new PackReviewError("round-trip-mismatch");
    }
  }
  /** Success resolves at the commit point; later Cancel/activation failure never deletes this pack. */
  async save(preview: PackPreview, directory: string, options: StarterPackCreateOptions = {}): Promise<{ directory: string; status: "saved" }> {
    this.enter();
    try {
      if (preview !== this.previewValue || preview.revision !== this.revision) throw new PackReviewError("stale-preview");
      await createKnowledgePackFiles(directory, preview.documents.map((d) => d.text), { ...options, requireNewDirectory: true,
        verify: async () => { await options.verify?.(); await this.verify(directory, preview.documents); } });
      this.completed = true;
      return { directory, status: "saved" };
    } finally { this.busy = false; }
  }
}
/** Cheap local preflight before optional model listing; K2 still performs bounded frozen reads. */
export async function validateDocumentSelection(documents: readonly { path: string }[]): Promise<void> {
  const limits = (await import("../core/knowledge-pack/builder/document-candidates.js")).documentCandidateLimits;
  if (!documents.length || documents.length > limits.documents || new Set(documents.map((d) => d.path)).size !== documents.length) throw new PackReviewError("invalid-document-input");
  let total = 0;
  for (const d of documents) {
    if (!path.isAbsolute(d.path) || !/\.(md|txt|pdf|docx|xlsx)$/iu.test(d.path)) throw new PackReviewError("invalid-document-input");
    const s = await lstat(d.path); total += s.size;
    if (!s.isFile() || !s.size || s.size > limits.inputBytes || total > limits.totalInputBytes) throw new PackReviewError("invalid-document-input");
  }
}
