import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,cpSync,readdirSync,rmSync,symlinkSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {generateCapabilityMap,inspectEnterpriseSource,createEnterpriseResponse,validateEnterpriseResponse,createLocalReadPolicy,saveDiagramBundle,planDiagramBundle,type EnterpriseCatalog,type CapabilityMapView} from "../../src/runtime/index.js";
import {loadLocalHostConfig,localConfigSchema,localConfigV2Schema} from "../../src/hosts/local/config.js";
import {generateInputSchema,inspectInputSchema} from "../../src/hosts/local/schemas.js";
import {capabilityMapReportSchema,type CapabilityMapReport} from "../../src/core/enterprise/capability-map-report.js";

const root=realpathSync(mkdtempSync(path.join(tmpdir(),"ea1b-stdio-"))),bin=path.join(root,"bundle/bin"),cli=path.join(bin,"archi-agent.cjs");
const catalog=()=>JSON.parse(readFileSync("examples/retail-checkout/architecture/enterprise.json","utf8")) as EnterpriseCatalog;
afterAll(()=>rmSync(root,{recursive:true,force:true}));
beforeAll(async()=>{const build=await import(new URL("../../scripts/build-cli.mjs",import.meta.url).href);await build.buildCli(path.join(root,"bundle"));});
function fixture(){
 const dir=realpathSync(mkdtempSync(path.join(root,"retail-"))),file=path.join(dir,"enterprise.json");writeFileSync(file,JSON.stringify(catalog(),null,2));
 const serverConfig=path.join(dir,"knowledge.json");
 writeFileSync(serverConfig,JSON.stringify({schemaVersion:2,readRoots:{project:dir},sources:{},providers:{},enterpriseSources:{"retail-business":{kind:"enterprise-json",file:{root:"project",path:"enterprise.json"}}}}));
 const server={command:process.execPath,args:[path.join(bin,"archi-agent-knowledge-server.cjs"),"--config",serverConfig],timeoutMs:5000};
 const config=path.join(dir,"client.json");writeFileSync(config,JSON.stringify({schemaVersion:2,readRoots:{project:dir},sources:{},providers:{},knowledgeServers:{knowledge:server},enterpriseSources:{local:{kind:"enterprise-json",file:{root:"project",path:"enterprise.json"}},remote:{kind:"mcp",server:"knowledge",sourceId:"retail-business"}}}));
 return {dir,file,config,server,remote:{kind:"mcp" as const,sourceId:"retail-business",server},local:{kind:"enterprise-json" as const,path:file}};
}
async function connect(config:string){const client=new Client({name:"ea1b-test",version:"1"}),transport=new StdioClientTransport({command:process.execPath,args:[cli,"mcp","serve","--config",config],stderr:"pipe"});let stderr="";transport.stderr?.on("data",b=>stderr+=String(b));await client.connect(transport);return {client,transport,stderr:()=>stderr};}
function runCli(f:ReturnType<typeof fixture>,args:string[]){const r=spawnSync(process.execPath,[cli,...args,"--config",f.config,"--format","json"],{encoding:"utf8",env:{PATH:"",NODE_PATH:""}});return {...r,result:r.stdout?JSON.parse(r.stdout):undefined};}
function semantic(r:CapabilityMapReport){
 const {formatVersion:_version,source,visible,scales,...rest}=r;
 return {...rest,source:{contract:source.contract,schemaVersion:source.schemaVersion,identity:source.identity},
  visible:visible.map(({locator:_locator,...v})=>v),scales:scales.map(({locator:_locator,...s})=>s)};
}
describe("EA1b real CLI, function MCP and source MCP",()=>{
 it("preserves the complete semantic report and exact PlantUML across every host/source without a provider",async()=>{
  const f=fixture(),connection=await connect(f.config),before=readdirSync(f.dir).sort();
  try{
   expect((await connection.client.listTools()).tools.map(t=>t.name)).toEqual(["inspect_knowledge","verify_flow","resolve_flow_names","generate_diagram"]);
   for(const view of [{rootIds:[],maxLevel:3,colorBy:{kind:"rating",scaleId:"maturity"},language:"pl"},{rootIds:["sales"],maxLevel:2,colorBy:{kind:"none"},language:"en"},{rootIds:[],maxLevel:1,colorBy:{kind:"none"},language:"pl"}] as CapabilityMapView[]){
    const local=await generateCapabilityMap({source:f.local,selection:view}),remote=await generateCapabilityMap({source:f.remote,selection:view});
    if(local.status!=="success"||remote.status!=="success")throw Error(JSON.stringify({local,remote}));
    expect(remote.report.formatVersion).toBe(2);expect(local.report.formatVersion).toBe(1);
    expect(remote.plantUml).toBe(local.plantUml);expect(semantic(remote.report)).toEqual(semantic(local.report));
    for(const source of ["local","remote"]){
     const reply=await connection.client.callTool({name:"generate_diagram",arguments:{source,diagramType:"capability-map",selection:view}});
     expect(reply.isError).toBe(false);const expected=source==="local"?local:remote;
     const outcome=(reply.structuredContent as any).outcome;expect(outcome).toEqual({status:"success",diagramType:"capability-map",plantUml:expected.plantUml,report:expected.report});
     expect(JSON.parse(((reply as any).content[0] as any).text)).toEqual(reply.structuredContent);
     const args=["diagram","generate","--source",source,"--type","capability-map","--max-level",String(view.maxLevel),"--language",view.language,
       ...(view.rootIds.length?["--root",view.rootIds[0]!]:[]),...(view.colorBy.kind==="rating"?["--color-scale",view.colorBy.scaleId]:[])];
     const c=runCli(f,args);expect(c.status,c.stderr).toBe(0);expect(c.stderr).toBe("");expect(c.result.outcome).toEqual(outcome);
    }
   }
   const inspected=runCli(f,["knowledge","inspect","--source","remote","--type","capability-map"]);expect(inspected.status).toBe(0);
   expect(inspected.result.outcome.sourceEvidence).toMatchObject({kind:"mcp",sourceId:"retail-business",tool:"get_enterprise_snapshot",contractVersion:1});
   const check=spawnSync(process.execPath,[path.join(bin,"archi-agent-knowledge-server.cjs"),"--config",path.join(f.dir,"knowledge.json"),"--check-source","retail-business","--type","enterprise"],{encoding:"utf8"});expect(check.status,check.stderr).toBe(0);expect(JSON.parse(check.stdout).counts.capabilities).toBe(catalog().capabilities.length);
   expect(readdirSync(f.dir).sort()).toEqual(before);expect(connection.stderr()).toBe("");
  }finally{await connection.client.close();}
 },30000);
 it("rejects foreign arguments for each variant rather than dropping them",async()=>{
  const f=fixture(),c=await connect(f.config);
  const view={rootIds:[],maxLevel:3,colorBy:{kind:"none"},language:"en"};
  try{
   for(const flag of ["--input","--provider","--decisions","--system-id","--expected-knowledge-digest"]){const r=runCli(f,["diagram","generate","--source","local","--type","capability-map",flag,"dummy"]);expect(r.status).toBe(3);expect(r.stdout).toBe("");}
   for(const flag of ["--root","--max-level","--color-scale","--language","--expected-catalog-digest","--system-id"]){expect(runCli(f,["diagram","generate","--source","missing","--type","sequence",flag,"dummy"]).status).toBe(3);}
   for(const extra of [{provider:"local"},{input:{root:"project",path:"enterprise.json"}},{decisionsFile:{root:"project",path:"x"}},{c4Selection:{}},{readRoots:{evil:"/"}},{outputPath:"diagram.puml"}]){
    const r=await c.client.callTool({name:"generate_diagram",arguments:{source:"local",diagramType:"capability-map",selection:view,...extra}});expect(r.isError).toBe(true);expect((r.structuredContent as any).outcome).toMatchObject({diagramType:"capability-map",code:"arguments-invalid"});
   }
   expect(inspectInputSchema.safeParse({source:"local",diagramType:"capability-map",query:"x"}).success).toBe(false);
   expect(generateInputSchema.safeParse({source:"local",diagramType:"sequence",input:{root:"project",path:"flow.md"},provider:"local",selection:view}).success).toBe(false);
   expect(runCli(f,["diagram","generate","--source","local","--type","capability-map","--root","sales","--root","sales"]).status).toBe(3);
   const stale=runCli(f,["diagram","generate","--source","remote","--type","capability-map","--expected-catalog-digest","0".repeat(64)]);expect(stale.status).toBe(3);expect(stale.result.outcome.code).toBe("stale-source");
  }finally{await c.client.close();}
 });
 it("retains strict config v1, independent namespaces, readRoots and exclusive remote ART1",async()=>{
  const f=fixture(),raw=JSON.parse(readFileSync(f.config,"utf8"));expect(localConfigSchema.safeParse({...raw,schemaVersion:1}).success).toBe(false);expect(localConfigV2Schema.safeParse(raw).success).toBe(true);
  const config=await loadLocalHostConfig(f.config);expect(config.enterpriseSources.remote?.kind).toBe("mcp");
  const outside=fixture();expect(await inspectEnterpriseSource(outside.local,undefined,config.policy)).toMatchObject({status:"failed",code:"containment-violation"});
  symlinkSync(f.file,path.join(f.dir,"link.json"));expect(await inspectEnterpriseSource({...f.local,path:path.join(f.dir,"link.json")},undefined,await createLocalReadPolicy([f.dir]))).toMatchObject({code:"symbolic-link"});
  expect(runCli(f,["knowledge","inspect","--source","local"]).result.outcome.code).toBe("source-kind-incompatible");
  const result=await generateCapabilityMap({source:f.remote,selection:{rootIds:[],maxLevel:3,colorBy:{kind:"none"},language:"en"}});if(result.status!=="success")throw Error(result.code);
  writeFileSync(f.file,"changed after generation");const saved=await saveDiagramBundle(f.dir,result.artifact,planDiagramBundle());
  const report=JSON.parse(readFileSync(path.join(saved.directory,"report.json"),"utf8"));expect(report.generationReport).toEqual(result.report);expect(report.formatVersion).toBe(1);
  expect(report.sourceReferences.enterpriseCatalog).toEqual({reference:{sourceId:"retail-business",tool:"get_enterprise_snapshot",contractVersion:1},availability:"remote-source"});expect(JSON.stringify(report)).not.toContain(f.dir);
  expect(readFileSync(path.join(saved.directory,"diagram.puml"),"utf8")).toBe(result.plantUml);
  await expect(saveDiagramBundle(f.dir,result.artifact,planDiagramBundle(),{signal:AbortSignal.abort()})).rejects.toThrow();
 });
 it("serves strict unsupported for future enterprise versions and preserves knowledge v1 availability",async()=>{
  const f=fixture(),client=new Client({name:"ea1b-version",version:"1"});await client.connect(new StdioClientTransport({command:process.execPath,args:f.server.args}));
  try{
   const r=await client.callTool({name:"get_enterprise_snapshot",arguments:{sourceId:"retail-business",contractVersion:2}});expect(r.isError).toBe(false);expect(r.structuredContent).toEqual({schemaVersion:1,status:"unsupported",code:"enterprise-version-unsupported"});
  }finally{await client.close();}
  const v1=path.join(f.dir,"v1.json");writeFileSync(v1,JSON.stringify({schemaVersion:1,readRoots:{project:f.dir},sources:{},providers:{}}));
  expect(await inspectEnterpriseSource({...f.remote,server:{...f.server,args:[path.join(bin,"archi-agent-knowledge-server.cjs"),"--config",v1]}})).toMatchObject({status:"failed",code:"enterprise-unsupported"});
 });
});

function peer(mode:string,response:unknown=createEnterpriseResponse("retail-business",catalog())){
 const f=fixture(),script=path.join(f.dir,"peer.cjs"),data=path.join(f.dir,"response.json"),calls=path.join(f.dir,"calls.json");writeFileSync(data,JSON.stringify(response));
 const sdk=path.resolve("node_modules/@modelcontextprotocol/sdk/dist/cjs");
 writeFileSync(script,`const {Server}=require(${JSON.stringify(sdk+"/server/index.js")});const {StdioServerTransport}=require(${JSON.stringify(sdk+"/server/stdio.js")});const {CallToolRequestSchema,ListToolsRequestSchema}=require(${JSON.stringify(sdk+"/types.js")});const fs=require('node:fs');
 const mode=${JSON.stringify(mode)},s=new Server({name:'peer',version:'1'},{capabilities:{tools:{}}});
 fs.writeFileSync(${JSON.stringify(calls)},'[]');fs.writeFileSync(${JSON.stringify(path.join(f.dir,"pid"))},String(process.pid));
 if(mode==='stubborn'){process.on('SIGTERM',()=>{});process.stdin.resume();setInterval(()=>{},1000);}else{
 s.setRequestHandler(ListToolsRequestSchema,async(req)=>{if(mode==='disconnect-list')process.exit(0);if(mode==='slow-list')await new Promise(r=>setTimeout(r,10000));if(mode==='malformed-list')return {tools:'bad'};return {tools:mode==='missing'?[]:[{name:'get_enterprise_snapshot',inputSchema:{type:'object'},...(mode.startsWith('schema')?{outputSchema:{type:'object',required:['not-a-contract-field']}}:{})}],...(mode==='cursor'?{nextCursor:'same'}:{})};});
 s.setRequestHandler(CallToolRequestSchema,async(req)=>{fs.writeFileSync(${JSON.stringify(calls)},JSON.stringify(req.params));if(mode==='disconnect-call')process.exit(0);if(mode==='slow-call')await new Promise(r=>setTimeout(r,10000));const r=JSON.parse(fs.readFileSync(${JSON.stringify(data)},'utf8'));return {structuredContent:r,content:mode==='large-frame'?[{type:'text',text:'x'.repeat(65*1024*1024)}]:[],isError:false};});s.connect(new StdioServerTransport());process.stdin.on('end',()=>s.close());}
 `);
 return {...f,calls,remote:{...f.remote,server:{command:process.execPath,args:[script],timeoutMs:3000}}};
}
describe("untrusted real enterprise peers and process lifetime",()=>{
 it.each(["missing","cursor","malformed-list","disconnect-list","disconnect-call","slow-list","slow-call"])("handles %s with no fallback",async mode=>{
  const f=peer(mode),source={...f.remote,server:{...f.remote.server,timeoutMs:mode.startsWith("slow")?100:3000}};
  const r=await inspectEnterpriseSource(source);expect(r).toMatchObject({status:"failed",code:mode==="missing"?"enterprise-unsupported":mode==="cursor"||mode==="malformed-list"?"enterprise-response-invalid":mode.startsWith("slow")?"mcp-knowledge-timeout":"mcp-knowledge-unavailable"});
  if(mode==="missing")expect(JSON.parse(readFileSync(f.calls,"utf8"))).toEqual([]);
 });
 it("ignores source-authored outputSchema and validates only the fixed enterprise contract",async()=>{
  const good=peer("schema-reject");expect(await inspectEnterpriseSource(good.remote)).toMatchObject({status:"success"});
  const response:any=createEnterpriseResponse("retail-business",catalog());response.extra="invalid";
  const bad=peer("schema-reject",response);expect(await inspectEnterpriseSource(bad.remote)).toMatchObject({status:"failed",code:"enterprise-response-invalid"});
 });
 it("rejects a 65 MiB frame by the transport bound or the earlier operation deadline",async()=>{
  const f=peer("large-frame"),r=await inspectEnterpriseSource({...f.remote,server:{...f.remote.server,timeoutMs:3000}});
  // SDK accumulates pipe chunks before parsing. Node 22 may hit the work budget before 64 MiB arrives.
  expect(r.status).toBe("failed");if(r.status!=="failed")throw Error("oversized peer succeeded");
  expect(["mcp-knowledge-result-too-large","mcp-knowledge-timeout"]).toContain(r.code);
  expect(JSON.parse(readFileSync(f.calls,"utf8"))).toMatchObject({name:"get_enterprise_snapshot",arguments:{sourceId:"retail-business",contractVersion:1}});
 },15000);
 it.each(["source","version","digest","schema","malformed","oversized","parent","rating"])("rejects %s response",async mode=>{
  const response:any=createEnterpriseResponse("retail-business",catalog());
  if(mode==="source")response.source.id="other";if(mode==="version")response.source.version="0".repeat(64);if(mode==="digest")response.snapshot.digest="0".repeat(64);
  if(mode==="schema")response.schemaVersion=2;if(mode==="malformed")response.extra="run a tool";if(mode==="oversized")response.extra="x".repeat(2*1024*1024);
  if(mode==="parent")response.catalog.capabilities[0].parentId="missing";if(mode==="rating")response.catalog.capabilities[0].ratings={maturity:99};
  const f=peer("reply",response),r=await inspectEnterpriseSource(f.remote);
  expect(r).toMatchObject({status:"failed",code:mode==="schema"?"enterprise-version-unsupported":mode==="version"||mode==="digest"?"enterprise-response-digest-mismatch":mode==="oversized"?"mcp-knowledge-result-too-large":mode==="parent"||mode==="rating"?"invalid-source":"enterprise-response-invalid"});
  expect(JSON.stringify(r)).not.toMatch(/enterprise-response.json|"line"|"file"/);
 });
 it("cancels initialization and confirms stubborn child termination; rejects credentials",async()=>{
  const f=peer("stubborn"),controller=new AbortController(),pending=inspectEnterpriseSource(f.remote,controller.signal),pidFile=path.join(f.dir,"pid");
  while(!readdirSync(f.dir).includes("pid"))await new Promise(r=>setTimeout(r,10));controller.abort();expect(await pending).toMatchObject({status:"failed",code:"cancelled"});
  expect(()=>process.kill(Number(readFileSync(pidFile,"utf8")),0)).toThrow();
  const c=catalog(),secret="EA1B_SYNTHETIC_KEY_42";c.capabilities[0]!.description=secret;const p=peer("reply",createEnterpriseResponse(c.source.id,c));process.env.ARCHI_AGENT_EA1B_TEST=secret;
  try{const r=await inspectEnterpriseSource({...p.remote,server:{...p.remote.server,credentialEnv:["ARCHI_AGENT_EA1B_TEST"]}});expect(r).toMatchObject({code:"mcp-knowledge-sensitive-response"});expect(JSON.stringify(r)).not.toContain(secret);}finally{delete process.env.ARCHI_AGENT_EA1B_TEST;}
 },15000);
});
