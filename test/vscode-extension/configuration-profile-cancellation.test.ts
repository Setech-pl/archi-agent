import {afterEach,expect,it,vi} from 'vitest';
import * as runtimeApi from '../../src/runtime/index.js';
import {ConfigurationWorkbench} from '../../vscode-extension/src/workbench/configuration.js';
import {extensions,panels,resetDouble,secretStorage,state,window} from '../doubles/vscode-module-double.js';
afterEach(()=>{resetDouble();vi.restoreAllMocks();});
it('configuration inspection observes a newly enabled profile conflict while awaiting knowledge',async()=>{
 resetDouble();let both=false;
 vi.spyOn(extensions,'getExtension').mockImplementation(id=>(id==='setech-pl.archi-agent'||both?{}:undefined)as never);
 state.configuration.set('archiAgent.knowledgePackPath','/synthetic/knowledge');
 let cancellation:{readonly aborted:boolean}|undefined;
 const inspection=vi.spyOn(runtimeApi,'inspectArchitectureSource').mockImplementation(async(_source,signal)=>{
  cancellation=signal;
  await vi.waitFor(()=>expect(signal?.aborted).toBe(true));
  return {ok:false,code:'cancelled',issues:[{message:'cancelled'}]} as never;
 });
 const workbench=new ConfigurationWorkbench(runtimeApi.createArchiAgentRuntime(),window.createOutputChannel('test') as never,secretStorage as never);
 workbench.open();const pending=panels[0]!.receive({op:'ready'});
 await vi.waitFor(()=>expect(inspection).toHaveBeenCalledOnce());
 expect(cancellation?.aborted).toBe(false);both=true;
 await pending;
 expect(cancellation?.aborted).toBe(true);
 expect(JSON.stringify(panels[0]!.webview.messages)).not.toContain('Valid —');
 workbench.dispose();
});
