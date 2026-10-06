#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const [bundle, fixtures, report] = process.argv.slice(2);
const api = createRequire(import.meta.url)(bundle);
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-k2-packaged-")));
const results = [];
const documents = [{ path: path.join(root, "source.md") }];
writeFileSync(documents[0].path, "Alpha service.\nAlpha calls Beta.");
const original = readFileSync(documents[0].path);
const generator = { kind: "openai-compatible-local", profileId: "local-ollama", modelId: "synthetic-k2" };
const sha = (value) => createHash("sha256").update(value).digest("hex");
let calls = 0, mode = "success", wire;
let started, startPromise;
const server = createServer((req, res) => {
  calls++; let body = "";
  req.on("data", (data) => { body += data; });
  req.on("end", () => {
    wire = JSON.parse(body); started?.();
    if (mode === "timeout" || mode === "cancel") return;
    const s = JSON.parse(wire.messages[1].content).sources[0];
    const excerpt = s.text.slice(0, Math.min(48, s.text.length));
    const evidence = [{ sourceId: s.sourceId, originalDigest: s.originalDigest, textDigest: s.textDigest,
      excerpt: mode === "bad-evidence" ? "fabricated" : excerpt, startOffset: 0, endOffset: excerpt.length }];
    const candidates = [
      { table: "systems", row: { id: "a", canonical_name: "Alpha", kind: "service", description: "Service" }, basis: "explicit", reasoning: null, evidence },
      { table: "systems", row: { id: "b", canonical_name: "Beta", kind: "database", description: "Store" }, basis: "inferred", reasoning: "Proposed responsibility", evidence },
      { table: "relationships", row: { from_id: "a", to_id: "b", interface_type: "DB", interface_name: "", mode: "synchronous", purpose: "Call" }, basis: "explicit", reasoning: null, evidence }
    ];
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: mode === "bad-json" ? "```json\n{}\n```" : JSON.stringify({ version: 1, candidates }) } }] }));
  });
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
generator.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const runtime = api.createArchiAgentRuntime();
const op = (docs = documents, extra = {}) => runtime.extractDocumentCandidates({ documents: docs, generator, ...extra });
async function check(id, task) {
  calls = 0; mode = "success"; startPromise = new Promise((resolve) => { started = resolve; });
  try { await task(); results.push({ id, status: "PASS" }); }
  catch (error) { results.push({ id, status: "FAIL", error: error.message }); }
}
try {
  await check("production-entry-one-http-pending-partial-evidence", async () => {
    const r = await op(); assert.equal(r.status, "success"); assert.equal(calls, 1); assert.equal(r.logicalRequests, 1);
    assert.equal(wire.model, generator.modelId); assert.equal(wire.max_tokens, api.documentCandidateLimits.maxTokens);
    assert.equal(wire.response_format.json_schema.strict, true);
    assert.equal(r.result.semanticAcceptance, "requires-user-review");
    const s = r.result.bundle.sources[0]; assert.equal(s.originalDigest, sha(original)); assert.equal(s.textDigest, sha(s.text));
    for (const c of r.result.candidates) { assert.equal(c.decision, "pending"); const e = c.evidence[0];
      assert.equal(s.text.slice(e.location.startOffset, e.location.endOffset), e.excerpt); }
    const rel = r.result.candidates.find((c) => c.table === "relationships");
    assert.ok(r.result.candidates.some((c) => c.row.id === rel.row.from_id));
  });
  await check("invalid-input-zero-http", async () => { assert.equal((await op([{ path: path.join(root, "missing.md") }])).status, "failed"); assert.equal(calls, 0); });
  for (const errorMode of ["bad-evidence", "bad-json"]) await check(`${errorMode}-one-http-no-repair`, async () => {
    mode = errorMode; const r = await op(); assert.equal(r.status, "failed"); assert.equal(r.logicalRequests, 1); assert.equal(calls, 1); assert.ok(!("result" in r));
  });
  for (const errorMode of ["cancel", "timeout"]) await check(`${errorMode}-active-http-stopped`, async () => {
    mode = errorMode; const controller = new AbortController();
    const pending = op(documents, { signal: controller.signal, ...(errorMode === "timeout" ? { timeoutMs: 300 } : {}) });
    await startPromise; if (errorMode === "cancel") controller.abort();
    const r = await pending; assert.equal(r.code, errorMode === "timeout" ? "timeout" : "cancelled"); assert.equal(calls, 1); assert.ok(!("result" in r));
  });
  await check("cancel-before-start-zero-http", async () => { const c = new AbortController(); c.abort(); assert.equal((await op(documents, { signal: c.signal })).status, "cancelled"); assert.equal(calls, 0); });
  for (const file of ["structured.docx", "two-sheets.xlsx", "two-pages.pdf", "pl-clean-200.pdf", "mixed.pdf"]) await check(`packaged-conversion-${file}`, async () => {
    const input = path.join(fixtures, file), before = readFileSync(input);
    const r = await op([{ path: input, ...(["mixed.pdf", "pl-clean-200.pdf"].includes(file) ? { pdfOcrMode: "auto" } : {}) }]);
    assert.equal(r.status, "success", r.code); assert.equal(calls, 1); assert.deepEqual(readFileSync(input), before);
    const s = r.result.bundle.sources[0]; assert.equal(s.originalDigest, sha(before)); assert.equal(s.textDigest, sha(s.text));
    if (file === "mixed.pdf") assert.deepEqual(s.conversion.pages.map((p) => p.source), ["text", "ocr", "blank"]);
    if (file === "pl-clean-200.pdf") { assert.equal(s.conversion.pages[0].source, "ocr"); assert.ok(s.conversion.warnings.includes("ocr-confidence-unavailable")); }
  });
  await check("blank-ocr-blocked-zero-http", async () => { assert.equal((await op([{ path: path.join(fixtures, "blank-only.pdf"), pdfOcrMode: "auto" }])).status, "failed"); assert.equal(calls, 0); });
  for (const control of ["cancel", "timeout"]) await check(`${control}-active-ocr-cleanup-zero-http`, async () => {
    const controller = new AbortController();
    const before = readdirSync(tmpdir()).filter((f) => f.startsWith("archi-k2-")).sort();
    const pending = op([{ path: path.join(fixtures, "pl-clean-200.pdf"), pdfOcrMode: "all" }], { signal: controller.signal, ...(control === "timeout" ? { timeoutMs: 50 } : {}) });
    if (control === "cancel") setTimeout(() => controller.abort(), 50);
    const r = await pending; assert.equal(r.code, control === "timeout" ? "timeout" : "cancelled"); assert.equal(calls, 0);
    assert.deepEqual(readdirSync(tmpdir()).filter((f) => f.startsWith("archi-k2-")).sort(), before);
  });
  await check("multiple-md-txt-sources-deterministic", async () => {
    const text = path.join(root, "source.txt"); writeFileSync(text, "Other source.");
    const a = await op([...documents, { path: text }]); const b = await op([{ path: text }, ...documents]);
    assert.equal(a.status, "success"); assert.equal(b.status, "success"); assert.equal(calls, 2);
    assert.equal(a.result.digest, b.result.digest);
  });
  await check("no-pack-settings-or-input-mutation", async () => {
    assert.deepEqual(readFileSync(documents[0].path), original);
    assert.deepEqual(readdirSync(root).sort(), ["source.md", "source.txt"]);
  });
} finally {
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
writeFileSync(report, JSON.stringify({ results, node: process.version, platform: process.platform, arch: process.arch, cwd: process.cwd() }, null, 2) + "\n");
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
