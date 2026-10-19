// Real Extension Host; controlled editor answers are separate from the visible UI gate.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),http=require('node:http');
const {controlWebviews,wait}=require('./ux4-host-webview.cjs');
const {prepare,answer}=require('./src1-smoke-fixture.cjs');
exports.run=async()=>{
 let building=false,buildStep=0;
 const settings=JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG)),results=[],views=controlWebviews(vscode,async(panel,state)=>{
   if(!building||panel.viewType!=='archiAgent.packReview')return;
   if(state.error) { panel.dispose(); return; }
   if(state.completed) {panel.dispose();return;}
   if(buildStep===0){buildStep++;await panel.send('decide',{indices:state.entries.map((_,i)=>i),decision:'accepted'});return;}
   if(buildStep===1){buildStep++;await panel.send('preview');return;}
   if(!state.directory){await panel.send('destination');return;}
   await panel.send('save-use');
 }),load=Module._load;
 const folder=vscode.workspace.workspaceFolders?.at(-1),project=folder?.uri.fsPath??settings.root;
 const {flow,config}=prepare(project,process.env.SRC1_FIXTURE);const source=path.join(project,'source.md');fs.writeFileSync(source,'Alpha service.');const originals={};let calls=0,type='sequence';
 const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify((()=>{const input=JSON.parse(JSON.parse(body).messages[1].content);if(!input.sources)return answer(input);const s=input.sources[0];return {version:1,candidates:[{table:'systems',row:{id:'alpha',canonical_name:'Alpha',kind:'system',description:'Synthetic'},basis:'explicit',reasoning:null,evidence:[{sourceId:s.sourceId,originalDigest:s.originalDigest,textDigest:s.textDigest,excerpt:s.text,startOffset:0,endOffset:s.text.length}]}]};})())}}]}));});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const key of ['showQuickPick','showOpenDialog','showWarningMessage','showInformationMessage','showErrorMessage','showInputBox'])originals[key]=vscode.window[key];
 vscode.window.showQuickPick=async(items,o)=>o.title==='Archi Agent: diagram type'?items.find(i=>i.id===type):o.title==='Archi Agent: flow source'?items.find(i=>i.source==='file'):o.title.includes('project')?items.at(-1):items[0];
 vscode.window.showOpenDialog=async o=>[vscode.Uri.file(building?(o.canSelectFiles?source:project):flow)];vscode.window.showInputBox=async()=> 'k3-new-pack';vscode.window.showWarningMessage=async(m,o,...actions)=>actions.includes('Save Diagram and Report')?'Save Diagram and Report':undefined;
 vscode.window.showInformationMessage=async()=>undefined;vscode.window.showErrorMessage=async()=>undefined;
 const check=async(id,fn)=>{try{await fn();results.push({id:id+'-'+settings.mode,status:'PASS',layer:'actual Extension Host, controlled editor answers'});}catch(e){results.push({id:id+'-'+settings.mode,status:'FAIL',error:e.stack});}};
 try{
  const extension=(vscode.extensions.getExtension('setech-pl.archi-agent-core')??vscode.extensions.getExtension('setech-pl.archi-agent'));assert(extension);
  Module._load=function(request,parent,...rest){return request==='vscode'&&parent?.filename===path.join(extension.extensionPath,'dist/extension.js')?vscode:load.call(this,request,parent,...rest);};await extension.activate();Module._load=load;
  const cfg=vscode.workspace.getConfiguration('archiAgent',folder?.uri),global=vscode.workspace.getConfiguration('archiAgent');
  await cfg.update('architectureSource',config,folder?vscode.ConfigurationTarget.WorkspaceFolder:vscode.ConfigurationTarget.Global);
  await global.update('localModel.baseUrl',`http://127.0.0.1:${server.address().port}/v1`,vscode.ConfigurationTarget.Global);await global.update('localModel.model','synthetic-src1',vscode.ConfigurationTarget.Global);
  await check('src1-configuration',async()=>{await vscode.commands.executeCommand('archiAgent.configuration');const panel=await wait(()=>views.panels[0]?.latest&&views.panels[0]);if(settings.mode==='multi-root')await panel.send('project',{project:String(vscode.workspace.workspaceFolders.length-1)});await wait(()=>panel.latest.counts?.systems===9);assert.equal(panel.latest.counts.relationships,18);assert.match(panel.latest.packPath,/components: 6/);assert.equal(calls,0);});
  for(const diagramType of ['sequence','component'])await check('src1-'+diagramType,async()=>{type=diagramType;await vscode.commands.executeCommand('archiAgent.generateDiagram');assert.equal(calls,type==='sequence'?2:4);const report=vscode.workspace.textDocuments.filter(d=>d.isUntitled&&d.getText().includes('"sourceProvenance"')).at(-1);assert(report);const r=JSON.parse(report.getText());assert(r.sourceProvenance.facts.some(f=>f.provenance.some(p=>p.sourceId==='big-bank-overlay')));});
  if(folder)await check('src1-save-frozen-original',async()=>{fs.unlinkSync(config.modelPath);await vscode.commands.executeCommand('archiAgent.saveDiagramAndReport');const base=path.join(project,'archi-agent-results');const result=fs.readdirSync(base)[0];const report=JSON.parse(fs.readFileSync(path.join(base,result,'report.json')));assert(report.generationReport.sourceProvenance);assert.equal(calls,4);});
  if(folder)await check('src1-global-source-to-folder-pack',async()=>{
    const runtime=require(path.join(extension.extensionPath,'dist/archi-agent-runtime.js'));
    const refreshed=prepare(path.join(project,'scope-fixture'),process.env.SRC1_FIXTURE);
    await cfg.update('architectureSource',undefined,vscode.ConfigurationTarget.WorkspaceFolder);
    await global.update('architectureSource',refreshed.config,vscode.ConfigurationTarget.Global);
    const target=path.join(project,'k3-new-pack');building=true;buildStep=0;
    await vscode.commands.executeCommand('archiAgent.buildKnowledgePack');building=false;
    assert.equal(fs.readdirSync(target).length,5);assert.equal(calls,5);
    assert.equal(cfg.get('architectureSource'),null);assert.equal(global.inspect('architectureSource').globalValue.kind,'structurizr-json');
    await vscode.commands.executeCommand('archiAgent.configuration');const panel=views.panels[0];await panel.send('refresh');await wait(()=>panel.latest.counts?.systems===1);assert.equal(panel.latest.packPath,target);
  });

 }finally{Module._load=load;for(const [k,v]of Object.entries(originals))vscode.window[k]=v;views.restore();server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(settings.report,JSON.stringify({version:vscode.version,node:process.version,calls,results},null,2));}
 if(results.some(r=>r.status!=='PASS'))throw new Error('SRC1 Host failed');
};
