import {afterEach,expect,it,vi} from 'vitest';
import * as runtimeApi from '../../src/runtime/index.js';
import {generateDiagramCommand} from '../../vscode-extension/src/commands/generate-sequence-diagram.js';
import {extensions,resetDouble,secretStorage,state,window} from '../doubles/vscode-module-double.js';
vi.mock('../../vscode-extension/src/commands/knowledge-pack-onboarding.js',()=>({ensureKnowledgePack:async()=>({status:'ready'})}));
afterEach(()=>{resetDouble();vi.restoreAllMocks();});
it('C4 system inspection observes a profile conflict before generation',async()=>{
 resetDouble();let both=false;
 vi.spyOn(extensions,'getExtension').mockImplementation(id=>(id==='setech-pl.archi-agent'||both?{}:undefined)as never);
 state.configuration.set('archiAgent.knowledgePackPath','/synthetic/knowledge');
 state.quickPickAnswers.push(items=>(items as {id:string}[]).find(i=>i.id==='c4-context'));
 let cancellation:{readonly aborted:boolean}|undefined;
 const inspection=vi.spyOn(runtimeApi,'inspectC4Source').mockImplementation(async(_source,signal)=>{
  cancellation=signal;
  await vi.waitFor(()=>expect(signal?.aborted).toBe(true));
  return {ok:false,code:'cancelled',issues:[]} as never;
 });
 const runtime=runtimeApi.createArchiAgentRuntime(),generate=vi.spyOn(runtime,'generateDiagram');
 const pending=generateDiagramCommand({runtime,output:window.createOutputChannel('test') as never,secrets:secretStorage as never});
 await vi.waitFor(()=>expect(inspection).toHaveBeenCalledOnce());
 expect(cancellation?.aborted).toBe(false);both=true;await pending;
 expect(cancellation?.aborted).toBe(true);expect(generate).not.toHaveBeenCalled();
});
