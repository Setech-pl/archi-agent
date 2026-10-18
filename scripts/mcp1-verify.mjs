// MCP1 acceptance: one exact candidate, Node 22, installed/packaged evidence, no publication.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,realpathSync,copyFileSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
import {runHostSmoke} from './ux3-vscode-smoke.mjs';
process.env.PATH=path.dirname(process.execPath)+path.delimiter+process.env.PATH;
const out=path.resolve(process.argv[2]??`build/mcp1/run-${Date.now()}`);mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),results=[];
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const sourceFiles=()=>Object.fromEntries(git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(Boolean).sort().map(f=>[f,sha(readFileSync(f))]));
const manifest={node:process.version,branch:git('branch','--show-current'),base:git('rev-parse','HEAD'),sourceFiles:sourceFiles(),ownerSmoke:'DEFERRED',realLlm:'NOT_RUN',remoteCI:'NOT_RUN',windowsArm64Runtime:'NOT_RUN',results};
function run(id,command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:64*1024*1024,...options});writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));results.push({id,status:r.status===0?'PASS':'FAIL',exitCode:r.status});console.log(id+': '+results.at(-1).status);assert.equal(r.status,0,id);}
const node=(id,args,opts)=>run(id,process.execPath,args,opts);
try{
 assert.equal(process.version,'v22.12.0');
 node('clean-Core',['scripts/mcp1-clean-core.mjs',path.join(out,'clean-Core')]);
 const reused=process.argv[3]?JSON.parse(readFileSync(path.resolve(process.argv[3]))):undefined;
 if(reused){
  for(const f of ['package.json','package-lock.json','experiments/ux2-ocr/package.json','experiments/ux2-ocr/package-lock.json','scripts/prepare-ci-ocr.mjs','scripts/mcp1-clean-core.mjs'])assert.equal(reused.sourceFiles[f],manifest.sourceFiles[f],'dependency/clean gate input changed '+f);
  for(const id of ['install-root','install-ocr','audit-root','audit-ocr','prepare-ocr']){assert.equal(reused.results.find(r=>r.id===id)?.status,'PASS',id);results.push({id,status:'PASS',reusedFrom:path.resolve(process.argv[3])});}
 }else{
  for(const[id,args]of [['install-root',['ci']],['install-ocr',['ci','--prefix','experiments/ux2-ocr']],['audit-root',['audit','--audit-level=low']],['audit-ocr',['audit','--prefix','experiments/ux2-ocr','--audit-level=low']]])run(id,'npm',args);
  node('prepare-ocr',['scripts/prepare-ci-ocr.mjs']);
 }
 for(const[id,args]of [['typecheck',['run','typecheck']],['extension-typecheck',['run','extension:typecheck']],['root-tests',['test','--','--no-file-parallelism']],['extension-tests',['run','extension:test','--','--no-file-parallelism']],['build',['run','extension:build']],['cli-build',['run','cli:build']],['demo',['run','demo:dry-run']]])run(id,'npm',args);
 const v=JSON.parse(readFileSync('vscode-extension/package.json')).version,artifacts={};
 for(const p of ['core','full']){const dir=path.join(out,p);run('package-'+p,'npm',['run','extension:package','--','--profile',p,'--out',dir]);const f=path.join(dir,`archi-agent-${p}-${v}.vsix`);artifacts[p]=f;run('verify-'+p,'npm',['run','extension:verify','--',f]);}
 const cliDir=path.join(out,'cli');run('package-cli','npm',['run','cli:package','--',cliDir]);artifacts.cli=path.join(cliDir,`archi-agent-cli-${v}.tgz`);run('verify-cli','npm',['run','cli:verify','--',artifacts.cli]);
 manifest.artifacts=Object.fromEntries(Object.entries(artifacts).map(([key,f])=>[key,{path:f,bytes:readFileSync(f).length,sha256:sha(readFileSync(f))}]));
 for(const p of ['core','full']){const dir=path.join(out,'baseline-'+p);run('fresh-build-'+p,'npm',['run','extension:package','--','--profile',p,'--out',dir]);const d=path.join(out,'docs-'+p);mkdirSync(d);node('docs-'+p,['scripts/docs/check-docs.mjs',d,artifacts[p],'--mcp1',path.join(dir,`archi-agent-${p}-${v}.vsix`)]);}
 node('packaged-parity',['scripts/mcp1-packaged-smoke.mjs',artifacts.core,artifacts.full,artifacts.cli,path.join(out,'packaged')]);
 node('Full-offline-OCR',['scripts/mcp1-full-ocr-smoke.mjs',artifacts.full,path.join(out,'Full-OCR')]);
 const extracted=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-regressions-'))),archive=openVsix(artifacts.core);manifest.extracted=extracted;
 for(const e of archive.entries){if(e.name.endsWith('/'))continue;const f=path.join(extracted,e.name);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,archive.read(e.name));}
 for(const name of ['src1-packaged-runtime-smoke.mjs','src1-smoke-fixture.cjs','ver1-c4-fixture.cjs','ver1-c4-packaged-runtime-smoke.mjs','k1-packaged-runtime-smoke.mjs','k3-packaged-runtime-smoke.mjs','art1-packaged-runtime-smoke.mjs','art1-smoke-fixture.cjs'])copyFileSync('scripts/'+name,path.join(extracted,name));
 const fixture=path.join(extracted,'fixture');cpSync('test/fixtures/structurizr/big-bank-plc',fixture,{recursive:true});process.env.SRC1_FIXTURE=fixture;const bundle=path.join(extracted,'extension/dist/archi-agent-runtime.js');
 for(const name of ['src1','k1','k3','art1'])node(name+'-packaged',[path.join(extracted,name+'-packaged-runtime-smoke.mjs'),bundle,...(name==='src1'?[fixture]:[]),path.join(out,name+'-packaged.json')],{cwd:extracted,env:{...process.env,PATH:'',NODE_PATH:''}});
 node('ver1-c4-packaged',[path.join(extracted,'ver1-c4-packaged-runtime-smoke.mjs'),bundle,fixture,path.join(out,'ver1-c4-packaged.json')],{cwd:extracted,env:{...process.env,PATH:'',NODE_PATH:''}});
 node('profile-install-switch-coinstall',['scripts/mcp1-profile-smoke.mjs',artifacts.core,artifacts.full,path.join(out,'profiles'),path.resolve('build/ver1-c4/candidate-3/archi-agent-0.3.0-alpha.6.vsix')]);
 const parityRoot=JSON.parse(readFileSync(path.join(out,'packaged/packaged-smoke.json'))).root;process.env.MCP1_CLI=path.join(parityRoot,'package/bin/archi-agent.cjs');process.env.MCP1_NODE=process.execPath;
 for(const p of ['core','full']){
  const hostOut=path.join(out,'host-'+p);mkdirSync(hostOut);
  for(const[name,files]of [['src1',['src1-smoke-fixture.cjs']],['ver1-c4',['src1-smoke-fixture.cjs','ver1-c4-fixture.cjs']],['mcp1-export',['src1-smoke-fixture.cjs','ver1-c4-fixture.cjs']]]){const r=await runHostSmoke(artifacts[p],hostOut,name+'-extension-host.cjs',name,files);writeFileSync(path.join(hostOut,name+'-results.json'),JSON.stringify(r,null,2));results.push({id:name+'-Host-'+p,status:r.length&&r.every(x=>x.status==='PASS')?'PASS':'FAIL',scenarios:r.length});assert(results.at(-1).status==='PASS',name+' Host '+p);console.log(name+'-Host-'+p+': PASS');}
 }
 for(const p of ['core','full'])node('mcp1-ui-'+p,['scripts/mcp1-real-ui-smoke.mjs',artifacts[p],artifacts.cli,p,path.join(out,'ui-mcp1-'+p)]);
 for(const p of ['core','full']){node('src1-ui-'+p,['scripts/src1-real-ui-smoke.mjs',artifacts[p],path.join(out,'ui-src1-'+p)]);node('ver1-c4-ui-'+p,['scripts/ver1-c4-real-ui-smoke.mjs',artifacts[p],path.join(out,'ui-ver1-c4-'+p)]);}
 run('diff-check','git',['diff','--check']);
 manifest.sourceFilesUnchanged=JSON.stringify(sourceFiles())===JSON.stringify(manifest.sourceFiles);assert(manifest.sourceFilesUnchanged,'source files changed during acceptance');
}catch(e){manifest.error=e.stack;process.exitCode=1;}
manifest.status=manifest.error?'FAIL':'PASS';writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log('MCP1 '+manifest.status+' '+out);
