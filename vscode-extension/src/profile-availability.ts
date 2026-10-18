import * as vscode from"vscode";
const ids=["setech-pl.archi-agent","setech-pl.archi-agent-core"]as const;
let blocked=false;
const lifetime=new AbortController();
export const profileLifetimeSignal=lifetime.signal;
export function profileConflict():boolean{
  if(!blocked&&vscode.extensions?.getExtension(ids[0])&&vscode.extensions?.getExtension(ids[1])){blocked=true;lifetime.abort();}
  return blocked;
}
export function assertProfileAvailable():void{if(profileConflict())throw Object.assign(new Error("profile-conflict"),{code:"profile-conflict"});}
export function withProfileSignal(signal?:AbortSignal):AbortSignal{return signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal;}
export function withProfileCancellation(signal?:{readonly aborted:boolean}){return{get aborted(){return profileConflict()||!!signal?.aborted;}};}
export function showProfileConflict():void{void vscode.window.showErrorMessage("Archi Agent: both setech-pl.archi-agent (Full) and setech-pl.archi-agent-core are enabled. Operations are blocked. Disable one extension yourself, then Reload Window. Settings remain shared; API keys belong to each extension ID.");}
