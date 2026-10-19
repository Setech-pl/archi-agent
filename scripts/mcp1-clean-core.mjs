// Build Core in an isolated source copy with no OCR experiment, assets or dependencies.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,realpathSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const out=path.resolve(process.argv[2]);mkdirSync(out,{recursive:true});
const root=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-clean-core-'))),steps=[];
function run(id,command,args,cwd=root){const r=spawnSync(command,args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024});writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));steps.push({id,status:r.status===0?'PASS':'FAIL'});assert.equal(r.status,0,id);}
const files=spawnSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).stdout.trim().split('\n');
for(const f of files){if(f.startsWith('experiments/'))continue;const target=path.join(root,f);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(f,target);}
try{
 run('clean-install','npm',['ci']);assert(!existsSync(path.join(root,'experiments')));
 run('clean-core-build',process.execPath,['vscode-extension/scripts/package-vsix.mjs','--profile','core','--out',out]);
 const version=JSON.parse(readFileSync('vscode-extension/package.json')).version,vsix=path.join(out,`archi-agent-core-${version}.vsix`);
 run('clean-core-verify',process.execPath,['vscode-extension/scripts/verify-vsix.mjs',vsix]);
 assert(!existsSync(path.join(root,'build/ux2-ocr')));
 writeFileSync(path.join(out,'clean-core.json'),JSON.stringify({status:'PASS',root,ocrExperimentPresent:false,steps,vsix},null,2));
}catch(e){writeFileSync(path.join(out,'clean-core.json'),JSON.stringify({status:'FAIL',root,steps,error:e.stack},null,2));throw e;}
