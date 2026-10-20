import {nativePidForPort} from './ea1b-ui-native-pid.mjs';
// Visible installed VS Code, real MCP source and native confirmation. No editor API doubles.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Cdp,freePort,waitFor} from './ux3-real-ui-smoke.mjs';
import {prepareVscode,vscodeBinary} from './ux3-vscode-smoke.mjs';
const [vsix,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const env=prepareVscode(path.resolve(vsix),'EA1b'),project=path.join(env.root,'retail');mkdirSync(project);
const catalog=path.join(project,'enterprise.json');copyFileSync('examples/retail-checkout/architecture/enterprise.json',catalog);
const configFile=path.join(env.root,'knowledge.json');writeFileSync(configFile,JSON.stringify({schemaVersion:2,readRoots:{project},sources:{},providers:{},enterpriseSources:{'retail-business':{kind:'enterprise-json',file:{root:'project',path:'enterprise.json'}}}}));
const server={command:process.env.EA1B_NODE,args:[process.env.EA1B_SERVER,'--config',configFile],timeoutMs:10000};assert(server.command&&server.args[0]);
mkdirSync(path.join(project,'.vscode'));writeFileSync(path.join(project,'.vscode/settings.json'),JSON.stringify({'archiAgent.knowledgeServer':{command:'/untrusted/workspace-executable',args:[]}}));
const results=[],logs=[],delay=ms=>new Promise(r=>setTimeout(r,ms)),require=createRequire(import.meta.url);let child,cdp,nativePid;
const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);};
const check=async(id,fn)=>{await fn();results.push({id,status:'PASS',layer:'visible installed VS Code UI with real MCP process'});};
async function start(){await cdp.palette('Archi: Create Diagram');await cdp.pick('Archi Agent: diagram type','Capability Map / Mapa zdolności biznesowych');await cdp.expectTitle('Archi Agent: capability source');}
try{
 run('/usr/bin/swiftc',['scripts/art1-native-confirmation.swift','-o',path.join(out,'confirm')]);
 const settingsFile=path.join(env.user,'User/settings.json'),settings=JSON.parse(readFileSync(settingsFile));Object.assign(settings,{'window.title':'Archi Agent — EA1b MCP capabilities','editor.wordWrap':'on','editor.minimap.enabled':false,
  'archiAgent.enterpriseSource':{kind:'mcp',sourceId:'retail-business'},'archiAgent.knowledgeServer':server});writeFileSync(settingsFile,JSON.stringify(settings));
 assert(!Object.keys(settings).some(k=>k.startsWith('archiAgent.localModel')));
 const port=await freePort();child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,`--remote-debugging-port=${port}`,'--skip-welcome','--skip-release-notes','--new-window',project],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs.push(b));child.stderr.on('data',b=>logs.push(b));
 const target=await waitFor(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&/workbench/.test(t.url));}catch{}},'renderer',30000);
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});nativePid=await nativePidForPort(port);cdp=new Cdp(socket);await delay(3000);
 await check('ea1b-visible-source-cancel',async()=>{await start();await cdp.screenshot(path.join(out,'source.png'));await cdp.key('Escape','Escape');assert(!existsSync(path.join(project,'archi-agent-results')));});
 await check('ea1b-visible-scope-cancel',async()=>{await start();await cdp.pick('Archi Agent: capability source','Configured MCP source: retail-business');await cdp.expectTitle('Archi Agent: capability scope');await cdp.key('Escape','Escape');assert(!existsSync(path.join(project,'archi-agent-results')));});
 await check('ea1b-visible-real-MCP-two-previews-no-provider',async()=>{await start();await cdp.pick('Archi Agent: capability source','Configured MCP source: retail-business');await cdp.pick('Archi Agent: capability scope','Sprzedaż');await cdp.pick('Archi Agent: capability detail','L1–L3');await cdp.pick('Archi Agent: capability colors','Dojrzałość');
  await waitFor(()=>cdp.read('document.body.textContent.includes("Capability Map and report ready")'),'capability success');await waitFor(()=>cdp.read('document.body.textContent.replace(/[\\s\\u200b]/g,"").includes("responseFingerprint")'),'MCP report');await cdp.screenshot(path.join(out,'result.png'));assert(!existsSync(path.join(project,'archi-agent-results')));
 });
 await check('ea1b-visible-ART1-cancel',async()=>{await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.key('Enter','Enter');run(path.join(out,'confirm'),[String(nativePid),'Cancel']);assert(!existsSync(path.join(project,'archi-agent-results')));});
 const runtime=require(path.join(env.extensionRoot,'dist/archi-agent-runtime.js')),expected=await runtime.generateCapabilityMap({source:{kind:'mcp',sourceId:'retail-business',server},selection:{rootIds:['sales'],maxLevel:3,colorBy:{kind:'rating',scaleId:'maturity'},language:'en'}});assert.equal(expected.status,'success',JSON.stringify(expected));
 await check('ea1b-visible-ART1-original-remote-parity',async()=>{writeFileSync(catalog,'changed after preview');await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.key('Enter','Enter');run(path.join(out,'confirm'),[String(nativePid),'Save Diagram and Report']);
  const base=path.join(project,'archi-agent-results');await waitFor(()=>existsSync(base)&&readdirSync(base).length===1,'saved original');const bundle=path.join(base,readdirSync(base)[0]),report=JSON.parse(readFileSync(path.join(bundle,'report.json'))),puml=readFileSync(path.join(bundle,'diagram.puml'));
  assert.deepEqual(report.generationReport,expected.report);assert.equal(puml.toString(),expected.plantUml);assert.equal(report.sourceReferences.enterpriseCatalog.availability,'remote-source');assert.equal(report.diagram.sha256,createHash('sha256').update(puml).digest('hex'));assert(!JSON.stringify(report).includes(env.root));await cdp.screenshot(path.join(out,'saved.png'));
 });
 await check('ea1b-visible-v1-only-unsupported-no-fallback',async()=>{writeFileSync(configFile,JSON.stringify({schemaVersion:1,readRoots:{project},sources:{},providers:{}}));await start();await cdp.pick('Archi Agent: capability source','Configured MCP source: retail-business');await waitFor(()=>cdp.read('document.body.textContent.includes("enterprise-unsupported")'),'unsupported notification');await cdp.screenshot(path.join(out,'unsupported.png'));});
}catch(e){if(cdp)await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});writeFileSync(path.join(out,'failure.txt'),e.stack);process.exitCode=1;}
finally{cdp?.socket.close();child?.kill('SIGTERM');writeFileSync(path.join(out,'ui.log'),Buffer.concat(logs));writeFileSync(path.join(out,'report.json'),JSON.stringify({vsix:path.resolve(vsix),vsixSha256:createHash('sha256').update(readFileSync(vsix)).digest('hex'),environment:env,providerConfigured:false,launchedPid:child?.pid,nativePid,results},null,2)+'\n');}
console.log(JSON.stringify(results));if(results.length!==6||results.some(r=>r.status!=='PASS'))process.exitCode=1;
