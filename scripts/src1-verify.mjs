// SRC1 gates: full suites once, exact VSIX runtime outside repo, real Host and visible UI.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,mkdtempSync,realpathSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
import {runHostSmoke} from './ux3-vscode-smoke.mjs';
const out=path.resolve(process.argv[2]??`build/src1/run-${Date.now()}`);mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),results=[];
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
const files=()=>Object.fromEntries(git('ls-files','--cached','--others','--exclude-standard').split('\n').filter(Boolean).sort().map(f=>[f,sha(readFileSync(f))]));
const manifest={base:git('rev-parse','HEAD'),branch:git('branch','--show-current'),node:process.version,platform:process.platform,arch:process.arch,sourceFiles:files(),ownerSmoke:'DEFERRED',remoteSrc1CI:'NOT_RUN'};
function run(id,bin,args,opts={}){const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:64*1024*1024,...opts});writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));results.push({id,status:r.status===0?'PASS':'FAIL',exitCode:r.status});console.log(id+': '+results.at(-1).status);if(r.status!==0)throw Error(id+' failed');}
try{
 if(process.version!=='v22.12.0')throw Error('Use Node 22.12.0');
 for(const [id,args]of [['install-root',['ci']],['install-ocr',['ci','--prefix','experiments/ux2-ocr']],['audit-root',['audit','--audit-level=low']],['audit-ocr',['audit','--prefix','experiments/ux2-ocr','--audit-level=low']]])run(id,'npm',args);
 run('prepare-ocr',process.execPath,['scripts/prepare-ci-ocr.mjs']);
 for(const [id,args]of [['typecheck',['run','typecheck']],['extension-typecheck',['run','extension:typecheck']],['root-tests',['test','--','--no-file-parallelism']],['extension-tests',['run','extension:test','--','--no-file-parallelism']],['build',['run','extension:build']],['package',['run','extension:package','--','--profile','full','--out',out]]])run(id,'npm',args);
 const p=JSON.parse(readFileSync('vscode-extension/package.json'));const vsix=path.join(out,`archi-agent-full-${p.version}.vsix`);manifest.vsix={path:vsix,bytes:readFileSync(vsix).length,sha256:sha(readFileSync(vsix))};
 run('verify','npm',['run','extension:verify','--',vsix]);const docsBaseline=path.join(out,'documentation-baseline');run('documentation-baseline','npm',['run','extension:package','--','--profile','full','--out',docsBaseline]);run('documentation',process.execPath,['scripts/docs/check-docs.mjs',out,vsix,'--mcp1',path.join(docsBaseline,`archi-agent-full-${p.version}.vsix`)]);run('demo','npm',['run','demo:dry-run']);run('diff-check','git',['diff','--check']);
 const extracted=realpathSync(mkdtempSync(path.join(tmpdir(),'src1-extracted-')));manifest.extracted=extracted;const archive=openVsix(vsix);
 for(const e of archive.entries){if(e.name.endsWith('/'))continue;const file=path.join(extracted,e.name);if(!file.startsWith(extracted+path.sep))throw Error('unsafe-entry');mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,archive.read(e.name));}
 for(const name of ['src1-packaged-runtime-smoke.mjs','src1-smoke-fixture.cjs','k1-packaged-runtime-smoke.mjs','k3-packaged-runtime-smoke.mjs','art1-packaged-runtime-smoke.mjs','art1-smoke-fixture.cjs'])copyFileSync(path.join('scripts',name),path.join(extracted,name));
 const fixture=path.join(extracted,'fixture');cpSync('test/fixtures/structurizr/big-bank-plc',fixture,{recursive:true});process.env.SRC1_FIXTURE=fixture;
 const bundle=path.join(extracted,'extension/dist/archi-agent-runtime.js');
 for(const name of ['src1','k1','k3','art1'])run(name+'-packaged',process.execPath,[path.join(extracted,name+'-packaged-runtime-smoke.mjs'),bundle,...(name==='src1'?[fixture]:[]),path.join(out,name+'-packaged.json')],{cwd:extracted,env:{...process.env,PATH:'',NODE_PATH:''}});
 const host=await runHostSmoke(vsix,out,'src1-extension-host.cjs','src1-host',['src1-smoke-fixture.cjs']);writeFileSync(path.join(out,'host-results.json'),JSON.stringify(host,null,2));results.push(...host);if(host.some(r=>r.status!=='PASS'))throw Error('Host failed');
 run('real-ui',process.execPath,['scripts/src1-real-ui-smoke.mjs',vsix,path.join(out,'ui')]);
 const after=files();manifest.sourceFilesUnchanged=JSON.stringify(after)===JSON.stringify(manifest.sourceFiles);if(!manifest.sourceFilesUnchanged)throw Error('source changed during gates');
}catch(e){manifest.error=e.stack;process.exitCode=1;}
finally{manifest.results=results;manifest.status=manifest.error?'FAIL':'PASS';writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log('SRC1 '+manifest.status+' '+out);}
