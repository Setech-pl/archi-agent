import {it,expect,afterAll} from 'vitest';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createArchiAgentRuntime,portableDiagramOutcome,portableVerificationOutcome} from '../../src/runtime/index.js';
import type {RemoteJsonRequest} from '../../src/node/llm/remote-json-transport.js';
const fixture=createRequire(import.meta.url)('../../scripts/ver1-c4-fixture.cjs'),root=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-credentials-')));afterAll(()=>rmSync(root,{recursive:true,force:true}));
it.each(['cloud-openai','cloud-openrouter','cloud-anthropic']as const)('blocks reflected credential before VER1 output or a second Sequence request: %s',async profileId=>{
 const dir=path.join(root,profileId),{config:source}=fixture.prepare(dir,path.resolve('test/fixtures/structurizr/big-bank-plc')),key='MCP1-SYNTHETIC-KEY-47';let calls=0;
 const app=createArchiAgentRuntime({remoteTransport:{async exchange(request:RemoteJsonRequest){calls++;const header=request.headers.Authorization?.slice(7)??request.headers['x-api-key'];expect(header).toBe(key);const input=JSON.parse(JSON.parse(request.body!).messages.at(-1).content),answer=fixture.answer(input);if(answer.steps)answer.steps[0].label=header;else answer.groundedSteps[0].label=header;const content=JSON.stringify(answer);return JSON.stringify(profileId==='cloud-anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:content}]}:{choices:[{finish_reason:'stop',message:{content}}]});}}});
 const generator={kind:'remote-provider'as const,profileId,modelId:'synthetic-model',credential:{type:'api-key'as const,value:key}};
 const verified=await app.startFlowVerification!({input:{format:'prose',text:fixture.prose,fileName:'flow.txt',firstLine:1},knowledgePack:source,interpreter:generator});expect(verified.status).toBe('failed');expect(JSON.stringify(portableVerificationOutcome(verified))).not.toContain(key);expect(calls).toBe(1);
 const generated=await app.generateDiagram!({diagramType:'sequence',flow:{kind:'description',flowName:'Credential guard',description:'SPA calls Banking API. Banking API reads Banking Database.'},knowledgePack:source,generator});expect(generated.status).toBe('failed');expect(JSON.stringify(portableDiagramOutcome(generated))).not.toContain(key);expect(calls).toBe(2);
});
