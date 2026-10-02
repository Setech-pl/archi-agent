import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modulePath, fixtures] = process.argv.slice(2);
if (!modulePath || !fixtures) throw new Error('usage: recheck-regressions.mjs <convert.mjs> <fixtures>');
const { convert } = await import(pathToFileURL(modulePath));
const rejection = (code, stage) => (result) => result.status === 'error' && result.error === code &&
  result.stages.includes(stage) && result.pages === undefined;
const checks = [
  ['image-at-16mp', (result) => result.status === 'success' && result.pages?.[0]?.source === 'ocr' && result.stages.includes('recognize')],
  ['image-over-16mp', rejection('embedded-image-limit', 'render')],
  ['oversize-image', rejection('embedded-image-limit', 'render')],
  ['text-then-oversize', rejection('embedded-image-limit', 'render')],
  ['mixed', (result) => result.status === 'success' && result.pages?.[0]?.source === 'text' && result.pages?.[1]?.source === 'ocr' && result.pages?.[2]?.source === 'blank'],
  ['corrupt', rejection('image-decode-failed', 'render')],
  ['good-and-corrupt', rejection('image-decode-failed', 'render')],
  ['good-then-corrupt', rejection('image-decode-failed', 'render')],
  ['repeat-corrupt', rejection('image-decode-failed', 'render')],
  ['shared-corrupt', rejection('image-decode-failed', 'render')],
  ['blank-only', (result) => result.status === 'success' && result.pages?.[0]?.source === 'blank' &&
    !result.stages.includes('ocr-init')],
  ['mask', (result) => result.status === 'success' && result.pages?.[0]?.source === 'ocr' && result.stages.includes('recognize')],
  ['transparent', (result) => result.status === 'success' && result.pages?.[0]?.source === 'ocr' &&
    result.stages.includes('recognize')]
];
if (rejection('embedded-image-limit', 'render')({ status: 'error', error: 'text-init-failed', stages: ['text-init'] }) ||
  rejection('embedded-image-limit', 'render')({ status: 'error', error: 'embedded-image-limit', stages: ['text-init'] }))
  throw new Error('rejection-predicate-accepted-wrong-cause');
let failed = 0;
for (const [name, accept] of checks) {
  const stages = [];
  let result;
  try {
    const pages = await convert(path.join(fixtures, `${name}.pdf`), { onStage: (stage) => stages.push(stage) });
    result = { status: 'success', pages, stages };
  } catch (error) {
    result = { status: 'error', error: error instanceof Error ? error.message : String(error), stages };
  }
  const pass = accept(result);
  if (!pass) failed++;
  console.log(JSON.stringify({ name, pass, ...result }));
}
console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failed, failed }));
if (failed) process.exitCode = 1;
