import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import * as vscode from 'vscode';
import {saveEnterpriseUpdate} from '../../vscode-extension/src/commands/update-enterprise-catalog.js';
import {captureEnterpriseUpdate,type EnterpriseUpdateSession} from '../../src/runtime/index.js';
import {resetDouble,Uri} from '../doubles/vscode-module-double.js';
import {mkdtemp,readFile,writeFile,realpath,rm,readdir} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';
const roots:string[]=[];beforeEach(()=>resetDouble());afterEach(async()=>{vi.restoreAllMocks();for(const p of roots.splice(0))await rm(p,{recursive:true,force:true});});
async function setup(options:{dirty?:boolean;race?:boolean;apply?:boolean;save?:boolean;saveError?:boolean;postRace?:boolean;diskRace?:boolean}={}){
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'eak2-native-')));roots.push(root);const file=path.join(root,'enterprise.json'),text=await readFile('examples/retail-checkout/architecture/enterprise-applications.json','utf8');await writeFile(file,text);const session=await captureEnterpriseUpdate(file);session.decide(session.propose({kind:'patch-capability',id:'sales',changes:{name:'Sales Updated'}}),'accepted');const plan=session.prepareSave();let buffer=text,version=7,dirty=!!options.dirty;
 const save=vi.fn(async()=>{if(options.saveError)throw Error('disk failure');if(options.save===false)return false;await writeFile(file,buffer);dirty=false;if(options.postRace)await writeFile(file,'foreign');return true;});
 const doc={uri:Uri.file(file),getText:()=>buffer,get version(){return version;},get isDirty(){return dirty;},positionAt:(n:number)=>n,save};
 const edit=vi.fn(async(callback:any)=>{if(options.apply===false)return false;callback({replace:(_range:any,text:string)=>{buffer=text;version++;dirty=true;}});if(options.diskRace)await writeFile(file,'foreign');return true;});
 vi.spyOn(vscode.window,'showTextDocument').mockImplementation(async()=>{if(options.race)version++;return {document:doc,edit} as never;});vi.spyOn(vscode.window,'showInformationMessage').mockResolvedValue('Save catalog' as never);
 return {root,file,session,plan,doc:doc as unknown as vscode.TextDocument,edit,save};
}
it('uses native edit/save and exact persisted readback, preserving v2 mappings',async()=>{const c=await setup();expect(await saveEnterpriseUpdate(c.session,c.plan,c.doc,7)).toBe('saved');expect(c.edit).toHaveBeenCalledOnce();expect(c.save).toHaveBeenCalledOnce();expect(await readFile(c.file,'utf8')).toBe(c.plan.proposedText);expect(JSON.parse(c.plan.proposedText).supports).toHaveLength(3);});
it.each([{dirty:true},{race:true},{apply:false},{diskRace:true}])('blocks dirty/version/rejected-edit/disk conflict without forced save %j',async options=>{const c=await setup(options);expect(await saveEnterpriseUpdate(c.session,c.plan,c.doc,7)).toBe('conflict');expect(c.save).not.toHaveBeenCalled();});
it.each([{save:false,expected:'cancelled'},{saveError:true,expected:'failed'},{postRace:true,expected:'failed'}])('does not confirm save after failure/cancellation/foreign edit %j',async options=>{const c=await setup(options);expect(await saveEnterpriseUpdate(c.session,c.plan,c.doc,7)).toBe(options.expected);expect(c.session.state().completed).toBe(false);});
it('cancel before apply keeps both disk and editor unchanged',async()=>{const c=await setup();vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);expect(await saveEnterpriseUpdate(c.session,c.plan,c.doc,7)).toBe('cancelled');expect(c.edit).not.toHaveBeenCalled();expect(c.save).not.toHaveBeenCalled();expect(await readdir(c.root)).toEqual(['enterprise.json']);});
it('document version captured at session creation remains binding, even after text reverted',async()=>{const c=await setup();expect(await saveEnterpriseUpdate(c.session,c.plan,c.doc,6)).toBe('conflict');expect(c.edit).not.toHaveBeenCalled();});
it('second material selection cannot request another extraction after a proposal is imported',async()=>{
 const c=await setup(),{updateEnterpriseCatalogCommand}=await import('../../vscode-extension/src/commands/update-enterprise-catalog.js'),{createArchiAgentRuntime}=await import('../../src/runtime/index.js'),double=await import('../doubles/vscode-module-double.js');
 vi.spyOn(vscode.workspace,'openTextDocument').mockResolvedValue(c.doc as never);vi.spyOn(vscode.window,'showOpenDialog').mockResolvedValue([Uri.file(c.file)] as never);vi.spyOn(vscode.window,'showInputBox').mockResolvedValue('Business input' as never);
 double.state.configuration.set('archiAgent.localModel.model','synthetic');let calls=0,menuCalls=0;
 double.webviewDrivers.push(async(panel,v)=>{if(panel.viewType==='archiAgent.enterpriseMaterials')await panel.receive({op:'send-materials',revision:0});});
 const runtime=createArchiAgentRuntime({diagramClientFactory:()=>({clientType:'synthetic',generationMetadata:{modelId:'synthetic',temperature:null,seed:null,attemptCount:1,structuredOutput:true},complete:async()=>{calls++;return {source:'content',value:{version:1,warnings:[],candidates:[]}};}})});
 vi.spyOn(vscode.window,'showQuickPick').mockImplementation(async(items:any,options:any)=>{
  if(options?.title==='Archi: catalog update — frozen base'){menuCalls++;if(menuCalls===1)return items.find((i:any)=>i.id==='materials');if(menuCalls===2){expect(items.some((i:any)=>i.id==='materials')).toBe(false);return {id:'materials'} as any;}return items.find((i:any)=>i.id==='close');}
  if(options?.title==='Archi Agent: build business capability catalog')return items.find((i:any)=>i.id==='propose');
  if(options?.title==='Archi Agent: catalog materials')return items.find((i:any)=>i.id==='description');return undefined;
 });
 await updateEnterpriseCatalogCommand({runtime,output:vscode.window.createOutputChannel('test')});expect(calls).toBe(1);expect(menuCalls).toBe(3);
});
