#!/usr/bin/env node
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareDocxFixtures, runDocxSmoke } from "./docx-compatibility-smoke.mjs";
const [report] = process.argv.slice(2);
if (!report) throw new Error("usage: docx-source-smoke.mjs <report.json>");
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "archi-docx-source-")));
const bundle = path.join(root, "converter.cjs");
await build({ entryPoints: ["src/node/document-conversion/convert.ts"], bundle: true, platform: "node", format: "cjs", target: "node20", outfile: bundle, logLevel: "silent" });
await prepareDocxFixtures(root, "test/fixtures/document-conversion/structured.docx");
const { convertLocalDocument } = createRequire(import.meta.url)(bundle);
const results = (await runDocxSmoke(convertLocalDocument, root)).map(r => ({ ...r, layer: "sources" }));
writeFileSync(report, JSON.stringify({ results, root, evidence: "production convertLocalDocument, source bundle; synthetic inputs" }, null, 2) + "\n");
console.log(`${results.filter(r => r.status === "PASS").length}/${results.length} source DOCX scenarios PASS`);
if (results.some(r => r.status !== "PASS")) process.exitCode = 1;
