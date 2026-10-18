// DOC1 checks, independent of production runtime and third-party Markdown libraries.
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {openVsix} from '../../vscode-extension/scripts/vsix-zip.mjs';
import {createHash} from 'node:crypto';
const [outArg,vsixArg,mode,baselineArg]=process.argv.slice(2),out=path.resolve(outArg),vsix=path.resolve(vsixArg);
assert.ok(['--docs','--help','--functional','--mcp1'].includes(mode),'Unknown documentation check mode');
const files=['README.md','README.pl.md','vscode-extension/README.md','vscode-extension/README.pl.md',...['en','pl'].flatMap(l=>['user-guide','architecture','development'].map(n=>`docs/${l}/${n}.md`)),'docs/assets/README.md','docs/assets/screenshots/README.md','docs/testing/owner-smoke.md','scripts/docs/README.md','docs/architecture.md','docs/project-state.md','docs/product-roadmap.md','docs/en/cli-mcp.md','docs/pl/cli-mcp.md','examples/knowledge-server/README.md','docs/configuration-workbench.md','docs/ux4-model-selection.md','docs/ux4-owner-findings.md'];
const issues=[],checks=[];const hash=b=>createHash('sha256').update(b).digest('hex');
const content=f=>readFileSync(f,'utf8');
function anchors(text){const counts=new Map();return new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map(m=>{const a=m[1].toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu,'').replace(/\s/g,'-');const n=counts.get(a)||0;counts.set(a,n+1);return a+(n?`-${n}`:'');}));}
for(const file of files){
 if(!existsSync(file)){issues.push('missing '+file);continue;}
 const text=content(file).replace(/```[\s\S]*?```/g,'');
 for(const m of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
  const link=m[1];if(/^(https?:|mailto:)/.test(link))continue;
  const [target,anchor]=link.split('#');let p=path.resolve(path.dirname(file),decodeURIComponent(target||path.basename(file)));
  // vsce canonicalizes EN README to readme.md; the Polish standalone guide targets that package name.
  if(file==='vscode-extension/README.pl.md'&&target==='readme.md')p=path.resolve('vscode-extension/README.md');
  if(file.startsWith('vscode-extension/README')&&target==='ux2-ocr/TRIAL_NOTICES.md')p=path.resolve('experiments/ux2-ocr/TRIAL_NOTICES.md');
  if(!existsSync(p)){issues.push(`broken link ${file}: ${link}`);continue;}
  if(anchor&&!anchors(content(p)).has(anchor))issues.push(`broken anchor ${file}: ${link}`);
 }
}
checks.push({id:'local-links-and-anchors',status:issues.length?'FAIL':'PASS'});
for(const name of ['user-guide','development']){
 const codes=l=>[...content(`docs/${l}/${name}.md`).matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1]);
 if(JSON.stringify(codes('en'))!==JSON.stringify(codes('pl')))issues.push('PL/EN code examples differ: '+name);
}
const diagrams=l=>[...content(`docs/${l}/architecture.md`).matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m=>m[1]);
const topology=s=>s.split('\n').map(line=>line.replace(/\[".*?"\]/g,'[]').replace(/(participant \w+ as ).*/,'$1LABEL').replace(/(: ).*/,'$1LABEL').replace(/^(\s*(?:alt|else|opt|loop)) .*/,'$1 LABEL')).join('\n');
assert.equal(diagrams('en').length,5);assert.deepEqual(diagrams('en').map(topology),diagrams('pl').map(topology));
checks.push({id:'same-PL-EN-examples-and-diagram-topology',status:'PASS'});
const manifest=JSON.parse(content('vscode-extension/package.json'));
const settings=manifest.contributes.configuration.properties;
for(const file of files)if(existsSync(file))for(const m of content(file).matchAll(/`(archiAgent\.[A-Za-z.]+)`/g))if(!(m[1] in settings)&&!manifest.contributes.commands.some(c=>c.command===m[1]))issues.push(`unknown setting ${file}: ${m[1]}`);
const archive=openVsix(vsix),entries=archive.entries.map(e=>e.name);
for(const name of ['extension/readme.md','extension/README.pl.md']){
 const text=archive.read(name).toString('utf8');
 for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g))if(!/^https?:/.test(m[1])) {
  const [target,anchor]=m[1].split('#'),entry=target?'extension/'+target:name;
  if(!entries.includes(entry))issues.push(`broken VSIX link ${name}: ${m[1]}`);
  else if(anchor&&!anchors(archive.read(entry).toString('utf8')).has(anchor))issues.push(`broken VSIX anchor ${name}: ${m[1]}`);
  if(target?.startsWith('help-assets/')&&entries.includes(entry))assert.ok(archive.read(entry).equals(readFileSync('docs/assets/screenshots/'+path.basename(target))),'packaged screenshot differs: '+entry);
 }
}
for(const [language,entry] of [['en','extension/readme.md'],['pl','extension/README.pl.md']]) {
 const examples=text=>[...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1]);
 assert.deepEqual(examples(archive.read(entry).toString('utf8')),examples(content(`docs/${language}/user-guide.md`)));
 const instruction=text=>text.replace(/\]\([^)]+\)/g,'](destination)').replace(/\nOCR notices:.*\n$/,'').trim();
 assert.equal(instruction(archive.read(entry).toString('utf8')),instruction(content(`docs/${language}/user-guide.md`)),'online/offline instruction drift: '+language);
}
const provenance=JSON.parse(content('docs/assets/screenshots/provenance.json'));
for(const screen of provenance.screens)assert.equal(hash(readFileSync('docs/assets/screenshots/'+screen.file)),screen.sha256,'screenshot provenance hash: '+screen.file);
assert.equal(archive.read('extension/LICENSE.txt').toString(),content('LICENSE'));
assert.equal(content('vscode-extension/LICENSE.txt'),content('LICENSE'));
assert.equal(manifest.license,'MIT');assert.equal(JSON.parse(content('package.json')).license,'MIT');assert.equal(JSON.parse(content('package-lock.json')).packages[''].license,'MIT');
const coreProfile=entries.includes('extension/distribution-profile.json')&&JSON.parse(archive.read('extension/distribution-profile.json')).profile==='core';
for(const required of ['extension/THIRD_PARTY_NOTICES.md',...(coreProfile?[]:['extension/ux2-ocr/TRIAL_NOTICES.md','extension/ux2-ocr/licenses/SKIA-LICENSE','extension/ux2-ocr/assets/lang/LICENSE-tessdata-fast'])])assert.ok(entries.includes(required),required);
assert.ok(entries.every(e=>!e.endsWith('.gif')&&!e.includes('audits/')&&!e.includes('scripts/docs/')));
// --mcp1 compares all executable/OCR bytes with an independently rebuilt same-candidate baseline.
// Older documentation-only modes retain their original baseline policy.
assert.ok(baselineArg,'Supply the exact verified baseline VSIX explicitly; no historical default.');
const baseline=openVsix(baselineArg);
const runtimeEntries=entries.filter(e=>e.startsWith('extension/ux2-ocr/')||(mode==='--help'?e.startsWith('extension/dist/')&&e!=='extension/dist/extension.js':mode==='--functional'?e==='extension/dist/archi-agent-converter-worker.js':e.startsWith('extension/dist/')));
for(const e of runtimeEntries) {
 if(mode==='--docs'&&e==='extension/ux2-ocr/resource-manifest.json') {
  const current=JSON.parse(archive.read(e)),previous=JSON.parse(baseline.read(e));
  // GNU-compatible context changes the source patch hash, never the patched PDF.js bytes.
  delete current.pdfjsPatch.patchSha256;delete previous.pdfjsPatch.patchSha256;
  assert.deepEqual(current,previous,'OCR manifest changed beyond source patch hash');
 } else assert.ok(archive.read(e).equals(baseline.read(e)),'runtime bytes changed: '+e);
}
checks.push({id:mode==='--help'?'help-links-and-runtime-worker-OCR-byte-parity':mode==='--functional'?'license-and-package-links-notices-preserved-worker-OCR':'license-and-exact-package-links-notices-runtime-byte-parity',status:'PASS',runtimeEntries:runtimeEntries.length});
const privacyPatterns=[/\/Users\//,/sk-[A-Za-z0-9]{16}/,/linkedin\.com/i];
for(const file of files)if(existsSync(file)&&privacyPatterns.some(p=>p.test(content(file))))issues.push('private data pattern: '+file);
const candidate={path:vsixArg,bytes:readFileSync(vsix).length,sha256:hash(readFileSync(vsix)),entries:entries.length};
writeFileSync(path.join(out,'documentation-check.json'),JSON.stringify({status:issues.length?'FAIL':'PASS',checks,issues,candidate,files},null,2)+'\n');
console.log(JSON.stringify({issues,checks,candidate},null,2));if(issues.length)process.exitCode=1;
