import * as vscode from "vscode";
import { assertProfileAvailable, profileLifetimeSignal } from "../profile-availability.js";
import { workbenchHtml, plainMessage } from "./webview.js";

/** Scrollable, read-only preview of the exact frozen material. No editor-buffer edits can alter consent. */
export async function confirmEnterpriseMaterials(text:string,pl:boolean):Promise<boolean>{
  const panel=vscode.window.createWebviewPanel("archiAgent.enterpriseMaterials",pl?"Archi: materiały do wysłania":"Archi: Materials to Send",vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[]});
  const send=pl?"Wyślij materiały — maks. 1 wywołanie":"Send materials — max 1 call";
  panel.webview.html=workbenchHtml(pl?"Materiały do wysłania":"Materials to Send",`<p>${pl?"Przejrzyj cały tekst poniżej. Tylko te zamrożone treści trafią do skonfigurowanego modelu. Aby je zmienić, anuluj i rozpocznij ponownie.":"Review the full text below. Only this frozen material will go to the configured model. To change it, cancel and start again."}</p><p>${pl?"Maksymalnie 1 wywołanie, 16 384 tokeny wyjścia, 120 s ekstrakcji. Bez retry, napraw i fallbacku. Nadmiar materiału kończy się błędem.":"Maximum 1 call, 16,384 output tokens, 120 seconds for extraction. No retries, repairs or fallback. Oversized material fails."}</p><button id="send-materials">${send}</button><button id="cancel-materials">${pl?"Anuluj":"Cancel"}</button><pre id="material-text" tabindex="0"></pre>`,
    `const vscode=acquireVsCodeApi();const send=op=>vscode.postMessage({op,revision:0});document.getElementById('send-materials').onclick=()=>send('send-materials');document.getElementById('cancel-materials').onclick=()=>send('cancel');window.addEventListener('message',event=>{if(event.data?.type==='state')document.getElementById('material-text').textContent=event.data.text;});send('ready');`);
  let accepted=false;
  return new Promise<boolean>(resolve=>{
    const stop=()=>panel.dispose();profileLifetimeSignal.addEventListener("abort",stop,{once:true});
    const subscriptions=[panel.webview.onDidReceiveMessage(async(value:unknown)=>{
      if(!plainMessage(value,["ready","send-materials","cancel"]))return;
      if(value.op==="ready"){await panel.webview.postMessage({type:"state",revision:0,text,maxCalls:1,busy:false});return;}
      if(value.op==="send-materials"){try{assertProfileAvailable();accepted=true;}catch{/* No consent after profile invalidation. */}}
      panel.dispose();
    }),panel.onDidDispose(()=>{profileLifetimeSignal.removeEventListener("abort",stop);subscriptions.forEach(s=>s.dispose());resolve(accepted);})];
  });
}
