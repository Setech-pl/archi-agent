import path from "node:path";
import * as vscode from "vscode";
import { EnterpriseReviewSession, type EnterpriseDecision } from "../../../src/runtime/index.js";
import { workbenchHtml, plainMessage } from "./webview.js";
import { withProfileSignal, profileLifetimeSignal, assertProfileAvailable } from "../profile-availability.js";
import { generateCapabilityMapCommand } from "../commands/generate-capability-map.js";
import type { OpenDiagramResults } from "../commands/save-diagram-and-report.js";

export async function openEnterpriseReview(session:EnterpriseReviewSession,results?:OpenDiagramResults):Promise<void>{
  const pl=vscode.env.language.startsWith("pl"),t=(a:string,b:string)=>pl?a:b;
  const panel=vscode.window.createWebviewPanel("archiAgent.enterpriseReview",t("Archi: przegląd zdolności biznesowych","Archi: Business Capability Review"),vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[]});
  panel.webview.html=enterpriseReviewHtml(pl);
  let closed=false,busy=false,directory="",saved="",errorText="";
  const controller=new AbortController();let finish!:()=>void;const done=new Promise<void>(r=>finish=r);
  const publish=async(error?:string)=>{if(error!==undefined)errorText=error;if(!closed)await panel.webview.postMessage({type:"state",...session.state(),originals:session.result.candidates,origins:session.result.origins,materials:session.result.bundle.sources.map(({text:_text,...source})=>source),warnings:session.result.warnings,mode:session.result.mode,busy,directory,saved,error:errorText});};
  const receive=async(value:unknown)=>{
    if(closed||!plainMessage(value,["ready","decide","edit","warnings","destination","save-catalog","map","cancel"]))return;
    const m=value;
    if(m.op==="cancel"){controller.abort();panel.dispose();return;}
    if(m.op==="ready"){await publish();return;}
    if(busy)return;
    busy=true;errorText="";
    try{
      assertProfileAvailable();const state=session.state();
      if(m.revision!==state.revision)throw {code:"stale-review"};
      if(saved&&m.op!=="map")return;
      if(m.op==="decide"){
        if(!Array.isArray(m.indices)||m.indices.some(i=>!Number.isSafeInteger(i)||!state.entries[i])||!["accepted","rejected","pending"].includes(String(m.decision)))throw {code:"invalid-selection"};
        session.decide(m.indices.map(i=>state.entries[i]!.id),m.decision as EnterpriseDecision);
      }else if(m.op==="edit"){
        if(!Number.isSafeInteger(m.index)||!state.entries[m.index as number]||!m.changes||typeof m.changes!=="object"||Array.isArray(m.changes)||Object.values(m.changes).some(v=>typeof v!=="string"||v.length>4000))throw {code:"invalid-edit"};
        const changes=m.changes as Record<string,string>;
        session.edit(state.entries[m.index as number]!.id,{...changes,...("parentId" in changes?{parentId:changes.parentId||null}:{})});
      }else if(m.op==="warnings")session.acknowledgeWarnings();
      else if(m.op==="destination"){
        const selected=await vscode.window.showOpenDialog({title:t("Wybierz folder dla nowego enterprise.json i raportu","Choose folder for new enterprise.json and review report"),canSelectFiles:false,canSelectFolders:true,canSelectMany:false});
        if(closed||!selected?.[0])return;
        if(selected[0].scheme!=="file")throw {code:"invalid-location"};
        const target=selected[0].fsPath,install=path.resolve(__dirname,"..");
        if(target===install||target.startsWith(install+path.sep))throw {code:"invalid-location"};
        directory=target;
      }else if(m.op==="save-catalog"){
        if(!directory||typeof m.name!=="string"||typeof m.scope!=="string")throw {code:"invalid-location"};
        await publish();if(closed)return;
        const result=await session.save(directory,m.name,m.scope,{signal:withProfileSignal(controller.signal)});
        saved=result.path;finish();
      }else if(m.op==="map"){
        if(!saved)throw {code:"catalog-not-saved"};
        await generateCapabilityMapCommand(results,undefined,{kind:"enterprise-json",path:saved});
      }
    }catch(e){const code=(e as {code?:unknown})?.code;await publish(`${t("Operacja zablokowana","Operation blocked")} [${typeof code==="string"&&/^[a-z0-9-]+$/.test(code)?code:"operation-failed"}]. ${t("Popraw błędy; odrzucenie rodzica wymaga odrzucenia lub jawnego przeniesienia dzieci.","Resolve errors; rejecting a parent requires rejecting or explicitly moving its children.")}`);}
    finally{busy=false;await publish();}
  };
  const stop=()=>{controller.abort();panel.dispose();};profileLifetimeSignal.addEventListener("abort",stop,{once:true});
  const subscriptions=[panel.webview.onDidReceiveMessage(receive),panel.onDidDispose(()=>{closed=true;controller.abort();profileLifetimeSignal.removeEventListener("abort",stop);subscriptions.forEach(s=>s.dispose());finish();})];
  await done;
}
export function enterpriseReviewHtml(pl:boolean):string{
  const labels=pl?{title:"Przegląd zdolności biznesowych",accept:"Akceptuj zaznaczone",reject:"Odrzuć zaznaczone",pending:"Oznacz do przeglądu",all:"Zaznacz wszystkie",warnings:"Potwierdzam przegląd ostrzeżeń",destination:"Wybierz folder zapisu",save:"Zapisz nowy katalog",map:"Wygeneruj Capability Map",cancel:"Zamknij",name:"Nazwa katalogu",scope:"Zakres katalogu (pokrycie: partial)",edit:"Zastosuj edycję",root:"Korzeń L1",fieldName:"Nazwa",fieldDescription:"Opis",fieldParent:"Rodzic",userDecision:"Decyzja użytkownika",original:"oryginał",supported:"Poparcie w materiale (do przeglądu)",proposed:"Propozycja modelu",accepted:"zaakceptowana",rejected:"odrzucona",pendingState:"do przeglądu",evidence:"Oryginalna propozycja, dowody i decyzje użytkownika"}:
    {title:"Business Capability Review",accept:"Accept selected",reject:"Reject selected",pending:"Mark pending",all:"Select all",warnings:"I reviewed the warnings",destination:"Choose save folder",save:"Save new catalog",map:"Generate Capability Map",cancel:"Close",name:"Catalog name",scope:"Catalog scope (coverage: partial)",edit:"Apply edit",root:"L1 root",fieldName:"Name",fieldDescription:"Description",fieldParent:"Parent",userDecision:"User decision",original:"original",supported:"Material support (requires review)",proposed:"Model proposal",accepted:"accepted",rejected:"rejected",pendingState:"pending",evidence:"Original proposal, evidence and user decisions"};
  return workbenchHtml(labels.title,`<p>${pl?"Zweryfikowano lokalizacje cytatów; znaczenie wymaga Twojego przeglądu. Akceptacja i edycja to decyzje użytkownika, nie potwierdzenie w źródle. Oceny pozostają nieznane.":"Quote locations were checked; semantic relevance requires your review. Acceptance and edits are user decisions, not source confirmation. Ratings remain unknown."}</p>
<p id="status" role="status"></p><p id="error" class="error" role="alert"></p><pre id="issues"></pre><pre id="warnings"></pre><details><summary>${pl?"Materiały i lokalizacje":"Materials and locations"}</summary><pre id="origins"></pre></details>
<label>${labels.name}<input id="name" value="${pl?"Zdolności biznesowe":"Business capabilities"}"></label><label>${labels.scope}<input id="scope" value="${pl?"Wybrane materiały i zatwierdzone propozycje":"Selected materials and approved proposals"}"></label>
<div id="actions">${["all","accept","reject","pending","warnings","destination","save","map","cancel"].map(id=>`<button id="${id==="warnings"?"ack":id}">${labels[id as keyof typeof labels]}</button>`).join("")}</div><p id="destination-path"></p><div id="rows"></div>`,String.raw`
const labels=${JSON.stringify(labels)},vscode=acquireVsCodeApi(),$=id=>document.getElementById(id);let state={revision:0},selected=new Set();
const send=(op,extra={})=>vscode.postMessage({op,revision:state.revision,...extra});
$('all').onclick=()=>{selected=new Set(state.entries.map((_,i)=>i));render();};
for(const [id,decision] of [['accept','accepted'],['reject','rejected'],['pending','pending']])$(id).onclick=()=>send('decide',{indices:[...selected],decision});
$('ack').onclick=()=>send('warnings');$('destination').onclick=()=>send('destination');$('save').onclick=()=>send('save-catalog',{name:$('name').value,scope:$('scope').value});$('map').onclick=()=>send('map');$('cancel').onclick=()=>send('cancel');
function render(){const m=state; $('status').textContent=m.saved?'Saved: '+m.saved:'Mode: '+m.mode+' · Coverage: partial';$('error').textContent=m.error||'';$('issues').textContent=(m.issues||[]).join('\n');$('warnings').textContent=[...(m.warnings||[]),...(m.materialWarnings||[]).map(w=>{const origin=m.origins.find(o=>o.sourceId===w.sourceId);return 'Conversion · '+(origin?.label||w.sourceId)+': '+w.warning;})].join('\n');$('origins').textContent=JSON.stringify({origins:m.origins,materials:m.materials},null,2);$('destination-path').textContent=m.directory?m.directory+'/enterprise.json + enterprise.review.json':'';
for(const id of ['all','accept','reject','pending','ack','destination','save'])$(id).disabled=!!m.busy||!!m.saved;
$('save').disabled||=!m.directory||m.issues.length>0;$('map').disabled=!!m.busy||!m.saved;$('rows').replaceChildren();
const rows=m.entries.map((entry,index)=>({entry,index})),ordered=[];const walk=(parent,level)=>{for(const row of rows.filter(r=>r.entry.parentId===parent)){ordered.push({...row,level});walk(row.entry.id,level+1);}};walk(null,1);
for(const {entry:e,index,level} of ordered){const card=document.createElement('section');card.className='card';card.style.marginLeft=((level-1)*20)+'px';const title=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(index);check.onchange=()=>check.checked?selected.add(index):selected.delete(index);title.append(check,document.createTextNode(' L'+level+' · '+e.name+' · '+e.id+' · '+(e.decision==='pending'?labels.pendingState:labels[e.decision])));card.append(title);
const description=document.createElement('p');description.textContent=e.description;card.append(description);const origin=document.createElement('p');origin.textContent=Object.entries(state.originals[index].basis).map(([f,b])=>(f==='name'?labels.fieldName:f==='description'?labels.fieldDescription:labels.fieldParent)+': '+(e.editedFields.includes('/'+(f==='parent'?'parentId':f))?labels.userDecision+' ('+labels.original+': '+(b==='source-supported'?labels.supported:labels.proposed)+')':(b==='source-supported'?labels.supported:labels.proposed))).join(' · ');card.append(origin);
const details=document.createElement('details'),summary=document.createElement('summary'),original=document.createElement('pre');summary.textContent=labels.evidence;original.textContent=JSON.stringify({original:state.originals[index],decision:e.decision,editedFields:e.editedFields},null,2);details.append(summary,original);card.append(details);
const editor=document.createElement('details'),editSummary=document.createElement('summary');editSummary.textContent=labels.edit;editor.append(editSummary);const fields={};
for(const key of ['name','description','parentId']){const l=document.createElement('label');l.textContent=key==='name'?labels.fieldName:key==='description'?labels.fieldDescription:labels.fieldParent;const input=document.createElement(key==='parentId'?'select':'input');input.setAttribute('aria-label',key+' '+e.id);if(key==='parentId'){for(const item of [{id:'',name:labels.root},...m.entries.filter(v=>v.id!==e.id&&v.decision!=='rejected')]){const o=document.createElement('option');o.value=item.id;o.textContent=item.name+(item.id?' ('+item.id+')':'');input.append(o);}}input.value=e[key]||'';input.disabled=!!m.busy||!!m.saved;fields[key]=input;l.append(input);editor.append(l);}
const apply=document.createElement('button');apply.textContent=labels.edit;apply.disabled=!!m.busy||!!m.saved;apply.onclick=()=>send('edit',{index,changes:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value]))});editor.append(apply);card.append(editor);$('rows').append(card);}}
window.addEventListener('message',event=>{if(event.data?.type!=='state')return;state=event.data;render();});send('ready');
`);
}
