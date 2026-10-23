// Sequential EA1 gates. Every layer records the exact VSIX identity; no publication operations.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,copyFileSync,cpSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
import {runHostSmoke} from './ux3-vscode-smoke.mjs';
const [mode,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),results=[];
const manifest={mode,node:process.version,platform:process.platform,arch:process.arch,ownerSmoke:'DEFERRED'};
const run=(id,bin,args,options={})=>{const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:64*1024*1024,...options});writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));results.push({id,status:r.status===0?'PASS':'FAIL',exit:r.status});console.log(id+': '+results.at(-1).status);if(r.status!==0)throw Error(id+' failed');};
const version=JSON.parse(readFileSync('vscode-extension/package.json')).version;
const vsix=profile=>path.join(out,profile,`archi-agent-${profile}-${version}.vsix`);
try{
 manifest.base=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
 if(mode==='gates'){
  if(!process.argv.includes('--reuse-install'))for(const [id,args]of [['install-root',['ci']],['install-ocr',['ci','--prefix','experiments/ux2-ocr']],['audit-root',['audit','--audit-level=low']],['audit-ocr',['audit','--prefix','experiments/ux2-ocr','--audit-level=low']]])run(id,'npm',args);
  else manifest.installationAndAudit='Reused PASS from candidate-20261019; no dependency changes.';
  for(const [id,args]of [['root-tests',['test','--','--no-file-parallelism']],['extension-tests',['run','extension:test','--','--no-file-parallelism']],['typecheck',['run','typecheck']],['extension-typecheck',['run','extension:typecheck']],['build',['run','extension:build']]])run(id,'npm',args);
  run('prepare-ocr',process.execPath,['scripts/prepare-ci-ocr.mjs']);
  for(const profile of ['core','full']){run('package-'+profile,'npm',['run','extension:package','--','--profile',profile,'--out',path.join(out,profile)]);run('verify-'+profile,'npm',['run','extension:verify','--',vsix(profile)]);}
  run('demo-dry-run','npm',['run','demo:dry-run']);
  for(const profile of ['core','full']){const dir=path.join(out,'docs-'+profile);mkdirSync(dir);run('docs-'+profile,process.execPath,['scripts/docs/check-docs.mjs',dir,vsix(profile),'--functional',path.resolve(`build/doc3/final-${profile}/archi-agent-${profile}-${version}.vsix`)]);}
  run('diff-check','git',['diff','--check']);
 }else if(mode==='runtime'){
  for(const profile of ['core','full']){
   const extracted=mkdtempSync('/private/tmp/ea1-extracted-');const archive=openVsix(vsix(profile));
   for(const e of archive.entries){if(e.name.endsWith('/'))continue;const file=path.join(extracted,e.name);if(!file.startsWith(extracted+path.sep))throw Error('unsafe ZIP');mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,archive.read(e.name));}
   for(const name of ['ea1-packaged-runtime-smoke.mjs','src1-packaged-runtime-smoke.mjs','src1-smoke-fixture.cjs','ver1-c4-packaged-runtime-smoke.mjs','ver1-c4-fixture.cjs','art1-packaged-runtime-smoke.mjs','art1-smoke-fixture.cjs'])copyFileSync('scripts/'+name,path.join(extracted,name));
   const fixture=path.join(extracted,'fixture');cpSync('test/fixtures/structurizr/big-bank-plc',fixture,{recursive:true});
   const catalog=path.join(extracted,'retail-enterprise.json');copyFileSync('examples/retail-checkout/architecture/enterprise.json',catalog);
   const bundle=path.join(extracted,'extension/dist/archi-agent-runtime.js'),env={...process.env,PATH:'',NODE_PATH:''};
   run('ea1-packaged-'+profile,process.execPath,[path.join(extracted,'ea1-packaged-runtime-smoke.mjs'),bundle,catalog,path.join(extracted,'ea1')],{cwd:extracted,env});
   copyFileSync(path.join(extracted,'ea1/runtime-report.json'),path.join(out,'ea1-packaged-'+profile+'.json'));
   if(profile==='core')for(const name of ['src1','ver1-c4','art1'])run(name+'-packaged',process.execPath,[path.join(extracted,name+'-packaged-runtime-smoke.mjs'),bundle,...(name==='art1'?[]:[fixture]),path.join(out,name+'-packaged.json')],{cwd:extracted,env});
   manifest[profile+'Extracted']=extracted;
  }
  const a=openVsix(vsix('core')),b=openVsix(vsix('full'));for(const file of ['archi-agent-runtime.js','extension.js','archi-agent-converter-worker.js'])if(!a.read('extension/dist/'+file).equals(b.read('extension/dist/'+file)))throw Error('profile bundle mismatch');
 }else if(mode==='host'){
  process.env.EA1_CATALOG=path.resolve('examples/retail-checkout/architecture/enterprise.json');
  const host=await runHostSmoke(vsix('core'),out,'ea1-extension-host.cjs','ea1-host');results.push(...host);if(host.some(r=>r.status!=='PASS'))throw Error('Host failed');
 }else if(mode==='ui'){
  for(const name of ['ea1','ver1-c4','src1'])run(name+'-ui',process.execPath,[`scripts/${name}-real-ui-smoke.mjs`,vsix('core'),path.join(out,name+'-ui')]);
 }else throw Error('Mode must be gates, runtime, host or ui');
 manifest.packages=Object.fromEntries(['core','full'].map(p=>[p,{path:vsix(p),bytes:readFileSync(vsix(p)).length,sha256:sha(readFileSync(vsix(p)))}]));
}catch(e){manifest.error=e.stack;process.exitCode=1;}
manifest.status=manifest.error?'FAIL':'PASS';manifest.results=results;writeFileSync(path.join(out,mode+'-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(mode+': '+manifest.status);
