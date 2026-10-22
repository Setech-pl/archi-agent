import {enterpriseViewCandidatesPrompt,enterpriseViewCandidatesJsonSchema,validateEnterpriseViewCandidates} from "../core/enterprise/enterprise-view-candidates.js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {pathToFileURL} from "node:url";
import { readFile } from "node:fs/promises";
import { prepareDocumentBundle } from "./document-source-bundle.js";
import type { DocumentInput, DocumentExtractionOptions } from "./extract-document-candidates.js";
import type { GeneratorConfig } from "./runtime-types.js";
import { documentCandidateLimits, documentEvidenceSlices, candidateCanonical, type DocumentSourceBundle } from "../core/knowledge-pack/builder/document-candidates.js";
import { enterpriseCandidatesPrompt, enterpriseCandidatesJsonSchema, validateEnterpriseCandidates, enterpriseProposalDigest, proposalCatalog,
  type EnterpriseProposal, type EnterpriseBuildMode, type EnterpriseCandidateOrigin } from "../core/enterprise/enterprise-candidates.js";
import { EnterpriseError, deepFreeze, type EnterpriseCatalog } from "../core/enterprise/enterprise-catalog.js";
import { safeErrorCode, type StructuredChatClient } from "../core/llm/structured-chat-client.js";
import { createExclusiveArtifactFiles, type StarterPackCreateOptions } from "./knowledge-pack-onboarding.js";
import { loadEnterpriseJson, parseEnterpriseText } from "../node/enterprise-json-source.js";

export interface EnterpriseMaterialInput {
  readonly document: DocumentInput;
  readonly origin?: Omit<EnterpriseCandidateOrigin,"sourceId">;
}
export interface EnterpriseMaterials {
  readonly bundle: DocumentSourceBundle;
  readonly origins: readonly EnterpriseCandidateOrigin[];
  readonly maxCalls: 1;
}
const preparedMaterials=new WeakSet<EnterpriseMaterials>();
export async function prepareEnterpriseMaterials(inputs:readonly EnterpriseMaterialInput[],signal:AbortSignal,options:DocumentExtractionOptions={}):Promise<EnterpriseMaterials>{
  // Capture caller-owned objects synchronously before reading/converting any material.
  const own=structuredClone(inputs);
  const controller=new AbortController(),abort=()=>controller.abort();
  signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;abort();},documentCandidateLimits.operationMs);
  try{
    const origins:EnterpriseCandidateOrigin[]=[];
    const bundle=await prepareDocumentBundle(own.map(i=>i.document),{...options,signal:controller.signal,preserveText:true,onSource:(s,d)=>{
      if("kind" in d){
        const input=own.find(i=>"kind" in i.document&&i.document.uri===d.uri);
        if(!input?.origin)throw new EnterpriseError("input-origin-required");
        origins.push({...input.origin,sourceId:s.sourceId});
      }else origins.push({sourceId:s.sourceId,label:path.basename(d.path),uri:pathToFileURL(d.path).href,
        startOffset:0,startLine:1,startColumn:1,locations:s.conversion.engine==="utf8"?"captured-document":"converted-text"});
    }});
    const materials=deepFreeze({bundle,origins,maxCalls:1 as const});preparedMaterials.add(materials);return materials;
  } catch(e){if(timedOut)throw new EnterpriseError("timeout");throw e;}
  finally {clearTimeout(timer);signal.removeEventListener("abort",abort);}
}
export interface ExtractEnterpriseCandidatesRequest {
  readonly target?:"capabilities"|"enterprise-views";
  readonly materials:EnterpriseMaterials;
  readonly mode:EnterpriseBuildMode;
  readonly generator:GeneratorConfig|((signal:AbortSignal)=>Promise<GeneratorConfig|undefined>);
  readonly signal?:AbortSignal;
  readonly timeoutMs?:number;
}
export type ExtractEnterpriseCandidatesOutcome={readonly status:"success";readonly result:EnterpriseProposal;readonly logicalRequests:1}|
  {readonly status:"failed"|"cancelled";readonly code:string;readonly logicalRequests:0|1};
export async function extractEnterpriseCandidates(request:ExtractEnterpriseCandidatesRequest,resolve:(signal:AbortSignal)=>Promise<{ok:true;client:StructuredChatClient}|{ok:false;issues:readonly {code:string}[]}>):Promise<ExtractEnterpriseCandidatesOutcome>{
  let calls:0|1=0,timedOut=false;
  const controller=new AbortController(),abort=()=>controller.abort();
  request.signal?.addEventListener("abort",abort,{once:true});if(request.signal?.aborted)abort();
  const duration=request.timeoutMs??120000;
  const timer=setTimeout(()=>{timedOut=true;abort();},Math.max(1,Math.min(duration,120000)));
  const check=()=>{if(controller.signal.aborted)throw new EnterpriseError(timedOut?"timeout":"cancelled");};
  let stop:()=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(new EnterpriseError(timedOut?"timeout":"cancelled"));controller.signal.addEventListener("abort",stop,{once:true});});
  try{
    check();
    if(!preparedMaterials.has(request.materials)||!["extract","propose"].includes(request.mode)||!Number.isSafeInteger(duration)||duration<1||duration>120000)throw new EnterpriseError("invalid-request");
    if(request.target!==undefined&&!["capabilities","enterprise-views"].includes(request.target))throw new EnterpriseError("invalid-request");
    const views=request.target==="enterprise-views",materials=request.materials;
    const messages=[{role:"system" as const,content:views?enterpriseViewCandidatesPrompt:enterpriseCandidatesPrompt},{role:"user" as const,content:candidateCanonical({mode:request.mode,
      sources:materials.bundle.sources.map(({editorUri:_uri,...s})=>({...s,evidenceSlices:documentEvidenceSlices(s.text)}))})}];
    if(Buffer.byteLength(candidateCanonical(messages))>documentCandidateLimits.requestBytes)throw new EnterpriseError("request-too-large");
    const resolved=await Promise.race([resolve(controller.signal),aborted]);check();
    if(!resolved.ok)throw new EnterpriseError(resolved.issues[0]?.code??"generator-unavailable");
    calls=1;
    const answer=await Promise.race([resolved.client.complete({messages,schemaName:views?"archi_enterprise_view_candidates_v1":"archi_enterprise_candidates_v1",schema:views?enterpriseViewCandidatesJsonSchema:enterpriseCandidatesJsonSchema,maxTokens:16384,signal:controller.signal}),aborted]);
    check();
    const result=(views?validateEnterpriseViewCandidates:validateEnterpriseCandidates)(answer.value,materials.bundle,materials.origins,request.mode,randomUUID());check();
    return {status:"success",result,logicalRequests:1};
  }catch(e){const code=controller.signal.aborted?timedOut?"timeout":"cancelled":safeErrorCode(e)??"enterprise-extraction-failed";return {status:code==="cancelled"?"cancelled":"failed",code,logicalRequests:calls};}
  finally{clearTimeout(timer);controller.signal.removeEventListener("abort",stop);request.signal?.removeEventListener("abort",abort);}
}
export type EnterpriseDecision="pending"|"accepted"|"rejected";
export class EnterpriseReviewSession {
  readonly result:EnterpriseProposal;
  private entries:{id:string;name:string;description:string;parentId:string|null;decision:EnterpriseDecision;editedFields:string[]}[];
  private revision=0;
  private warningsReviewed=false;
  private completed=false;
  private busy=false;
  constructor(result:EnterpriseProposal){
    this.result=deepFreeze(structuredClone(result));
    this.entries=result.candidates.map(c=>({id:c.id,name:c.name,description:c.description,parentId:c.parentId,decision:"pending",editedFields:[]}));
  }
  state(){
    const issues:string[]=[];
    const materialWarnings=this.result.bundle.sources.flatMap(source=>source.conversion.warnings.map(warning=>({sourceId:source.sourceId,warning})));
    if(this.entries.some(e=>e.decision==="pending"))issues.push("pending-decisions");
    if(!this.entries.some(e=>e.decision==="accepted"))issues.push("empty-catalog");
    if((this.result.warnings.length||materialWarnings.length)&&!this.warningsReviewed)issues.push("review-source-warnings");
    try{this.catalog("Reviewed capabilities","Selected materials");}catch(e){issues.push(...(e instanceof EnterpriseError&&e.issues.length?e.issues.map(i=>`${i.code}: /${i.path.join("/")}`):[safeErrorCode(e)??"invalid-catalog"]));}
    return deepFreeze({revision:this.revision,entries:structuredClone(this.entries),issues:[...new Set(issues)],completed:this.completed,warningsReviewed:this.warningsReviewed,materialWarnings});
  }
  private available(){if(this.busy||this.completed)throw new EnterpriseError("session-unavailable");}
  decide(ids:readonly string[],decision:EnterpriseDecision){
    this.available();const selected=new Set(ids);
    if(!ids.length||selected.size!==ids.length||ids.some(id=>!this.entries.some(e=>e.id===id))||!["pending","accepted","rejected"].includes(decision))throw new EnterpriseError("invalid-selection");
    if(decision==="rejected"&&this.entries.some(e=>e.parentId&&selected.has(e.parentId)&&!selected.has(e.id)&&e.decision!=="rejected"))throw new EnterpriseError("retained-children");
    for(const entry of this.entries)if(selected.has(entry.id))entry.decision=decision;
    this.revision++;return this.state();
  }
  edit(id:string,changes:{name?:string;description?:string;parentId?:string|null}){
    this.available();const index=this.entries.findIndex(e=>e.id===id),entry=this.entries[index];
    if(!entry||!Object.keys(changes).length||Object.keys(changes).some(k=>!["name","description","parentId"].includes(k)))throw new EnterpriseError("invalid-edit");
    const next={...entry,...changes};
    if(next.parentId&&this.entries.find(e=>e.id===next.parentId)?.decision==="rejected")throw new EnterpriseError("parent-rejected");
    const rows=this.entries.map(e=>e.id===id?next:e);
    proposalCatalog(this.result.sessionId,rows,"Review","Selected materials","unreviewed");
    for(const field of ["name","description","parentId"] as const)if(field in changes&&changes[field]!==entry[field])next.editedFields=[...new Set([...next.editedFields,`/${field}`])];
    this.entries[index]=next;this.revision++;return this.state();
  }
  acknowledgeWarnings(){this.available();this.warningsReviewed=true;this.revision++;return this.state();}
  private catalog(name:string,scope:string,version="unreviewed"){return proposalCatalog(this.result.sessionId,this.entries.filter(e=>e.decision==="accepted"),name,scope,version);}
  async save(directory:string,name:string,scope:string,options:StarterPackCreateOptions={}){
    this.available();if(this.state().issues.length)throw new EnterpriseError("invalid-draft");this.busy=true;
    try{
      // Report preserves original claims/evidence separately from current user decisions and fields.
      const reportBase={format:"archi-agent-enterprise-review/1",version:1,session:this.result,revision:this.revision,decisions:structuredClone(this.entries),warningsReviewed:this.warningsReviewed,materialWarnings:this.state().materialWarnings,
        scope:{name,description:scope,coverage:"partial"},limitations:["Evidence locations are verified, semantic relevance requires user review.","Acceptance is a user decision, never new source confirmation.","No ratings inferred; no claim of complete material or organization coverage."],approvedAt:new Date().toISOString()};
      const digest=enterpriseProposalDigest(reportBase),report={...reportBase,digest};
      const catalog=this.catalog(name,scope,digest),text=JSON.stringify(catalog,null,2)+"\n",reportText=JSON.stringify(report,null,2)+"\n";
      parseEnterpriseText(text,"enterprise.json",options.signal);
      const file=path.join(directory,"enterprise.json");
      await createExclusiveArtifactFiles(directory,["enterprise.json","enterprise.review.json"],[text,reportText],{...options,verify:async()=>{
        await options.verify?.();const loaded=await loadEnterpriseJson({kind:"enterprise-json",path:file},options.signal);
        if(candidateCanonical(loaded.catalog)!==candidateCanonical(parseEnterpriseText(text,"enterprise.json").catalog)||await readFile(file,"utf8")!==text||await readFile(path.join(directory,"enterprise.review.json"),"utf8")!==reportText)throw new EnterpriseError("saved-bytes-mismatch");
      }});
      this.completed=true;return {status:"saved" as const,path:file,catalog};
    }finally{this.busy=false;}
  }
}
