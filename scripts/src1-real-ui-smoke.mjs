import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Cdp,freePort,waitFor} from './ux3-real-ui-smoke.mjs';
import {prepareVscode,vscodeBinary} from './ux3-vscode-smoke.mjs';
import {WebviewUi} from './ux4-webview-ui.mjs';
const [vsix,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),fixture=createRequire(import.meta.url)('./src1-smoke-fixture.cjs');
const env=prepareVscode(path.resolve(vsix),'SRC1'),project=path.join(env.root,'big-bank');mkdirSync(project);const {config,flow}=fixture.prepare(project,path.resolve('test/fixtures/structurizr/big-bank-plc'));
let child,cdp,ui,calls=0;const results=[],inputs=[],logs=[];
const server=createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{calls++;const input=JSON.parse(JSON.parse(body).messages[1].content);inputs.push(input);res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture.answer(input))}}]}));});});
const check=async(id,fn)=>{try{await fn();results.push({id,status:'PASS',layer:'visible installed VS Code UI'});}catch(e){results.push({id,status:'FAIL',error:e.stack});throw e;}};
const command=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout;};
async function clickTree(label){const point=await waitFor(()=>cdp.read(`(()=>{const e=Array.from(Array.from(document.querySelectorAll('.pane')).find(e=>e.querySelector('.pane-header')?.textContent.includes('Archi Agent'))?.querySelectorAll('.monaco-list-row')??[]).find(e=>e.textContent.includes(${JSON.stringify(label)})&&e.getBoundingClientRect().height>0);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+30,y:r.y+r.height/2};})()`),'tree '+label);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:2,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:2,...point});await delay(500);}
async function generate(type){
 await cdp.palette('Archi: Create Diagram');await cdp.pick('Archi Agent: diagram type',type);
 await cdp.expectTitle('Archi Agent: flow source');await cdp.text('Choose a flow file');
 const label=await waitFor(async()=>{const value=await cdp.read("document.querySelector('.quick-input-list .monaco-list-row.focused .label-name')?.textContent");return value?.includes('Choose a flow file')?value:null;},'filtered file choice');
 await cdp.chooseLabel(label);
 command(path.join(out,'picker'),[String(child.pid),flow]);
}

try{
 command('/usr/bin/swiftc',['scripts/k3-native-picker.swift','-o',path.join(out,'picker')]);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const settingsPath=path.join(env.user,'User/settings.json');const settings=JSON.parse(readFileSync(settingsPath));Object.assign(settings,{'archiAgent.architectureSource':config,'archiAgent.localModel.baseUrl':`http://127.0.0.1:${server.address().port}/v1`,'archiAgent.localModel.model':'synthetic-src1','window.title':'Archi Agent — SRC1 Big Bank','editor.wordWrap':'on','editor.minimap.enabled':false});writeFileSync(settingsPath,JSON.stringify(settings));
 const port=await freePort();child=spawn(vscodeBinary,['--user-data-dir',env.user,'--extensions-dir',env.extensions,`--remote-debugging-port=${port}`,'--skip-welcome','--skip-release-notes','--new-window',project],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs.push(b));child.stderr.on('data',b=>logs.push(b));
 const target=await waitFor(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(i=>i.type==='page'&&/workbench/u.test(i.url));}catch{}},'renderer',30000);const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});cdp=new Cdp(socket);ui=new WebviewUi(cdp);await delay(3000);
 await check('src1-ui-configuration',async()=>{await cdp.palette('Archi: Configuration');await ui.wait('#pack-path','document.querySelector("#pack-path").textContent.includes("Structurizr JSON") && document.querySelector("#counts").textContent.includes("relationships: 18")');assert.equal(calls,0);await cdp.screenshot(path.join(out,'configuration.png'));});
 await check('src1-ui-source-settings',async()=>{await ui.click('#source-settings');await waitFor(()=>cdp.read("document.body.textContent.includes('settings.json')"),'settings editor');writeFileSync(path.join(out,'settings-dom.html'),await cdp.read('document.body.innerHTML'));await cdp.key('Escape','Escape');await delay(500);await cdp.palette('Archi: Configuration');await ui.wait('#pack-path','document.querySelector("#pack-path").textContent.includes("Structurizr JSON")');});
 await check('src1-ui-browser',async()=>{await cdp.palette('Archi: Knowledge Browser');await delay(800);
 const point=await cdp.read("(()=>{const e=Array.from(document.querySelectorAll('.pane-header')).find(e=>e.textContent.includes('Archi Agent'));const r=e?.getBoundingClientRect();return r?{x:r.x+150,y:r.y-2}:null})()");
 if(point){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:point.x,y:150});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:150});}
 await clickTree('big-bank');await clickTree('Active Structurizr');await clickTree('Systems (9)');await waitFor(()=>cdp.read("document.body.textContent.includes('Internet Banking System / API Application')"),'qualified container');await cdp.screenshot(path.join(out,'browser.png'));});
 for(const type of ['Sequence','Component'])await check('src1-ui-'+type,async()=>{const before=calls;await generate(type);await waitFor(()=>calls===before+2,'two model calls');await waitFor(()=>cdp.read("Array.from(document.querySelectorAll('.notification-list-item-message')).some(e=>e.textContent.includes('Archi Agent generated'))"),'generation result');assert.deepEqual(inputs.at(-1).snapshot,inputs.at(-2).snapshot);await delay(500);await cdp.screenshot(path.join(out,type.toLowerCase()+'.png'));});
 await check('src1-ui-original-save',async()=>{const helper=path.join(out,'confirm');command('/usr/bin/swiftc',['scripts/art1-native-confirmation.swift','-o',helper]);await cdp.palette('Archi: Save Diagram and Report');await cdp.expectTitle('Archi Agent: choose original diagram result');await cdp.text('sequence');await delay(300);await cdp.key('Enter','Enter');command(helper,[String(child.pid),'Save Diagram and Report']);await waitFor(()=>{try{return readdirSync(path.join(project,'archi-agent-results')).length===1;}catch{}},'saved original');const folder=readdirSync(path.join(project,'archi-agent-results'))[0],r=JSON.parse(readFileSync(path.join(project,'archi-agent-results',folder,'report.json')));assert(r.generationReport.sourceProvenance);assert.equal(calls,4);});
 await check('src1-ui-source-error-before-LLM',async()=>{const file=path.join(config.overlayPath,'relationships.md');writeFileSync(file,readFileSync(file,'utf8').replace('| 45 | 11 | 18 |','| 45 | 11 | 4 |'));await cdp.palette('Archi: Configuration');await ui.click('#refresh');await ui.wait('#validation','document.querySelector("#validation").textContent.includes("overlay-relationship-endpoints-mismatch")');assert.equal(calls,4);await cdp.screenshot(path.join(out,'invalid-source.png'));});
}catch(e){if(cdp)await cdp.screenshot(path.join(out,'failure.png')).catch(()=>{});writeFileSync(path.join(out,'failure.txt'),e.stack);process.exitCode=1;}
finally{ui?.dispose();cdp?.socket.close();child?.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));writeFileSync(path.join(out,'ui.log'),Buffer.concat(logs));writeFileSync(path.join(out,'report.json'),JSON.stringify({vsix:path.resolve(vsix),vsixSha256:createHash('sha256').update(readFileSync(vsix)).digest('hex'),environment:env,syntheticTransport:true,calls,results},null,2));}
console.log(JSON.stringify(results,null,2));if(results.length!==7||results.some(r=>r.status!=='PASS'))process.exitCode=1;
