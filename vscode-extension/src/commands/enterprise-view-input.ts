import * as vscode from "vscode";
import type {EnterpriseChange,EnterpriseUpdateSession} from "../../../src/runtime/index.js";
/** Small guided native forms; current stable identities are always an explicit user choice. */
export async function collectEnterpriseViewChange(session:EnterpriseUpdateSession,kind:"domain"|"stream"|"application"|"scale",seed?:EnterpriseChange):Promise<EnterpriseChange|undefined>{
 const pl=vscode.env.language.startsWith("pl"),t=(a:string,b:string)=>pl?a:b,cat=session.state().proposed??session.base;
 const input=(title:string,value?:string)=>vscode.window.showInputBox({title,value,ignoreFocusOut:true});
 if(kind==="domain"){
  const domains=cat.schemaVersion===3?cat.domains:[],pick=await vscode.window.showQuickPick([{label:t("Nowa domena","New domain"),id:null as string|null},...domains.map(d=>({label:d.name,description:d.id,id:d.id}))],{title:t("Jawnie wskaż tożsamość domeny","Explicitly choose domain identity")});if(!pick)return;
  const id=pick.id??await input("Stable domain ID",seed?.kind==="set-domain"?seed.id:undefined);if(!id)return;
  const name=await input(t("Nazwa domeny","Domain name"),seed?.kind==="set-domain"?seed.name:domains.find(d=>d.id===id)?.name);return name?{kind:"set-domain",id,name}:undefined;
 }
 if(kind==="scale"){
  const id=await input("Stable scale ID",seed?.kind==="set-scale"?seed.id:undefined);if(!id)return;
  const name=await input(t("Nazwa jawnej skali","Explicit scale name"),seed?.kind==="set-scale"?seed.name:undefined);if(!name)return;
  const levels:{value:number;label:string}[]=[];
  for(let i=0;i<7;i++){
   const value=await input(t("Wartość poziomu 0–100 (rosnąco)","Level value 0–100 (ascending)"),seed?.kind==="set-scale"?String(seed.levels[i]?.value??""):undefined);if(value===undefined)return;if(!/^\d{1,3}$/.test(value)||Number(value)>100||levels.some(l=>l.value>=Number(value)))throw {code:"scale-levels-invalid"};
   const label=await input(t("Znaczenie poziomu","Level meaning"),seed?.kind==="set-scale"?seed.levels[i]?.label:undefined);if(!label)return;levels.push({value:Number(value),label});
   if(levels.length>=2&&await vscode.window.showQuickPick([t("Zakończ skalę","Finish scale"),t("Dodaj poziom","Add level")],{title:t("Jawna definicja skali","Explicit scale definition")})!==t("Dodaj poziom","Add level"))break;
  }return {kind:"set-scale",id,name,levels};
 }
 if(kind==="application"){
  const apps=cat.schemaVersion!==1?cat.applications:[],a=await vscode.window.showQuickPick([{label:t("Nowa aplikacja","New application"),id:null as string|null},...apps.map(a=>({label:a.name,description:a.id,id:a.id}))],{title:t("Jawnie wskaż tożsamość aplikacji","Explicitly choose application identity")});if(!a)return;
  if(!a.id){const id=await input("Stable application ID",seed&&"id"in seed?seed.id:undefined),name=id&&await input(t("Nazwa aplikacji","Application name"),seed?.kind==="add-application"?seed.name:undefined);return id&&name?{kind:"add-application",id,name}:undefined;}
  const field=await vscode.window.showQuickPick(["name","description","domainId","owner","lifecycle","ratings"],{title:t("Jawne pole aplikacji","Explicit application field")});if(!field)return;
  if(field==="domainId"){
   const d=await vscode.window.showQuickPick([{label:t("Nieznana domena","Unknown domain"),id:null as string|null},...(cat.schemaVersion===3?cat.domains:[]).map(d=>({label:d.name,description:d.id,id:d.id}))],{title:t("Domena biznesowa","Business domain")});return d?{kind:"patch-application",id:a.id,changes:{domainId:d.id}}:undefined;
  }
  if(field==="lifecycle"){const value=await vscode.window.showQuickPick(["unknown","planned","active","retiring","retired"],{title:t("Jawny cykl życia","Explicit lifecycle")});return value?{kind:"patch-application",id:a.id,changes:{lifecycle:value==="unknown"?null:value as "active"}}:undefined;}
  if(field==="ratings"){
   const scale=await vscode.window.showQuickPick(cat.scales.map(s=>({label:s.name,description:s.id,record:s})),{title:t("Wybierz zdefiniowaną skalę","Choose a defined scale")});if(!scale)return;
   const level=await vscode.window.showQuickPick([{label:t("Nieznana ocena","Unknown rating"),value:null as number|null},...scale.record.levels.map(l=>({label:`${l.value}: ${l.label}`,value:l.value}))],{title:t("Jawna ocena — zero też jest oceną","Explicit rating — zero is a rating")});if(!level)return;
   const original=cat.schemaVersion===3?cat.applications.find(x=>x.id===a.id):undefined,ratings={...original?.ratings};if(level.value===null)delete ratings[scale.record.id];else ratings[scale.record.id]=level.value;
   return {kind:"patch-application",id:a.id,changes:{ratings}};
  }
  const suggestion=seed?.kind==="patch-application"?seed.changes[field as keyof typeof seed.changes]:undefined,value=await input(field,typeof suggestion==="string"?suggestion:undefined);if(value===undefined)return;
  return {kind:"patch-application",id:a.id,changes:{[field]:value||null}};
 }
 const streams=cat.schemaVersion===3?cat.valueStreams:[],picked=await vscode.window.showQuickPick([{label:t("Nowy strumień","New stream"),id:null as string|null},...streams.map(v=>({label:v.name,description:v.id,id:v.id}))],{title:t("Jawnie wskaż tożsamość strumienia","Explicitly choose stream identity")});if(!picked)return;
 const initial=seed?.kind==="set-value-stream"?seed.stream:streams.find(v=>v.id===picked.id);
 const id=picked.id??await input("Stable stream ID",initial?.id);if(!id)return;
 const name=await input(t("Nazwa strumienia","Stream name"),initial?.name),context=name&&await input(t("Odbiorca wartości lub jawny kontekst","Value recipient or explicit context"),initial?.context);if(!name||!context)return;
 const outcome=await input(t("Oczekiwany rezultat — opcjonalnie","Expected outcome — optional"),initial?.outcome);if(outcome===undefined)return;
 const stages:Extract<EnterpriseChange,{kind:"set-value-stream"}>["stream"]["stages"]=[];
 // Every stage and mapping is reviewed, even when a model proposed it.
 for(let i=0;i<100;i++){
  const original=initial?.stages[i],stageId=await input(t("Stabilne ID etapu — w jawnej kolejności","Stable stage ID — in declared order"),original?.id);if(!stageId)return;
  const stageName=await input(t("Nazwa etapu","Stage name"),original?.name);if(!stageName)return;
  const stageOutcome=await input(t("Rezultat etapu — opcjonalnie","Stage outcome — optional"),original?.outcome);if(stageOutcome===undefined)return;
  const caps=await vscode.window.showQuickPick(cat.capabilities.map(c=>({label:c.name,description:c.id,id:c.id,picked:original?.capabilityIds.includes(c.id)??false})),{title:t("Jawne powiązania etapu — wiele zdolności jest dozwolone","Explicit stage mappings — multiple capabilities allowed"),canPickMany:true,ignoreFocusOut:true});if(!caps)return;
  stages.push({id:stageId,name:stageName,...(stageOutcome?{outcome:stageOutcome}:{}),capabilityIds:caps.map(c=>c.id)});
  const next=await vscode.window.showQuickPick([{label:t("Dodaj następny etap","Add next stage"),id:"add"},{label:t("Przejrzyj i zatwierdź kolejność","Review and confirm order"),id:"finish"}],{title:stages.map((s,i)=>`${i+1}. ${s.name} (${s.id})`).join(" → ")});if(!next)return;if(next.id==="finish")break;
 }
 if(await vscode.window.showInformationMessage(t("Zatwierdź jawną kolejność etapów (decyzja użytkownika): ","Confirm explicit stage order (user decision): ")+stages.map((s,i)=>`${i+1}. ${s.name} (${s.id})`).join(" → "),{modal:true},"Confirm order")!=="Confirm order")return;
 return {kind:"set-value-stream",stream:{id,name,context,...(outcome?{outcome}:{}),stages}};
}
