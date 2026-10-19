import {nativePidForPort} from './ea1b-ui-native-pid.mjs';
// Visible installed VS Code controls plus native macOS pickers/confirmation. No editor API stubs.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Cdp,freePort,waitFor} from './ux3-real-ui-smoke.mjs';
import {prepareVscode,vscodeBinary} from './ux3-vscode-smoke.mjs';
const singleProject=process.argv.includes('--single-project');
const [vsix,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const env=prepareVscode(path.resolve(vsix),'EA1'),left=path.join(env.root,'left'),project=path.join(env.root,'retail');mkdirSync(left);mkdirSync(project);
const catalog=path.join(project,'enterprise.json');copyFileSync('examples/retail-checkout/architecture/enterprise.json',catalog);
const workspace=path.join(env.root,'capabilities.code-workspace');writeFileSync(workspace,JSON.stringify({folders:[{path:left},{path:project}]}));
const results=[],logs=[],delay=ms=>new Promise(r=>setTimeout(r,ms));let child,cdp,nativePid;
const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);};
const check=async(id,fn)=>{await fn();results.push({id,status:'PASS',layer:'visible installed VS Code UI'});};
async function start(){await cdp.palette('Archi: Create Diagram');await cdp.expectTitle('Archi Agent: diagram type');
 assert(await cdp.read('document.body.textContent.includes("Enterprise Architecture / Architektura korporacyjna")'));
 await cdp.pick('Archi Agent: diagram type','Capability Map / Mapa zdolności biznesowych');
 if(!singleProject)await cdp.pick('Archi Agent: capability project','retail');await delay(600);run(path.join(out,'picker'),[String(nativePid),catalog]);}
try{
 run('/usr/bin/swiftc',['scripts/k3-native-picker.swift','-o',path.join(out,'picker')]);run('/usr/bin/swiftc',['scripts/art1-native-confirmation.swift','-o',path.join(out,'confirm')]);
 const settingsFile=path.join(env.user,'User/settings.json'),settings=JSON.parse(readFileSync(settingsFile));
 Object.assign(settings,{'window.title':'Archi Agent — EA1 capabilities','editor.wordWrap':'on','editor.minimap.enabled':false});
 assert(!Object.keys(settings).some(k=>k.startsWith('archiAgent.')));writeFileSync(settingsFile,JSON.stringify(settings));
 const port=await freePort();child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,`--remote-debugging-port=${port}`,'--skip-welcome','--skip-release-notes','--new-window',singleProject?project:workspace],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs.push(b));child.stderr.on('data',b=>logs.push(b));
 const target=await waitFor(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&/workbench/.test(t.url));}catch{}},'renderer',30000);
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});nativePid=await nativePidForPort(port);cdp=new Cdp(socket);await delay(3000);
 await check('ea1-visible-type-cancel',async()=>{await cdp.palette('Archi: Create Diagram');await cdp.expectTitle('Archi Agent: diagram type');await cdp.screenshot(path.join(out,'types.png'));await cdp.key('Escape','Escape');assert(!existsSync(path.join(project,'archi-agent-results')));});
 await check('ea1-visible-scope-cancel',async()=>{await start();await cdp.expectTitle('Archi Agent: capability scope');await cdp.screenshot(path.join(out,'scope.png'));await cdp.key('Escape','Escape');assert(!existsSync(path.join(project,'archi-agent-results')));});
 await check('ea1-visible-unconfigured-provider-two-previews',async()=>{await start();await cdp.pick('Archi Agent: capability scope','Sprzedaż');await cdp.pick('Archi Agent: capability detail','L1–L3');await cdp.pick('Archi Agent: capability colors','Dojrzałość');
  await waitFor(()=>cdp.read('document.body.textContent.includes("Capability Map and report ready")'),'capability success');await delay(500);
  await waitFor(()=>cdp.read('document.body.textContent.replace(/[\\s\\u200b]/g,"").includes("deterministic-catalog-projection")'),'report editor');await cdp.screenshot(path.join(out,'result.png'));assert(!existsSync(path.join(project,'archi-agent-results')));
 });
 await check('ea1-visible-save-cancel',async()=>{await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.key('Enter','Enter');if(!singleProject)await cdp.pick('Archi Agent: select save project','retail');run(path.join(out,'confirm'),[String(nativePid),'Cancel']);assert(!existsSync(path.join(project,'archi-agent-results')));});
 await check('ea1-visible-ART1-original-pair',async()=>{writeFileSync(catalog,'changed after previews');await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.key('Enter','Enter');if(!singleProject)await cdp.pick('Archi Agent: select save project','retail');run(path.join(out,'confirm'),[String(nativePid),'Save Diagram and Report']);
  const base=path.join(project,'archi-agent-results');await waitFor(()=>existsSync(base)&&readdirSync(base).length===1,'saved original');const bundle=path.join(base,readdirSync(base)[0]),report=JSON.parse(readFileSync(path.join(bundle,'report.json'))),puml=readFileSync(path.join(bundle,'diagram.puml'));
  assert.equal(report.generationReport.modelCalls,0);assert.equal(report.generationReport.semanticReview.status,'not-applicable');assert.deepEqual(report.generationReport.selection.rootIds,['sales']);assert.equal(report.generationReport.visible.length,5);assert.equal(report.diagram.sha256,createHash('sha256').update(puml).digest('hex'));assert(!existsSync(path.join(left,'archi-agent-results')));await cdp.screenshot(path.join(out,'saved.png'));
 });
 assert(!Object.keys(JSON.parse(readFileSync(settingsFile))).some(k=>k.startsWith('archiAgent.')));
}catch(e){if(cdp){await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});writeFileSync(path.join(out,'failure-dom.txt'),await cdp.read('document.body.textContent').catch(()=>''));}writeFileSync(path.join(out,'failure.txt'),e.stack);process.exitCode=1;}
finally{cdp?.socket.close();child?.kill('SIGTERM');writeFileSync(path.join(out,'ui.log'),Buffer.concat(logs));writeFileSync(path.join(out,'report.json'),JSON.stringify({vsix:path.resolve(vsix),vsixSha256:createHash('sha256').update(readFileSync(vsix)).digest('hex'),environment:env,providerConfigured:false,singleProject,launchedPid:child?.pid,nativePid,results},null,2)+'\n');}
console.log(JSON.stringify(results));if(results.length!==5||results.some(r=>r.status!=='PASS'))process.exitCode=1;
