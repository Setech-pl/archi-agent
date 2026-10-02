import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [alphaRuntime, trial, fixture] = process.argv.slice(2);
if (!alphaRuntime || !trial || !fixture) throw new Error('usage: compare-text.mjs <alpha3-runtime.js> <trial-dir> <text-compat.pdf>');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceBefore = digest(await readFile(fixture));
const require = createRequire(import.meta.url);
const { convertDocument } = require(alphaRuntime);
const { convertPdfIsolated } = await import(pathToFileURL(path.join(trial, 'ocr-parent.mjs')));
const baseline = await convertDocument(fixture);
const candidate = await convertPdfIsolated(fixture);
const sourceAfter = digest(await readFile(fixture));
const pass = baseline.status === 'success' && baseline.markdown === candidate.markdown && sourceBefore === sourceAfter &&
  candidate.pages.map((p) => p.source).join(',') === 'text,blank,text,text';
console.log(JSON.stringify({ pass, baselineStatus: baseline.status, baselineMarkdownSha256: digest(baseline.markdown ?? ''),
  candidateMarkdownSha256: digest(candidate.markdown), sourceBefore, sourceAfter, pages: candidate.pages }));
if (!pass) process.exitCode = 1;
