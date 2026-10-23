import {collectEnterpriseViewChange} from "./enterprise-view-input.js";
import * as vscode from "vscode";
import {captureEnterpriseUpdate,type EnterpriseUpdateSession,type EnterpriseUpdatePlan,type EnterpriseChange} from "../../../src/runtime/index.js";
import {assertProfileAvailable,withProfileCancellation,withProfileSignal} from "../profile-availability.js";
import {buildEnterpriseCatalogCommand} from "./build-enterprise-catalog.js";
import {captureEnterpriseInput,type CapturedEnterpriseInput} from "./enterprise-input.js";
import type {GenerateCommandDependencies} from "./generate-sequence-diagram.js";
import {generateCapabilityMapCommand} from "./generate-capability-map.js";
let active=false;
/** Native versioned edit/save. Foreign edits are never merged, overwritten or rolled back. */
export async function saveEnterpriseUpdate(session:EnterpriseUpdateSession,plan:EnterpriseUpdatePlan,document:vscode.TextDocument,expectedVersion:number):Promise<string>{
 const signal=withProfileCancellation(),matches=()=>!document.isDirty&&document.version===expectedVersion&&document.getText()===plan.expectedText&&document.uri.scheme==="file"&&document.uri.fsPath===plan.path;
 assertProfileAvailable();if(!matches())return "conflict";
 const chosen=await vscode.window.showInformationMessage(`Archi Agent: save reviewed catalog changes? Review report: ${plan.reportName}`,{modal:true},"Save catalog");if(chosen!=="Save catalog")return "cancelled";
 const check=await session.checkBase(signal);if(check.status!=="prepared")return check.status;
 if(!matches())return "conflict";
 const controller=new AbortController();
 await session.persistReview(plan,withProfileSignal(controller.signal));
 const editor=await vscode.window.showTextDocument(document,{preview:false});
 const again=await session.checkBase(signal);if(again.status!=="prepared")return again.status;
 if(!matches())return "conflict";assertProfileAvailable();
 const applied=await editor.edit(edit=>edit.replace(new vscode.Range(document.positionAt(0),document.positionAt(document.getText().length)),plan.proposedText));
 if(!applied||document.version!==expectedVersion+1||document.getText()!==plan.proposedText)return "conflict";
 // A disk change after applying our buffer still blocks native save.
 const last=await session.checkBase(signal);if(last.status!=="prepared")return last.status;
 if(document.version!==expectedVersion+1||document.getText()!==plan.proposedText)return "conflict";
 assertProfileAvailable();if(signal.aborted)return "cancelled";
 try{if(!await document.save())return "cancelled";}catch{return "failed";}
 if(document.isDirty||document.version!==expectedVersion+1||document.getText()!==plan.proposedText)return "conflict";
 return (await session.confirmSave(plan,signal)).status;
}
export async function updateEnterpriseCatalogCommand(deps:GenerateCommandDependencies,captured:CapturedEnterpriseInput|undefined=captureEnterpriseInput()):Promise<void>{
 if(active)return;active=true;const pl=vscode.env.language.startsWith("pl"),t=(a:string,b:string)=>pl?a:b;
 try{
  const picked=await vscode.window.showOpenDialog({title:t("Wybierz istniejący lokalny katalog enterprise","Choose an existing local enterprise catalog"),canSelectFiles:true,canSelectFolders:false,canSelectMany:false,filters:{"Enterprise catalog":["json"]}});if(!picked?.[0])return;if(picked[0].scheme!=="file")throw {code:"invalid-source"};
  const document=await vscode.workspace.openTextDocument(picked[0]),version=document.version;
  if(document.isDirty)throw {code:"dirty-catalog"};
  const session=await captureEnterpriseUpdate(picked[0].fsPath,withProfileCancellation());
  if(document.isDirty||document.version!==version||document.getText()!==session.expectedText)throw {code:"conflict"};
  const propose=(change:EnterpriseChange)=>session.propose(change);
  const input=async(title:string,value?:string)=>vscode.window.showInputBox({title,value,ignoreFocusOut:true});
  const cap=async()=>{const s=session.state(),records=s.proposed?.capabilities??s.base.capabilities;return (await vscode.window.showQuickPick(records.map(c=>({label:c.name,description:c.id,record:c})),{title:t("Wskaż zdolność","Choose capability"),ignoreFocusOut:true}))?.record;};
  while(true){
   const state=session.state();const choice=await vscode.window.showQuickPick([
    {id:"review",label:t("Przejrzyj różnice i decyzje","Review differences and decisions"),detail:state.issues.join("; ")},
    ...(state.proposalImported?[]:[{id:"materials",label:t("Nowe informacje z materiałów — maks. 1 wywołanie","New information from materials — max 1 call")}]),
    {id:"bind",label:t("Rozstrzygnij tożsamość propozycji","Resolve proposal identity")},
    {id:"add",label:t("Dodaj zdolność","Add capability")},{id:"edit",label:t("Zmień zdolność / rodzica / jawną ocenę","Change capability / parent / explicit rating")},
    {id:"delete",label:t("Zaproponuj usunięcie zdolności","Propose capability deletion")},
    {id:"application",label:t("Dodaj aplikację","Add application")},{id:"support",label:t("Dodaj jawne powiązanie aplikacji i zdolności","Add explicit application support")},
    {id:"remove-support",label:t("Usuń jawne powiązanie","Remove explicit support")},{id:"remove-application",label:t("Zaproponuj usunięcie aplikacji","Propose application deletion")},
    {id:"domain",label:t("Dodaj / zmień domenę biznesową","Add / change business domain")},
    {id:"stream",label:t("Dodaj / zmień strumień i jawną kolejność etapów","Add / change stream and explicit stage order")},
    {id:"application-fields",label:t("Zmień aplikację, właściciela, cykl życia lub ocenę","Change application, owner, lifecycle or rating")},
    {id:"scale",label:t("Zdefiniuj jawną skalę ocen","Define explicit rating scale")},
    {id:"delete-view",label:t("Usuń domenę lub strumień — bez kaskady","Delete domain or stream — no cascade")},
    ...(state.viewProposalImported?[]:[{id:"view-materials",label:t("Propozycje Value Stream / Landscape z materiałów","Value Stream / Landscape proposals from materials")}]),
    {id:"view-bind",label:t("Przejrzyj propozycję nowych widoków i wskaż ID","Review new view proposal and choose IDs")},
    {id:"warnings",label:t("Potwierdź przegląd ostrzeżeń","Acknowledge reviewed warnings")},
    {id:"save",label:t("Zatwierdź i zapisz katalog","Approve and save catalog"),detail:state.issues.length?state.issues.join("; "):t("Walidacja gotowa","Validation ready")},
    {id:"close",label:t("Zamknij bez zapisu katalogu","Close without saving catalog")}
   ],{title:t("Archi: aktualizacja katalogu — zamrożona baza","Archi: catalog update — frozen base"),ignoreFocusOut:true});if(!choice||choice.id==="close")return;
   try{
    if(["domain","stream","application-fields","scale"].includes(choice.id)){
      const change=await collectEnterpriseViewChange(session,choice.id==="application-fields"?"application":choice.id as "domain"|"stream"|"scale");if(change)propose(change);
    }else if(choice.id==="view-materials")await buildEnterpriseCatalogCommand(deps,captured,p=>session.importViewProposal(p),"enterprise-views");
    else if(choice.id==="view-bind"){
      const c=await vscode.window.showQuickPick(state.viewCandidates.filter(c=>!c.bound).map(c=>({label:c.key,detail:JSON.stringify({proposal:c.change,basis:c.basis,evidence:c.evidence}),record:c})),{title:t("Propozycja nie jest faktem — przejrzyj pola i dowody","Proposal is not a fact — inspect fields and evidence")});if(!c)continue;
      const doc=await vscode.workspace.openTextDocument({language:"json",content:JSON.stringify(c.record,null,2)});await vscode.window.showTextDocument(doc,{preview:false});
      const action=await vscode.window.showQuickPick(["Review and bind IDs","Reject proposal"],{title:t("Jawna decyzja","Explicit decision")});if(!action)continue;
      if(action==="Reject proposal")session.bindViewCandidate(c.record.id,undefined);
      else{const seed=c.record.change,kind=seed.kind==="set-domain"?"domain":seed.kind==="set-value-stream"?"stream":seed.kind==="set-scale"?"scale":"application",change=await collectEnterpriseViewChange(session,kind,seed);if(change)session.bindViewCandidate(c.record.id,change);}
    }else if(choice.id==="delete-view"){
      const cat=state.proposed??state.base;if(cat.schemaVersion!==3)continue;
      const record=await vscode.window.showQuickPick([...cat.domains.map(d=>({label:d.name,description:d.id,action:"delete-domain" as const,id:d.id})),...cat.valueStreams.map(v=>({label:v.name,description:v.id,action:"delete-value-stream" as const,id:v.id}))],{title:t("Usunięcie wymaga rozwiązania zależności","Deletion requires resolving dependencies")});if(record)propose({kind:record.action,id:record.id});
    }else if(choice.id==="review"){
      const before=await vscode.workspace.openTextDocument({language:"json",content:session.expectedText}),after=await vscode.workspace.openTextDocument({language:"json",content:JSON.stringify(state.proposed??{issues:state.issues},null,2)});
      await vscode.commands.executeCommand("vscode.diff",before.uri,after.uri,t("Archi: zmiany katalogu (podgląd)","Archi: catalog changes (preview)"));
      const report=await vscode.workspace.openTextDocument({language:"json",content:JSON.stringify(state,null,2)});await vscode.window.showTextDocument(report,{preview:false});
      const selected=await vscode.window.showQuickPick(state.entries.map(e=>({label:`${e.differences.join(", ")} · ${"id"in e.change?e.change.id:JSON.stringify(e.change)}`,description:`${e.operationId} · ${e.decision}`,detail:JSON.stringify({before:e.before,after:e.change,dependencies:e.dependencies}),entry:e})),{title:t("Wskaż zmianę — obejrzyj przed/po i zależności","Choose change — inspect before/after and dependencies"),ignoreFocusOut:true});if(!selected)continue;
      const decision=await vscode.window.showQuickPick(["accepted","rejected","pending"],{title:t("Jawna decyzja dla wybranej zmiany","Explicit decision for selected change"),ignoreFocusOut:true});if(decision)session.decide(selected.entry.operationId,decision as "accepted"|"rejected"|"pending");
    }else if(choice.id==="materials"){if(state.proposalImported)throw {code:"proposal-already-imported"};await buildEnterpriseCatalogCommand(deps,captured,p=>session.importProposal(p));}
    else if(choice.id==="bind"){
      const c=await vscode.window.showQuickPick(state.candidates.filter(c=>!c.boundTo).map(c=>({label:c.name,description:c.id,detail:JSON.stringify({suggestedTargets:c.suggestedTargets,original:c}),candidate:c})),{title:t("Propozycja — nazwa nie potwierdza tożsamości","Proposal — a name does not confirm identity")});if(!c)continue;
      const target=await vscode.window.showQuickPick([{label:t("Nowa zdolność (osobne ID)","New capability (separate ID)"),action:"new" as const},{label:t("Odrzuć propozycję","Reject proposal"),action:"reject" as const},...state.base.capabilities.map(b=>({label:b.name,description:b.id,id:b.id,action:"existing" as const}))],{title:t("Potwierdź konkretny cel","Confirm specific target")});if(!target)continue;
      if(target.action==="new"){const id=await input("Stable capability ID");if(id)session.bindCandidate(c.candidate.id,{kind:"new",id});}else session.bindCandidate(c.candidate.id,target.action==="reject"?{kind:"reject"}:{kind:"existing",id:target.id!});
    }else if(choice.id==="add"){
      const id=await input("Stable capability ID"),name=id&&await input(t("Nazwa zdolności","Capability name")),description=name&&await input(t("Opis zdolności","Capability description"));if(id&&name&&description)propose({kind:"add-capability",id,name,description});
    }else if(choice.id==="edit"){
      const c=await cap();if(!c)continue;const field=await vscode.window.showQuickPick(["name","description","parentId","rating"],{title:t("Pole do zmiany","Field to change")});if(!field)continue;
      if(field==="parentId"){const parent=await vscode.window.showQuickPick([{label:"L1",id:""},...(state.proposed??state.base).capabilities.filter(v=>v.id!==c.id).map(v=>({label:v.name,description:v.id,id:v.id}))],{title:t("Nowy rodzic","New parent")});if(parent)propose({kind:"patch-capability",id:c.id,changes:{parentId:parent.id||null}});}
      else if(field==="rating"){const scale=await vscode.window.showQuickPick(state.base.scales.map(s=>({label:s.name,description:s.id,scale:s})),{title:t("Jawna skala","Explicit scale")});if(!scale)continue;const value=await vscode.window.showQuickPick([{label:t("Nieznana — usuń ocenę","Unknown — remove rating"),value:null as number|null},...scale.scale.levels.map(l=>({label:`${l.value}: ${l.label}`,value:l.value}))],{title:t("Jawna ocena — bez agregacji","Explicit rating — no aggregation")});if(value){const ratings={...c.ratings};if(value.value===null)delete ratings[scale.scale.id];else ratings[scale.scale.id]=value.value;propose({kind:"patch-capability",id:c.id,changes:{ratings}});}}
      else{const value=await input(field,c[field as "name"|"description"]);if(value)propose({kind:"patch-capability",id:c.id,changes:{[field]:value}});}
    }else if(choice.id==="delete"){const c=await cap();if(c)propose({kind:"delete-capability",id:c.id});}
    else if(choice.id==="application"){
      const id=await input("Stable application ID"),name=id&&await input(t("Nazwa aplikacji","Application name"));if(id&&name)propose({kind:"add-application",id,name});
    }else if(choice.id==="support"||choice.id==="remove-application"){
      const cat=state.proposed??state.base;if(cat.schemaVersion===1)throw {code:"applications-not-provided"};
      const app=await vscode.window.showQuickPick(cat.applications.map(a=>({label:a.name,description:a.id,record:a})),{title:t("Wskaż aplikację","Choose application")});if(!app)continue;
      if(choice.id==="remove-application")propose({kind:"delete-application",id:app.record.id});else{const c=await cap();if(c)propose({kind:"add-support",applicationId:app.record.id,capabilityId:c.id});}
    }else if(choice.id==="remove-support"){
      const cat=state.proposed??state.base;if(cat.schemaVersion===1)continue;const link=await vscode.window.showQuickPick(cat.supports.map(r=>({label:`${r.applicationId} → ${r.capabilityId}`,record:r})),{title:t("Jawne powiązanie do usunięcia","Explicit link to remove")});if(link)propose({kind:"delete-support",applicationId:link.record.applicationId,capabilityId:link.record.capabilityId});
    }else if(choice.id==="warnings"){
      const doc=await vscode.workspace.openTextDocument({content:JSON.stringify({warnings:state.warnings,proposal:state.candidates},null,2)});await vscode.window.showTextDocument(doc,{preview:false});
      if(await vscode.window.showInformationMessage(t("Potwierdź przegląd ostrzeżeń i dowodów","Confirm warnings and evidence review"),{modal:true},"Reviewed")==="Reviewed")session.acknowledgeWarnings();
    }else if(choice.id==="save"){
      const plan=session.prepareSave(),outcome=await saveEnterpriseUpdate(session,plan,document,version);
      await vscode.window.showInformationMessage(`Archi Agent: ${outcome}. ${outcome==="saved"?t("Katalog ponownie odczytany i zwalidowany.","Catalog reread and validated."):t("Zachowano sesję i cudze zmiany. Rozwiąż konflikt i rozpocznij nową sesję.","Session and foreign changes retained. Resolve conflict and start a new session.")}`);
      if(outcome==="saved"){const map=await vscode.window.showQuickPick(["Capability Map","Capability–Application Map","Close"],{title:"Archi Agent"});if(map&&map!=="Close")await generateCapabilityMapCommand(deps.results,undefined,{kind:"enterprise-json",path:plan.path},map==="Capability–Application Map");return;}
    }
   }catch(e){const code=e&&typeof e==="object"&&"code"in e&&typeof e.code==="string"?e.code:"operation-failed";await vscode.window.showWarningMessage(`Archi Agent: ${/^[a-z0-9-]+$/.test(code)?code:"operation-failed"}. ${t("Sprawdź różnice, decyzje i zależności.","Inspect differences, decisions and dependencies.")}`);}
  }
 }catch(e){const code=e&&typeof e==="object"&&"code"in e&&typeof e.code==="string"?e.code:"operation-failed";await vscode.window.showWarningMessage(`Archi Agent: ${/^[a-z0-9-]+$/.test(code)?code:"operation-failed"}. ${t("Wymagany czysty lokalny katalog; zapisz lub odrzuć zmiany i rozpocznij nową sesję.","A clean local catalog is required; save or discard changes and start a new session.")}`);}
 finally{active=false;}
}
