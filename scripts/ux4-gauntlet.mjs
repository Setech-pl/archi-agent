#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyVsix } from "../vscode-extension/scripts/verify-vsix.mjs";
import { openVsix } from "../vscode-extension/scripts/vsix-zip.mjs";
import { buildExtensionBundles, bundleFileNames } from "../vscode-extension/scripts/build.mjs";
import { runArt1UiSmoke } from "./art1-real-ui-smoke.mjs";
import { runK3UiSmoke } from "./k3-real-ui-smoke.mjs";
import { runHostSmoke } from "./ux3-vscode-smoke.mjs";
import { prepareDocxFixtures } from "./docx-compatibility-smoke.mjs";

const fu1 = process.argv.includes("--fu1");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, fu1 ? "build/ux4-fu1" : "build/ux4", `gauntlet-${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}`);
mkdirSync(out, { recursive: true });
const commands = [], scenarios = [];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git-exit-${result.status}`);
  return result.stdout.trimEnd();
};
function run(label, executable, args, options = {}) {
  const env = { ...process.env, npm_config_userconfig: "/dev/null", ...options.env };
  delete env.npm_config_allow_scripts;
  const result = spawnSync(executable, args, { cwd: options.cwd ?? repo, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env });
  const log = path.join(out, `${label}.log`);
  writeFileSync(log, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  commands.push({ label, executable, args, cwd: options.cwd ?? repo, exitCode: result.status, log });
  scenarios.push({ id: label, status: result.status === 0 ? "PASS" : "FAIL" });
  process.stdout.write(`${label}: ${result.status === 0 ? "PASS" : "FAIL"}\n`);
  return result;
}
function readScenarios(file, minimum) {
  if (!existsSync(file)) { scenarios.push({ id: path.basename(file), status: "NOT_RUN", reason: "missing-report" }); return; }
  const report = JSON.parse(readFileSync(file, "utf8"));
  const entries = report.results ?? [];
  scenarios.push(...entries);
  scenarios.push({ id: `${path.basename(file)}-coverage`, status: entries.length >= minimum ? "PASS" : "FAIL" });
}
function sourceFiles() {
  return Object.fromEntries(git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter(Boolean).sort()
    .map((file) => [file, existsSync(path.join(repo, file)) ? sha(readFileSync(path.join(repo, file))) : null]));
}
function artifacts(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? artifacts(file) : entry.name.endsWith(".vsix") ? [{ path: file, sha256: sha(readFileSync(file)) }] : [];
  });
}
const metadata = { milestone: fu1 ? "UX4-FU1" : "UX4", base: fu1 ? "4dd62465a909020b415ae27698a0878508da438d" : "8375861582e64cd90e75843eb4c0fa66e50f7867", independentReview: "PENDING", head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), initialStatus: git("status", "--short"),
  initialStaging: git("diff", "--cached", "--name-only"), sourceFilesSha256: sourceFiles(),
  environment: { node: process.version, platform: process.platform, arch: process.arch }, startedAt: new Date().toISOString(), ownerSmoke: "NOT_COMPLETED",
  uiApplicability: "Required: real native pickers, ART1 confirmation and visible ART1/K3 controls; host controlled-answer evidence reported separately." };
metadata.sourceStateSha256 = sha(JSON.stringify(metadata.sourceFilesSha256));
const previous = ["build/ux3", "build/k1", "build/k2", "build/k3", "build/art1", "build/art1-audit-fixes", "build/docs-pl-en", "build/fu01", "build/ux4"].flatMap((folder) => artifacts(path.join(repo, folder)));
let vsix, vsixSha256, vsixSize;
try {
  run("install-root", "npm", ["ci"]);
  run("install-ocr", "npm", ["ci"], {cwd:path.join(repo,"experiments/ux2-ocr")});
  const ocrAudit = run("audit-ocr", "npm", ["audit", "--json"], { cwd: path.join(repo, "experiments/ux2-ocr") });
  writeFileSync(path.join(out, "audit-ocr.json"), ocrAudit.stdout ?? "");
  const focusedJson = path.join(out, "focused-tests.json");
  run("focused", "npx", ["vitest", "run", "test/vscode-extension/configuration-workbench.test.ts", "test/runtime/ux4-fu1.test.ts", "test/vscode-extension/knowledge-browser.test.ts", "test/runtime/diagram-artifact.test.ts", "test/vscode-extension/save-diagram-and-report.test.ts", "test/runtime/knowledge-pack-review.test.ts", "test/vscode-extension/build-knowledge-pack.test.ts", "test/runtime/document-candidates.test.ts", "test/runtime/convert-document.test.ts", "test/node/document-conversion.test.ts", "test/unit/knowledge-pack/builder/knowledge-pack-builder.test.ts", "test/unit/knowledge-pack/knowledge-snapshot.test.ts", "test/runtime/knowledge-snapshot.test.ts",
    "test/core/pipeline/reviewed-sequence-digest.test.ts", "test/core/pipeline/component-diagram.test.ts", "test/runtime/generate-diagram.test.ts",
    "test/runtime/component-diagram.test.ts", "test/runtime/knowledge-pack-onboarding.test.ts", "test/runtime/knowledge-pack-onboarding-ownership.test.ts", "test/vscode-extension/knowledge-pack-onboarding.test.ts", "--reporter=json", `--outputFile=${focusedJson}`]);
  if (!existsSync(focusedJson)) scenarios.push({ id: "focused-json", status: "NOT_RUN" });
  else {
    const focused = JSON.parse(readFileSync(focusedJson, "utf8"));
    scenarios.push({ id: "focused-coverage", status: focused.numTotalTests > 0 && focused.numPassedTests === focused.numTotalTests && ["diagram-artifact.test.ts", "save-diagram-and-report.test.ts"].every((name) => focused.testResults.some((file) => file.name.endsWith(name) && file.assertionResults.length > 0 && file.assertionResults.every((test) => test.status === "passed"))) ? "PASS" : "FAIL", count: focused.numPassedTests });
  }
  const audit = run("audit-json", "npm", ["audit", "--json"]);
  writeFileSync(path.join(out, "audit.json"), audit.stdout ?? "");
  run("docx-source", process.execPath, ["scripts/docx-source-smoke.mjs", path.join(out, "docx-source.json")]);
  readScenarios(path.join(out, "docx-source.json"), 5);
  const fullGates = run("full-gates", "bash", [".agents/skills/archi-agent-gauntlet/scripts/run-gates.sh", "--vsix-out", out]);
  metadata.fullGateCommands = (fullGates.stdout ?? "").split("\n").filter((line) => line.startsWith("+ "))
    .map((line) => ({ command: line.slice(2), exitCode: fullGates.status === 0 ? 0 : null }));
  const manifest = JSON.parse(readFileSync(path.join(repo, "vscode-extension/package.json"), "utf8"));
  const candidate = path.join(out, `${manifest.name}-${manifest.version}.vsix`);
  if (!existsSync(candidate)) throw new Error("candidate-not-built");
  vsix = candidate; vsixSha256 = sha(readFileSync(vsix)); vsixSize = statSync(vsix).size;
  run("documentation",process.execPath,["scripts/docs/check-docs.mjs",out,vsix,"--functional"]);
  const verified = verifyVsix(vsix);
  scenarios.push({ id: "candidate-verification", status: verified.ok ? "PASS" : "FAIL", entries: verified.entries.length });
  const extracted = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "archi-ux4-extracted-")));
  metadata.extracted = extracted;
  const archive = openVsix(vsix);
  for (const entry of archive.entries) {
    if (entry.name.endsWith("/")) continue;
    const file = path.join(extracted, entry.name);
    if (!file.startsWith(extracted + path.sep)) throw new Error("unsafe-vsix-entry");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, archive.read(entry.name));
  }
  const runtime = path.join(extracted, "extension/dist/archi-agent-runtime.js"), worker = path.join(extracted, "extension/dist/archi-agent-converter-worker.js");
  const assets = archive.entries.filter((entry) => entry.name.startsWith("extension/ux2-ocr/") && !entry.name.endsWith("/"));
  metadata.resourceHashes = Object.fromEntries(assets.map((entry) => [entry.name, {
    candidate: sha(archive.read(entry.name)), freshBuild: sha(readFileSync(path.join(repo, "build/ux2-ocr/phase2/stage", entry.name)))
  }]));
  scenarios.push({ id: "ocr-resources-source-package-match", status: assets.length > 0 && Object.values(metadata.resourceHashes).every((entry) => entry.candidate === entry.freshBuild) ? "PASS" : "FAIL", count: assets.length });
  const rebuilt = await buildExtensionBundles({ outDir: path.join(extracted, "rebuilt") });
  metadata.bundleHashes = Object.fromEntries(Object.values(bundleFileNames).map((name) => [name, {
    candidate: sha(archive.read(`extension/dist/${name}`)), freshSourceBuild: sha(readFileSync(path.join(rebuilt.outDir, name)))
  }]));
  scenarios.push({ id: "source-package-byte-match", status: Object.values(metadata.bundleHashes).every((entry) => entry.candidate === entry.freshSourceBuild) ? "PASS" : "FAIL" });
  for (const script of ["art1-packaged-runtime-smoke.mjs", "art1-smoke-fixture.cjs", "k3-packaged-runtime-smoke.mjs", "k2-packaged-runtime-smoke.mjs", "k1-packaged-runtime-smoke.mjs", "ux3-packaged-runtime-smoke.mjs", "ux3-onboarding-ownership-smoke.cjs", "ux3-onboarding-ownership-fixture.cjs", "docx-compatibility-smoke.mjs"])
    copyFileSync(path.join(repo, "scripts", script), path.join(extracted, script));
  const isolated = { cwd: extracted, env: { NODE_PATH: "", PATH: "" } };
  for (const [label, script, minimum] of [["k1-runtime", "k1-packaged-runtime-smoke.mjs", 15], ["ux3-runtime-regression", "ux3-packaged-runtime-smoke.mjs", 27]]) {
    const json = path.join(out, `${label}.json`);
    run(label, process.execPath, [path.join(extracted, script), runtime, json], isolated);
    readScenarios(json, minimum);
  }
  const fixtures = path.join(extracted, "docx-fixtures");
  await prepareDocxFixtures(fixtures, path.join(repo, "test/fixtures/document-conversion/structured.docx"));
  const docxJson = path.join(out, "docx-packaged.json");
  run("docx-packaged", process.execPath, [path.join(extracted, "docx-compatibility-smoke.mjs"), runtime, worker, fixtures, docxJson], isolated);
  readScenarios(docxJson, 5);
  const sourceFixtures = path.join(extracted, "k2-source-fixtures");
  run("synthetic-ocr-fixtures", process.execPath, ["experiments/ux2-ocr/make-fixtures.mjs", sourceFixtures]);
  for (const name of ["structured.docx", "two-sheets.xlsx", "two-pages.pdf"])
    copyFileSync(path.join(repo, "test/fixtures/document-conversion", name), path.join(sourceFixtures, name));
  const k2Json = path.join(out, "k2-runtime.json");
  run("k2-runtime", process.execPath, [path.join(extracted, "k2-packaged-runtime-smoke.mjs"), runtime, sourceFixtures, k2Json], isolated);
  readScenarios(k2Json, 17);
  const k3Json = path.join(out, "k3-runtime.json");
  run("k3-runtime", process.execPath, [path.join(extracted, "k3-packaged-runtime-smoke.mjs"), runtime, k3Json], isolated);
  readScenarios(k3Json, 13);
  const art1Json = path.join(out, "art1-runtime.json");
  run("art1-runtime", process.execPath, [path.join(extracted, "art1-packaged-runtime-smoke.mjs"), runtime, art1Json], isolated);
  readScenarios(art1Json, 14);
  const art1Runtime = JSON.parse(readFileSync(art1Json, "utf8"));
  scenarios.push({ id: "ART1-01-exact-VSIX-coverage", status: ["sequence", "component"].every((type) =>
    art1Runtime.results.some((entry) => entry.id === `art1-${type}-model-identity-audit-regression` && entry.status === "PASS")) ? "PASS" : "FAIL" });
  const ux4host = await runHostSmoke(vsix, out, "ux4-extension-host.cjs", "ux4-host");
  scenarios.push(...ux4host);
  scenarios.push({id:"UX4-Host-coverage",status:ux4host.length>=18&&ux4host.every(r=>r.status==="PASS")?"PASS":"FAIL"});
  const host = await runHostSmoke(vsix, out);
  metadata.extensionHost = { executable: "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
    reports: ["global", "single-folder", "multi-root"].map((mode) => {
      const data = JSON.parse(readFileSync(path.join(out, `host-${mode}.json`), "utf8"));
      return { mode, version: data.version, node: data.node };
    }) };
  scenarios.push(...host);
  scenarios.push({ id: "Extension-Host-coverage", status: host.length >= 12 ? "PASS" : "FAIL" });
  const k3host = await runHostSmoke(vsix, out, "k3-extension-host.cjs", "k3-host");
  scenarios.push(...k3host);
  scenarios.push({ id: "K3-Host-coverage", status: k3host.length >= 33 ? "PASS" : "FAIL" });
  const art1host = await runHostSmoke(vsix, out, "art1-extension-host.cjs", "art1-host", ["art1-smoke-fixture.cjs"]);
  scenarios.push(...art1host);
  scenarios.push({ id: "ART1-Host-coverage", status: art1host.length === 21 && art1host.every((r) => r.status === "PASS") ? "PASS" : "FAIL" });
  const lifecycle = await runHostSmoke(vsix, out, "art1-preview-lifecycle-host.cjs", "art1-q02-host", ["art1-smoke-fixture.cjs"]);
  scenarios.push(...lifecycle);
  scenarios.push({ id: "ART1-Q02-Host-coverage", status: lifecycle.length === 15 && lifecycle.every((r) => r.status === "PASS") ? "PASS" : "FAIL" });
  const art1ui = await runArt1UiSmoke(vsix, out);
  scenarios.push(...art1ui);
  scenarios.push({ id: "ART1-real-UI-coverage", status: art1ui.length === 9 && art1ui.every((r) => r.status === "PASS") ? "PASS" : "FAIL" });
  if (fu1) {
    const { runFu1UiSmoke } = await import("./ux4-fu1-real-ui-smoke.mjs");
    const fu1ui = await runFu1UiSmoke(vsix, out);
    scenarios.push(...fu1ui);
    scenarios.push({ id: "UX4-FU1-native-coverage", status: fu1ui.length === 12 && fu1ui.every(r=>r.status === "PASS") ? "PASS" : "FAIL" });
  }
  const nativeProjectParent = fu1 ? path.join(path.dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir")), "build/ux4-fu1/native-projects", path.basename(out)) : out;
  mkdirSync(nativeProjectParent, { recursive: true });
  const ui = await runK3UiSmoke(vsix, out, nativeProjectParent);
  scenarios.push(...ui);
  scenarios.push({ id: "UX4-K3-real-UI-coverage", status: ui.length >= 28 && ui.every((r) => r.status === "PASS") ? "PASS" : "FAIL" });
} catch (error) { scenarios.push({ id: "gauntlet", status: "FAIL", reason: error.message }); }
scenarios.push({ id: "source-stability", status: JSON.stringify(sourceFiles()) === JSON.stringify(metadata.sourceFilesSha256) ? "PASS" : "FAIL" });
scenarios.push({ id: "staging-empty", status: metadata.initialStaging === "" && git("diff", "--cached", "--name-only") === "" ? "PASS" : "FAIL" });
scenarios.push({ id: "earlier-artifacts-preserved", status: previous.every((entry) => existsSync(entry.path) && sha(readFileSync(entry.path)) === entry.sha256) ? "PASS" : "FAIL", count: previous.length });
for (const item of [...commands, ...scenarios]) { item.vsixSha256 = vsixSha256 ?? null; item.sourceStateSha256 = metadata.sourceStateSha256; }
const passed = scenarios.length > 0 && scenarios.every((entry) => entry.status === "PASS") && commands.every((entry) => entry.exitCode === 0);
const report = { ...metadata, completedAt: new Date().toISOString(), status: passed ? "PASS" : "INCOMPLETE_OR_FAILED", commands, scenarios,
  vsix, vsixSize, vsixSha256, finalHead: git("rev-parse", "HEAD"), finalStatus: git("status", "--short"), finalStaging: git("diff", "--cached", "--name-only") };
for (const file of readdirSync(out).filter((file) => file.endsWith(".json"))) {
  const target = path.join(out, file), evidence = JSON.parse(readFileSync(target, "utf8"));
  evidence.vsixSha256 = vsixSha256 ?? null; evidence.sourceStateSha256 = metadata.sourceStateSha256;
  writeFileSync(target, JSON.stringify(evidence, null, 2) + "\n");
}
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(path.join(out, "manifest.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(path.join(out, "report.txt"), [`UX4 gauntlet: ${report.status}`, `Branch: ${report.branch}`, `HEAD: ${report.head}`,
  `VSIX: ${vsix}`, `Bytes: ${vsixSize}`, `SHA-256: ${vsixSha256}`, `Sources: ${metadata.sourceStateSha256}`,
  `OWNER_SMOKE: NOT_COMPLETED`, metadata.uiApplicability, "", ...commands.map((entry) => `${entry.label}: exit ${entry.exitCode}; ${entry.log}`),
  "", ...scenarios.map((entry) => `${entry.status} ${entry.id}`), ""].join("\n"));
process.stdout.write(`Report: ${out}/report.txt\n`);
if (!passed) process.exitCode = 1;
