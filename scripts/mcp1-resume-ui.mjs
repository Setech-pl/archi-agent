// Complete UI gates on exactly the previously tested packages; never rebuild or hide failed attempts.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [baseArg,outArg]=process.argv.slice(2),baseFile=path.resolve(baseArg),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
process.env.PATH=path.dirname(process.execPath)+path.delimiter+process.env.PATH;
const base=JSON.parse(readFileSync(baseFile)),sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0);return r.stdout.trim();};
const files=()=>Object.fromEntries(git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(Boolean).sort().map(f=>[f,sha(readFileSync(f))]));
const before=files(),allowed=['scripts/mcp1-real-ui-smoke.mjs','scripts/mcp1-resume-ui.mjs'];
const report={baseReport:baseFile,baseReportSha256:sha(readFileSync(baseFile)),baseFailure:base.error,artifacts:base.artifacts,node:process.version,branch:git('branch','--show-current'),base:git('rev-parse','HEAD'),sourceFiles:before,allowedHarnessChanges:allowed,results:[]};
try{
 assert.equal(process.version,'v22.12.0');assert.equal(base.node,process.version);assert.equal(base.branch,report.branch);assert.equal(base.base,report.base);
 const changed=[...new Set([...Object.keys(before),...Object.keys(base.sourceFiles)])].filter(f=>before[f]!==base.sourceFiles[f]);report.changedSourceFiles=changed;report.harnessChanges=changed.map(f=>({path:f,before:base.sourceFiles[f]??null,after:before[f]??null}));assert(changed.every(f=>allowed.includes(f)),'product, tests or configuration changed since full gates');
 const required=['clean-Core','install-root','install-ocr','audit-root','audit-ocr','prepare-ocr','typecheck','extension-typecheck','root-tests','extension-tests','build','cli-build','demo','package-core','verify-core','package-full','verify-full','package-cli','verify-cli','fresh-build-core','docs-core','fresh-build-full','docs-full','packaged-parity','Full-offline-OCR','src1-packaged','k1-packaged','k3-packaged','art1-packaged','ver1-c4-packaged','profile-install-switch-coinstall','src1-Host-core','ver1-c4-Host-core','mcp1-export-Host-core','src1-Host-full','ver1-c4-Host-full','mcp1-export-Host-full'];
 for(const id of required){const r=base.results.find(r=>r.id===id);assert.equal(r?.status,'PASS','required prior gate '+id);report.results.push({...r,evidence:baseFile});}
 const checkArtifacts=()=>Object.fromEntries(Object.entries(base.artifacts).map(([id,a])=>{const actual=sha(readFileSync(a.path));assert.equal(actual,a.sha256,'exact delivered package changed');return[id,actual];}));report.artifactHashesBefore=checkArtifacts();
 function run(id,args){const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:64*1024*1024});writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));report.results.push({id,status:r.status===0?'PASS':'FAIL',exitCode:r.status});console.log(id+': '+report.results.at(-1).status);assert.equal(r.status,0,id);}
 for(const p of ['core','full'])run('mcp1-ui-'+p,['scripts/mcp1-real-ui-smoke.mjs',base.artifacts[p].path,base.artifacts.cli.path,p,path.join(out,'ui-mcp1-'+p)]);
 for(const p of ['core','full']){run('src1-ui-'+p,['scripts/src1-real-ui-smoke.mjs',base.artifacts[p].path,path.join(out,'ui-src1-'+p)]);run('ver1-c4-ui-'+p,['scripts/ver1-c4-real-ui-smoke.mjs',base.artifacts[p].path,path.join(out,'ui-ver1-c4-'+p)]);}
 const whitespace=spawnSync('git',['diff','--check'],{encoding:'utf8'});assert.equal(whitespace.status,0,whitespace.stdout+whitespace.stderr);report.results.push({id:'diff-check',status:'PASS'});
 report.artifactHashesAfter=checkArtifacts();
 assert.deepEqual(files(),before,'source changed during UI rerun');report.sourceFilesUnchanged=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
report.status=report.error?'FAIL':'PASS';report.ownerSmoke='DEFERRED';report.realLlm='NOT_RUN';report.windowsArm64Runtime='NOT_RUN';report.remoteCI='NOT_RUN';writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log('MCP1 UI completion '+report.status);
