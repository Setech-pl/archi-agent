#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyVsix } from "../vscode-extension/scripts/verify-vsix.mjs";
import { openVsix } from "../vscode-extension/scripts/vsix-zip.mjs";
import { runHostSmoke } from "./ux3-vscode-smoke.mjs";
import { runRealUiSmoke } from "./ux3-real-ui-smoke.mjs";
import { buildExtensionBundles, bundleFileNames } from "../vscode-extension/scripts/build.mjs";
import { prepareDocxFixtures } from "./docx-compatibility-smoke.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, "build", "ux3", `gauntlet-${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}`);
mkdirSync(out, { recursive: true });
const scenarios = [];
const commands = [];
const manifest = JSON.parse(readFileSync(path.join(repo, "vscode-extension/package.json"), "utf8"));
let vsix;
let vsixSize;
let vsixSha256;
function run(label, executable, args, options = {}) {
  // npm 11 rejects an unrelated user-level allow-scripts list for project audit.
  const environment = { ...process.env, npm_config_userconfig: "/dev/null" };
  delete environment.npm_config_allow_scripts;
  const result = spawnSync(executable, args, { cwd: options.cwd ?? repo, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    env: { ...environment, ...options.env } });
  const log = path.join(out, `${label}.log`);
  writeFileSync(log, `${result.stdout ?? ""}${result.stderr ?? ""}`);
  commands.push({ label, exitCode: result.status, log });
  process.stdout.write(`${label}: ${result.status === 0 ? "PASS" : "FAIL"} (${log})\n`);
  return result.status === 0;
}
function git(...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trimEnd() : `git-error-${result.status}`;
}
function record(id, layer, status, expected, actual, errorCode) {
  scenarios.push({ id, layer, status, expected, actual, ...(errorCode ? { errorCode } : {}) });
}
const metadata = { startedAt: new Date().toISOString(), head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
  initialStatus: git("status", "--short"), initialStaging: git("diff", "--cached", "--name-only"),
  logicalTempDirectory: tmpdir(), physicalTempDirectory: realpathSync(tmpdir()),
  hostTempDirectory: process.platform === "darwin" ? "/private/tmp" : realpathSync(tmpdir()),
  hostEvidence: "real configuration API; controlled editor answers; no real UI claim",
  uiEvidence: "installed VSIX; renderer keyboard controls through loopback CDP; native picker through macOS Accessibility" };
function sourceDigest() {
  const hash = createHash("sha256");
  hash.update(git("rev-parse", "HEAD"));
  hash.update(git("diff", "HEAD", "--binary"));
  for (const name of git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean).sort()) {
    hash.update(name); hash.update(readFileSync(path.join(repo, name)));
  }
  return hash.digest("hex");
}
metadata.sourceStateSha256 = sourceDigest();
metadata.sourceFilesSha256 = Object.fromEntries(git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter(Boolean).sort()
  .map((name) => [name, existsSync(path.join(repo, name)) ? createHash("sha256").update(readFileSync(path.join(repo, name))).digest("hex") : null]));
function previousArtifacts(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return previousArtifacts(file);
    return entry.isFile() && entry.name.endsWith(".vsix") ? [{ path: file, bytes: statSync(file).size,
      sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }] : [];
  });
}
metadata.previousArtifacts = ["build/ux3", "build/obs1", "vscode-extension/build"].flatMap((dir) => previousArtifacts(path.join(repo, dir)));
try {
  const docxSourceReport = path.join(out, "docx-source.json");
  const docxSource = run("docx-source", process.execPath, ["scripts/docx-source-smoke.mjs", docxSourceReport]);
  record("docx-source-harness", "sources", docxSource ? "PASS" : "FAIL", "production DOCX source scenarios pass", docxSource ? "exit 0" : "nonzero exit");
  if (existsSync(docxSourceReport)) scenarios.push(...JSON.parse(readFileSync(docxSourceReport, "utf8")).results);
  else record("docx-source-scenarios", "sources", "NOT_RUN", "DOCX result JSON", "missing report", "report-missing");
  const cli = run("mammoth-cli", process.execPath, ["scripts/mammoth-cli-compatibility.mjs", path.join(out, "mammoth-cli.json")]);
  record("mammoth-cli-compatibility", "sources", cli ? "PASS" : "FAIL", "11 CLI scenarios pass", cli ? "exit 0" : "nonzero exit");
  const gates = run("full-gates", "bash", [".agents/skills/archi-agent-gauntlet/scripts/run-gates.sh", "--vsix-out", out]);
  record("full-repository-gates", "sources", gates ? "PASS" : "FAIL", "all existing sequential gates pass",
    gates ? "all gates passed" : "one or more gates failed", gates ? undefined : "gate-failed");
  const focusedJson = path.join(out, "focused-tests.json");
  const focused = run("focused-scenarios", "npx", ["vitest", "run", "test/runtime/knowledge-pack-onboarding.test.ts",
    "test/runtime/knowledge-pack-onboarding-ownership.test.ts",
    "test/vscode-extension/knowledge-pack-onboarding.test.ts", "--reporter=json", `--outputFile=${focusedJson}`]);
  record("focused-harness-run", "sources", focused ? "PASS" : "FAIL", "UX3 harness command succeeds", focused ? "exit 0" : "nonzero exit", focused ? undefined : "test-run-failed");
  if (existsSync(focusedJson)) {
    const report = JSON.parse(readFileSync(focusedJson, "utf8"));
    record("focused-coverage", "sources", report.numTotalTests >= 55 ? "PASS" : "FAIL", "at least 55 named UX3 assertions", `${report.numTotalTests} assertions`, report.numTotalTests >= 55 ? undefined : "missing-tests");
    for (const suite of report.testResults ?? []) for (const item of suite.assertionResults ?? []) {
      const name = item.fullName.replace(/^(starter Knowledge Pack transaction|Knowledge Pack onboarding) /u, "");
      record(name, "sources", item.status === "passed" ? "PASS" : "FAIL", `assertions for ${name} pass`,
        item.status === "passed" ? "assertions passed" : "assertions failed", item.status === "passed" ? undefined : "test-failed");
    }
  } else record("focused-scenarios", "sources", "NOT_RUN", "individual UX3 assertions", "no Vitest JSON report", "report-missing");
  const candidate = path.join(out, `${manifest.name}-${manifest.version}.vsix`);
  if (existsSync(candidate)) {
    vsix = candidate;
    const verification = verifyVsix(vsix);
    record("candidate-verification", "packaged-runtime", verification.ok ? "PASS" : "FAIL", "VSIX allowlist and hashes valid",
      verification.ok ? `${verification.entries.length} entries verified` : verification.violations.join(", "),
      verification.ok ? undefined : "vsix-invalid");
    vsixSize = statSync(vsix).size;
    vsixSha256 = createHash("sha256").update(readFileSync(vsix)).digest("hex");
    const extracted = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "archi-ux3-extracted-")));
    const bundle = path.join(extracted, "runtime.cjs");
    const archive = openVsix(vsix);
    writeFileSync(bundle, archive.read("extension/dist/archi-agent-runtime.js"));
    const worker = path.join(extracted, "worker.cjs");
    writeFileSync(worker, archive.read("extension/dist/archi-agent-converter-worker.js"));
    const docxFixtures = path.join(extracted, "docx-fixtures");
    await prepareDocxFixtures(docxFixtures, path.join(repo, "test/fixtures/document-conversion/structured.docx"));
    const docxScript = path.join(extracted, "docx-compatibility-smoke.mjs");
    copyFileSync(path.join(repo, "scripts/docx-compatibility-smoke.mjs"), docxScript);
    const docxReport = path.join(out, "docx-packaged.json");
    run("docx-packaged", process.execPath, [docxScript, bundle, worker, docxFixtures, docxReport], { cwd: extracted, env: { NODE_PATH: "", PATH: "" } });
    if (existsSync(docxReport)) scenarios.push(...JSON.parse(readFileSync(docxReport, "utf8")).results);
    else record("docx-packaged-scenarios", "packaged-runtime", "NOT_RUN", "DOCX result JSON", "missing report", "report-missing");
    const rebuilt = await buildExtensionBundles({ outDir: path.join(extracted, "rebuilt") });
    metadata.candidateBundleHashes = {};
    let bundlesMatch = true;
    for (const name of Object.values(bundleFileNames)) {
      const packaged = archive.read(`extension/dist/${name}`);
      const rebuiltBytes = readFileSync(path.join(rebuilt.outDir, name));
      bundlesMatch &&= packaged.equals(rebuiltBytes);
      metadata.candidateBundleHashes[name] = { packaged: createHash("sha256").update(packaged).digest("hex"), rebuilt: createHash("sha256").update(rebuiltBytes).digest("hex") };
    }
    record("candidate-source-bundle-match", "packaged-runtime", bundlesMatch ? "PASS" : "FAIL", "packaged bundles equal a fresh source build", bundlesMatch ? "all three bundles byte-identical" : "bundle mismatch", bundlesMatch ? undefined : "bundle-mismatch");
    const smokeJson = path.join(out, "packaged-runtime.json");
    const smokeScript = path.join(extracted, "smoke.mjs");
    copyFileSync(path.join(repo, "scripts/ux3-packaged-runtime-smoke.mjs"), smokeScript);
    for (const name of ["ux3-onboarding-ownership-smoke.cjs", "ux3-onboarding-ownership-fixture.cjs"])
      copyFileSync(path.join(repo, "scripts", name), path.join(extracted, name));
    run("packaged-runtime", process.execPath, [smokeScript, bundle, smokeJson], { cwd: extracted, env: { NODE_PATH: "", PATH: "" } });
    metadata.packagedEvidence = "extracted CJS runtime and smoke outside repository; cwd outside repository; empty NODE_PATH and PATH";
    if (existsSync(smokeJson)) {
      const smoke = JSON.parse(readFileSync(smokeJson, "utf8"));
      for (const scenario of smoke.results) scenarios.push(scenario);
      metadata.packagedTestRoot = smoke.testRoot;
      metadata.globalDefault = smoke.globalDefault;
      metadata.globalDefaultSymlinkAncestors = smoke.globalDefaultSymlinkAncestors;
    } else record("packaged-runtime", "packaged-runtime", "NOT_RUN", "runtime scenarios", "no result JSON", "report-missing");
    for (const [layer, operation] of [["Extension Host", runHostSmoke], ["real-ui", runRealUiSmoke]]) {
      process.stdout.write(`${layer}: running isolated candidate checks\n`);
      try {
        const results = await operation(vsix, out); scenarios.push(...results);
        process.stdout.write(`${layer}: ${results.filter((item) => item.status === "PASS").length}/${results.length} PASS\n`);
      }
      catch (error) { record(`${layer}-startup`, layer, "NOT_RUN", "isolated VS Code scenarios", error.message, "harness-start-failed"); }
    }
    const stable = sourceDigest() === metadata.sourceStateSha256;
    record("source-state-stable", "sources", stable ? "PASS" : "FAIL", "source state unchanged during gates and packaging", stable ? "unchanged" : "changed", stable ? undefined : "source-changed");
  } else record("candidate-build", "packaged-runtime", "NOT_RUN", "new verified VSIX", "prerequisite gates failed", "prerequisite-failed");
  if (!scenarios.some((entry) => entry.layer === "real-ui")) record("real-ui-wizard", "real-ui", "NOT_RUN", "visible wizard controls", "candidate not available", "prerequisite-failed");
  if (!scenarios.some((entry) => entry.layer === "Extension Host")) record("extension-host-settings", "Extension Host", "NOT_RUN", "real settings", "candidate not available", "prerequisite-failed");
} catch (error) {
  record("gauntlet-internal", "sources", "FAIL", "runner completes", error instanceof Error ? error.message : "unknown error", "runner-error");
}
const preserved = metadata.previousArtifacts.every((item) => existsSync(item.path) && createHash("sha256").update(readFileSync(item.path)).digest("hex") === item.sha256);
record("previous-artifacts-preserved", "packaged-runtime", preserved ? "PASS" : "FAIL", "previous VSIX bytes unchanged", preserved ? `${metadata.previousArtifacts.length} prior hashes unchanged` : "previous artifact changed", preserved ? undefined : "artifact-changed");
const stagingEmpty = metadata.initialStaging === "" && git("diff", "--cached", "--name-only") === "";
record("staging-empty", "sources", stagingEmpty ? "PASS" : "FAIL", "staging remains empty", stagingEmpty ? "empty" : "staged changes present", stagingEmpty ? undefined : "staging-not-empty");
for (const [layer, minimum] of [["sources", 55], ["packaged-runtime", 20], ["Extension Host", 12], ["real-ui", 12]]) {
  const count = scenarios.filter((entry) => entry.layer === layer && entry.status === "PASS").length;
  if (count < minimum) record(`${layer}-coverage`, layer, "NOT_RUN", `at least ${minimum} passing scenarios`, `${count} passing scenarios; incomplete coverage`, "coverage-incomplete");
}
const requiredPassed = scenarios.length > 0 && scenarios.every((entry) => entry.status === "PASS") && commands.every((entry) => entry.exitCode === 0);
const report = { ...metadata, completedAt: new Date().toISOString(), finalStatus: git("status", "--short"),
  finalHead: git("rev-parse", "HEAD"),
  finalStaging: git("diff", "--cached", "--name-only"), vsix, vsixSize, vsixSha256, commands, scenarios,
  status: requiredPassed ? "PASS" : "INCOMPLETE_OR_FAILED" };
for (const scenario of scenarios) { scenario.vsixSha256 = vsixSha256 ?? null; scenario.sourceStateSha256 = metadata.sourceStateSha256; }
for (const command of commands) { command.vsixSha256 = vsixSha256 ?? null; command.sourceStateSha256 = metadata.sourceStateSha256; }
for (const name of readdirSync(out).filter((name) => name.endsWith(".json"))) {
  const file = path.join(out, name);
  const evidence = JSON.parse(readFileSync(file, "utf8"));
  evidence.vsixSha256 = vsixSha256 ?? null;
  evidence.sourceStateSha256 = metadata.sourceStateSha256;
  writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
}
report.layers = Object.fromEntries(["sources", "packaged-runtime", "Extension Host", "real-ui"].map((layer) => [layer,
  Object.fromEntries(["PASS", "FAIL", "NOT_RUN"].map((status) => [status, scenarios.filter((item) => item.layer === layer && item.status === status).length]))]));
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
if (vsix) writeFileSync(path.join(out, "candidate.sha256"), `${vsixSha256}  ${path.basename(vsix)}\n`);
writeFileSync(path.join(out, "report.txt"), [
  `UX3 gauntlet: ${report.status}`, `HEAD: ${report.head}`, `Branch: ${report.branch}`,
  `Initial changes:\n${report.initialStatus || "(none)"}`, `Final changes:\n${report.finalStatus || "(none)"}`,
  `Initial staging: ${report.initialStaging || "(empty)"}`, `Final staging: ${report.finalStaging || "(empty)"}`,
  `VSIX: ${vsix ?? "NOT_BUILT"}`, `Bytes: ${vsixSize ?? "NOT_BUILT"}`, `SHA-256: ${vsixSha256 ?? "NOT_BUILT"}`,
  `Source state SHA-256: ${metadata.sourceStateSha256}`, `Physical TMPDIR: ${metadata.physicalTempDirectory}`, `Host test root: ${metadata.hostTempDirectory}`,
  `Global default (inspection only): ${metadata.globalDefault ?? "NOT_RUN"}`, `Global default symlink ancestors: ${JSON.stringify(metadata.globalDefaultSymlinkAncestors ?? [])}`,
  "", "Warstwy:", ...Object.entries(report.layers).map(([layer, counts]) => `${layer}: PASS ${counts.PASS}, FAIL ${counts.FAIL}, NOT_RUN ${counts.NOT_RUN}`),
  "", "Scenariusze:", ...scenarios.map((item) => `${item.status} [${item.layer}] ${item.id}: oczekiwane ${item.expected}; wynik ${item.actual}${item.errorCode ? `; kod ${item.errorCode}` : ""}`), ""
].join("\n"));
process.stdout.write(`Report: ${path.join(out, "report.txt")}\n`);
if (!requiredPassed) process.exitCode = 1;
