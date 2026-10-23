import { confirmEnterpriseMaterials } from "../workbench/enterprise-materials.js";
import * as vscode from "vscode";
import { EnterpriseReviewSession, getDocumentConversionCapabilities, type EnterpriseMaterialInput, type EnterpriseMaterials, type EnterpriseProposal } from "../../../src/runtime/index.js";
import { withProfileSignal, assertProfileAvailable } from "../profile-availability.js";
import { documentGenerator } from "./document-generator.js";
import { openEnterpriseReview } from "../workbench/enterprise-review.js";
import type { GenerateCommandDependencies } from "./generate-sequence-diagram.js";

export { captureEnterpriseInput } from "./enterprise-input.js";
import { captureEnterpriseInput, type CapturedEnterpriseInput } from "./enterprise-input.js";
let active=false;
export async function buildEnterpriseCatalogCommand(deps:GenerateCommandDependencies,captured=captureEnterpriseInput(),onProposal?:(proposal:EnterpriseProposal)=>void,target:"capabilities"|"enterprise-views"="capabilities"):Promise<void>{
  if(active){await vscode.window.showWarningMessage("Archi Agent: enterprise catalog review already active.");return;}
  active=true;
  const pl=vscode.env.language.startsWith("pl"),t=(a:string,b:string)=>pl?a:b;
  try{
    const mode=await vscode.window.showQuickPick([{id:"extract" as const,label:t("Wyodrębnij z materiałów","Extract from materials"),detail:t("Tylko zdolności poparte materiałem; hierarchia może być propozycją.","Only material-supported capabilities; hierarchy may be proposed.")},
      {id:"propose" as const,label:t("Zaproponuj model firmy","Propose a company model"),detail:t("Uzupełnienia L1–L3 są propozycjami do przeglądu.","L1–L3 additions are proposals for review.")}],{title:t("Archi Agent: utwórz katalog zdolności biznesowych","Archi Agent: build business capability catalog")});
    if(!mode)return;
    const folders=vscode.workspace.workspaceFolders??[];
    const folder=folders.length>1?(await vscode.window.showQuickPick(folders.map(folder=>({label:folder.name,folder})),{title:"Archi Agent: catalog project"}))?.folder:folders[0];
    if(folders.length>1&&!folder)return;
    const source=await vscode.window.showQuickPick([
      ...(captured?.selection?[{id:"selection",label:t("Zaznaczenie — przechwycona wersja","Selection — captured version")}]:[]),
      ...(captured?[{id:"active",label:t("Cały aktywny dokument — przechwycona wersja","Whole active document — captured version")}]:[]),
      {id:"description",label:t("Wpisz opis firmy","Enter company description")},{id:"files",label:t("Wybierz lokalne dokumenty…","Choose local documents…")}],{title:t("Archi Agent: materiały katalogu","Archi Agent: catalog materials")});
    if(!source)return;
    let inputs:EnterpriseMaterialInput[];
    if(source.id==="active"||source.id==="selection")inputs=[(source.id==="active"?captured?.whole:captured?.selection)!];
    else if(source.id==="description"){
      const content=await vscode.window.showInputBox({title:t("Archi Agent: opis firmy","Archi Agent: company description"),prompt:t("Opisz działalność i oczekiwany zakres zdolności L1–L3.","Describe the business and intended L1–L3 capability scope."),ignoreFocusOut:true});
      if(!content?.trim())return;
      inputs=[{document:{kind:"editor-buffer",uri:"untitled:company-description",type:"txt",content},origin:{label:t("Opis użytkownika","User description"),startOffset:0,startLine:1,startColumn:1,locations:"user-description"}}];
    }else{
      let pdfOcrMode:"none"|"auto"|"all"="none";
      {
        const cap=await getDocumentConversionCapabilities();
        const choice=await vscode.window.showQuickPick(cap.profile==="core"?["none","auto"]:["none","auto","all"],{title:t("Archi Agent: polityka dla plików PDF — Core bez OCR, Full lokalnie","Archi Agent: policy for PDF files — Core has no OCR, Full is local")});
        if(!choice)return;pdfOcrMode=choice as typeof pdfOcrMode;
      }
      const uris=await vscode.window.showOpenDialog({title:t("Wybierz materiały katalogu","Choose catalog materials"),canSelectFiles:true,canSelectMany:true,canSelectFolders:false,filters:{Documents:["md","txt","pdf","docx","xlsx"]}});
      if(!uris?.length)return;if(uris.some(u=>u.scheme!=="file"))throw {code:"invalid-document-input"};
      inputs=uris.map(u=>({document:{path:u.fsPath,...(/\.pdf$/iu.test(u.fsPath)?{pdfOcrMode}:{})}}));
    }
    const materials=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:t("Archi Agent: przygotowanie materiałów","Archi Agent: preparing materials"),cancellable:true},async(_,token)=>{
      const controller=new AbortController(),sub=token.onCancellationRequested(()=>controller.abort());if(token.isCancellationRequested)controller.abort();
      try{return await deps.runtime.prepareEnterpriseMaterials!(inputs,withProfileSignal(controller.signal));}finally{sub.dispose();}
    });
    assertProfileAvailable();
    if(!await confirmEnterpriseMaterials(materialsPreview(materials,pl),pl))return;
    const outcome=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:t("Archi Agent: propozycje zdolności — jedno wywołanie","Archi Agent: capability proposals — one call"),cancellable:true},async(_,token)=>{
      const controller=new AbortController(),sub=token.onCancellationRequested(()=>controller.abort());if(token.isCancellationRequested)controller.abort();
      try{return await deps.runtime.extractEnterpriseCandidates!({materials,target,mode:mode.id,generator:documentGenerator(deps,folder?.uri,true),signal:withProfileSignal(controller.signal)});}finally{sub.dispose();}
    });
    assertProfileAvailable();if(outcome.status==="cancelled")return;
    if(outcome.status!=="success")throw outcome;
    if(onProposal)onProposal(outcome.result);else await openEnterpriseReview(new EnterpriseReviewSession(outcome.result),deps.results);
  }catch(e){const code=(e as {code?:unknown})?.code;if(code==="cancelled")return;await vscode.window.showErrorMessage(`Archi Agent: ${t("katalog nie został utworzony","catalog was not created")} [${typeof code==="string"&&/^[a-z0-9-]{1,64}$/.test(code)?code:"operation-failed"}]. ${t("Popraw materiały lub konfigurację i ponów jawnie.","Correct the materials or configuration and retry explicitly.")}`);}
  finally{active=false;}
}
export function materialsPreview(materials:EnterpriseMaterials,pl:boolean):string{
  return `${pl?"Materiały do wysłania — maksymalnie jedno wywołanie":"Materials to send — maximum one call"}\nCoverage: partial. No workspace harvesting.\n${materials.origins.map(o=>`${o.label} · ${o.locations} · line ${o.startLine}, column ${o.startColumn}${o.documentVersion!==undefined?` · version ${o.documentVersion}`:""}\n${o.sourceId}${o.documentSha256?`\nDocument SHA-256: ${o.documentSha256}`:""}`).join("\n")}\n\n`+
    materials.bundle.sources.map(s=>`=== ${s.sourceId} ===\nOriginal SHA-256: ${s.originalDigest}\nText SHA-256: ${s.textDigest}\nConversion: ${JSON.stringify(s.conversion)}\n\n${s.text}`).join("\n\n");
}
