import { z } from "zod";
import { canonicalSerialize, type CanonicalValue } from "../util/stable-digest.js";
import { knowledgePackCandidateSchema } from "./builder/knowledge-pack-candidate.js";
import type { DocumentSource, VerifiedDocumentCandidate } from "./builder/document-candidates.js";
import type { KnowledgePackCandidate } from "./builder/knowledge-pack-candidate.js";
import type { KnowledgePack, KnowledgePackTableKind } from "./knowledge-pack.schema.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.strictObject({
  sourceId: z.string().regex(/^source-[a-f0-9]{64}$/), originalDigest: digest, textDigest: digest,
  type: z.enum(["md", "txt", "pdf", "docx", "xlsx"]), scope: z.literal("explicit-file"), knowledgeCoverage: z.literal("partial"),
  conversion: z.strictObject({ engine: z.enum(["utf8", "local-converter"]), ocrMode: z.enum(["none", "auto", "all"]),
    counts: z.record(z.string().max(80), z.number().nonnegative()),
    pages: z.array(z.strictObject({ page: z.number().int().positive(), source: z.enum(["text", "ocr", "blank"]) })).max(300),
    warnings: z.array(z.string().max(80)).max(32), locations: z.literal("normalized-text-offsets") })
});
const entrySchema = z.strictObject({
  candidateId: z.string().regex(/^candidate-[a-f0-9]{64}$/), candidate: knowledgePackCandidateSchema,
  editedByUser: z.boolean(), reasoning: z.string().max(512).nullable(),
  evidence: z.array(z.strictObject({ sourceId: sourceSchema.shape.sourceId, originalDigest: digest, textDigest: digest,
    excerpt: z.string().min(1).max(512), location: z.strictObject({ startOffset: z.number().int().nonnegative(), endOffset: z.number().int().positive(),
      startLine: z.number().int().positive(), endLine: z.number().int().positive() }) })).min(1).max(4)
});
export const documentProvenanceSchema = z.strictObject({ version: z.literal(1), bundleDigest: digest,
  sources: z.array(sourceSchema).max(8), entries: z.array(entrySchema).max(128) });
export interface DocumentProvenance {
  readonly version: 1;
  readonly bundleDigest: string;
  readonly sources: readonly Omit<DocumentSource, "text">[];
  readonly entries: readonly { readonly candidateId: string; readonly candidate: KnowledgePackCandidate;
    readonly editedByUser: boolean; readonly reasoning: string | null; readonly evidence: VerifiedDocumentCandidate["evidence"] }[];
}
export const provenancePrefix = "ArchiAgent-Provenance-v1: ";
export const canonicalProvenance = (value: unknown): string => canonicalSerialize(value as CanonicalValue);

/** Percent encoding keeps quotations and Markdown metacharacters out of table syntax. */
export function appendDocumentProvenance(text: string, metadata: DocumentProvenance): string {
  return text + "\n" + provenancePrefix + encodeURIComponent(canonicalProvenance(metadata)) + "\n";
}
export function splitDocumentProvenance(text: string): { text: string; metadata?: DocumentProvenance } {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.startsWith(provenancePrefix));
  if (at < 0) return { text };
  if (lines.slice(at + 1).some((line) => line.trim() !== "")) throw new Error("invalid-provenance");
  const metadata = documentProvenanceSchema.parse(JSON.parse(decodeURIComponent(lines[at]!.slice(provenancePrefix.length))));
  return { text: lines.slice(0, at).join("\n") + "\n", metadata: metadata as unknown as DocumentProvenance };
}
/** Loaded metadata binds exactly to this file's records. It cannot prove source authenticity. */
export function validateDocumentProvenance(metadata: DocumentProvenance, kind: KnowledgePackTableKind, records: readonly KnowledgePack[KnowledgePackTableKind][number][]): boolean {
  const mapping: Record<string, string> = { canonicalName: "canonical_name", fromId: "from_id", toId: "to_id", interfaceType: "interface_type", interfaceName: "interface_name", targetId: "target_id" };
  const rows = records.map(({ location: _location, ...record }) => {
    const row = Object.fromEntries(Object.entries(record).map(([key, value]) => [mapping[key] ?? key, value]));
    if (kind === "relationships" && row.interface_name === undefined) row.interface_name = "";
    return canonicalProvenance(row);
  }).sort();
  if (new Set(metadata.sources.map((s) => s.sourceId)).size !== metadata.sources.length ||
      new Set(metadata.entries.map((e) => e.candidateId)).size !== metadata.entries.length ||
      canonicalProvenance(rows) !== canonicalProvenance(metadata.entries.map((e) => canonicalProvenance(e.candidate.row)).sort())) return false;
  return metadata.entries.every((e) => e.candidate.table === kind &&
    (e.candidate.basis === "inferred" ? !!e.reasoning?.trim() : e.reasoning === null) &&
    canonicalProvenance(e.candidate.evidence) === canonicalProvenance(e.evidence.map((v) => ({ sourceId: v.sourceId, excerpt: v.excerpt,
      location: { startLine: v.location.startLine, endLine: v.location.endLine } }))) &&
    e.evidence.every((v) => metadata.sources.some((s) => s.sourceId === v.sourceId && s.originalDigest === v.originalDigest && s.textDigest === v.textDigest) &&
      v.location.endOffset > v.location.startOffset && v.location.endOffset - v.location.startOffset === v.excerpt.length && v.location.endLine >= v.location.startLine));
}
