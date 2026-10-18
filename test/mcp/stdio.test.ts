import{describe,it,expect,afterAll,beforeAll}from'vitest';
import{Client}from'@modelcontextprotocol/sdk/client/index.js';import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';
import{mkdtempSync,realpathSync,cpSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';
import{createArchiAgentRuntime,serializeFlowVerificationForHost}from'../../src/runtime/index.js';import{legendLines}from'../../src/core/render/legend.js';
import{loadLocalHostConfig}from'../../src/hosts/local/config.js';
const root=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-stdio-'))),cli=path.join(root,'bundle/bin/archi-agent.cjs');
afterAll(()=>rmSync(root,{recursive:true,force:true}));
const diagram=(a='Banking API',body='A -> B : read (DB)')=>`@startuml\nparticipant "${a}" as A\nparticipant "Banking Database" as B\n${body}\n${legendLines('en').join('\n')}\n@enduml\n`;
async function setup(){const dir=path.join(root,String(Math.random()));cpSync('test/fixtures/structurizr/big-bank-plc',dir,{recursive:true});writeFileSync(path.join(dir,'flow.puml'),diagram());const config=path.join(dir,'config.json');writeFileSync(config,JSON.stringify({schemaVersion:1,readRoots:{project:dir},sources:{bank:{kind:'structurizr-json',sourceId:'big-bank',model:{root:'project',path:'workspace.json'},overlay:{root:'project',path:'overlay'}}},providers:{}}));
 const transport=new StdioClientTransport({command:process.execPath,args:[cli,'mcp','serve','--config',config],cwd:root,stderr:'pipe'});let stderr='';transport.stderr?.on('data',b=>stderr+=String(b));
 const client=new Client({name:'mcp1-test',version:'1.0.0'});await client.connect(transport);return{client,transport,dir,config,stderr:()=>stderr};}
const outcome=(r:any)=>r.structuredContent.outcome;
describe('real SDK client and stdio process',()=>{
 it('negotiates, lists exactly four closed tools, and preserves runtime evidence',async()=>{const f=await setup();try{
  const tools=await f.client.listTools();expect(tools.tools.map(t=>t.name)).toEqual(['inspect_knowledge','verify_flow','resolve_flow_names','generate_diagram']);for(const t of tools.tools){expect(t.inputSchema.type).toBe('object');expect(t.outputSchema?.type).toBe('object');}
  await f.client.ping();const inspection=await f.client.callTool({name:'inspect_knowledge',arguments:{source:'bank',limit:2}});expect(inspection.isError).toBe(false);expect(outcome(inspection).elements).toHaveLength(2);expect(outcome(inspection).counts).toEqual({systems:9,actors:3,relationships:18,aliases:3,rules:1});
  const r=await f.client.callTool({name:'verify_flow',arguments:{source:'bank',input:{root:'project',path:'flow.puml'},format:'plantuml-sequence'}});expect(r.isError).toBe(false);
  expect(JSON.parse(((r as any).content[0]as any).text)).toEqual(r.structuredContent);
  const config=await loadLocalHostConfig(f.config),full=await createArchiAgentRuntime().startFlowVerification!({input:{format:'plantuml-sequence',text:diagram(),fileName:'flow.puml',firstLine:1},knowledgePack:config.sources.bank!});if(!('report'in full))throw Error('fixture');expect(outcome(r)).toEqual({status:full.status,report:serializeFlowVerificationForHost(full.report)});expect(outcome(r).report.report.modelCalls).toBe(0);expect(f.stderr()).toBe('');
 }finally{await f.client.close();}});
 it('keeps discrepancies and partial assessment separate from execution errors and rejects permission expansion',async()=>{const f=await setup();try{
  for(const [text,assessment]of[[diagram('Banking API','A ->> B : read (DB)'),'discrepancies'],[diagram().replace(legendLines('en').join('\n'),''),'inconclusive']]){writeFileSync(path.join(f.dir,'flow.puml'),text!);const r=await f.client.callTool({name:'verify_flow',arguments:{source:'bank',input:{root:'project',path:'flow.puml'},format:'plantuml-sequence'}});expect(r.isError).toBe(false);expect(outcome(r).report.report.assessment).toBe(assessment);}
  for(const args of[{source:'bank',readRoots:{evil:'/'}},{source:'unknown'},{source:'bank',input:{root:'project',path:'../../etc/passwd'},format:'plantuml-sequence'}]){const r=await f.client.callTool({name:'input'in args?'verify_flow':'inspect_knowledge',arguments:args});expect(r.isError).toBe(true);}
  await expect(f.client.callTool({name:'unknown_tool',arguments:{}})).rejects.toThrow();
 }finally{await f.client.close();}});
 it('binds a session to hashes and source freshness without persisting aliases',async()=>{const f=await setup();try{
  writeFileSync(path.join(f.dir,'flow.puml'),diagram('Unknown'));
  const r:any=await f.client.callTool({name:'verify_flow',arguments:{source:'bank',input:{root:'project',path:'flow.puml'},format:'plantuml-sequence'}}),v=r.structuredContent,p=v.outcome.report.report;expect(v.continuation.sessionId).toBeTruthy();
  const target=p.resolutions.find((r:any)=>r.mention==='Banking Database').targetId;
  const args={sessionId:v.continuation.sessionId,expectedInputSha256:p.input.sha256,expectedInterpretationDigest:p.interpretationDigest,expectedSnapshotDigest:p.snapshot.digest,decisions:[{mentionId:p.resolutions.find((r:any)=>r.mention==='Unknown').mentionId,targetElementId:target,expectedSnapshotDigest:p.snapshot.digest,confirmed:true}]};
  const bad=await f.client.callTool({name:'resolve_flow_names',arguments:{...args,expectedInputSha256:'0'.repeat(64)}});expect(bad.isError).toBe(true);
  writeFileSync(path.join(f.dir,'overlay/aliases.md'),'| alias | source_id | target_id |\n|---|---|---|\n');
  const stale=await f.client.callTool({name:'resolve_flow_names',arguments:args});expect(outcome(stale).status).toBe('stale-source');expect((stale.structuredContent as any).continuation).toBeUndefined();
 }finally{await f.client.close();}});
});

beforeAll(async()=>{const module=await import(new URL('../../scripts/build-cli.mjs',import.meta.url).href);await module.buildCli(path.join(root,'bundle'));});
