// Real installed product, public Big Bank fixture, synthetic loopback model.
// Reuses the existing isolated VS Code/CDP and owned-window capture helpers.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Cdp,freePort,waitFor} from '../ux3-real-ui-smoke.mjs';
import {prepareVscode,vscodeBinary} from '../ux3-vscode-smoke.mjs';
import {WebviewUi} from '../ux4-webview-ui.mjs';
const [vsix,outArg]=process.argv.slice(2),out=path.resolve(outArg);
mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const fixture=createRequire(import.meta.url)('../ver1-c4-fixture.cjs');
const env=prepareVscode(path.resolve(vsix),'DOC2'),project=path.join(env.root,'big-bank');mkdirSync(project);
const {config,flow}=fixture.prepare(project,path.resolve('test/fixtures/structurizr/big-bank-plc'));
const bad=path.join(project,'verify-discrepancies.puml');
writeFileSync(bad,fixture.diagram('A ->> B : wrong mode (DB)\nB -> A : wrong direction (DB)'));
let child,cdp,ui,calls=0;const screens=[],inputs=[];
const server=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'synthetic-doc2-model'}]}));return;}
 let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{calls++;const input=JSON.parse(JSON.parse(raw).messages[1].content);inputs.push(input);const answer=fixture.answer(input);if(answer.version===3)answer.groundedSteps=input.operationCatalog.filter(o=>o.kind==='request').map((o,i)=>({order:i+1,operationId:o.operationId,label:i?'Read account data':'Open online banking'}));res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}));});});
async function open(file){await cdp.key('p','KeyP',4);await waitFor(()=>cdp.focused(),'Quick Open');await cdp.text(file);await delay(350);await cdp.key('Enter','Enter');await delay(600);}
async function capture(file,screen){
 await cdp.palette('Notifications: Clear All Notifications');await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:300,y:20});await delay(700);
 const dir=path.join(out,file.replace('.png',''));mkdirSync(dir);
 const capture=spawn(path.join(out,'capture'),[String(child.pid),dir,path.join(dir,'stop')],{stdio:['ignore','ignore','pipe']});let error='';capture.stderr.on('data',b=>error+=b);
 await waitFor(()=>readdirSync(dir).some(n=>n.endsWith('.png')),'owned window frame',20000);writeFileSync(path.join(dir,'stop'),'');const code=capture.exitCode??await new Promise(r=>capture.once('close',r));assert.equal(code,0,error);
 const frames=JSON.parse(readFileSync(path.join(dir,'frames.json'))),frame=frames.at(-1);assert.ok(frame);
 copyFileSync(path.join(dir,frame.file),path.join(out,file));screens.push({file,screen,sha256:hash(readFileSync(path.join(out,file))),method:'ScreenCaptureKit, isolated installed VS Code PID; no image modification',windowID:frame.windowID,capturedAt:new Date().toISOString()});
}
async function clickTree(label){const p=await waitFor(()=>cdp.read(`(()=>{const e=Array.from(document.querySelectorAll('.monaco-list-row')).find(e=>e.textContent.includes(${JSON.stringify(label)})&&e.getBoundingClientRect().height>0);const r=e?.getBoundingClientRect();return r?{x:r.x+30,y:r.y+r.height/2}:null})()`),'tree '+label);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:2,...p});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:2,...p});await delay(350);}
try{
 for(const [name,source] of [['window','capture-window.swift'],['capture','capture-owned-window.swift'],['confirm','../art1-native-confirmation.swift']])run('/usr/bin/swiftc',['scripts/docs/'+source,'-o',path.join(out,name)]);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const settingsPath=path.join(env.user,'User/settings.json'),settings=JSON.parse(readFileSync(settingsPath));
 Object.assign(settings,{'archiAgent.architectureSource':config,'archiAgent.localModel.baseUrl':`http://127.0.0.1:${server.address().port}/v1`,'archiAgent.localModel.model':'synthetic-doc2-model','window.title':'Archi Agent — Big Bank example','workbench.colorTheme':'Default Light Modern','workbench.activityBar.location':'hidden','workbench.statusBar.visible':false,'workbench.secondarySideBar.defaultVisibility':'hidden','editor.wordWrap':'on','editor.fontSize':15,'editor.minimap.enabled':false,'window.autoDetectColorScheme':false,'window.autoDetectHighContrast':false});writeFileSync(settingsPath,JSON.stringify(settings));
 const port=await freePort();child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,`--remote-debugging-port=${port}`,'--skip-welcome','--skip-release-notes','--new-window',project],{stdio:'ignore'});
 const target=await waitFor(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(i=>i.type==='page'&&/workbench/u.test(i.url));}catch{}},'renderer',30000);
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});cdp=new Cdp(socket);ui=new WebviewUi(cdp);await delay(3000);run(path.join(out,'window'),[String(child.pid)]);
 await cdp.palette('View: Toggle Primary Side Bar Visibility');
 await open(flow);
 for(const [type,file] of [['Sequence','15-sequence.png'],['C4 Context','16-c4-context.png'],['C4 Container','17-c4-container.png']]){
  if(type==='Sequence')await open(flow);
  const before=calls;await cdp.palette('Archi: Create Diagram');await cdp.pick('Archi Agent: diagram type',type);
  if(type.startsWith('C4'))await cdp.pick('Archi Agent: C4 software system','Internet Banking System');
  else {await cdp.expectTitle('Archi Agent: flow source');await cdp.text('Use the active editor document');await delay(400);await cdp.key('Enter','Enter');}
  await waitFor(()=>calls===before+2,'two generation calls');await waitFor(()=>cdp.read("document.body.textContent.includes('Archi Agent generated')"),'generated');
  assert.deepEqual(inputs.at(-1).snapshot,inputs.at(-2).snapshot);await delay(800);
  await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.text(type.toLowerCase().replace(' ','-'));await delay(300);await cdp.key('Enter','Enter');run(path.join(out,'confirm'),[String(child.pid),'Save Diagram and Report']);
  const bundle=await waitFor(()=>{try{return readdirSync(path.join(project,'archi-agent-results')).map(n=>path.join(project,'archi-agent-results',n)).find(p=>JSON.parse(readFileSync(path.join(p,'report.json'))).generationReport.diagramType===type.toLowerCase().replace(' ','-'));}catch{}},'saved original');
  const puml=path.join(bundle,'diagram.puml');run('/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java',['-Djava.awt.headless=true','-jar','/usr/local/Cellar/plantuml/1.2026.6/libexec/plantuml.jar','-Playout=smetana','-tpng',puml]);
  await open(path.join(bundle,'diagram.png'));if(type==='C4 Container')await cdp.palette('View: Single Column Editor Layout');await delay(600);await capture(file,type+' rendered from original saved PlantUML by separate local PlantUML 1.2026.6 / Smetana'+(type==='C4 Container'?'; full-width diagram for readability':'; original report alongside'));
  screens.at(-1).originalPlantUmlSha256=hash(readFileSync(puml));screens.at(-1).originalReportSha256=hash(readFileSync(path.join(bundle,'report.json')));
 }
 await open(bad);const before=calls;await cdp.palette('Archi: Verify Flow (Sequence / prose)');await cdp.pick('Archi Agent: Verify Flow — Sequence or prose','Use active document');await waitFor(()=>cdp.read("document.body.textContent.includes('discrepancies')"),'verification');assert.equal(calls,before);await capture('18-verify-flow.png','Verify Flow discrepancies; Sequence parsing without LLM');
 await cdp.palette('View: Single Column Editor Layout');await cdp.palette('Archi: Configuration');await ui.wait('#pack-path','document.querySelector("#pack-path").textContent.includes("Structurizr JSON")');await capture('20-configuration.png','Configuration: Structurizr JSON with ID-bound overlay');
 await cdp.palette('Archi: Knowledge Browser');await delay(800);
 const point=await cdp.read("(()=>{const e=Array.from(document.querySelectorAll('.pane-header')).find(e=>e.textContent.includes('Archi Agent'));const r=e?.getBoundingClientRect();return r?{x:r.x+150,y:r.y-2}:null})()");
 if(point){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:point.x,y:140});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:140});}
 await clickTree('big-bank');await clickTree('Active Structurizr');await clickTree('Systems (9)');
 await waitFor(()=>cdp.read("document.body.textContent.includes('Internet Banking System / API Application')"),'source containers');await capture('19-knowledge-browser.png','Knowledge Browser: public Big Bank systems, original IDs and source scope');
 assert.equal(calls,6);assert.equal(screens.length,6);
}catch(e){if(cdp)await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});writeFileSync(path.join(out,'failure.txt'),e.stack);process.exitCode=1;}
finally{ui?.dispose();cdp?.socket.close();child?.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));writeFileSync(path.join(out,'provenance.json'),JSON.stringify({status:process.exitCode?'FAIL':'PASS',commit:run('git',['rev-parse','HEAD']),vsixSha256:hash(readFileSync(vsix)),platform:process.platform,arch:process.arch,syntheticTransport:true,generationRequests:calls,screens,environment:env},null,2)+'\n');}
