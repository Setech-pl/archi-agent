// Actual VS Code Extension Host. Scripted native API responses are a separate layer from visible UI.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
exports.run=async()=>{
 const settings=JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG)),results=[],originals={},load=Module._load;
 const folder=vscode.workspace.workspaceFolders?.at(-1),project=folder?.uri.fsPath??settings.root,file=path.join(project,'enterprise.json');
 fs.copyFileSync(process.env.EA1_CATALOG,file);
 let cancel='',kind='capability-map',save=false,providerReads=0;
 for(const key of ['showQuickPick','showOpenDialog','showWarningMessage','showInformationMessage','showErrorMessage'])originals[key]=vscode.window[key];
 const check=async(id,fn)=>{try{await fn();results.push({id:id+'-'+settings.mode,status:'PASS',layer:'actual Extension Host, controlled editor answers'});}catch(e){results.push({id:id+'-'+settings.mode,status:'FAIL',error:e.stack});}};
 vscode.window.showQuickPick=async(items,o)=>{
  if(o.title==='Archi Agent: diagram type')return cancel==='type'?undefined:items.find(i=>i.id===kind);
  if(o.title==='Archi Agent: capability project')return cancel==='project'?undefined:items.at(-1);
  if(o.title==='Archi Agent: capability scope')return cancel==='scope'?undefined:items.find(i=>i.id==='sales');
  if(o.title==='Archi Agent: capability detail')return cancel==='detail'?undefined:items.find(i=>i.value===3);
  if(o.title==='Archi Agent: capability colors')return cancel==='colors'?undefined:items.find(i=>i.id==='maturity');
  if(o.title==='Archi Agent: choose original diagram result')return items.find(i=>i.result.diagramType==='capability-map');
  if(o.title==='Archi Agent: select save project')return items.at(-1);
  throw Error('Unexpected provider/software picker '+o.title);
 };
 vscode.window.showOpenDialog=async()=>cancel==='file'?undefined:[vscode.Uri.file(file)];
 vscode.window.showWarningMessage=async(m,o,...actions)=>save&&actions.includes('Save Diagram and Report')?'Save Diagram and Report':undefined;
 vscode.window.showInformationMessage=async()=>undefined;vscode.window.showErrorMessage=async()=>undefined;
 try{
  const extension=vscode.extensions.getExtension('setech-pl.archi-agent-core')??vscode.extensions.getExtension('setech-pl.archi-agent');assert(extension);
  // Reject actual credential and transport access from product bundle throughout this operation.
  const productVscode=new Proxy(vscode,{get(target,key){if(key==='workspace')return new Proxy(target.workspace,{get(w,k){if(k==='getConfiguration')return(...args)=>{const config=w.getConfiguration(...args);return new Proxy({},{get(_c,p){const c=config;if(p==='get')return(name,...rest)=>{if(name?.startsWith('localModel')||name?.startsWith('provider')){providerReads++;throw Error('EA1 provider read');}return c.get(name,...rest);};const v=c[p];return typeof v==='function'?v.bind(c):v;}});};return w[k];}});return target[key];}});
  Module._load=function(request,parent,...rest){return request==='vscode'&&parent?.filename===path.join(extension.extensionPath,'dist/extension.js')?productVscode:load.call(this,request,parent,...rest);};await extension.activate();Module._load=load;
  const runtime=require(path.join(extension.extensionPath,'dist/archi-agent-runtime.js'));let result;
  if(!folder){await check('ea1-no-workspace-instruction',async()=>{await vscode.commands.executeCommand('archiAgent.generateDiagram');assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);});}
  else{
   for(const step of ['type',...(settings.mode==='multi-root'?['project']:[]),'file','scope','detail','colors'])await check('ea1-cancel-'+step,async()=>{cancel=step;await vscode.commands.executeCommand('archiAgent.generateDiagram');assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);assert(!fs.existsSync(path.join(project,'archi-agent-results')));});
   cancel='';
   await check('ea1-no-provider-previews',async()=>{await vscode.commands.executeCommand('archiAgent.generateDiagram');const report=vscode.workspace.textDocuments.find(d=>d.isUntitled&&d.getText().includes('archi-agent-capability-map-report'));assert(report);result=JSON.parse(report.getText());assert.equal(result.modelCalls,0);assert.deepEqual(result.selection.rootIds,['sales']);assert.equal(result.visible.find(v=>v.capability.id==='payment').hierarchy.level,3);assert.equal(providerReads,0);});
   await check('ea1-cancel-save',async()=>{save=false;await vscode.commands.executeCommand('archiAgent.saveDiagramAndReport');assert(!fs.existsSync(path.join(project,'archi-agent-results')));});
   await check('ea1-save-frozen-original',async()=>{const doc=vscode.workspace.textDocuments.find(d=>d.isUntitled&&d.getText().startsWith('@startuml'));assert(doc);const original=doc.getText();const edit=new vscode.WorkspaceEdit();edit.insert(doc.uri,new vscode.Position(1,0),"' OWNER BUFFER EDIT\n");assert(await vscode.workspace.applyEdit(edit));fs.writeFileSync(file,'changed after generation');save=true;await vscode.commands.executeCommand('archiAgent.saveDiagramAndReport');const base=path.join(project,'archi-agent-results'),bundle=path.join(base,fs.readdirSync(base)[0]),saved=JSON.parse(fs.readFileSync(path.join(bundle,'report.json')));assert.equal(fs.readFileSync(path.join(bundle,'diagram.puml'),'utf8'),original);assert.deepEqual(saved.generationReport,result);assert(!JSON.stringify(saved).includes(project));assert.equal(providerReads,0);});
  }
  assert(runtime.generateCapabilityMap);
 }finally{Module._load=load;for(const[k,v]of Object.entries(originals))vscode.window[k]=v;fs.writeFileSync(settings.report,JSON.stringify({version:vscode.version,node:process.version,providerReads,results},null,2));}
 if(results.some(r=>r.status!=='PASS'))throw Error('EA1 Host failed');
};
