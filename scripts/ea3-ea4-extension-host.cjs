const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
exports.run=async()=>{
 const cfg=JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG)),project=vscode.workspace.workspaceFolders?.at(-1)?.uri.fsPath??cfg.root,source=fs.readFileSync(process.env.EA34_CATALOG,'utf8'),results=[],messages=[],originals={},load=Module._load;
 let file=path.join(project,'enterprise-views.json'),type='value-stream',queue=[],inputs=[];
 for(const k of ['showQuickPick','showInputBox','showOpenDialog','showInformationMessage','showWarningMessage','showErrorMessage'])originals[k]=vscode.window[k];
 const check=async(id,fn)=>{try{await fn();results.push({id:id+'-'+cfg.mode,status:'PASS',layer:'actual installed Extension Host; controlled native answers, not visible UI'});}catch(e){results.push({id:id+'-'+cfg.mode,status:'FAIL',error:e.stack});}};
 vscode.window.showOpenDialog=async()=>[vscode.Uri.file(file)];vscode.window.showInputBox=async()=>inputs.shift();
 vscode.window.showInformationMessage=async(message,...rest)=>{messages.push(message);if(rest.includes('Save catalog'))return 'Save catalog';};vscode.window.showWarningMessage=async m=>messages.push(m);vscode.window.showErrorMessage=async m=>messages.push(m);
 vscode.window.showQuickPick=async(items,o={})=>{
  const title=o.title??'';
  if(title==='Archi Agent: diagram type')return items.find(i=>i.id===type);
  if(title==='Archi Agent: capability project')return items.at(-1);
  if(title==='Archi Agent: capability source')return items.find(i=>i.id==='local');
  if(title==='Choose value stream')return items[0];
  if(title==='Stage scope — preserves declared order')return items;
  if(title==='Business domain scope')return items.find(i=>i.id===null);
  if(title==='Explicit color scale')return items.find(i=>i.id==='maturity');
  if(title==='Archi: catalog update — frozen base'){const action=queue.shift(),selected=items.find(i=>i.id===action);assert(action&&selected,'Unexpected catalog menu action '+action);return selected;}
  if(title==='Choose capability')return items.find(i=>i.record?.id==='sales');
  if(title==='Field to change')return 'name';
  if(title==='Choose change — inspect before/after and dependencies')return items.find(i=>i.entry.decision==='pending');
  if(title==='Explicit decision for selected change')return 'accepted';
  if(title==='Archi Agent')return 'Close';
  throw Error('Unexpected picker '+title);
 };
 try{
  fs.writeFileSync(file,source);const extension=vscode.extensions.getExtension('setech-pl.archi-agent-core')??vscode.extensions.getExtension('setech-pl.archi-agent');assert(extension);
  Module._load=function(request,parent,...rest){return request==='vscode'&&parent?.filename===path.join(extension.extensionPath,'dist/extension.js')?vscode:load.call(this,request,parent,...rest);};await extension.activate();Module._load=load;
  if(!vscode.workspace.workspaceFolders?.length){await check('no-project-guidance',async()=>{await vscode.commands.executeCommand('archiAgent.generateDiagram');assert(messages.some(m=>m.includes('open a local project folder')));});return;}
  for(const view of ['value-stream','application-landscape'])await check(view+'-Create-Diagram-zero-provider',async()=>{type=view;await vscode.commands.executeCommand('archiAgent.generateDiagram');const reports=vscode.workspace.textDocuments.filter(d=>d.isUntitled&&d.getText().includes(`archi-agent-${view}-report/1`));assert(reports.length,messages.join('\n'));const report=JSON.parse(reports.at(-1).getText());assert.equal(report.modelCalls,0);assert.equal(report.source.contract,'archi-agent-enterprise/3');if(view==='value-stream')assert.deepEqual(report.stages.map(s=>s.ordinal),[1,2,3,4]);else assert.equal(report.applications.length,4);});
  for(const eol of ['LF','CRLF'])await check('guarded-update-'+eol+'-retains-v3',async()=>{file=path.join(project,`update-${eol}.json`);fs.writeFileSync(file,eol==='CRLF'?source.replace(/\n/g,'\r\n'):source);queue=['edit','review','save'];inputs=['Reviewed Sales'];await vscode.commands.executeCommand('archiAgent.updateEnterpriseCatalog');const text=fs.readFileSync(file,'utf8'),c=JSON.parse(text),original=JSON.parse(source);assert.equal(c.capabilities.find(c=>c.id==='sales').name,'Reviewed Sales',messages.join('\n'));assert.equal(c.schemaVersion,3);assert.equal(c.valueStreams[0].id,original.valueStreams[0].id);assert.deepEqual(c.valueStreams[0].stages.map(s=>s.id),original.valueStreams[0].stages.map(s=>s.id));assert.equal(c.applications.length,4);if(eol==='CRLF')assert(!text.replace(/\r\n/g,'').includes('\n'));assert(messages.some(m=>m.includes('saved.')));});
 }finally{Module._load=load;for(const[k,v]of Object.entries(originals))vscode.window[k]=v;fs.writeFileSync(cfg.report,JSON.stringify({version:vscode.version,node:process.version,cwd:process.cwd(),report:cfg.report,results,messages},null,2));}
 if(results.some(r=>r.status!=='PASS'))throw Error('EA3/EA4 host failed');
};
