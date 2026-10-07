import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, realpath, readFile, writeFile, readdir, rm, mkdir, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), api = require(path.resolve(process.argv[2]));
const fixture = require("./art1-smoke-fixture.cjs"), results = [];
const root = await realpath(await mkdtemp(path.join(tmpdir(), "art1-packaged-"))), { pack, flow } = fixture.prepare(root);
let calls = 0, component = false;
const client = { clientType: "openai-compatible-local", generationMetadata: { modelId: "synthetic-art1", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
  async complete(chat) { calls++; return { source: "content", value: fixture.answer(JSON.parse(chat.messages[1].content), component) }; } };
const app = api.createArchiAgentRuntime({ diagramClientFactory: () => client, extensionVersion: "0.3.0-alpha.4" });
const request = { flow: { kind: "file", path: flow }, knowledgePack: { kind: "local-directory", path: pack },
  generator: { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1/v1", modelId: "synthetic-art1", credential: { type: "api-key", value: "SECRET_MARKER" } } };
let sequence, comp;
async function check(id, fn) { try { await fn(); results.push({ id: `art1-${id}`, layer: "exact-VSIX runtime outside repository", status: "PASS" }); } catch (e) { results.push({ id: `art1-${id}`, status: "FAIL", error: e.message }); } }
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await check("sequence-original", async () => { sequence = await app.generateDiagram({ ...request, diagramType: "sequence" }); assert.equal(sequence.status, "success"); assert.ok(sequence.artifact); assert.equal(calls, 2); });
await check("component-original", async () => { component = true; comp = await app.generateDiagram({ ...request, diagramType: "component" }); assert.equal(comp.status, "success"); assert.equal(calls, 4); });
await rm(pack, { recursive: true }); await writeFile(flow, "CHANGED_SOURCE_MARKER"); request.generator.modelId = "CHANGED_MODEL_MARKER";
for (const [type, result] of [["sequence", sequence], ["component", comp]]) {
  await check(`${type}-exact-save-no-requests-source-refresh`, async () => {
    const saved = await api.saveDiagramBundle(root, result.artifact, api.planDiagramBundle());
    const bytes = await readFile(path.join(saved.directory, "diagram.puml")), text = await readFile(path.join(saved.directory, "report.json"), "utf8"), report = JSON.parse(text);
    assert.equal(bytes.toString(), result.plantUml); assert.equal(report.diagram.sha256, sha(bytes)); assert.equal(report.diagram.byteLength, bytes.length);
    assert.deepEqual(report.generationReport, JSON.parse(result.groundingReport)); assert.equal(report.resultId, result.artifact.resultId);
    assert.equal(report.diagramType, type); assert.equal(report.knowledge.generationSnapshotDigest, result.digest);
    assert.equal(report.configuration.sha256, sha(api.serializeArtifactConfiguration(report.configuration.projection)));
    assert.equal(report.sourceReferences.flow.reference, "flow.md"); assert.equal(report.sourceReferences.knowledgePack.reference, "architecture");
    assert.equal(calls, 4); assert.ok(!/SECRET_MARKER|CHANGED_MODEL_MARKER|CHANGED_SOURCE_MARKER/.test(text)); assert.ok(!text.includes(root));
    assert.deepEqual(await readdir(saved.directory), ["diagram.puml", "report.json"]);
  });
}
await check("existing-empty-target", async () => { const plan = api.planDiagramBundle(), target = path.join(root, plan.relativeDirectory); await mkdir(target); await assert.rejects(api.saveDiagramBundle(root, sequence.artifact, plan), { code: "location-exists" }); assert.deepEqual(await readdir(target), []); });
await check("same-target-concurrency", async () => { const plan = api.planDiagramBundle(); const saves = await Promise.allSettled([api.saveDiagramBundle(root, sequence.artifact, plan), api.saveDiagramBundle(root, sequence.artifact, plan)]); assert.equal(saves.filter((s) => s.status === "fulfilled").length, 1); assert.equal((await readdir(path.join(root, plan.relativeDirectory))).length, 2); });
await check("cancel-before-mutation", async () => { const plan = api.planDiagramBundle(), c = new AbortController(); c.abort(); await assert.rejects(api.saveDiagramBundle(root, sequence.artifact, plan, { signal: c.signal }), { code: "cancelled" }); await assert.rejects(lstat(path.join(root, plan.relativeDirectory)), { code: "ENOENT" }); });
await check("cancel-mid-write", async () => { const plan = api.planDiagramBundle(), c = new AbortController(); await assert.rejects(api.saveDiagramBundle(root, sequence.artifact, plan, { signal: c.signal, onStep: (s) => { if (s === "after-write") c.abort(); } }), { code: "cancelled" }); await assert.rejects(lstat(path.join(root, plan.relativeDirectory)), { code: "ENOENT" }); });
await check("preserve-foreign-edit", async () => { const plan = api.planDiagramBundle(); await assert.rejects(api.saveDiagramBundle(root, sequence.artifact, plan, { onStep: async (s, file) => { if (s === "after-write") { await writeFile(file, "foreign edit"); throw Error("fault"); } } }), { cleanupIncomplete: true }); assert.equal(await readFile(path.join(root, plan.relativeDirectory, "diagram.puml"), "utf8"), "foreign edit"); });
await check("unlinked-and-traversal-rejected", async () => { await assert.rejects(api.saveDiagramBundle(root, { ...sequence.artifact }, api.planDiagramBundle())); await assert.rejects(api.saveDiagramBundle(root, sequence.artifact, { ...api.planDiagramBundle(), relativeDirectory: "../escape" })); });
await check("symlink-parent-rejected", async () => { const linked = path.join(root, "linked"); await mkdir(linked); await symlink(root, path.join(linked, "archi-agent-results")); await assert.rejects(api.saveDiagramBundle(linked, sequence.artifact, api.planDiagramBundle())); assert.deepEqual(await readdir(linked), ["archi-agent-results"]); });
await check("late-cancel-after-commit", async () => { const c = new AbortController(), saved = await api.saveDiagramBundle(root, sequence.artifact, api.planDiagramBundle(), { signal: c.signal }); c.abort(); assert.equal((await readdir(saved.directory)).length, 2); assert.equal(calls, 4); });
await writeFile(process.argv[3], JSON.stringify({ root, node: process.version, runtime: process.argv[2], results }, null, 2) + "\n");
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
