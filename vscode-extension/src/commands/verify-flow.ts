import { assertProfileAvailable, profileConflict, withProfileCancellation } from "../profile-availability.js";
import * as vscode from "vscode";
import path from "node:path";
import type { ArchiAgentRuntime, AliasSavePlan, FlowVerificationSession, GeneratorConfig, KnowledgePackSourceConfig, VerifyFlowReport } from "../../../src/runtime/index.js";
import { serializeFlowVerificationForHost } from "../../../src/runtime/index.js";
import { settingsSection } from "../contributions.js";
import { readArchiAgentSettings } from "../settings.js";
import { ensureKnowledgePack } from "./knowledge-pack-onboarding.js";
import { buildGenerationRequest } from "./sequence-generation-session.js";
import { selectLocalModel } from "./local-provider-selection.js";
import { readApiKey } from "../api-key-storage.js";

/** Thin native-editor save adapter. Never forces overwrite, merges or rolls back foreign edits. */
export async function saveVerificationAliases(session:FlowVerificationSession,plan:AliasSavePlan,currentSource:()=>KnowledgePackSourceConfig|undefined):Promise<string> {
  assertProfileAvailable();
  const uri=vscode.Uri.file(plan.path),doc=await vscode.workspace.openTextDocument(uri);
  if(doc.isDirty||doc.getText()!==plan.expectedText)return "conflict";
  const version=doc.version;
  const editor=await vscode.window.showTextDocument(doc,{preview:false});
  const chosen=await vscode.window.showInformationMessage("Archi Agent: save the confirmed aliases to this source overlay?",{modal:true},"Save aliases");
  if(chosen!=="Save aliases")return "cancelled";
  const source=currentSource();if(!source)return "stale-source";
  const check=await session.prepareAliasSave(source,withProfileCancellation());
  if(check.status!=="prepared"||check.plan.id!==plan.id)return check.status;
  if(doc.isDirty||doc.version!==version||doc.getText()!==plan.expectedText)return "conflict";
  assertProfileAvailable();
  const applied=await editor.edit(edit=>edit.insert(doc.positionAt(doc.getText().length),plan.appendText));
  if(!applied||doc.version!==version+1||doc.getText()!==plan.proposedText)return "conflict";
  // Native save performs the editor's external-file conflict check. Never execute an overwrite command.
  assertProfileAvailable();
  if(!await doc.save())return "conflict";
  const after=currentSource();if(!after)return "stale-source";
  return (await session.confirmAliasSave(plan.id,after,withProfileCancellation())).status;
}

export async function verifyFlowCommand(deps:{runtime:ArchiAgentRuntime;output:vscode.OutputChannel;secrets?:vscode.SecretStorage}):Promise<void> {
  const editor=vscode.window.activeTextEditor;
  const picked=await vscode.window.showQuickPick([
    ...(editor&&!editor.selection.isEmpty?[{label:"Use selection",id:"selection"}]:[]),
    ...(editor?[{label:"Use active document",id:"document"}]:[]),{label:"Enter a flow description",id:"prose"}],
    {title:"Archi Agent: Verify Flow — Sequence or prose",placeHolder:"Choose the input to verify"});
  if(!picked)return;
  let text:string|undefined,firstLine=1;
  if(picked.id==="prose")text=await vscode.window.showInputBox({title:"Archi Agent: flow description",prompt:"Describe participants and directed steps; state synchronous/asynchronous behavior explicitly.",ignoreFocusOut:true});
  else if(editor) {text=picked.id==="selection"?editor.document.getText(editor.selection):editor.document.getText();firstLine=picked.id==="selection"?editor.selection.start.line+1:1;}
  if(!text?.trim())return;
  let format:"plantuml-sequence"|"prose";
  if(text.trimStart().startsWith("@startuml"))format="plantuml-sequence";
  else if(picked.id==="prose")format="prose";
  else {const kind=await vscode.window.showQuickPick([{label:"Sequence PlantUML (no LLM)",id:"plantuml-sequence" as const},{label:"Prose (one interpretation request)",id:"prose" as const}],{title:"Archi Agent: verification input format"});if(!kind)return;format=kind.id;}
  const pack=await ensureKnowledgePack();if(pack.status!=="ready")return;
  const settings=()=>readArchiAgentSettings(vscode.workspace.getConfiguration(settingsSection,pack.resource));
  const initial=settings();if(!initial.ok){await vscode.window.showErrorMessage("Archi Agent: invalid settings.");return;}
  let configured=initial.settings;
  const currentSource=():KnowledgePackSourceConfig|undefined=>{if(profileConflict())return undefined;const s=settings();return s.ok?s.settings.architectureSource??{kind:"local-directory",path:s.settings.knowledgePackPath}:undefined;};
  const source=currentSource();if(!source)return;
  let interpreter:GeneratorConfig|undefined;
  if(format==="prose") {
    if(!configured.localModel.modelId) {const chosen=await selectLocalModel(deps.runtime,deps.output,deps.secrets,undefined,pack.resource);if(chosen.status!=="selected"||!chosen.settings.modelId)return;configured={...configured,localModel:chosen.settings};}
    const profile=deps.runtime.listProviderProfiles().find(p=>p.profileId===configured.localModel.profileId);if(!profile)return;
    const key=deps.secrets?await readApiKey(deps.secrets,profile):undefined;
    interpreter=buildGenerationRequest(configured,{kind:"description",flowName:"Verification",description:text},configured.localModel.modelId!,undefined,key).generator;
  }
  const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:"Archi Agent: verifying Sequence / prose",cancellable:true},(_p,token)=>deps.runtime.startFlowVerification!({input:{format,text:text!,firstLine,...(editor?{fileName:path.basename(editor.document.fileName)}:{})},knowledgePack:source,...(interpreter?{interpreter}:{}),signal:withProfileCancellation({get aborted(){return token.isCancellationRequested;}})}));
  if(!("report" in result)||!result.session){await vscode.window.showWarningMessage(`Archi Agent: verification ${result.status}${"code" in result?` (${result.code})`:""}.`);return;}
  let outcome: {report:VerifyFlowReport}|undefined=result;
  const catalog=result.report.sourceProvenance.facts.filter(f=>f.table==="systems"||f.table==="actors").map(f=>({...f.value,provenance:f.provenance}));
  for(const mention of result.report.resolutions.filter(r=>r.status!=="resolved")) {
    const candidates=catalog.filter(e=>!mention.candidateIds.length||mention.candidateIds.includes(e.id));
    const chosen=await vscode.window.showQuickPick([{label:"Leave unresolved",id:""},...candidates.map(e=>({label:e.canonicalName,description:e.id,detail:`${e.kind} — ${e.provenance?.map(p=>p.location?`${p.location.file}:${p.location.line}`:p.reference?.uri??p.sourceId).join(", ")??"No local locator"}`,id:e.id}))],{title:`Archi Agent: confirm meaning of “${mention.mention}”`,ignoreFocusOut:true,matchOnDescription:true});
    if(!chosen||!chosen.id)continue;
    const current=currentSource();if(!current)return;
    const next=await result.session.resolveNames({expectedSnapshotDigest:result.report.snapshot.digest,decisions:[{mentionId:mention.mentionId,targetElementId:chosen.id,expectedSnapshotDigest:result.report.snapshot.digest,confirmed:true}],currentSource:current,signal:withProfileCancellation()});
    if(!("report" in next)){await vscode.window.showWarningMessage(`Archi Agent: ${next.status}; start verification again.`);return;}
    outcome=next;
  }
  assertProfileAvailable();
  const report=outcome!.report;
  const reportDoc=await vscode.workspace.openTextDocument({language:"json",content:JSON.stringify(serializeFlowVerificationForHost(report),null,2)+"\n"});
  await vscode.window.showTextDocument(reportDoc,{viewColumn:vscode.ViewColumn.Beside,preview:false,preserveFocus:true});
  const summary=`Archi Agent: ${report.assessment}; ${report.coverage.conformant}/${report.coverage.steps} steps confirmed, ${report.coverage.discrepant} discrepancies, ${report.coverage.unresolved} unresolved. Scope: Sequence / prose.`;
  deps.output.appendLine(summary);
  const current=currentSource();
  const aliasPlan=current?await result.session.prepareAliasSave(current,withProfileCancellation()):undefined;
  const choice=await vscode.window.showInformationMessage(summary,...(aliasPlan?.status==="prepared"?["Save confirmed aliases"]:[]));
  if(choice==="Save confirmed aliases"&&aliasPlan?.status==="prepared") {
    const saved=await saveVerificationAliases(result.session,aliasPlan.plan,currentSource);
    await vscode.window.showInformationMessage(`Archi Agent: aliases ${saved}.`);
  }
}
