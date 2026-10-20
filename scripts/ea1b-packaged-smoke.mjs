// Bundle this acceptance driver, then run it outside the repository with empty PATH/NODE_PATH.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
async function main(){
const [coreArg,fullArg,tarArg,catalogArg,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const root=realpathSync(mkdtempSync('/private/tmp/ea1b-packaged-')),results=[],require=createRequire(path.join(root,'harness.cjs'));
const sha=b=>createHash('sha256').update(b).digest('hex'),files=[coreArg,fullArg,tarArg].map(f=>({path:path.resolve(f),bytes:readFileSync(f).length,sha256:sha(readFileSync(f))}));
const check=async(id,fn)=>{await fn();results.push({id,status:'PASS',layer:'exact packaged processes/runtime outside repository'});console.log(id+': PASS');};
const extract=(file,name)=>{const dir=path.join(root,name),archive=openVsix(file);for(const e of archive.entries){if(e.name.endsWith('/'))continue;const f=path.join(dir,e.name);assert(f.startsWith(dir+path.sep));mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,archive.read(e.name));}return path.join(dir,'extension/dist/archi-agent-runtime.js');};
const core=extract(coreArg,'core'),full=extract(fullArg,'full');assert.equal(spawnSync('/usr/bin/tar',['-xzf',path.resolve(tarArg),'-C',root]).status,0);
const bin=path.join(root,'package/bin'),cli=path.join(bin,'archi-agent.cjs'),serverFile=path.join(bin,'archi-agent-knowledge-server.cjs'),catalog=path.join(root,'enterprise.json');copyFileSync(catalogArg,catalog);
const serverConfig=path.join(root,'knowledge.json'),config=path.join(root,'client.json');
writeFileSync(serverConfig,JSON.stringify({schemaVersion:2,readRoots:{project:root},sources:{},providers:{},enterpriseSources:{'retail-business':{kind:'enterprise-json',file:{root:'project',path:'enterprise.json'}}}}));
const server={command:process.execPath,args:[serverFile,'--config',serverConfig],timeoutMs:10000};
writeFileSync(config,JSON.stringify({schemaVersion:2,readRoots:{project:root},sources:{},providers:{},knowledgeServers:{knowledge:server},enterpriseSources:{local:{kind:'enterprise-json',file:{root:'project',path:'enterprise.json'}},remote:{kind:'mcp',server:'knowledge',sourceId:'retail-business'}}}));
const source={kind:'mcp',sourceId:'retail-business',server};
const run=(...args)=>{const c=spawnSync(process.execPath,[cli,...args,'--config',config,'--format','json'],{cwd:root,env:{PATH:'',NODE_PATH:''},encoding:'utf8',timeout:20000});assert.equal(c.stderr,'');return {status:c.status,result:c.stdout?JSON.parse(c.stdout):null};};
const semantic=r=>{const {formatVersion,source,visible,scales,...rest}=r;return {...rest,source:{contract:source.contract,schemaVersion:source.schemaVersion,identity:source.identity},visible:visible.map(({locator,...v})=>v),scales:scales.map(({locator,...v})=>v)};};
const wait=async(fn,label,ms=10000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timeout: '+label);};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
let client;
try{
 await check('shared-runtime-Core-Full-CLI-bytes',async()=>{assert(readFileSync(core).equals(readFileSync(full)));assert(readFileSync(core).equals(readFileSync(path.join(bin,'archi-agent-runtime.js'))));});
 client=new Client({name:'ea1b-packaged',version:'1'});await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,'mcp','serve','--config',config],cwd:root,env:{PATH:'',NODE_PATH:''},stderr:'ignore'}));
 assert.equal((await client.listTools()).tools.length,4);
 const before=readdirSync(root).sort(),runtime=require(core);
 for(const selection of [{rootIds:[],maxLevel:3,colorBy:{kind:'rating',scaleId:'maturity'},language:'pl'}, {rootIds:['sales'],maxLevel:2,colorBy:{kind:'none'},language:'en'}]){
  const label=selection.rootIds.length?'branch':'whole';
  await check('parity-local-CLI-function-MCP-source-MCP-'+label,async()=>{
   const local=await runtime.generateCapabilityMap({source:{kind:'enterprise-json',path:catalog},selection});assert.equal(local.status,'success',JSON.stringify(local));
   const remote=await runtime.generateCapabilityMap({source,selection});assert.equal(remote.status,'success',JSON.stringify(remote));assert.deepEqual(semantic(remote.report),semantic(local.report));assert.equal(remote.plantUml,local.plantUml);
   for(const name of ['local','remote']){
    const expected=name==='local'?local:remote,r=await client.callTool({name:'generate_diagram',arguments:{source:name,diagramType:'capability-map',selection}});
    assert.equal(r.isError,false);assert.deepEqual(r.structuredContent.outcome,{status:'success',diagramType:'capability-map',plantUml:expected.plantUml,report:expected.report});assert.deepEqual(JSON.parse(r.content[0].text),r.structuredContent);
    const c=run('diagram','generate','--source',name,'--type','capability-map','--language',selection.language,'--max-level',String(selection.maxLevel),...(selection.rootIds.length?['--root',selection.rootIds[0]]:[]),...(selection.colorBy.kind==='rating'?['--color-scale','maturity']:[]));assert.equal(c.status,0);assert.deepEqual(c.result.outcome,r.structuredContent.outcome);
   }
   assert.equal(local.report.modelCalls,0);assert.equal(remote.report.modelCalls,0);assert.equal(remote.report.formatVersion,2);assert(!JSON.stringify(remote.report.source).includes('file'));
   writeFileSync(path.join(out,label+'-local.json'),JSON.stringify(local.report,null,2));writeFileSync(path.join(out,label+'-remote.json'),JSON.stringify(remote.report,null,2));
  });
 }
 await check('no-product-writes-and-enterprise-inspection',async()=>{const c=run('knowledge','inspect','--source','remote','--type','capability-map');assert.equal(c.status,0);assert.equal(c.result.outcome.sourceEvidence.tool,'get_enterprise_snapshot');assert.deepEqual(readdirSync(root).sort(),before);});
 await check('foreign-arguments-and-stale-hash',async()=>{const invalid=await client.callTool({name:'generate_diagram',arguments:{source:'remote',diagramType:'capability-map',provider:'forbidden',selection:{rootIds:[],maxLevel:3,colorBy:{kind:'none'},language:'en'}}});assert.equal(invalid.isError,true);assert.equal(invalid.structuredContent.outcome.code,'arguments-invalid');const stale=run('diagram','generate','--source','remote','--type','capability-map','--expected-catalog-digest','0'.repeat(64));assert.equal(stale.status,3);assert.equal(stale.result.outcome.code,'stale-source');});
 await check('Core-Full-remote-original-ART1-and-missing-data',async()=>{for(const file of [core,full]){
  const app=require(file),selection={rootIds:['sales'],maxLevel:3,colorBy:{kind:'rating',scaleId:'maturity'},language:'en'},r=await app.generateCapabilityMap({source,selection});assert.equal(r.status,'success');
  const project=path.join(root,file===core?'save-core':'save-full');mkdirSync(project);const saved=await app.saveDiagramBundle(project,r.artifact,app.planDiagramBundle());const report=JSON.parse(readFileSync(path.join(saved.directory,'report.json')));assert.deepEqual(report.generationReport,r.report);assert.equal(report.sourceReferences.enterpriseCatalog.availability,'remote-source');assert.equal(readFileSync(path.join(saved.directory,'diagram.puml'),'utf8'),r.plantUml);
  await assert.rejects(app.saveDiagramBundle(project,r.artifact,app.planDiagramBundle(),{signal:AbortSignal.abort()}));
 }const empty=JSON.parse(readFileSync(catalog));empty.capabilities=[];empty.source.scope.coverage='not-provided';writeFileSync(catalog,JSON.stringify(empty));const c=run('diagram','generate','--source','remote','--type','capability-map');assert.equal(c.status,2);assert.equal(c.result.outcome.code,'enterprise-data-unavailable');});
 await check('legacy-v1-only-knowledge-server-unsupported',async()=>{const v1=path.join(root,'v1.json');writeFileSync(v1,JSON.stringify({schemaVersion:1,readRoots:{project:root},sources:{},providers:{}}));const r=await runtime.inspectEnterpriseSource({...source,server:{...server,args:[serverFile,'--config',v1]}});assert.equal(r.code,'enterprise-unsupported');});
 await check('nested-source-cancel-timeout-EOF-SIGTERM-cleanup',async()=>{
  const script=path.join(root,'stubborn-source.cjs');
  writeFileSync(script,`const fs=require('node:fs'),readline=require('node:readline');process.on('SIGTERM',()=>{});setInterval(()=>{},1000);const send=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.method==='initialize')send(r.id,{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'stubborn',version:'1'}});if(r.method==='tools/list')send(r.id,{tools:[{name:'get_enterprise_snapshot',inputSchema:{type:'object'}}]});if(r.method==='tools/call')fs.writeFileSync(process.argv[2],String(process.pid));});`);
  for(const action of ['cancel','timeout','EOF','SIGTERM']){
   const pidFile=path.join(root,action+'.pid'),nestedConfig=path.join(root,action+'.json'),c=JSON.parse(readFileSync(config));c.knowledgeServers.knowledge={command:process.execPath,args:[script,pidFile],timeoutMs:10000};writeFileSync(nestedConfig,JSON.stringify(c));
   const args={source:'remote',diagramType:'capability-map',selection:{rootIds:[],maxLevel:3,colorBy:{kind:'none'},language:'en'},...(action==='timeout'?{timeoutMs:500}:{})};
   let output='',errors='',parent;
   if(action==='cancel'||action==='timeout'){
    const peer=new Client({name:'nested-'+action,version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[cli,'mcp','serve','--config',nestedConfig],cwd:root,env:{PATH:'',NODE_PATH:''},stderr:'ignore'});await peer.connect(transport);const cancel=new AbortController();
    const pending=peer.callTool({name:'generate_diagram',arguments:args},undefined,{signal:cancel.signal}).then(result=>({result}),error=>({error}));
    try{await wait(()=>readdirSync(root).includes(action+'.pid'),'source call '+action);if(action==='cancel')cancel.abort();const r=await pending;
     if(action==='cancel')assert(r.error);else{assert.equal(r.result.isError,true);assert.equal(r.result.structuredContent.outcome.code,'timeout');}
     const pid=Number(readFileSync(pidFile));await wait(()=>!alive(pid),'nested source cleanup '+action);
    }finally{await peer.close();}
   }else{
    parent=spawn(process.execPath,[cli,'mcp','serve','--config',nestedConfig],{cwd:root,env:{PATH:'',NODE_PATH:''},stdio:['pipe','pipe','pipe']});parent.stdout.on('data',b=>output+=b);parent.stderr.on('data',b=>errors+=b);const closed=new Promise(resolve=>parent.once('close',resolve));
    parent.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'nested',version:'1'}}})+'\n');
    await wait(()=>output.includes('"id":1'),'parent initialize');parent.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');parent.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'generate_diagram',arguments:args}})+'\n');
    await wait(()=>readdirSync(root).includes(action+'.pid'),'active nested source '+action);const pid=Number(readFileSync(pidFile));if(action==='EOF')parent.stdin.end();else parent.kill('SIGTERM');
    const code=await Promise.race([closed,new Promise(resolve=>setTimeout(()=>{parent.kill('SIGKILL');resolve('hung');},10000))]);assert.equal(code,0);await wait(()=>!alive(pid),'nested child exit '+action);assert(!output.includes('"status":"success"'));assert.equal(errors,'');
   }
  }
 });
}catch(e){results.push({id:'failure',status:'FAIL',error:e.stack});process.exitCode=1;}
finally{await client?.close();writeFileSync(path.join(out,'packaged-smoke.json'),JSON.stringify({status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS',root,node:process.version,artifacts:files,serverFile,catalog,results},null,2)+'\n');}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
