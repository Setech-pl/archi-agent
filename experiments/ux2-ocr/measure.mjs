import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [nodeBin, packagedConverter, fixtures, report] = process.argv.slice(2);
if (!nodeBin || !packagedConverter || !fixtures || !report) throw new Error('usage: measure.mjs <node> <extracted-convert.mjs> <fixtures> <report.json>');
const expected = {
  pl: 'Zażółć gęślą jaźń. Łódź i źródło informacji. Ćma śpi wśród żółtych róż.',
  en: 'The quick brown fox jumps over the lazy dog. Architecture review is complete.'
};
const normalized = (s) => Array.from(s.normalize('NFC').replace(/\s+/g, ' ').trim());
function align(reference, actual) {
  const a = normalized(reference), b = normalized(actual);
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  let i = a.length, j = b.length, diacriticErrors = 0;
  const diacritics = new Set(Array.from('ąćęłńóśźżĄĆĘŁŃÓŚŹŻ'));
  while (i || j) {
    if (i && j && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1] && diacritics.has(a[i - 1])) diacriticErrors++;
      i--; j--;
    } else if (i && dp[i][j] === dp[i - 1][j] + 1) {
      if (diacritics.has(a[i - 1])) diacriticErrors++;
      i--;
    } else j--;
  }
  return { cer: dp[a.length][b.length] / a.length, errors: dp[a.length][b.length], characters: a.length, diacriticErrors };
}
function run(name, options = {}) {
  const child = spawnSync(nodeBin, [path.join(here, 'run-one.mjs'), packagedConverter, path.join(fixtures, `${name}.pdf`), JSON.stringify(options)],
    { encoding: 'utf8', timeout: 300_000, maxBuffer: 2 * 1024 * 1024 });
  let result;
  try { result = JSON.parse(child.stdout.trim().split('\n').at(-1)); }
  catch { result = { status: 'process-error', stderr: child.stderr.slice(-300), signal: child.signal, exitCode: child.status }; }
  return { name, ...result };
}
const rows = [];
for (const dpi of [200, 300]) for (const quality of ['clean', 'compressed', 'noise', 'skew']) for (const language of ['pl', 'en']) {
  const row = run(`${language}-${quality}-${dpi}`, { dpi });
  const text = row.pages?.[0]?.text ?? '';
  const measured = { ...row, dpi, quality, language, ...(row.status === 'success' ? align(expected[language], text) : {}) };
  rows.push(measured);
  console.log(`${row.name}: ${row.status} CER=${measured.cer ?? 'n/a'} ${Math.round(row.wallMs ?? 0)}ms`);
}
for (const [name, options] of [['mixed', {}], ['mixed', { fullPage: true }], ['mask', {}], ['corrupt', {}], ['good-and-corrupt', {}],
  ['twenty', {}], ['twenty-one', {}], ['oversize-image', {}], ['pl-clean-200', { maxCanvasPixels: 1_000_000 }]]) {
  const row = run(name, options);
  rows.push({ ...row, options });
  console.log(`${name} ${JSON.stringify(options)}: ${row.status} ${Math.round(row.wallMs ?? 0)}ms`);
}
writeFileSync(report, JSON.stringify({ node: nodeBin, converter: packagedConverter, rows }, null, 2) + '\n');
