// EA1b acceptance layers. New output directory per candidate; packaging is sequential.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,copyFileSync,cpSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {build} from 'esbuild';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
import {runHostSmoke} from './ux3-vscode-smoke.mjs';
const [mode,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),version=JSON.parse(readFileSync('vscode-extension/package.json')).version;
const results=[],manifest={mode,node:process.version,platform:process.platform,arch:process.arch,ownerSmoke:'DEFERRED',results};
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
manifest.selection=only??'all';manifest.scope=only?'selected-checks':'complete-layer';
const available=new Set();
const run=(id,bin,args,options={})=>{available.add(id);if(only&&!only.includes(id))return;console.log(id+': RUN');const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:64*1024*1024,...options});writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));results.push({id,status:r.status===0?'PASS':'FAIL',exit:r.status});console.log(id+': '+results.at(-1).status);if(r.status!==0)throw Error(id+' failed');};
const vsix=p=>path.join(out,p,`archi-agent-${p}-${version}.vsix`),tar=path.join(out,'cli',`archi-agent-cli-${version}.tgz`);
function extract(file){const dir=mkdtempSync('/private/tmp/ea1b-runtime-'),a=openVsix(file);for(const e of a.entries){if(e.name.endsWith('/'))continue;const f=path.join(dir,e.name);if(!f.startsWith(dir+path.sep))throw Error('unsafe ZIP');mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,a.read(e.name));}return dir;}
try{
 manifest.base=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
 const names=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','src','vscode-extension/src','vscode-extension/package.json','package.json','package-lock.json'],{encoding:'utf8'}).stdout.split('\0').filter(Boolean);
 manifest.sourceFiles=Object.fromEntries(names.map(f=>[f,sha(readFileSync(f))]));manifest.sourceFingerprint=sha(JSON.stringify(manifest.sourceFiles));
 if(mode==='gates'){
  for(const [id,args]of [['root-tests',['test','--','--no-file-parallelism']],['extension-tests',['run','extension:test','--','--no-file-parallelism']],['typecheck',['run','typecheck']],['extension-typecheck',['run','extension:typecheck']],['build',['run','extension:build']]])run(id,'npm',args);
  // Dependencies/OCR inventory were not changed; package verification checks the pinned existing inventory.
  for(const p of ['core','full']){run('package-'+p,'npm',['run','extension:package','--','--profile',p,'--out',path.join(out,p)]);run('verify-'+p,'npm',['run','extension:verify','--',vsix(p)]);}
  run('package-cli','npm',['run','cli:package','--',path.join(out,'cli')]);run('verify-cli','npm',['run','cli:verify','--',tar]);
  run('help-sync',process.execPath,['scripts/docs/sync-help.mjs','--check']);run('demo-docs','python3',['scripts/check-demo-docs.py']);
  for(const p of ['core','full']){const dir=path.join(out,'docs-'+p);mkdirSync(dir,{recursive:true});run('docs-'+p,process.execPath,['scripts/docs/check-docs.mjs',dir,vsix(p),'--functional',path.resolve(`build/ea1/candidate-final-20261019/${p}/archi-agent-${p}-${version}.vsix`)]);}
  run('diff-check','git',['diff','--check']);
 }else if(mode==='runtime'){
  const harness=mkdtempSync('/private/tmp/ea1b-driver-'),driver=path.join(harness,'packaged.cjs'),catalog=path.join(harness,'enterprise.json');copyFileSync('examples/retail-checkout/architecture/enterprise.json',catalog);
  await build({entryPoints:['scripts/ea1b-packaged-smoke.mjs'],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:driver});
  run('packaged-cli-mcp',process.execPath,[driver,vsix('core'),vsix('full'),tar,catalog,path.join(out,'packaged')],{cwd:harness,env:{...process.env,PATH:'',NODE_PATH:''}});
  // Output paths passed to the outside-repo driver are absolute; product needs no repo modules.
  for(const p of ['core','full']){
   const dir=extract(vsix(p)),bundle=path.join(dir,'extension/dist/archi-agent-runtime.js');
   for(const name of ['ea1-packaged-runtime-smoke.mjs','src1-packaged-runtime-smoke.mjs','src1-smoke-fixture.cjs','ver1-c4-packaged-runtime-smoke.mjs','ver1-c4-fixture.cjs','art1-packaged-runtime-smoke.mjs','art1-smoke-fixture.cjs'])copyFileSync('scripts/'+name,path.join(dir,name));
   const fixture=path.join(dir,'bank');cpSync('test/fixtures/structurizr/big-bank-plc',fixture,{recursive:true});const input=path.join(dir,'enterprise.json');copyFileSync('examples/retail-checkout/architecture/enterprise.json',input);
   run('ea1-'+p,process.execPath,[path.join(dir,'ea1-packaged-runtime-smoke.mjs'),bundle,input,path.join(out,'ea1-'+p)],{cwd:dir,env:{...process.env,PATH:'',NODE_PATH:''}});
   if(p==='core')for(const name of ['src1','ver1-c4','art1'])run(name,process.execPath,[path.join(dir,name+'-packaged-runtime-smoke.mjs'),bundle,...(name==='art1'?[]:[fixture]),path.join(out,name+'-runtime.json')],{cwd:dir,env:{...process.env,PATH:'',NODE_PATH:''}});
  }
 }else if(mode==='host'||mode==='ui'){
  const dir=mkdtempSync('/private/tmp/ea1b-cli-host-');const r=spawnSync('/usr/bin/tar',['-xzf',tar,'-C',dir]);if(r.status!==0)throw Error('CLI extraction failed');
  process.env.EA1B_NODE=process.execPath;process.env.EA1B_SERVER=path.join(dir,'package/bin/archi-agent-knowledge-server.cjs');process.env.EA1_CATALOG=path.resolve('examples/retail-checkout/architecture/enterprise.json');
  if(mode==='host'){
   for(const [script,prefix]of [['ea1b-extension-host.cjs','ea1b-host'],['ea1-extension-host.cjs','ea1-host']]){const r=await runHostSmoke(vsix('core'),out,script,prefix);results.push(...r);if(r.some(r=>r.status!=='PASS'))throw Error(prefix+' failed');}
  }else{
   for(const name of ['ea1b','ea1','src1'])run(name+'-ui',process.execPath,[`scripts/${name}-real-ui-smoke.mjs`,vsix('core'),path.join(out,name+'-ui'),...(name==='src1'?['--generation-only']:name==='ea1'?['--single-project']:[])]);
  }
 }else throw Error('mode must be gates/runtime/host/ui');
 if(only&&(!only.length||only.some(id=>!available.has(id))||!results.length))throw Error('Unknown/empty selected checks');
 manifest.artifacts=Object.fromEntries([...['core','full'].map(p=>[p,vsix(p)]),['cli',tar]].map(([p,file])=>{const b=readFileSync(file);return[p,{path:file,bytes:b.length,sha256:sha(b)}];}));
}catch(e){manifest.error=e.stack;process.exitCode=1;}
manifest.status=manifest.error?'FAIL':only?'SELECTED_CHECKS_PASS':'PASS';
const suffix=only?'-selected-'+sha(JSON.stringify(only)).slice(0,8):'';
writeFileSync(path.join(out,mode+suffix+'-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(mode+': '+manifest.status);
