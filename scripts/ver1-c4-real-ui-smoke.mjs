// Visible installed VS Code controls only: CDP input + native confirmation helper.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Cdp,freePort,waitFor} from './ux3-real-ui-smoke.mjs';
import {prepareVscode,vscodeBinary} from './ux3-vscode-smoke.mjs';
const [vsix,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const fixture=createRequire(import.meta.url)('./ver1-c4-fixture.cjs'),env=prepareVscode(path.resolve(vsix),'VER1-C4'),project=path.join(env.root,'bank');mkdirSync(project);
const {config}=fixture.prepare(project,path.resolve('test/fixtures/structurizr/big-bank-plc'));
const good=path.join(project,'verify-good.puml'),bad=path.join(project,'verify-bad.puml'),prose=path.join(project,'verify-prose.txt'),alias=path.join(project,'verify-alias.puml');
writeFileSync(good,fixture.diagram());writeFileSync(bad,fixture.diagram('A ->> B : wrong mode (DB)\nB -> A : wrong direction (DB)'));writeFileSync(prose,fixture.prose);writeFileSync(alias,fixture.diagram(undefined,'Bazę Płatności'));
const aliasOnly=process.argv.includes('--alias-only'),baselineCalls=aliasOnly?0:4;
const results=[],inputs=[],logs=[];let child,cdp,calls=0;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout;};
const server=createServer((req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{calls++;const input=JSON.parse(JSON.parse(raw).messages[1].content);inputs.push(input);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture.answer(input))}}]}));});});
const check=async(id,fn)=>{try{await fn();results.push({id,status:'PASS',layer:'visible installed VS Code UI'});}catch(e){results.push({id,status:'FAIL',error:e.stack});throw e;}};
async function openFile(file){await cdp.send('Page.bringToFront');await cdp.key('p','KeyP',4);await waitFor(()=>cdp.focused(),'Quick Open');await cdp.text(file);await delay(400);await cdp.key('Enter','Enter');await waitFor(()=>cdp.read(`Array.from(document.querySelectorAll('.tab.active')).some(e=>e.textContent.includes(${JSON.stringify(path.basename(file))}))`),'active input editor');await delay(300);}
async function verify(file){await openFile(file);await cdp.palette('Archi: Verify Flow (Sequence / prose)');await cdp.pick('Archi Agent: Verify Flow — Sequence or prose','Use active document');}
async function notification(text){return waitFor(()=>cdp.read(`document.body.textContent.includes(${JSON.stringify(text)})`),'notification '+text);}
async function clickAction(label){
 await cdp.send('Page.bringToFront');await delay(600);
 const expression=`(()=>{const e=Array.from(document.querySelectorAll('.notification-list-item .monaco-button')).find(e=>e.textContent===${JSON.stringify(label)}&&e.getBoundingClientRect().height>0);const r=e?.getBoundingClientRect();return r?.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`;
 await cdp.screenshot(path.join(out,'alias-before-click.png'));
 writeFileSync(path.join(out,'alias-buttons.json'),JSON.stringify(await cdp.read("Array.from(document.querySelectorAll('.monaco-button')).map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),parent:e.parentElement?.className}))"),null,2));
 let p=await waitFor(()=>cdp.read(expression),'notification action '+label,45000);
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await delay(400);p=await cdp.read(expression);
 const hit=await cdp.read(`document.elementFromPoint(${p.x},${p.y})?.closest('.monaco-button')?.textContent`);assert.equal(hit,label);
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
 await waitFor(()=>cdp.read("Array.from(document.querySelectorAll('.tab')).some(e=>e.textContent.includes('aliases.md'))"),'alias editor opened from notification');
}

try {
 run('/usr/bin/swiftc',['scripts/art1-native-confirmation.swift','-o',path.join(out,'confirm')]);
 run('/usr/bin/swiftc',['scripts/ver1-native-confirmation.swift','-o',path.join(out,'confirm-alias')]);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const settingsPath=path.join(env.user,'User/settings.json'),settings=JSON.parse(readFileSync(settingsPath));Object.assign(settings,{'archiAgent.architectureSource':config,'archiAgent.localModel.baseUrl':`http://127.0.0.1:${server.address().port}/v1`,'archiAgent.localModel.model':'synthetic','window.title':'Archi Agent — VER1 / C4 Big Bank','editor.wordWrap':'on','editor.minimap.enabled':false});writeFileSync(settingsPath,JSON.stringify(settings));
 const port=await freePort();child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,`--remote-debugging-port=${port}`,'--skip-welcome','--skip-release-notes','--new-window',project],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs.push(b));child.stderr.on('data',b=>logs.push(b));
 const target=await waitFor(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(i=>i.type==='page'&&/workbench/u.test(i.url));}catch{}},'renderer',30000),socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});cdp=new Cdp(socket);await delay(3000);
 if(!aliasOnly)for(const type of ['C4 Context','C4 Container'])await check(type,async()=>{const before=calls;await cdp.palette('Archi: Create Diagram');await cdp.pick('Archi Agent: diagram type',type);await cdp.pick('Archi Agent: C4 software system','Internet Banking System');await waitFor(()=>calls===before+2,'two C4 requests');await notification('Archi Agent generated');assert.deepEqual(inputs.at(-1).snapshot,inputs.at(-2).snapshot);await delay(700);await cdp.screenshot(path.join(out,type==='C4 Context'?'context-editor.png':'container-editor.png'));});
 if(!aliasOnly)await check('C4 original ART1 native save',async()=>{await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.text('c4-container');await delay(300);await cdp.key('Enter','Enter');run(path.join(out,'confirm'),[String(child.pid),'Save Diagram and Report']);await waitFor(()=>{try{return readdirSync(path.join(project,'archi-agent-results')).length===1;}catch{}},'saved C4 original');const dir=readdirSync(path.join(project,'archi-agent-results'))[0],r=JSON.parse(readFileSync(path.join(project,'archi-agent-results',dir,'report.json')));assert.equal(r.generationReport.diagramType,'c4-container');assert(r.generationReport.c4);assert.equal(calls,4);});
 if(!aliasOnly)await check('VER1 bad PlantUML zero LLM',async()=>{await verify(bad);await notification('discrepancies');assert.equal(calls,4);await delay(500);await cdp.screenshot(path.join(out,'verification-discrepancies.png'));});
 if(!aliasOnly)await check('VER1 good PlantUML zero LLM',async()=>{await verify(good);await notification('conformant-within-scope');assert.equal(calls,4);});
 await check('VER1 Polish explicit alias and native save',async()=>{await verify(prose);await cdp.pick('Archi Agent: verification input format','Prose (one interpretation request)');await cdp.pick('Archi Agent: confirm meaning of “Bazę Płatności”','Internet Banking System / Database');await notification('conformant-within-scope');assert.equal(calls,baselineCalls+1);await clickAction('Save confirmed aliases');run(path.join(out,'confirm-alias'),[String(child.pid)]);await waitFor(()=>readFileSync(path.join(config.overlayPath,'aliases.md'),'utf8').includes('| Bazę Płatności | big-bank | 18 |'),'native saved alias');await notification('aliases saved');await cdp.screenshot(path.join(out,'native-alias-saved.png'));});
 await check('VER1 saved alias in next operation',async()=>{await verify(alias);await notification('conformant-within-scope');assert.equal(calls,baselineCalls+1);});
}catch(e){if(cdp)await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});if(cdp)writeFileSync(path.join(out,'failure-dom.html'),await cdp.read('document.body.innerHTML').catch(()=>''));writeFileSync(path.join(out,'failure.txt'),e.stack);process.exitCode=1;}
finally{cdp?.socket.close();child?.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));writeFileSync(path.join(out,'ui.log'),Buffer.concat(logs));writeFileSync(path.join(out,'report.json'),JSON.stringify({vsix:path.resolve(vsix),vsixSha256:createHash('sha256').update(readFileSync(vsix)).digest('hex'),environment:env,syntheticTransport:true,aliasOnly,calls,results},null,2));}
console.log(JSON.stringify(results,null,2));if(results.length!==(aliasOnly?2:7)||results.some(r=>r.status!=='PASS'))process.exitCode=1;
