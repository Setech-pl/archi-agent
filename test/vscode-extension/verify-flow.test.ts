import {describe,it,expect,beforeEach,afterEach,vi} from "vitest";
import * as vscode from "vscode";
import {verifyFlowCommand,saveVerificationAliases} from "../../vscode-extension/src/commands/verify-flow.js";
import {resetDouble,state,window,Uri,extensions} from "../doubles/vscode-module-double.js";
import type {AliasSavePlan,FlowVerificationSession,ArchiAgentRuntime} from "../../src/runtime/index.js";
beforeEach(()=>resetDouble());afterEach(()=>vi.restoreAllMocks());
const source={kind:"structurizr-json",sourceId:"test",modelPath:"/project/model.json",overlayPath:"/project/overlay"} as const;
const plan:AliasSavePlan={id:"test",path:"/project/overlay/aliases.md",expectedText:"old\n",proposedText:"old\nnew\n",appendText:"new\n",expectedSha256:"hash",snapshotDigest:"digest"};
function setupNative(options:{dirty?:boolean;race?:boolean;apply?:boolean;save?:boolean}={}) {
 let text=plan.expectedText,version=1,dirty=options.dirty??false;
 const save=vi.fn(async()=>options.save??true),edit=vi.fn(async(callback:any)=>{if(options.apply===false)return false;callback({insert:(_p:any,added:string)=>{text+=added;version++;dirty=true;}});return true;});
 const doc={getText:()=>text,get version(){return version;},get isDirty(){return dirty;},positionAt:(n:number)=>n,save,uri:Uri.file(plan.path)};
 vi.spyOn(vscode.workspace,"openTextDocument").mockResolvedValue(doc as never);
 vi.spyOn(vscode.window,"showTextDocument").mockImplementation(async()=>{if(options.race)version++;return {document:doc,edit} as never;});
 vi.spyOn(vscode.window,"showInformationMessage").mockResolvedValue("Save aliases" as never);
 const prepare=vi.fn(async()=>({status:"prepared",plan})),confirm=vi.fn(async()=>({status:"saved",code:"alias-saved"}));
 const session={prepareAliasSave:prepare,confirmAliasSave:confirm} as unknown as FlowVerificationSession;
 return {session,doc,edit,save,prepare,confirm};
}
describe("VER1 native editor boundaries",()=>{
 it("applies one minimal native edit and validates persisted data before saved",async()=>{const c=setupNative();expect(await saveVerificationAliases(c.session,plan,()=>source)).toBe("saved");expect(c.edit).toHaveBeenCalledOnce();expect(c.save).toHaveBeenCalledOnce();expect(c.confirm).toHaveBeenCalledWith(plan.id,source,expect.objectContaining({aborted:false}));expect(c.doc.getText()).toBe(plan.proposedText);});
 it.each([{dirty:true},{race:true}])("preserves an already dirty or changed document: %j",async options=>{const c=setupNative(options);expect(await saveVerificationAliases(c.session,plan,()=>source)).toBe("conflict");expect(c.edit).not.toHaveBeenCalled();expect(c.save).not.toHaveBeenCalled();});
 it("does not force a failed native save or acknowledge it",async()=>{const c=setupNative({save:false});expect(await saveVerificationAliases(c.session,plan,()=>source)).toBe("conflict");expect(c.confirm).not.toHaveBeenCalled();expect(c.save).toHaveBeenCalledOnce();});
 it("rejects a stale source without changing the document",async()=>{const c=setupNative();c.prepare.mockResolvedValue({status:"stale-source",code:"source-changed"} as never);expect(await saveVerificationAliases(c.session,plan,()=>source)).toBe("stale-source");expect(c.edit).not.toHaveBeenCalled();});
 it("does not save after rejected version-checked edit",async()=>{const c=setupNative({apply:false});expect(await saveVerificationAliases(c.session,plan,()=>source)).toBe("conflict");expect(c.save).not.toHaveBeenCalled();expect(c.confirm).not.toHaveBeenCalled();});
 it("Cancel performs no source/provider/credential access",async()=>{const start=vi.fn();await verifyFlowCommand({runtime:{startFlowVerification:start} as unknown as ArchiAgentRuntime,output:window.createOutputChannel("test") as never});expect(start).not.toHaveBeenCalled();expect(state.secretReads).toEqual([]);expect(state.configurationUpdates).toEqual([]);});
});

it('does not perform a native edit when the second profile becomes enabled during prepare',async()=>{
 const c=setupNative();c.prepare.mockImplementation(async()=>{vi.spyOn(extensions,'getExtension').mockReturnValue({}as never);return{status:'prepared',plan};});
 await expect(saveVerificationAliases(c.session,plan,()=>source)).rejects.toThrow('profile-conflict');expect(c.edit).not.toHaveBeenCalled();expect(c.save).not.toHaveBeenCalled();
});
