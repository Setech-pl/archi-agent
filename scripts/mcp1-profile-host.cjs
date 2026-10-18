// Actual installed Extension Host. Controlled choices; real per-ID SecretStorage contexts.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
exports.run=async()=>{
 const c=JSON.parse(fs.readFileSync(process.env.MCP1_PROFILE_CONFIG)),results=[],notices=[],contexts={},load=Module._load,originals={};
 for(const key of ['showErrorMessage','showWarningMessage','showInformationMessage','showQuickPick'])originals[key]=vscode.window[key];
 let picks=0;vscode.window.showQuickPick=async()=>{picks++;return undefined;};
 for(const key of ['showErrorMessage','showWarningMessage','showInformationMessage'])vscode.window[key]=async m=>{notices.push(m);return undefined;};
 const check=async(id,fn)=>{try{await fn();results.push({id,status:'PASS'});}catch(e){results.push({id,status:'FAIL',error:e.stack});}};
 const ids=['setech-pl.archi-agent','setech-pl.archi-agent-core'];
 try{
  const enabled=ids.filter(id=>vscode.extensions.getExtension(id));assert.deepEqual(enabled,c.enabled);
  const entries=new Map(enabled.map(id=>[path.join(vscode.extensions.getExtension(id).extensionPath,'dist/extension.js'),id]));
  Module._load=function(request,parent,...rest){
   if(request==='vscode'&&entries.has(parent?.filename))return vscode;
   const mod=load.call(this,request,parent,...rest);
   if(entries.has(request))return {...mod,activate:context=>{contexts[entries.get(request)]=context;return mod.activate(context);}};
   return mod;
  };
  for(const id of enabled)await vscode.extensions.getExtension(id).activate();
  Module._load=load;
  if(c.mode.startsWith('conflict')){
   await check('coinstall-static-contributions-and-blocked-activation',async()=>{
    const a=vscode.extensions.getExtension(ids[0]).packageJSON,b=vscode.extensions.getExtension(ids[1]).packageJSON;
    assert.deepEqual(a.contributes,b.contributes);assert(notices.some(n=>n.includes('both setech-pl.archi-agent')));
    try{await vscode.commands.executeCommand('archiAgent.open');}catch(e){assert(/not found|not registered/.test(String(e)));}
    assert.equal(picks,0);assert.equal(vscode.extensions.all.filter(e=>ids.includes(e.id)).length,2);
   });
  }else{
   const id=enabled[0],context=contexts[id];assert(context,'actual ExtensionContext capture');
   await check('one-enabled-profile-operates',async()=>{await vscode.commands.executeCommand('archiAgent.open');assert.equal(picks,1);});
   await check('shared-settings-and-isolated-secrets-'+c.mode,async()=>{
    const cfg=vscode.workspace.getConfiguration('archiAgent'),key='mcp1.synthetic-profile-isolation';
    if(c.mode==='full-before-upgrade'){await cfg.update('defaultAuthor','MCP1 profile switch',vscode.ConfigurationTarget.Global);assert.equal(await context.secrets.get(key),undefined);await context.secrets.store(key,'synthetic-full-canary');}
    if(c.mode==='core-before-upgrade'){assert.equal(cfg.get('defaultAuthor'),'MCP1 profile switch');assert.equal(await context.secrets.get(key),undefined);await context.secrets.store(key,'synthetic-core-canary');}
    if(c.mode==='full-first')assert.equal(await context.secrets.get(key),'synthetic-full-canary');
    if(c.mode==='core-switch')assert.equal(await context.secrets.get(key),'synthetic-core-canary');
    if(c.mode==='full-return'){assert.equal(cfg.get('defaultAuthor'),'MCP1 profile switch');assert.equal(await context.secrets.get(key),'synthetic-full-canary');await context.secrets.delete(key);}
    if(c.mode==='core-return'){assert.equal(await context.secrets.get(key),'synthetic-core-canary');await context.secrets.delete(key);}
   });
   const runtime=require(path.join(vscode.extensions.getExtension(id).extensionPath,'dist/archi-agent-runtime.js'));
   if(!c.predecessor)await check('profile-capability-'+c.mode,async()=>{const cap=await runtime.getDocumentConversionCapabilities();assert.equal(cap.profile,id===ids[0]?'full':'core');assert.equal(cap.ocr,id===ids[0]?'not-validated':'not-installed');});
  }
 }finally{Module._load=load;for(const[k,v]of Object.entries(originals))vscode.window[k]=v;fs.writeFileSync(c.report,JSON.stringify({version:vscode.version,node:process.version,mode:c.mode,results,notices},null,2));}
 if(results.some(r=>r.status!=='PASS'))throw Error('profile Host failed');
};
