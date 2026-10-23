// Real installed Extension Host; native API answers are controlled, separately from visible UI.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
exports.run=async()=>{
 const settings=JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG)),results=[],originals={},load=Module._load;
 const folder=vscode.workspace.workspaceFolders?.at(-1),project=folder?.uri.fsPath??settings.root,file=path.join(project,'enterprise.json');fs.copyFileSync(process.env.EA1_CATALOG,file);
 const configFile=path.join(settings.root,'knowledge.json'),config={schemaVersion:2,readRoots:{project},sources:{},providers:{},enterpriseSources:{'retail-business':{kind:'enterprise-json',file:{root:'project',path:'enterprise.json'}}}};
 fs.writeFileSync(configFile,JSON.stringify(config));const trusted={command:process.env.EA1B_NODE,args:[process.env.EA1B_SERVER,'--config',configFile],timeoutMs:10000};
 let cancel='',save=false,providerReads=0,secretReads=0,reads=[],messages=[],testMode='normal';
 const check=async(id,fn)=>{try{await fn();results.push({id:id+'-'+settings.mode,status:'PASS',layer:'actual Extension Host, controlled native answers'});}catch(e){results.push({id:id+'-'+settings.mode,status:'FAIL',error:e.stack});}};
 for(const key of ['showQuickPick','showOpenDialog','showWarningMessage','showInformationMessage','showErrorMessage','withProgress'])originals[key]=vscode.window[key];
 vscode.window.showQuickPick=async(items,o)=>{
  if(o.title==='Archi Agent: diagram type')return items.find(i=>i.id==='capability-map');
  if(o.title==='Archi Agent: capability project')return items.at(-1);
  if(o.title==='Archi Agent: capability source')return cancel==='source'?undefined:items.find(i=>i.id==='mcp');
  if(o.title==='Archi Agent: capability scope')return cancel==='scope'?undefined:items.find(i=>i.id==='sales');
  if(o.title==='Archi Agent: capability detail')return items.find(i=>i.value===3);
  if(o.title==='Archi Agent: capability colors'){if(testMode==='stale'){const c=JSON.parse(fs.readFileSync(file));c.capabilities[0].description+=' changed';fs.writeFileSync(file,JSON.stringify(c));}return items.find(i=>i.id==='maturity');}
  if(o.title==='Archi Agent: choose original diagram result')return items.find(i=>i.result.diagramType==='capability-map');
  if(o.title==='Archi Agent: select save project')return items.at(-1);
  throw Error('Unexpected picker '+o.title);
 };
 vscode.window.showOpenDialog=async()=>{throw Error('MCP must not ask for local file');};
 vscode.window.showWarningMessage=async(m,o,...actions)=>{messages.push(m);return save&&actions.includes('Save Diagram and Report')?'Save Diagram and Report':undefined;};
 vscode.window.showInformationMessage=async m=>{messages.push(m);};vscode.window.showErrorMessage=async m=>{messages.push(m);};
 const extension=vscode.extensions.getExtension('setech-pl.archi-agent-core')??vscode.extensions.getExtension('setech-pl.archi-agent');
 try{
  const productVscode=new Proxy(vscode,{get(target,key){if(key==='workspace')return new Proxy(target.workspace,{get(w,k){if(k==='getConfiguration')return(...args)=>{const c=w.getConfiguration(...args);return new Proxy({},{get(_c,p){if(p==='get')return(name,...rest)=>{reads.push(name);if(name?.startsWith('localModel')||name?.startsWith('provider')){providerReads++;throw Error('provider read');}return c.get(name,...rest);};const v=c[p];return typeof v==='function'?v.bind(c):v;}});};return w[k];}});return target[key];}});
  Module._load=function(request,parent,...rest){return request==='vscode'&&parent?.filename===path.join(extension.extensionPath,'dist/extension.js')?productVscode:load.call(this,request,parent,...rest);};
  const main=path.join(extension.extensionPath,'dist/extension.js'),product=require(main),record=require.cache[main];let secretInstrumented=false;
  record.exports={...product,activate:context=>{secretInstrumented=true;return product.activate(new Proxy({},{get(_c,k){const c=context;if(k==='secrets')return new Proxy(c.secrets,{get(s,p){if(p==='get')return async()=>{secretReads++;throw Error('Enterprise must not read secrets');};const v=s[p];return typeof v==='function'?v.bind(s):v;}});return c[k];}}));}};
  try{await extension.activate();assert(secretInstrumented,'SecretStorage instrumentation must be active');}finally{record.exports=product;Module._load=load;}
  const cfg=vscode.workspace.getConfiguration('archiAgent',folder?.uri),target=folder?vscode.ConfigurationTarget.WorkspaceFolder:vscode.ConfigurationTarget.Global;
  await cfg.update('enterpriseSource',{kind:'mcp',sourceId:'retail-business'},target);
  if(!folder){await check('ea1b-no-folder-instruction',async()=>{await vscode.commands.executeCommand('archiAgent.generateDiagram');assert(messages.some(m=>m.includes('open a local project')));assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);});}
  else{
   await assert.rejects(cfg.update('knowledgeServer',{command:'/untrusted/workspace-executable',args:[]},vscode.ConfigurationTarget.Workspace));
   await check('ea1b-workspace-executable-rejected',async()=>{await cfg.update('knowledgeServer',undefined,vscode.ConfigurationTarget.Global);await vscode.commands.executeCommand('archiAgent.generateDiagram');assert(messages.some(m=>m.includes('mcp-knowledge-configuration-invalid')));assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);});
   await cfg.update('knowledgeServer',trusted,vscode.ConfigurationTarget.Global);
   for(const step of ['source','scope'])await check('ea1b-cancel-'+step,async()=>{cancel=step;await vscode.commands.executeCommand('archiAgent.generateDiagram');assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);});cancel='';
   await check('ea1b-stale-source-between-inspect-and-generate',async()=>{testMode='stale';await vscode.commands.executeCommand('archiAgent.generateDiagram');assert(messages.some(m=>m.includes('stale-source')));assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);fs.copyFileSync(process.env.EA1_CATALOG,file);testMode='normal';});
   await check('ea1b-progress-cancel-active-MCP-confirmed-cleanup',async()=>{
    const script=path.join(settings.root,'slow-source.cjs'),pidFile=path.join(settings.root,'slow.pid');
    fs.writeFileSync(script,`const fs=require('node:fs'),readline=require('node:readline');process.on('SIGTERM',()=>{});setInterval(()=>{},1000);const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.method==='initialize')send(r.id,{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'slow',version:'1'}});if(r.method==='tools/list')send(r.id,{tools:[{name:'get_enterprise_snapshot',inputSchema:{type:'object'}}]});if(r.method==='tools/call')fs.writeFileSync(process.argv[2],String(process.pid));});`);
    await cfg.update('knowledgeServer',{command:process.env.EA1B_NODE,args:[script,pidFile],timeoutMs:10000},vscode.ConfigurationTarget.Global);
    let reached=false;
    vscode.window.withProgress=(o,task)=>originals.withProgress(o,async progress=>{const token=new vscode.CancellationTokenSource(),start=Date.now(),timer=setInterval(()=>{if(fs.existsSync(pidFile)){reached=true;token.cancel();}else if(Date.now()-start>5000)token.cancel();},20);try{return await task(progress,token.token);}finally{clearInterval(timer);token.dispose();}});
    try{await vscode.commands.executeCommand('archiAgent.generateDiagram');assert(reached);const pid=Number(fs.readFileSync(pidFile));assert.throws(()=>process.kill(pid,0));assert.equal(vscode.workspace.textDocuments.filter(d=>d.isUntitled).length,0);}
    finally{vscode.window.withProgress=originals.withProgress;await cfg.update('knowledgeServer',trusted,vscode.ConfigurationTarget.Global);}
   });
   let result,puml;
   await check('ea1b-real-source-report-parity-zero-provider',async()=>{reads=[];await vscode.commands.executeCommand('archiAgent.generateDiagram');const report=vscode.workspace.textDocuments.find(d=>d.isUntitled&&d.getText().includes('archi-agent-capability-map-report'));assert(report);result=JSON.parse(report.getText());puml=vscode.workspace.textDocuments.find(d=>d.isUntitled&&d.getText().startsWith('@startuml')).getText();assert.equal(result.formatVersion,2);assert.equal(result.modelCalls,0);assert.equal(providerReads,0);assert.deepEqual([...new Set(reads)],['enterpriseSource']);
    const runtime=require(path.join(extension.extensionPath,'dist/archi-agent-runtime.js')),expected=await runtime.generateCapabilityMap({source:{kind:'mcp',sourceId:'retail-business',server:trusted},selection:result.selection});assert.equal(expected.status,'success');assert.deepEqual(result,expected.report);assert.equal(puml,expected.plantUml);assert(!JSON.stringify(result.source).includes(project));assert.equal(secretReads,0);});
   await check('ea1b-ART1-cancel',async()=>{save=false;await vscode.commands.executeCommand('archiAgent.saveDiagramAndReport');assert(!fs.existsSync(path.join(project,'archi-agent-results')));});
   await check('ea1b-ART1-frozen-remote-reference',async()=>{fs.writeFileSync(file,'changed after preview');save=true;await vscode.commands.executeCommand('archiAgent.saveDiagramAndReport');const base=path.join(project,'archi-agent-results'),bundle=path.join(base,fs.readdirSync(base)[0]),r=JSON.parse(fs.readFileSync(path.join(bundle,'report.json')));assert.deepEqual(r.generationReport,result);assert.equal(r.sourceReferences.enterpriseCatalog.availability,'remote-source');assert.equal(fs.readFileSync(path.join(bundle,'diagram.puml'),'utf8'),puml);});
   await check('ea1b-v1-only-unsupported',async()=>{fs.writeFileSync(configFile,JSON.stringify({schemaVersion:1,readRoots:{project},sources:{},providers:{}}));await vscode.commands.executeCommand('archiAgent.generateDiagram');assert(messages.some(m=>m.includes('enterprise-unsupported')));assert.equal(providerReads,0);});
  }
 }finally{Module._load=load;for(const[k,v]of Object.entries(originals))vscode.window[k]=v;fs.writeFileSync(settings.report,JSON.stringify({version:vscode.version,node:process.version,providerReads,secretReads,reads,messages,results},null,2));}
 if(results.some(r=>r.status!=='PASS'))throw Error('EA1b Host failed');
};
