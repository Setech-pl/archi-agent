import path from "node:path";
import * as vscode from "vscode";
import { generateCapabilityMap, inspectEnterpriseSource, type CapabilityMapSelection,type EnterpriseSourceConfig,type EnterpriseTextSource } from "../../../src/runtime/index.js";
import {configuredEnterpriseSource} from "../settings.js";
import { assertProfileAvailable, withProfileCancellation } from "../profile-availability.js";
import { OpenDiagramResults, saveDiagramAction, saveDiagramAndReportCommand } from "./save-diagram-and-report.js";

/** Capture before the diagram picker can yield; never substitute another editor for a non-text tab. */
export function captureActiveEnterpriseSource():EnterpriseTextSource|undefined {
  const editor=vscode.window.activeTextEditor, tab=vscode.window.tabGroups?.activeTabGroup.activeTab;
  if(!editor||!["file","untitled"].includes(editor.document.uri.scheme))return;
  if(tab&&(!(tab.input instanceof vscode.TabInputText)||tab.input.uri.toString()!==editor.document.uri.toString()))return;
  return Object.freeze({kind:"enterprise-text",name:path.basename(editor.document.fileName),text:editor.document.getText()});
}
/** Native editor collection only. This path never reads provider settings or SecretStorage. */
export async function generateCapabilityMapCommand(results?:OpenDiagramResults,activeSource?:EnterpriseTextSource, forcedSource?:EnterpriseSourceConfig):Promise<void> {
  const pl=vscode.env.language.toLowerCase().startsWith("pl");
  const folders=vscode.workspace.workspaceFolders?.length?vscode.workspace.workspaceFolders:forcedSource?.kind==="enterprise-json"?[{uri:vscode.Uri.file(path.dirname(forcedSource.path)),name:"Saved catalog"}]:undefined;
  if(!folders?.length) {await vscode.window.showInformationMessage(pl ? "Archi Agent: otwórz lokalny folder projektu i wybierz katalog enterprise.json." : "Archi Agent: open a local project folder, then select an enterprise.json catalog.");return;}
  const project=folders.length===1?folders[0]:(await vscode.window.showQuickPick(folders.map(folder=>({label:folder.name,description:folder.uri.fsPath,folder})),
    {title:"Archi Agent: capability project",ignoreFocusOut:true}))?.folder;
  if(!project)return;
  if(project.uri.scheme!=="file") {await vscode.window.showWarningMessage("Archi Agent: Capability Map requires a local project and enterprise.json catalog.");return;}
  let source:EnterpriseSourceConfig|undefined=forcedSource;
  let explicitLocal=false;
  if(activeSource&&!forcedSource){
    const choice=await vscode.window.showQuickPick([
      {label:pl?"Aktywny dokument — także niezapisane zmiany":"Active document — including unsaved changes",description:activeSource.name,id:"active-document"},
      {label:"Local enterprise.json…",id:"local"},
      {label:pl?"Skonfigurowane źródło MCP":"Configured MCP source",id:"mcp"}
    ],{title:"Archi Agent: capability source",ignoreFocusOut:true});
    if(!choice)return;
    if(choice.id==="active-document")source=activeSource;
    explicitLocal=choice.id==="local";
  }
  if(!source&&!explicitLocal){
    try{source=configuredEnterpriseSource(vscode.workspace.getConfiguration("archiAgent",project.uri));}
    catch(e){await vscode.window.showWarningMessage(`Archi Agent: ${e instanceof Error?e.message:"enterprise-source-invalid"}. ${pl?"Ustaw źródło enterprise oraz zaufany knowledgeServer w ustawieniach użytkownika.":"Configure enterpriseSource and a trusted knowledgeServer in User settings."}`);return;}
    if(activeSource&&!source){await vscode.window.showWarningMessage("Archi Agent: configure enterpriseSource and a trusted knowledgeServer in User settings.");return;}
  }
  if(source?.kind==="mcp"&&!activeSource&&!forcedSource){
    const choice=await vscode.window.showQuickPick([{label:`${pl?"Skonfigurowane źródło MCP":"Configured MCP source"}: ${source.sourceId}`,id:"mcp"},
      {label:"Local enterprise.json…",id:"local"}],{title:"Archi Agent: capability source",ignoreFocusOut:true});
    if(!choice)return;if(choice.id==="local")source=undefined;
  }
  if(!source){
   const picked=await vscode.window.showOpenDialog({title:pl ? "Wybierz enterprise.json — katalog zdolności biznesowych" : "Select enterprise.json — a business capability catalog",
    canSelectFiles:true,canSelectFolders:false,canSelectMany:false,filters:{"Enterprise catalog":["json"]},
    defaultUri:vscode.Uri.file(path.join(project.uri.fsPath,"architecture","enterprise.json"))});
  if(!picked?.[0])return;
  if(picked[0].scheme!=="file") {await vscode.window.showWarningMessage("Archi Agent: select a local enterprise.json file. Software architecture sources do not supply business capabilities.");return;}
   source={kind:"enterprise-json",path:picked[0].fsPath};
  }
  const selectedSource=source;
  const inspected=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:"Archi Agent: validating enterprise catalog",cancellable:true},
    (_progress,token)=>inspectEnterpriseSource(selectedSource,withProfileCancellation({get aborted(){return token.isCancellationRequested;}})));
  const showFailure=async(f:{code:string;issues:readonly {code:string;path:readonly (string|number)[];location?:{line:number}}[];count?:number})=>{
    if(f.code==="cancelled")return;
    const issue=f.issues[0], detail=issue?` ${issue.code}: /${issue.path.join("/")}${issue.location?` (line ${issue.location.line})`:""}.`:"";
    const next=f.code==="map-too-large" ? ` Visible capabilities: ${f.count??"over limit"}. Select fewer L1 branches or L1/L2 detail.` :
      f.code==="stale-source" ? " The catalog changed. Repeat Create Diagram and scope selection." :
      f.code==="enterprise-unsupported"||f.code==="enterprise-version-unsupported"?" The configured knowledge server does not support get_enterprise_snapshot v1. No fallback was used.":
      selectedSource.kind==="mcp"?" Check the configured MCP enterprise source and its catalog. No fallback was used.":" Select a valid enterprise.json business catalog; software sources cannot supply these capabilities.";
    await vscode.window.showWarningMessage(`Archi Agent: ${f.code}.${detail}${selectedSource.kind==="enterprise-text"?" Correct the active document, then repeat Create Diagram. The captured buffer was not replaced with a disk or MCP source.":next}`);
  };
  if(inspected.status!=="success") {await showFailure(inspected);return;}
  const {snapshot}=inspected;
  if(!snapshot.catalog.capabilities.length) {await showFailure({code:snapshot.catalog.source.scope.coverage==="not-provided"?"enterprise-data-unavailable":"empty-scope",issues:[]});return;}
  const roots=snapshot.hierarchy.filter(h=>h.level===1);
  const root=await vscode.window.showQuickPick([{label:pl?"Cała mapa":"Whole map",description:snapshot.catalog.source.scope.coverage,id:null as string|null},
    ...roots.map(h=>({label:snapshot.catalog.capabilities.find(c=>c.id===h.id)!.name,description:h.id,
      detail:`${snapshot.catalog.source.scope.coverage}; ${snapshot.hierarchy.filter(v=>v.rootId===h.id).length} capabilities`,id:h.id}))],
    {title:"Archi Agent: capability scope",placeHolder:pl?"Cała mapa lub gałąź L1":"Whole map or one L1 branch",ignoreFocusOut:true});
  if(!root)return;
  const level=await vscode.window.showQuickPick([1,2,3].map(value=>({label:`L1${value===1?"":`–L${value}`}`,value:value as 1|2|3})),
    {title:"Archi Agent: capability detail",ignoreFocusOut:true});
  if(!level)return;
  const color=await vscode.window.showQuickPick([{label:pl?"Bez kolorowania ocen":"No rating colors",id:null as string|null},
    ...snapshot.catalog.scales.map(s=>({label:s.name,description:s.id,id:s.id}))],{title:"Archi Agent: capability colors",ignoreFocusOut:true});
  if(!color)return;
  const selection:CapabilityMapSelection={rootIds:root.id?[root.id]:[],maxLevel:level.value,colorBy:color.id?{kind:"rating",scaleId:color.id}:{kind:"none"},
    language:pl?"pl":"en",expectedCatalogDigest:snapshot.catalogDigest};
  const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:"Archi Agent: creating Capability Map",cancellable:true},
    (_progress,token)=>generateCapabilityMap({source:selectedSource,selection},withProfileCancellation({get aborted(){return token.isCancellationRequested;}})));
  if(result.status!=="success") {await showFailure(result);return;}
  assertProfileAvailable();
  const languages=await vscode.languages.getLanguages();
  const diagram=await vscode.workspace.openTextDocument({language:languages.includes("plantuml")?"plantuml":"plaintext",content:result.plantUml});
  const report=await vscode.workspace.openTextDocument({language:"json",content:JSON.stringify(result.report,null,2)+"\n"});
  assertProfileAvailable();
  results?.remember(result.artifact,[diagram,report]);
  await vscode.window.showTextDocument(diagram,{viewColumn:vscode.ViewColumn.Active,preview:false});
  await vscode.window.showTextDocument(report,{viewColumn:vscode.ViewColumn.Beside,preview:false,preserveFocus:true});
  const action=await vscode.window.showInformationMessage(pl?"Archi Agent: mapa zdolności i raport gotowe. Wywołania LLM: 0." : "Archi Agent: Capability Map and report ready. Model calls: 0.",...(results?[saveDiagramAction]:[]));
  if(action===saveDiagramAction && results)await saveDiagramAndReportCommand(results,result.artifact);
}
