#!/usr/bin/env node
// Run only against the CJS bundle extracted from the candidate VSIX, outside the repository.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import ownership from "./ux3-onboarding-ownership-smoke.cjs";

const [bundle, reportPath] = process.argv.slice(2);
if (!bundle || !reportPath) throw new Error("usage: ux3-packaged-runtime-smoke.mjs <extracted-runtime.cjs> <report.json>");
const runtime = createRequire(import.meta.url)(bundle);
const root = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "archi-ux3-packaged-")));
const names = ["systems.md", "actors.md", "relationships.md", "aliases.md", "rules.md"];
const system = { id: "synthetic-service", canonicalName: "Synthetic Service", kind: "service", description: "Synthetic test system" };
const results = [];
results.push(...await ownership.ownershipSmoke(bundle));
async function check(id, expected, fn, errorCode) {
  try {
    const actual = await fn();
    assert.equal(actual, expected);
    results.push({ id, layer: "packaged-runtime", status: "PASS", expected, actual,
      ...(errorCode ? { errorCode } : ["location-exists", "symbolic-link", "write-failed"].includes(actual) ? { errorCode: actual } : {}) });
  } catch (error) {
    results.push({ id, layer: "packaged-runtime", status: "FAIL", expected,
      actual: error instanceof Error ? error.name : "unknown-error",
      errorCode: typeof error?.code === "string" ? error.code : "assertion-failed" });
  }
}
function exactFive(folder) {
  assert.deepEqual(readdirSync(folder).sort(), [...names].sort());
  for (const name of names) assert.match(readFileSync(path.join(folder, name), "utf8"), /^# /u);
  return "five-valid-markdowns";
}
await check("missing-parents", "five-valid-markdowns", async () => {
  const folder = path.join(root, "missing", "parents", "knowledge");
  await runtime.createStarterKnowledgePack(folder, system);
  return exactFive(folder);
});
await check("existing-empty", "directory-preserved", async () => {
  const folder = path.join(root, "existing-empty"); mkdirSync(folder);
  const receipt = await runtime.createStarterKnowledgePack(folder, system);
  exactFive(folder);
  await runtime.cleanupStarterKnowledgePack(receipt);
  assert.equal(existsSync(folder), true);
  assert.deepEqual(readdirSync(folder), []);
  return "directory-preserved";
});
await check("production-loader", "valid-pack", async () => {
  const folder = path.join(root, "missing", "parents", "knowledge");
  const result = await runtime.validateKnowledgePackDirectory(folder);
  assert.deepEqual(result, { ok: true });
  return "valid-pack";
});
await check("nonempty-preserved", "location-exists", async () => {
  const folder = path.join(root, "nonempty"); mkdirSync(folder);
  writeFileSync(path.join(folder, "owner.txt"), "owner data\n");
  try { await runtime.createStarterKnowledgePack(folder, system); }
  catch (error) {
    assert.equal(readFileSync(path.join(folder, "owner.txt"), "utf8"), "owner data\n");
    assert.deepEqual(readdirSync(folder), ["owner.txt"]);
    return error.code;
  }
  return "unexpected-success";
});
await check("file-collision-preserved", "location-exists", async () => {
  const folder = path.join(root, "collision"); mkdirSync(folder);
  writeFileSync(path.join(folder, "systems.md"), "owner data\n");
  try { await runtime.createStarterKnowledgePack(folder, system); }
  catch (error) {
    assert.equal(readFileSync(path.join(folder, "systems.md"), "utf8"), "owner data\n");
    return error.code;
  }
  return "unexpected-success";
});
await check("concurrent-file-collision-cleanup", "location-exists", async () => {
  const folder = path.join(root, "late-collision"); mkdirSync(folder);
  await assert.rejects(runtime.createStarterKnowledgePack(folder, system, { onStep: (step, file) => {
    if (step === "after-write" && path.basename(file) === "systems.md") writeFileSync(path.join(folder, "actors.md"), "owner data\n");
  } }), { code: "location-exists" });
  assert.deepEqual(readdirSync(folder), ["actors.md"]);
  assert.equal(readFileSync(path.join(folder, "actors.md"), "utf8"), "owner data\n");
  return "location-exists";
});
await check("symlink-rejection-intentional", "symbolic-link", async () => {
  const target = path.join(root, "owner-target"); mkdirSync(target);
  const link = path.join(root, "intentional-link"); symlinkSync(target, link);
  await assert.rejects(runtime.createStarterKnowledgePack(path.join(link, "knowledge"), system), { code: "symbolic-link" });
  assert.deepEqual(readdirSync(target), []);
  return "symbolic-link";
});
for (const stage of ["after-open", "before-close", "before-verify"]) {
  await check(`failure-${stage}-cleanup`, "write-failed", async () => {
    const folder = path.join(root, `failure-${stage}`, "knowledge");
    await assert.rejects(runtime.createStarterKnowledgePack(folder, system, { onStep: (step) => {
      if (step === stage) throw new Error("synthetic failure");
    } }), { code: "write-failed" });
    assert.equal(existsSync(path.dirname(folder)), false);
    return "write-failed";
  });
}
await check("close-failure-cleanup", "write-failed", async () => {
  const folder = path.join(root, "close-failure"); mkdirSync(folder);
  await assert.rejects(runtime.createStarterKnowledgePack(folder, system, { closeHandle: async () => { throw new Error("synthetic close failure"); } }), { code: "write-failed" });
  assert.deepEqual(readdirSync(folder), []);
  return "write-failed";
});
await check("partial-write-preserved", "uncertain-partial-preserved", async () => {
  const folder = path.join(root, "partial"); mkdirSync(folder);
  try {
    await runtime.createStarterKnowledgePack(folder, system, { onStep: async (step, file, handle) => {
      if (step === "after-open" && path.basename(file) === "systems.md") {
        await handle.writeFile("partial", "utf8");
        throw new Error("synthetic-write-failure");
      }
    } });
  } catch (error) {
    assert.equal(error.code, "write-failed");
    assert.equal(error.cleanupIncomplete, true);
    assert.match(error.recovery, /Inspect the chosen directory/u);
  }
  assert.deepEqual(readdirSync(folder), ["systems.md"]);
  assert.equal(readFileSync(path.join(folder, "systems.md"), "utf8"), "partial");
  return "uncertain-partial-preserved";
}, "write-failed");
await check("changed-file-preserved", "owner-file-preserved", async () => {
  const folder = path.join(root, "changed"); mkdirSync(folder);
  try {
    await runtime.createStarterKnowledgePack(folder, system, { onStep: (step, file) => {
      if (step === "before-verify" && path.basename(file) === "systems.md") {
        writeFileSync(file, "owner change\n");
        throw new Error("synthetic-verify-failure");
      }
    } });
  } catch (error) { assert.equal(error.code, "write-failed"); }
  assert.equal(readFileSync(path.join(folder, "systems.md"), "utf8"), "owner change\n");
  return "owner-file-preserved";
}, "write-failed");
await check("cleanup-permission-failure-and-recovery", "files-preserved-then-cleaned", async () => {
  assert.notEqual(process.platform, "win32", "Unix permission fault required");
  assert.notEqual(process.getuid?.(), 0, "non-root permission fault required");
  const folder = path.join(root, "denied-cleanup");
  const receipt = await runtime.createStarterKnowledgePack(folder, system);
  const before = names.map((name) => readFileSync(path.join(folder, name), "utf8"));
  chmodSync(folder, 0o500);
  try {
    assert.throws(() => unlinkSync(path.join(folder, "systems.md")), (error) => ["EACCES", "EPERM"].includes(error.code));
    await runtime.cleanupStarterKnowledgePack(receipt);
    exactFive(folder);
    assert.deepEqual(names.map((name) => readFileSync(path.join(folder, name), "utf8")), before);
  } finally { chmodSync(folder, 0o700); }
  await runtime.cleanupStarterKnowledgePack(receipt);
  assert.equal(existsSync(folder), false);
  return "files-preserved-then-cleaned";
}, "permission-denied");
await check("macos-path", "canonical-test-root", async () => {
  assert.equal(root, realpathSync(root));
  assert.equal(root.startsWith(realpathSync(tmpdir())), true);
  return "canonical-test-root";
});
const hasTempAlias = path.resolve(tmpdir()) !== realpathSync(tmpdir());
await check("tmpdir-system-alias-intentional-rejection", hasTempAlias ? "symbolic-link" : "no-system-alias", async () => {
  if (!hasTempAlias) return "no-system-alias";
  const logical = path.join(tmpdir(), path.basename(root), "intentional-alias-pack");
  await assert.rejects(runtime.createStarterKnowledgePack(logical, system), { code: "symbolic-link" });
  assert.equal(existsSync(path.join(root, "intentional-alias-pack")), false);
  return "symbolic-link";
});
await check("replacement-directory-preserved", "replacement-and-moved-files-preserved", async () => {
  const folder = path.join(root, "replacement");
  const receipt = await runtime.createStarterKnowledgePack(folder, system);
  renameSync(folder, `${folder}-moved`); mkdirSync(folder);
  await runtime.cleanupStarterKnowledgePack(receipt);
  assert.deepEqual(readdirSync(folder), []);
  exactFive(`${folder}-moved`);
  return "replacement-and-moved-files-preserved";
});
const globalDefault = runtime.defaultKnowledgePackPath(undefined);
const links = [];
for (let ancestor = globalDefault; ; ancestor = path.dirname(ancestor)) {
  try { if (lstatSync(ancestor).isSymbolicLink()) links.push(ancestor); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (path.dirname(ancestor) === ancestor) break;
}
await check("global-default-inspection", "home-Documents-ArchiAgent-knowledge", async () => {
  assert.equal(globalDefault, path.join(homedir(), "Documents", "ArchiAgent", "knowledge"));
  return "home-Documents-ArchiAgent-knowledge";
});
writeFileSync(reportPath, JSON.stringify({ testRoot: root, logicalTempDirectory: tmpdir(), physicalTempDirectory: realpathSync(tmpdir()),
  globalDefault, globalDefaultSymlinkAncestors: links, globalDefaultOperation: "path inspection only; no owner-home writes", results }, null, 2));
if (results.some((item) => item.status !== "PASS")) process.exitCode = 1;
