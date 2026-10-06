#!/usr/bin/env node
// Compare the actual Mammoth executable before/after a scoped argparse override.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const [reportFile, baselineFile] = process.argv.slice(2);
if (!reportFile) throw new Error("usage: mammoth-cli-compatibility.mjs <report.json> [baseline.json]");
const root = mkdtempSync(path.join(tmpdir(), "archi-mammoth-cli-"));
const cli = require.resolve("mammoth/bin/mammoth");
const fixture = path.resolve("test/fixtures/document-conversion/structured.docx");
const output = path.join(root, "result.html");
const markdownOutput = path.join(root, "result.md");
const directory = path.join(root, "html");
mkdirSync(directory);
const styles = path.join(root, "styles.txt");
writeFileSync(styles, "p[style-name='Heading 1'] => h2:fresh\n");
const cases = [
  ["help", ["--help"], 0],
  ["default-stdout", [fixture], 0],
  ["output-file", [fixture, output], 0],
  ["output-directory", [fixture, "--output-dir", directory], 0],
  ["markdown-stdout", [fixture, "--output-format", "markdown"], 0],
  ["markdown-file", [fixture, markdownOutput, "--output-format", "markdown"], 0],
  ["style-map", [fixture, "--style-map", styles], 0],
  ["missing-input", [], 2],
  ["unknown-option", [fixture, "--unknown-option"], 2],
  ["bad-format", [fixture, "--output-format", "invalid"], 2],
  ["conflicting-output", [fixture, output, "--output-dir", directory], 2]
];
const results = [];
for (const [id, args, expectedExit] of cases) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined, id);
  assert.equal(result.status, expectedExit, id);
  if (id === "help") for (const option of ["--output-dir", "--output-format", "--style-map", "docx-path", "output-path"])
    assert.ok(result.stdout.includes(option), option);
  if (expectedExit !== 0) assert.match(result.stderr, /error:/u, id);
  if (["default-stdout", "style-map"].includes(id)) assert.match(result.stdout, /<h[12]>Mission overview<\/h[12]>/u);
  if (id === "style-map") assert.match(result.stdout, /<h2>Mission overview<\/h2>/u);
  if (id === "markdown-stdout") assert.match(result.stdout, /Mission overview/u);
  const files = id === "output-file" ? [output] : id === "markdown-file" ? [markdownOutput] :
    id === "output-directory" ? readdirSync(directory).map(name => path.join(directory, name)).filter(f => statSync(f).isFile()) : [];
  const contents = files.map(f => ({ name: path.basename(f), content: readFileSync(f, "utf8") }));
  if (files.length) assert.ok(contents.some(f => f.content.includes("Żółw 🚀")), id);
  results.push({ id, exit: result.status, stdout: result.stdout, stderr: result.stderr,
    files: contents, status: "PASS" });
}
const baseline = baselineFile ? JSON.parse(readFileSync(baselineFile, "utf8")) : undefined;
if (baseline) for (const actual of results) {
  const expected = baseline.results.find(r => r.id === actual.id);
  assert.equal(actual.exit, expected.exit, actual.id);
  assert.deepEqual(actual.files, expected.files, actual.id);
  // Help wording/format and deprecation warnings may differ between argparse majors.
  if (actual.id !== "help" && actual.exit === 0) assert.equal(actual.stdout, expected.stdout, actual.id);
}
const mammothRequire = createRequire(require.resolve("mammoth/package.json"));
writeFileSync(reportFile, JSON.stringify({ mammoth: require("mammoth/package.json").version,
  argparse: mammothRequire("argparse/package.json").version, cli, root, baselineFile,
  comparison: baseline ? "exit codes, successful converted stdout and written bytes match; help/options and errors checked semantically; argparse 2 sends usage for invalid arguments to stderr and emits compatibility deprecation warnings" : "baseline",
  results }, null, 2) + "\n");
console.log(`${results.length}/${results.length} Mammoth CLI scenarios PASS`);
