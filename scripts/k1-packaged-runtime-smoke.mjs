#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [bundle, reportPath] = process.argv.slice(2);
if (!bundle || !reportPath) throw new Error("usage: k1-packaged-runtime-smoke.mjs runtime.cjs report.json");
const runtime = createRequire(import.meta.url)(bundle);
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-k1-runtime-")));
const results = [];
async function check(id, operation) {
  try { await operation(); results.push({ id, status: "PASS" }); }
  catch (error) { results.push({ id, status: "FAIL", error: error.message }); }
}
const systems = [
  { id: "alpha", canonicalName: "Alpha Service", kind: "service", description: "Synthetic service" },
  { id: "beta", canonicalName: "Beta Store", kind: "database", description: "Synthetic store" },
  { id: "unrelated", canonicalName: "Unrelated System", kind: "system", description: "Outside selected task" }
];
const partial = { source: { id: "system-list", kind: "system-list", scope: { systems: "partial" } }, records: { systems } };
await check("source-and-record-types-fail-closed", () => {
  for (const input of [
    { ...partial, source: { ...partial.source, id: 123 } },
    { ...partial, source: { ...partial.source, kind: 456 } },
    { ...partial, records: { systems: { length: 0 } } },
    { ...partial, records: { systems: null } }
  ]) assert.throws(() => runtime.createKnowledgeSnapshot([input]));
});
await check("systems-only-no-invented-evidence", () => {
  const snapshot = runtime.createKnowledgeSnapshot([partial]);
  assert.equal(snapshot.facts.length, 3);
  assert(snapshot.facts.every((fact) => fact.table === "systems" && !fact.provenance[0].location));
  assert(snapshot.gaps.some((gap) => gap.code === "scope-not-provided" && gap.table === "relationships"));
  assert.equal(snapshot.conflicts.length, 0);
});
await check("deterministic-order-and-duplicates", () => {
  assert.deepEqual(runtime.createKnowledgeSnapshot([partial]), runtime.createKnowledgeSnapshot([
    { ...partial, records: { systems: [systems[2], systems[1], systems[0], systems[0]] } }
  ]));
});
await check("immutable-copy-and-digest", () => {
  const input = structuredClone(partial), snapshot = runtime.createKnowledgeSnapshot([input]);
  input.records.systems[0].description = "Changed";
  assert.deepEqual(snapshot, runtime.createKnowledgeSnapshot([partial]));
  assert.notEqual(snapshot.digest, runtime.createKnowledgeSnapshot([input]).digest);
  assert(Object.isFrozen(snapshot.facts[0].provenance));
  assert.throws(() => snapshot.facts.pop());
});
await check("explicit-conflict-retains-both-claims", () => {
  const other = { ...partial, source: { ...partial.source, id: "other" }, records: { systems: [{ ...systems[0], description: "Other claim" }] } };
  const snapshot = runtime.createKnowledgeSnapshot([partial, other]);
  assert.equal(snapshot.conflicts.length, 1);
  assert.equal(snapshot.conflicts[0].code, "incompatible-records");
  assert.equal(snapshot.conflicts[0].factIds.length, 2);
  assert.equal(snapshot.facts.length, 4);
});
await check("all-source-provenance-and-scope-digest", () => {
  const other = { ...partial, source: { ...partial.source, id: "other", scope: { systems: "complete" } },
    records: { systems: [{ ...systems[0], location: { file: "inventory.md", line: 3 } }] } };
  const snapshot = runtime.createKnowledgeSnapshot([partial, other]);
  const fact = snapshot.facts.find((fact) => fact.value.id === "alpha");
  assert.equal(fact.provenance.length, 2);
  assert(fact.provenance.some((proof) => proof.sourceId === "other" && proof.location?.line === 3));
  assert.notEqual(snapshot.digest, runtime.createKnowledgeSnapshot([partial]).digest);
});
await check("alias-ambiguity-and-missing-reference", () => {
  const snapshot = runtime.createKnowledgeSnapshot([{ ...partial, source: { ...partial.source, scope: { systems: "partial", aliases: "partial" } },
    records: { systems, aliases: [{ alias: "Common", targetId: "alpha" }, { alias: "common", targetId: "beta" }, { alias: "Absent", targetId: "absent" }] } }]);
  assert.deepEqual(snapshot.ambiguities, [{ alias: "common", targetIds: ["alpha", "beta"] }]);
  assert(snapshot.gaps.some((gap) => gap.code === "missing-reference" && gap.targetId === "absent"));
  assert.equal(snapshot.facts.filter((fact) => fact.table === "systems").length, 3);
});
const headers = {
  systems: ["id", "canonical_name", "kind", "description"], actors: ["id", "canonical_name", "kind", "description"],
  relationships: ["from_id", "to_id", "interface_type", "interface_name", "mode", "purpose"], aliases: ["alias", "target_id"], rules: ["rule", "from_id", "to_id", "reason"]
};
function pack(folder, withRelationship) {
  mkdirSync(folder);
  for (const [table, columns] of Object.entries(headers)) {
    const rows = table === "systems" ? systems.map((row) => [row.id, row.canonicalName, row.kind, row.description]) :
      table === "relationships" && withRelationship ? [["alpha", "beta", "DB", "Store Writer", "synchronous", "Stores data"]] : [];
    const markdownRow = (cells) => `| ${cells.join(" | ")} |\n`;
    writeFileSync(path.join(folder, `${table}.md`), `# Synthetic knowledge\n\n${markdownRow(columns)}${markdownRow(columns.map(() => "---"))}${rows.map(markdownRow).join("")}`);
  }
}
const fullPath = path.join(root, "full"), onlyPath = path.join(root, "systems-only");
pack(fullPath, true); pack(onlyPath, false);
const common = runtime.knowledgeSnapshotFromPack({ systems: systems.map((row, index) => ({ ...row, location: { file: "systems.md", line: index + 5 } })),
  actors: [], aliases: [], rules: [], relationships: [{ fromId: "alpha", toId: "beta", interfaceType: "DB", interfaceName: "Store Writer",
    mode: "synchronous", purpose: "Stores data", location: { file: "relationships.md", line: 5 } }] });
const generator = { kind: "openai-compatible-local", baseUrl: "http://127.0.0.1:1234/v1", modelId: "synthetic" };
const flow = { kind: "document", text: "---\ndiagram_name: knowledge\nflow_name: Knowledge\nauthor: Synthetic\nlanguage: en\n---\nAlpha Service stores data in Beta Store.\n" };
const knowledgeByType = {};
for (const diagramType of ["sequence", "component"]) for (const variant of ["full", "systems-only", "invalid-plan", "cancelled"]) {
  await check(`${diagramType}-${variant}-knowledge-and-call-policy`, async () => {
    const calls = [];
    const client = { clientType: "openai-compatible-local", generationMetadata: { modelId: "synthetic", temperature: 0, seed: 42, attemptCount: 1, structuredOutput: true },
      async complete(chat) {
        const input = JSON.parse(chat.messages[1].content); calls.push(input);
        if (calls.length === 2) return { source: "content", value: { accepted: true, violations: [], confirmedUserStatedFactIds: variant === "systems-only" ? ["fact-0001"] : [] } };
        if (variant === "invalid-plan") return { source: "content", value: {} };
        const userStated = variant === "systems-only";
        const edge = { fromId: "alpha", toId: "beta", interfaceType: "DB", interfaceName: null, flowEvidenceId: input.snapshot.flowEvidence[0].flowEvidenceId };
        const value = diagramType === "sequence" ? { version: 3,
          groundedSteps: userStated ? [] : [{ order: 1, operationId: "op-0001", label: "Stores data" }],
          userStatedSteps: userStated ? [{ ...edge, order: 1, interactionKind: "request", label: "Stores data" }] : [] } : { version: 1,
          elementIds: input.snapshot.elements.map((item) => item.id), groundedDependencies: userStated ? [] : input.relationshipCatalog.map((item) => item.dependencyId),
          userStatedDependencies: userStated ? [{ ...edge, mode: "synchronous" }] : [] };
        return { source: "content", value };
      } };
    const app = runtime.createArchiAgentRuntime({ diagramClientFactory: () => client });
    const result = await app.generateDiagram({ diagramType, generator, flow,
      knowledgePack: { kind: "local-directory", path: variant === "systems-only" ? onlyPath : fullPath },
      ...(variant === "cancelled" ? { signal: { aborted: true } } : {}) });
    assert.equal(result.status, variant === "invalid-plan" || variant === "cancelled" ? "failed" : "success");
    assert.equal(calls.length, variant === "cancelled" ? 0 : variant === "invalid-plan" ? 1 : 2);
    if (calls.length === 2) {
      assert.deepEqual(calls[0].snapshot, calls[1].snapshot);
      assert(!JSON.stringify(calls[0].snapshot.knowledge).includes("Unrelated System"));
      assert(!JSON.stringify(calls[0].snapshot.knowledge).includes(root));
      assert(result.plantUml.includes('database "Beta Store"'));
      if (variant === "full") {
        assert.equal(calls[0].snapshot.knowledge.digest, common.digest);
        knowledgeByType[diagramType] = calls[0].snapshot.knowledge;
      } else {
        assert.equal(calls[0].snapshot.relationships.length, 0);
        assert(calls[0].snapshot.knowledge.provenance.every((fact) => JSON.parse(fact.recordKey)[0] === "systems"));
        assert.equal(JSON.parse(result.groundingReport).facts[0].evidenceClass, "user-stated");
      }
    }
  });
}
await check("Sequence-and-Component-share-common-knowledge", () => assert.deepEqual(knowledgeByType.sequence, knowledgeByType.component));
const passed = results.every((result) => result.status === "PASS");
writeFileSync(reportPath, JSON.stringify({ status: passed ? "PASS" : "FAIL", runtime: bundle, testRoot: root, cwd: process.cwd(),
  nodePath: process.env.NODE_PATH ?? null, results }, null, 2) + "\n");
process.stdout.write(`K1 packaged runtime: ${results.filter((result) => result.status === "PASS").length}/${results.length}\n`);
if (!passed) process.exitCode = 1;
