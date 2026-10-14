// DOC1 documentation harness. Drives actual installed VSIX UI; transport alone is synthetic.
if (process.argv.includes('--screenshots')) {
 await import('./capture-current-ui.mjs');
 process.exit(process.exitCode ?? 0);
}
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Cdp,freePort,waitFor} from '../ux3-real-ui-smoke.mjs';
import {prepareVscode,vscodeBinary} from '../ux3-vscode-smoke.mjs';
const require=createRequire(import.meta.url), fixture=require('../art1-smoke-fixture.cjs');
const base=path.dirname(fileURLToPath(import.meta.url));
const [vsixArg,outArg]=process.argv.slice(2),vsix=path.resolve(vsixArg),out=path.resolve(outArg);
mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function command(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});if(r.status!==0)throw new Error(`${path.basename(bin)} failed: ${r.stderr}`);return r.stdout.trim();}
for(const [name,source] of [['window',path.join(base,'capture-window.swift')],['capture',path.join(base,'capture-owned-window.swift')],['picker',path.join(base,'../k3-native-picker.swift')],['confirm',path.join(base,'../art1-native-confirmation.swift')]])command('/usr/bin/swiftc',[source,'-o',path.join(out,name)]);
const env=prepareVscode(vsix,'DOC1');
writeFileSync(path.join(out,'startup.json'),JSON.stringify({vsix,vsixSha256:createHash('sha256').update(readFileSync(vsix)).digest('hex'),testRoot:env.root},null,2)+'\n');
// Canonical short paths prevent NSOpenPanel /tmp aliases. No personal VS Code profile is touched.
const project=path.join(env.root,'synthetic-project');mkdirSync(project);
const {pack,flow}=fixture.prepare(project);const source=path.join(project,'source.md');writeFileSync(source,'Alpha calls Beta.');
let calls=0,lists=0,child,cdp,recorder,started,events=[],scenarios=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const server=createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{
 res.setHeader('content-type','application/json');
 if(req.method==='GET'){lists++;res.end(JSON.stringify({data:[{id:'synthetic-doc1'}]}));return;}
 calls++;const request=JSON.parse(body),input=JSON.parse(request.messages[1].content);let answer;
 if(request.response_format.json_schema.name==='archi_document_candidates_v1'){
  const s=input.sources[0],evidence=[{sourceId:s.sourceId,originalDigest:s.originalDigest,textDigest:s.textDigest,excerpt:s.text,startOffset:0,endOffset:s.text.length}];
  answer={version:1,candidates:[{table:'systems',row:{id:'a',canonical_name:'Alpha',kind:'service',description:'Service'},basis:'explicit',reasoning:null,evidence},{table:'systems',row:{id:'b',canonical_name:'Beta',kind:'database',description:'Store'},basis:'inferred',reasoning:'Proposed',evidence}]};
 }else{answer=fixture.answer(input);if(answer.version===3)answer.groundedSteps[0].label='Store data';}
 res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}));
});});
async function hold(name,ms=1500){events.push({name,seconds:(Date.now()-started)/1000});await delay(ms);}
async function pick(title,label){await cdp.expectTitle(title);await hold(title,200);await cdp.expectTitle(title);const point=await cdp.read("(()=>{const r=document.querySelector('.quick-input-widget input').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await cdp.text(label);await delay(500);await waitFor(()=>cdp.read(`document.querySelector('.quick-input-list .monaco-list-row.focused .label-name')?.textContent?.trim()===${JSON.stringify(label)}`),'focused '+label).catch(async e=>{writeFileSync(path.join(out,'focused-dom.json'),JSON.stringify(await cdp.read("Array.from(document.querySelectorAll('.quick-input-list .monaco-list-row')).map(r=>({text:r.textContent,html:r.outerHTML}))"),null,2));throw e;});await waitFor(()=>cdp.read(`document.activeElement?.matches('.quick-input-widget input') && document.activeElement.value===${JSON.stringify(label)}`),'focused filter '+label);await cdp.key('Enter','Enter');await delay(300);}
function native(destination){command(path.join(out,'picker'),[String(child.pid),destination]);}
async function begin(name){events=[];const dir=path.join(out,name);mkdirSync(dir);started=Date.now();recorder=spawn(path.join(out,'capture'),[String(child.pid),dir,path.join(dir,'stop')],{stdio:['ignore','pipe','pipe']});recorder.stderr.on('data',b=>writeFileSync(path.join(dir,'capture-error.txt'),b));await hold('start',1000);}
async function end(name,checks){await hold('end',1800);const dir=path.join(out,name);writeFileSync(path.join(dir,'stop'),'');if(recorder.exitCode===null)await new Promise(r=>recorder.once('close',r));assert.ok(existsSync(path.join(dir,'frames.json')),'capture completed');scenarios.push({name,events,checks,frames:JSON.parse(readFileSync(path.join(dir,'frames.json'))).length,status:'PASS'});writeFileSync(path.join(out,'recording.json'),JSON.stringify({status:'IN_PROGRESS',vsix,vsixSha256:sha(readFileSync(vsix)),testRoot:env.root,syntheticTransport:true,calls,lists,scenarios},null,2)+'\n');}
async function button(label){const expr=`(()=>{const b=Array.from(document.querySelectorAll('.notification-list-item .monaco-button')).filter(b=>b.textContent.trim()===${JSON.stringify(label)}&&b.getBoundingClientRect().height>0).at(-1);const r=b?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`;const point=await waitFor(()=>cdp.read(expr),label);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
let rectangle;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const settingsPath=path.join(env.user,'User/settings.json'),settings=JSON.parse(readFileSync(settingsPath));
 Object.assign(settings,{'window.title':'Archi Agent — Synthetic demo','workbench.colorTheme':'Default Light Modern','window.autoDetectHighContrast':false,'window.autoDetectColorScheme':false,'workbench.secondarySideBar.defaultVisibility':'hidden','editor.wordWrap':'on','editor.fontSize':16,'editor.minimap.enabled':false,'window.zoomLevel':0,'workbench.activityBar.location':'hidden','workbench.statusBar.visible':false,'archiAgent.localModel.baseUrl':`http://127.0.0.1:${server.address().port}/v1`,'archiAgent.localModel.model':'synthetic-doc1'});writeFileSync(settingsPath,JSON.stringify(settings));
 const port=await freePort();child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,`--remote-debugging-port=${port}`,'--skip-welcome','--skip-release-notes','--new-window',project],{stdio:'ignore'});
 const target=await waitFor(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(i=>i.type==='page'&&/workbench/u.test(i.url));}catch{}},'renderer',30000);
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});cdp=new Cdp(socket);await delay(3000);
 // The owned-window Accessibility helper already foregrounds this PID.
 rectangle=command(path.join(out,'window'),[String(child.pid)]);
 const left=await cdp.read("(()=>{const e=document.querySelector('.codicon-layout-sidebar-left');const r=e?.getBoundingClientRect();return r?.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()");
 if(left){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...left});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...left});}
 await delay(500);
 // 1: UX3 existing pack activation, then reviewed Sequence generation.
 await begin('choose-pack-generate');await cdp.palette('Archi Agent: Configure Knowledge Pack');
 await pick('Archi Agent: Knowledge Pack','Choose Existing');native(pack);await hold('pack selected',1000);
 await cdp.palette('Archi Agent: Generate Diagram');await pick('Archi Agent: diagram type','Sequence');
 await cdp.expectTitle('Archi Agent: flow source');await cdp.text('Choose a flow file');const label=await waitFor(()=>cdp.read("document.querySelector('.quick-input-list .monaco-list-row.focused .label-name')?.textContent"),'flow file label');await cdp.chooseLabel(label);native(flow);
 await waitFor(()=>cdp.read("Array.from(document.querySelectorAll('.notification-list-item-message')).some(e=>e.textContent.includes('Archi Agent generated'))"),'generation');
 assert.equal(calls,2);assert.equal(JSON.parse(readFileSync(path.join(project,'.vscode/settings.json')))['archiAgent.knowledgePackPath'],pack);
 await hold('diagram and report',3500);await end('choose-pack-generate',{packActivated:true,generatorRequests:1,reviewerRequests:1});
 // 2: ART1 original selection, real native confirmation, actual two-file write.
 const before=calls;await begin('save-original-pair');await cdp.palette('Archi Agent: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.text('sequence');await hold('original result',1800);const original=await waitFor(()=>cdp.read("document.querySelector('.quick-input-list .monaco-list-row.focused .label-name')?.textContent"),'original');await cdp.key('Enter','Enter');
 const observed=JSON.parse(command(path.join(out,'confirm'),[String(child.pid),'inspect']));await hold('native confirmation',2500);
 const destination=observed.texts.find(t=>t.includes('diagram.puml')&&t.includes('report.json')).split('\n')[0].trim();command(path.join(out,'confirm'),[String(child.pid),'Save Diagram and Report']);await waitFor(()=>existsSync(path.join(destination,'report.json')),'saved report');await hold('saved pair',1500);await button('Open Report');await hold('open saved report',2500);
 const report=JSON.parse(readFileSync(path.join(destination,'report.json')));assert.equal(report.diagram.sha256,sha(readFileSync(path.join(destination,'diagram.puml'))));assert.equal(report.diagram.byteLength,readFileSync(path.join(destination,'diagram.puml')).length);assert.equal(calls,before);assert.equal(readdirSync(destination).length,2);
 await end('save-original-pair',{files:2,diagramSha256:report.diagram.sha256,additionalRequests:0});
 // 3: K3 source selection, details, edit, group accept, exact preview, new-folder Save.
 await begin('documents-review-save');await cdp.palette('Archi Agent: Build Knowledge Pack from Documents');native(source);
 const reviewTitle='Archi Agent: review Knowledge Pack candidates',previewTitle='Archi Agent: preview new Knowledge Pack';await cdp.expectTitle(reviewTitle);await hold('pending candidates',2000);await pick(reviewTitle,'Show review details');await cdp.expectTitle(reviewTitle);await hold('evidence and decisions',1200);
 await pick(reviewTitle,'Edit candidate');await cdp.expectTitle('Archi Agent: edit candidate');await cdp.text('Beta');await delay(500);await cdp.key('Enter','Enter');await pick('Archi Agent: candidate field','description');await cdp.expectTitle('Archi Agent: edit description');await cdp.text('Edited synthetic store');await hold('edit description',1500);await cdp.key('Enter','Enter');
 await pick(reviewTitle,'Accept all pending');await pick(reviewTitle,'Validate and preview');native(project);await cdp.expectTitle('Archi Agent: new pack folder name');await cdp.text('pack-save');await hold('new folder',1500);await cdp.key('Enter','Enter');await pick(previewTitle,'systems.md');await cdp.expectTitle(previewTitle);await hold('immutable file preview',1800);await pick(previewTitle,'Save');const dest=path.join(project,'pack-save');await waitFor(()=>existsSync(path.join(dest,'rules.md')),'five files');assert.equal(readdirSync(dest).length,5);assert.match(readFileSync(path.join(dest,'systems.md'),'utf8'),/Edited synthetic store/);assert.equal(JSON.parse(readFileSync(path.join(project,'.vscode/settings.json')))['archiAgent.knowledgePackPath'],pack);assert.equal(calls,3);
 await end('documents-review-save',{files:5,extractionRequests:1,additionalReviewEditSaveRequests:0,activePackUnchanged:true});
 writeFileSync(path.join(out,'recording.json'),JSON.stringify({status:'PASS',vsix,vsixSha256:sha(readFileSync(vsix)),testRoot:env.root,platform:process.platform,arch:process.arch,rectangle,syntheticTransport:true,calls,lists,scenarios},null,2)+'\n');
 console.log('PASS: 3 actual UI recordings; 3 generation requests; no additional save/review requests.');
}catch(e){writeFileSync(path.join(out,'failure.txt'),e.stack+'\n');if(cdp){try{writeFileSync(path.join(out,'failure-ui.json'),JSON.stringify(await cdp.read("({title:document.querySelector('.quick-input-title')?.textContent,labels:Array.from(document.querySelectorAll('.quick-input-list .label-name')).map(e=>e.textContent),notifications:Array.from(document.querySelectorAll('.notification-list-item-message')).map(e=>e.textContent)})"),null,2));}catch{}}console.error(e);process.exitCode=1;}
finally{if(recorder&&recorder.exitCode===null){recorder.kill('SIGTERM');await delay(600);}cdp?.socket.close();child?.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));}
