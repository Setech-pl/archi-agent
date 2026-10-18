import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {prepareVscode,vscodeBinary} from './ux3-vscode-smoke.mjs';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
const [core,full,outArg,previousFull]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});assert(previousFull,'Supply exact predecessor Full VSIX');
const results=[],sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const previous=JSON.parse(openVsix(previousFull).read('extension/package.json'));assert.equal(previous.name,'archi-agent');assert.equal(previous.version,'0.3.0-alpha.6');
let env=prepareVscode(path.resolve(previousFull),'MCP1-upgrade');
function install(file){const r=spawnSync('code',['--user-data-dir',env.user,'--extensions-dir',env.extensions,'--install-extension',path.resolve(file),'--force'],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout+r.stderr;}
const coreOld=path.join(out,'synthetic-core-predecessor.vsix'),zip=await JSZip.loadAsync(readFileSync(core)),p=JSON.parse(await zip.file('extension/package.json').async('string'));p.version='0.3.0-alpha.6';zip.file('extension/package.json',JSON.stringify(p));zip.file('extension.vsixmanifest',(await zip.file('extension.vsixmanifest').async('string')).replace(/Version="0.3.0-alpha.7"/,'Version="0.3.0-alpha.6"'));writeFileSync(coreOld,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
const harness=path.join(env.root,'harness');mkdirSync(harness);writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'mcp1-profile-harness',publisher:'local',version:'1.0.0',engines:{vscode:'^1.91.0'},main:'extension.cjs',activationEvents:['onStartupFinished']}));writeFileSync(path.join(harness,'extension.cjs'),"exports.activate=()=>{void require('./test.cjs').run().catch(e=>console.error(e));};");copyFileSync('scripts/mcp1-profile-host.cjs',path.join(harness,'test.cjs'));
const report={environment:env,predecessorFull:{path:path.resolve(previousFull),sha256:sha(previousFull)},syntheticPredecessorCore:{path:coreOld,sha256:sha(coreOld),scope:'candidate bytes with only manifest version changed; no prior Core release exists'},artifacts:[core,full].map(f=>({path:path.resolve(f),sha256:sha(f)})),results};
async function mode(mode){
 const both=mode.startsWith('conflict'),isCore=mode.startsWith('core'),enabled=both?['setech-pl.archi-agent','setech-pl.archi-agent-core']:[isCore?'setech-pl.archi-agent-core':'setech-pl.archi-agent'];
 const config=path.join(harness,'config.json'),file=path.join(out,mode+'.json');writeFileSync(config,JSON.stringify({mode,enabled,report:file,predecessor:mode.includes('before-upgrade')}));
 const child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,'--password-store=basic',`--extensionDevelopmentPath=${harness}`,...(both?[]:['--disable-extension',isCore?'setech-pl.archi-agent':'setech-pl.archi-agent-core']),'--skip-welcome','--skip-release-notes','--new-window'],{env:{...process.env,MCP1_PROFILE_CONFIG:config},stdio:['ignore','pipe','pipe']});const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b));const start=Date.now();while(!existsSync(file)&&Date.now()-start<60000)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,1000));const closed=new Promise(r=>child.once('close',r));child.kill('SIGTERM');await closed;writeFileSync(path.join(out,mode+'.log'),Buffer.concat(chunks));assert(existsSync(file),'Host report '+mode);const r=JSON.parse(readFileSync(file));assert(r.results.length>0);results.push(...r.results);assert(r.results.every(x=>x.status==='PASS'),mode);
}
try{
 report.installCorePredecessor=install(coreOld);await mode('full-before-upgrade');await mode('core-before-upgrade');
 const oldCoreRoot=path.join(env.extensions,'setech-pl.archi-agent-core-0.3.0-alpha.6'),oldCoreHash=sha(path.join(oldCoreRoot,'package.json'));
 report.upgradeFull=install(full);assert.equal(sha(path.join(oldCoreRoot,'package.json')),oldCoreHash);await mode('full-first');
 const fullRoot=path.join(env.extensions,'setech-pl.archi-agent-0.3.0-alpha.7'),fullHash=sha(path.join(fullRoot,'package.json'));
 report.upgradeCore=install(core);assert.equal(sha(path.join(fullRoot,'package.json')),fullHash);await mode('core-switch');
 results.push({id:'independent-version-upgrade-Full-real-predecessor-Core-synthetic-predecessor-preserves-settings-secrets',status:'PASS'});
 for(const name of ['full-return','core-return','conflict'])await mode(name);
 const originalEnvironment=env;env=prepareVscode(path.resolve(core),'MCP1-reverse-install');report.reverseEnvironment=env;report.reverseInstallFull=install(full);await mode('core-only-reverse');await mode('conflict-reverse');
 const rendererLogs=[];function collect(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())collect(f);else if(e.name==='renderer.log')rendererLogs.push(readFileSync(f,'utf8'));}}collect(path.join(originalEnvironment.user,'logs'));collect(path.join(env.user,'logs'));
 const diagnostics=rendererLogs.join('\n');assert(diagnostics.includes('Command `archiAgent.open` already registered'));assert(diagnostics.includes("Cannot register 'archiAgent.knowledgePackPath'"));assert(diagnostics.includes('Cannot register multiple views with same id `archiAgent.knowledge`'));writeFileSync(path.join(out,'static-contribution-diagnostics.log'),diagnostics);results.push({id:'actual-static-command-setting-view-collisions-before-activation',status:'PASS'});
}catch(e){report.error=e.stack;process.exitCode=1;}
report.status=report.error?'FAIL':'PASS';writeFileSync(path.join(out,'profile-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
