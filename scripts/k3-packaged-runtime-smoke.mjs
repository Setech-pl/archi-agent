#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const [bundle, report] = process.argv.slice(2);
const api = createRequire(import.meta.url)(bundle);
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-k3-packaged-")));
const source = path.join(root, "source.md"); writeFileSync(source, "Alpha calls Beta.");
let requests = 0;
const server = createServer((req, res) => {
  let body = ""; req.on("data", (b) => { body += b; }); req.on("end", () => {
    requests++; const s = JSON.parse(JSON.parse(body).messages[1].content).sources[0];
    const evidence = [{ sourceId: s.sourceId, originalDigest: s.originalDigest, textDigest: s.textDigest, excerpt: s.text, startOffset: 0, endOffset: s.text.length }];
    const candidates = [
      { table: "systems", row: { id: "a", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null, evidence },
      { table: "systems", row: { id: "b", canonical_name: "Beta", kind: "database", description: "Store" }, basis: "inferred", reasoning: "Proposed", evidence },
      { table: "relationships", row: { from_id: "a", to_id: "b", interface_type: "DB", interface_name: "", mode: "synchronous", purpose: "Call" }, basis: "explicit", reasoning: null, evidence }
    ];
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ version: 1, candidates }) } }] }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const runtime = api.createArchiAgentRuntime();
const generator = { kind: "openai-compatible-local", profileId: "local-ollama", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, modelId: "synthetic-k3" };
const results = []; let number = 0;
const extraction = () => runtime.extractDocumentCandidates({ documents: [{ path: source }], generator });
async function session() { const r = await extraction(); assert.equal(r.status, "success", r.code); return new api.KnowledgePackReviewSession(r.result); }
async function accepted() { const s = await session(); const state = await s.state(); await s.decide(state.draft.entries.map((_, i) => i), "accepted"); return s; }
async function check(id, fn) { try { await fn(); results.push({ id, status: "PASS", layer: "packaged-runtime" }); } catch (e) { results.push({ id, status: "FAIL", error: e.stack }); } }
try {
  await check("K2-production-one-extraction-pending-no-pack", async () => {
    const before = requests, s = await session(); assert.equal(requests, before + 1); assert.ok((await s.state()).draft.entries.every((e) => e.decision === "pending"));
    await assert.rejects(s.prepare(), { code: "candidate-decision-pending" }); assert.equal(requests, before + 1);
  });
  await check("blocking-input-zero-provider-selection-zero-http", async () => {
    let selected = 0; const before = requests;
    const r = await runtime.extractDocumentCandidates({ documents: [{ path: path.join(root, "missing.md") }], generator: async () => { selected++; return generator; } });
    assert.equal(r.status, "failed"); assert.equal(selected, 0); assert.equal(requests, before);
  });
  for (const mode of ["cancel", "timeout"]) await check(`pending-selection-${mode}-zero-http-late-result-ignored`, async () => {
    const before = requests, c = new AbortController(); let started, release, seen;
    const ready = new Promise((resolve) => { started = resolve; });
    const pending = new Promise((resolve) => { release = resolve; });
    const operation = runtime.extractDocumentCandidates({ documents: [{ path: source }], generator: (signal) => { seen = signal; started(); return pending; }, signal: c.signal,
      ...(mode === "timeout" ? { timeoutMs: 100 } : {}) });
    await ready; if (mode === "cancel") c.abort();
    const result = await Promise.race([operation, new Promise((resolve) => setTimeout(() => resolve("hung"), 1000))]);
    assert.equal(result.code, mode === "cancel" ? "cancelled" : "timeout"); assert.equal(result.logicalRequests, 0); assert.equal(seen.aborted, true);
    release(generator); await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(requests, before);
  });
  await check("edit-inferred-frozen-evidence-special-markdown-round-trip-five-exact-files", async () => {
    const s = await accepted(), before = requests, state = await s.state(); const i = state.draft.entries.findIndex((e) => e.candidate.basis === "inferred");
    await s.edit(i, { canonical_name: "Beta | \\ Store" }); writeFileSync(source, "Changed original after frozen extraction");
    const p = await s.prepare(); const target = path.join(root, `pack-${++number}`); await s.save(p, target);
    for (const d of p.documents) assert.equal(readFileSync(path.join(target, d.file), "utf8"), d.text);
    assert.equal(readdirSync(target).length, 5); assert.deepEqual(await api.validateKnowledgePackDirectory(target), { ok: true });
    const metadata = p.documents.flatMap((d) => JSON.parse(decodeURIComponent(d.text.split("ArchiAgent-Provenance-v1: ")[1].trim())).entries);
    assert.ok(metadata.some((e) => e.editedByUser && e.candidate.basis === "inferred")); assert.equal(requests, before);
  });
  await check("edited-conflict-blocks-preview-zero-additional-http", async () => {
    const s = await accepted(), before = requests, state = await s.state(); const systems = state.draft.entries.flatMap((e, i) => e.candidate.table === "systems" ? [i] : []);
    await s.edit(systems[1], { canonical_name: state.draft.entries[systems[0]].candidate.row.canonical_name });
    await assert.rejects(s.prepare(), { code: "canonical-name-collision" }); assert.equal(requests, before);
  });
  await check("rejected-endpoint-no-autoaccept", async () => {
    const s = await accepted(); const state = await s.state(); const i = state.draft.entries.findIndex((e) => e.candidate.table === "systems");
    await s.decide([i], "rejected"); await assert.rejects(s.prepare(), { code: "unknown-reference" });
  });
  await check("existing-empty-directory-not-clobbered", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`); mkdirSync(target);
    await assert.rejects(s.save(p, target), { code: "location-exists" }); assert.deepEqual(readdirSync(target), []);
  });
  await check("existing-pack-not-clobbered", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`); mkdirSync(target); writeFileSync(path.join(target, "systems.md"), "foreign");
    await assert.rejects(s.save(p, target), { code: "location-exists" }); assert.equal(readFileSync(path.join(target, "systems.md"), "utf8"), "foreign");
  });
  await check("target-created-after-preview-empty-collision", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`); mkdirSync(target);
    await assert.rejects(s.save(p, target), { code: "location-exists" }); assert.deepEqual(readdirSync(target), []);
  });
  await check("cancel-midwrite-owned-rollback", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`), c = new AbortController();
    await assert.rejects(s.save(p, target, { signal: c.signal, onStep: () => c.abort() }), { code: "cancelled" });
    assert.ok(!readdirSync(root).includes(path.basename(target)));
  });
  await check("foreign-edited-file-preserved-on-rollback", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`);
    await assert.rejects(s.save(p, target, { verify: () => writeFileSync(path.join(target, "systems.md"), "foreign edit") }), { cleanupIncomplete: true });
    assert.equal(readFileSync(path.join(target, "systems.md"), "utf8"), "foreign edit");
  });
  await check("replaced-directory-preserved-on-rollback", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`);
    await assert.rejects(s.save(p, target, { verify: () => { renameSync(target, target + "-moved"); mkdirSync(target); } }), { cleanupIncomplete: true });
    assert.deepEqual(readdirSync(target), []); assert.equal(readdirSync(target + "-moved").length, 5);
  });
  await check("write-failure-at-second-file-no-orphans", async () => {
    const s = await accepted(), p = await s.prepare(), target = path.join(root, `pack-${++number}`);
    await assert.rejects(s.save(p, target, { onStep: (step, file) => { if (step === "after-write" && file.endsWith("actors.md")) throw new Error("fault"); } }), { code: "write-failed" });
    assert.ok(!readdirSync(root).includes(path.basename(target)));
  });
  await check("mutation-invalidates-preview", async () => {
    const s = await accepted(), p = await s.prepare(); await s.decide([0], "pending");
    await assert.rejects(s.save(p, path.join(root, `pack-${++number}`)), { code: "stale-preview" });
  });
} finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
writeFileSync(report, JSON.stringify({ root, bundle, environment: { node: process.version, platform: process.platform, arch: process.arch, cwd: process.cwd(), NODE_PATH: process.env.NODE_PATH, PATH: process.env.PATH }, requests, results }, null, 2) + "\n");
console.log(`${results.filter((r) => r.status === "PASS").length}/${results.length} packaged K3 scenarios; report ${report}`);
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
