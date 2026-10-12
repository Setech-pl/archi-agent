import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, readdir, rm, rename, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { KnowledgePackReviewSession } from "../../src/runtime/knowledge-pack-review.js";
import { validateDocumentCandidates, candidateDigest, type DocumentSource } from "../../src/core/knowledge-pack/builder/document-candidates.js";
import { loadKnowledgePack } from "../../src/core/knowledge-pack/knowledge-pack-loader.js";
import { NodeKnowledgePackSource } from "../../src/node/node-knowledge-pack-source.js";
import { knowledgeSnapshotFromPack } from "../../src/core/knowledge-pack/knowledge-snapshot.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function setup() {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "k3-test-")); roots.push(root);
  const text = "Alpha calls Beta.\nOCR not verified.";
  const source: DocumentSource = { sourceId: "source-" + hash("source"), originalDigest: hash(text), textDigest: hash(text), type: "pdf", text,
    scope: "explicit-file", knowledgeCoverage: "partial", conversion: { engine: "local-converter", ocrMode: "all", counts: {}, pages: [{ page: 1, source: "ocr" }], warnings: ["ocr-confidence-unavailable"], locations: "normalized-text-offsets" } };
  const evidence = [{ sourceId: source.sourceId, originalDigest: source.originalDigest, textDigest: source.textDigest, excerpt: "Alpha calls Beta.", startOffset: 0, endOffset: 17 }];
  const candidates = [
    { table: "systems", row: { id: "a", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null, evidence },
    { table: "systems", row: { id: "b", canonical_name: "Beta", kind: "database", description: "Store" }, basis: "inferred", reasoning: "Proposed", evidence },
    { table: "relationships", row: { from_id: "a", to_id: "b", interface_type: "DB", interface_name: "", mode: "synchronous", purpose: "Call" }, basis: "explicit", reasoning: null, evidence },
    { table: "aliases", row: { alias: "A", target_id: "a" }, basis: "explicit", reasoning: null, evidence },
    { table: "aliases", row: { alias: "B", target_id: "b" }, basis: "explicit", reasoning: null, evidence }
  ];
  const result = await validateDocumentCandidates({ version: 1, candidates }, { version: 1, sources: [source], digest: candidateDigest(source) }, new AbortController().signal);
  const session = new KnowledgePackReviewSession(result);
  const state = await session.state();
  const a = state.draft.entries.findIndex((e) => "canonical_name" in e.candidate.row && e.candidate.row.canonical_name === "Alpha");
  const b = state.draft.entries.findIndex((e) => "canonical_name" in e.candidate.row && e.candidate.row.canonical_name === "Beta");
  const rel = state.draft.entries.findIndex((e) => e.candidate.table === "relationships");
  const aliases = state.draft.entries.flatMap((e, i) => e.candidate.table === "aliases" ? [i] : []);
  const all = state.draft.entries.map((_e, i) => i);
  return { root, session, a, b, rel, aliases, all, result };
}
describe("K3 reviewed draft and exclusive transaction", () => {
  it("pending, grouped decisions and restoration use KPB-A", async () => {
    const { session, all } = await setup();
    expect((await session.state()).draft.entries.every((e) => e.decision === "pending")).toBe(true);
    await expect(session.prepare()).rejects.toMatchObject({ code: "candidate-decision-pending" });
    await session.decide(all, "accepted"); expect((await session.state()).validation.ok).toBe(true);
    await session.decide([0], "pending"); await expect(session.prepare()).rejects.toMatchObject({ code: "candidate-decision-pending" });
    await session.decide(all, "rejected"); await expect(session.prepare()).rejects.toMatchObject({ code: "no-data-rows" });
  });
  it("rejected and pending endpoints block a relationship", async () => {
    const { session, all, b } = await setup(); await session.decide(all, "accepted");
    await session.decide([b], "rejected"); expect((await session.state()).validation.ok).toBe(false);
    await expect(session.prepare()).rejects.toMatchObject({ code: "unknown-reference" });
    await session.decide([b], "pending"); expect((await session.state()).validation.ok).toBe(false);
  });
  it("edits preserve evidence, inferred, OCR, identifiers; collisions block preview", async () => {
    const { session, all, b, result } = await setup(); await session.decide(all, "accepted");
    const before = (await session.state()).draft.entries[b]!;
    await session.edit(b, { canonical_name: "Alpha" });
    expect((await session.state()).draft.entries[b]!.candidate.evidence).toEqual(before.candidate.evidence);
    expect((await session.state()).draft.entries[b]!.candidate.basis).toBe("inferred");
    expect(session.result).toEqual(result); expect((await session.state()).edited[b]).toBe(true);
    await expect(session.prepare()).rejects.toMatchObject({ code: "canonical-name-collision" });
    await session.edit(b, { canonical_name: "Beta | \\ Store" });
    await expect(session.edit(b, { id: "new" })).rejects.toMatchObject({ code: "invalid-edit-field" });
    await expect(session.edit(b, { description: "new\nline" })).rejects.toMatchObject({ code: "invalid-edit-row-or-reference" });
  });
  it("alias collision introduced by edit blocks render", async () => {
    const { session, all, aliases } = await setup(); await session.decide(all, "accepted");
    await session.edit(aliases[1]!, { alias: "A" }); await expect(session.prepare()).rejects.toMatchObject({ code: "alias-collision" });
  });
  it("round trip, special characters, exact preview, provenance and partial K1 snapshot", async () => {
    const { session, all, root, b } = await setup(); await session.decide(all, "accepted"); await session.edit(b, { canonical_name: "Beta | \\ Data", description: "Storage > data" });
    const preview = await session.prepare(); const destination = path.join(root, "pack");
    await session.save(preview, destination);
    expect((await readdir(destination)).sort()).toEqual(["actors.md", "aliases.md", "relationships.md", "rules.md", "systems.md"]);
    for (const d of preview.documents) expect(await readFile(path.join(destination, d.file), "utf8")).toBe(d.text);
    const loaded = await loadKnowledgePack(await NodeKnowledgePackSource.open(root, "pack")); expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.pack.documentProvenance).toHaveLength(5);
    expect(loaded.pack.documentProvenance!.flatMap((m) => m.entries).some((e) => e.editedByUser && e.candidate.basis === "inferred")).toBe(true);
    expect(knowledgeSnapshotFromPack(loaded.pack).sources[0]!.scope.systems).toBe("partial");
    await expect(session.decide([0], "pending")).rejects.toMatchObject({ code: "session-unavailable" });
  });
  it("preview invalidates on status and row changes", async () => {
    const { session, all, root, b } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare();
    await session.edit(b, { description: "Edited" }); await expect(session.save(p, path.join(root, "pack"))).rejects.toMatchObject({ code: "stale-preview" });
    const p2 = await session.prepare(); await session.decide([b], "pending"); await expect(session.save(p2, path.join(root, "pack"))).rejects.toMatchObject({ code: "stale-preview" });
    expect(await readdir(root)).toEqual([]);
  });
  for (const occupied of ["empty", "nonempty", "file"]) it(`never replaces ${occupied} destination`, async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare(); const target = path.join(root, "pack");
    if (occupied === "file") await writeFile(target, "foreign");
    else { await mkdir(target); if (occupied === "nonempty") await writeFile(path.join(target, "foreign"), "foreign"); }
    await expect(session.save(p, target)).rejects.toMatchObject({ code: "location-exists" });
    if (occupied === "file") expect(await readFile(target, "utf8")).toBe("foreign");
    else expect(await readdir(target)).toEqual(occupied === "empty" ? [] : ["foreign"]);
  });
  for (const step of ["after-open", "after-write", "before-close", "before-verify"] as const) it(`rollback at ${step} retains no ordinary resources`, async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare();
    await expect(session.save(p, path.join(root, "pack"), { onStep: (at) => { if (at === step) throw new Error("fault"); } })).rejects.toMatchObject({ code: "write-failed" });
    expect(await readdir(root)).toEqual([]);
  });
  it("Cancel before and during publication rolls back; success is final", async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare();
    const controller = new AbortController(); controller.abort(); await expect(session.save(p, path.join(root, "pack"), { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
    const during = new AbortController(); await expect(session.save(p, path.join(root, "pack"), { signal: during.signal, onStep: () => during.abort() })).rejects.toMatchObject({ code: "cancelled" });
    expect(await readdir(root)).toEqual([]);
    await session.save(p, path.join(root, "pack")); during.abort(); expect(await readdir(path.join(root, "pack"))).toHaveLength(5);
  });
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("unwritable parent blocks save without replacing any resource", async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare();
    await chmod(root, 0o500);
    try { await expect(session.save(p, path.join(root, "pack"))).rejects.toMatchObject({ code: "permission-denied" }); }
    finally { await chmod(root, 0o700); }
    expect(await readdir(root)).toEqual([]);
  });
  it("metadata/row mismatch and missing metadata reject the five-file pack", async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare(); await session.save(p, path.join(root, "pack"));
    const systems = path.join(root, "pack", "systems.md"); const content = await readFile(systems, "utf8");
    await writeFile(systems, content.replace("| Alpha |", "| Other |"));
    expect((await loadKnowledgePack(await NodeKnowledgePackSource.open(root, "pack"))).ok).toBe(false);
    await writeFile(systems, content.split("ArchiAgent-Provenance-v1: ")[0]!);
    expect((await loadKnowledgePack(await NodeKnowledgePackSource.open(root, "pack"))).ok).toBe(false);
  });
  it("foreign edit before final validation survives rollback", async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare(); const target = path.join(root, "pack");
    await expect(session.save(p, target, { verify: () => writeFile(path.join(target, "systems.md"), "foreign") })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readFile(path.join(target, "systems.md"), "utf8")).toBe("foreign"); expect(await readdir(target)).toEqual(["systems.md"]);
  });
  it("foreign edit after exclusive open is never overwritten or adopted", async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare(); const target = path.join(root, "pack");
    await expect(session.save(p, target, { onStep: async (step, file) => { if (step === "after-open") await writeFile(file, "foreign"); } })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readFile(path.join(target, "systems.md"), "utf8")).toBe("foreign");
  });
  it("directory replaced before cleanup preserves replacement and original resources", async () => {
    const { session, all, root } = await setup(); await session.decide(all, "accepted"); const p = await session.prepare(); const target = path.join(root, "pack");
    await expect(session.save(p, target, { verify: async () => { await rename(target, path.join(root, "moved")); await mkdir(target); await writeFile(path.join(target, "foreign"), "edit"); } })).rejects.toMatchObject({ cleanupIncomplete: true });
    expect(await readFile(path.join(target, "foreign"), "utf8")).toBe("edit"); expect(await readdir(path.join(root, "moved"))).toHaveLength(5);
  });
  it("concurrent session mutations cannot mix preview or publication", async () => {
    const { session, all } = await setup(); await session.decide(all, "accepted");
    const preparing = session.prepare(); await expect(session.edit(0, { description: "edit" })).rejects.toMatchObject({ code: "session-unavailable" }); await preparing;
  });
});
