// Actual command-created VSIX JSON versus CLI and MCP, without dropping domain fields.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),http=require('node:http'),{spawn}=require('node:child_process'),readline=require('node:readline');
const fixture=require('./ver1-c4-fixture.cjs');
exports.run=async()=>{
 const settings=JSON.parse(fs.readFileSync(process.env.UX3_HOST_CONFIG)),folder=vscode.workspace.workspaceFolders?.at(-1),project=folder?.uri.fsPath??settings.root,results=[],load=Module._load,originals={};
 const cli=process.env.MCP1_CLI,node=process.env.MCP1_NODE,{config:source}=fixture.prepare(project,process.env.SRC1_FIXTURE),config=path.join(project,'cli.json');
 let calls=0,peer;
 const server=http.createServer((req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture.answer(JSON.parse(JSON.parse(raw).messages[1].content)))}}]}));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const baseUrl=`http://127.0.0.1:${server.address().port}/v1`;
 fs.writeFileSync(config,JSON.stringify({schemaVersion:1,readRoots:{project},sources:{bank:{kind:'structurizr-json',sourceId:'big-bank',model:{root:'project',path:'architecture/workspace.json'},overlay:{root:'project',path:'architecture/overlay'}}},providers:{local:{profileId:'local-lm-studio',baseUrl,modelId:'synthetic'}}}));
 for(const key of ['showQuickPick','showInformationMessage','showWarningMessage','showErrorMessage'])originals[key]=vscode.window[key];
 vscode.window.showQuickPick=async(items,o)=>o.title?.startsWith('Archi Agent: Verify Flow')?items.find(i=>i.id==='document'):o.title?.includes('verification input format')?items.find(i=>i.id==='prose'):o.title?.includes('confirm meaning')?items.find(i=>i.label==='Internet Banking System / Database'):o.title?.includes('project')?items.at(-1):undefined;
 for(const key of ['showInformationMessage','showWarningMessage','showErrorMessage'])vscode.window[key]=async()=>undefined;
 const cliRun=args=>new Promise((resolve,reject)=>{const p=spawn(node,[cli,...args],{cwd:project,env:{...process.env,NODE_PATH:'',PATH:''},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);p.on('close',code=>{try{assert.equal(stderr,'');resolve({code,result:JSON.parse(stdout)});}catch(e){reject(e);}});});
 const check=async(id,fn)=>{try{await fn();results.push({id:id+'-'+settings.mode,status:'PASS'});}catch(e){results.push({id:id+'-'+settings.mode,status:'FAIL',error:e.stack});throw e;}};
 try{
  const extension=vscode.extensions.getExtension('setech-pl.archi-agent-core')??vscode.extensions.getExtension('setech-pl.archi-agent');assert(extension);
  Module._load=function(request,parent,...rest){return request==='vscode'&&parent?.filename===path.join(extension.extensionPath,'dist/extension.js')?vscode:load.call(this,request,parent,...rest);};await extension.activate();Module._load=load;
  const cfg=vscode.workspace.getConfiguration('archiAgent',folder?.uri),global=vscode.workspace.getConfiguration('archiAgent');await cfg.update('architectureSource',source,folder?vscode.ConfigurationTarget.WorkspaceFolder:vscode.ConfigurationTarget.Global);await global.update('localModel.baseUrl',baseUrl,vscode.ConfigurationTarget.Global);await global.update('localModel.model','synthetic',vscode.ConfigurationTarget.Global);
  peer=spawn(node,[cli,'mcp','serve','--config',config],{cwd:project,stdio:['pipe','pipe','pipe']});let seq=0,diagnostics='';const pending=new Map();peer.stderr.on('data',b=>diagnostics+=b);readline.createInterface({input:peer.stdout}).on('line',line=>{const r=JSON.parse(line);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}});
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});peer.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'actual-vsix-export-parity',version:'1'}});peer.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  for(const [name,text,format,code]of [['parity-good.puml',fixture.diagram(),'plantuml-sequence',0],['parity-bad.puml',fixture.diagram('A ->> B : read (DB)'),'plantuml-sequence',1],['parity-prose.txt',fixture.prose,'prose',2]])await check('actual-editor-full-portable-parity-'+format+'-'+code,async()=>{
   const before=calls,file=path.join(project,name);fs.writeFileSync(file,text);const d=await vscode.workspace.openTextDocument(vscode.Uri.file(file));await vscode.window.showTextDocument(d);await vscode.commands.executeCommand('archiAgent.verifyFlow');
   const doc=vscode.workspace.textDocuments.filter(d=>d.isUntitled&&d.getText().includes('"assessment"')).at(-1);assert(doc);const exported=JSON.parse(doc.getText());fs.writeFileSync(path.join(path.dirname(settings.report),`export-${settings.mode}-${name}.json`),JSON.stringify(exported,null,2));
   const args=['flow','verify','--config',config,'--source','bank','--input','project:'+name,'--input-format',format,'--format','json',...(format==='prose'?['--provider','local']:[])];
   let c=await cliRun(args);assert.equal(c.code,code);const m=await request('tools/call',{name:'verify_flow',arguments:{source:'bank',input:{root:'project',path:name},format,...(format==='prose'?{provider:'local'}:{})}});let mr=m;
   if(format==='prose'){
    const p=c.result.outcome.report.report,target=p.resolutions.find(x=>x.mention==='Bazę Płatności'),resolved=exported.report.resolutions.find(x=>x.mention==='Bazę Płatności');
    const decision={mentionId:target.mentionId,expectedSnapshotDigest:p.snapshot.digest,targetElementId:resolved.targetId,confirmed:true};
    assert(decision.targetElementId,'actual VSIX confirmed target');const hashes={expectedInputSha256:p.input.sha256,expectedInterpretationDigest:p.interpretationDigest,expectedSnapshotDigest:p.snapshot.digest};
    fs.writeFileSync(path.join(project,'decisions.json'),JSON.stringify({schemaVersion:1,...hashes,decisions:[decision]}));c=await cliRun([...args,'--decisions','project:decisions.json']);assert.equal(c.code,0);
    mr=await request('tools/call',{name:'resolve_flow_names',arguments:{sessionId:m.structuredContent.continuation.sessionId,...hashes,decisions:[decision]}});
   }
   assert.deepEqual(c.result.outcome.report,exported);assert.deepEqual(mr.structuredContent.outcome.report,exported);assert.deepEqual(JSON.parse(mr.content[0].text),mr.structuredContent);assert.equal(calls,before+(format==='prose'?4:0));
  });
  assert.equal(diagnostics,'');
 }finally{Module._load=load;for(const[k,v]of Object.entries(originals))vscode.window[k]=v;peer?.stdin.end();if(peer)await new Promise(r=>peer.once('close',r));server.closeAllConnections();await new Promise(r=>server.close(r));fs.writeFileSync(settings.report,JSON.stringify({node:process.version,version:vscode.version,calls,results,comparison:'entire portable report and evidence; no domain fields omitted'},null,2));}
 if(results.length!==3||results.some(r=>r.status!=='PASS'))throw Error('actual editor parity failed');
};
