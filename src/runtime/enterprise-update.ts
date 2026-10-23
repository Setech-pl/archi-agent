import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {readBoundedTextFile} from "../node/bounded-file-reader.js";
import {canonicalDirectory} from "../node/local-file-path.js";
import {loadEnterpriseJson,parseEnterpriseText} from "../node/enterprise-json-source.js";
import {EnterpriseError,deepFreeze,validateEnterpriseCatalog,type EnterpriseCatalog,type Capability,type EnterpriseCatalogV3,type EnterpriseCatalogV2} from "../core/enterprise/enterprise-catalog.js";
import {enterpriseProposalDigest,type EnterpriseProposal} from "../core/enterprise/enterprise-candidates.js";
import {createExclusiveArtifactFiles} from "./knowledge-pack-onboarding.js";
import type {CancellationSignal} from "./runtime-types.js";
import {canonicalSerialize,type CanonicalValue} from "../core/util/stable-digest.js";
const canonical=(v:unknown)=>canonicalSerialize(v as CanonicalValue);
async function boundedText(file:string,maxBytes:number,signal?:CancellationSignal){const root=await canonicalDirectory(path.dirname(file));return (await readBoundedTextFile(root,path.basename(file),{maxBytes,signal})).text;}
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
type Patch={name?:string;description?:string;parentId?:string|null;ratings?:Record<string,number>};
type StreamInput=Omit<EnterpriseCatalogV3["valueStreams"][number],"provenance"|"stages">&{stages:Omit<EnterpriseCatalogV3["valueStreams"][number]["stages"][number],"provenance">[]};
export type EnterpriseChange =
 {kind:"set-domain";id:string;name:string} |
 {kind:"delete-domain";id:string} |
 {kind:"set-value-stream";stream:StreamInput} |
 {kind:"delete-value-stream";id:string} |
 {kind:"set-scale";id:string;name:string;levels:{value:number;label:string}[]} |
 {kind:"patch-application";id:string;changes:{name?:string;description?:string|null;domainId?:string|null;owner?:string|null;lifecycle?:"planned"|"active"|"retiring"|"retired"|null;ratings?:Record<string,number>}} |
 {kind:"add-capability";id:string;name:string;description:string;parentId?:string} |
 {kind:"patch-capability";id:string;changes:Patch} |
 {kind:"delete-capability";id:string} |
 {kind:"add-application";id:string;name:string;description?:string} |
 {kind:"delete-application";id:string} |
 {kind:"add-support";applicationId:string;capabilityId:string} |
 {kind:"delete-support";applicationId:string;capabilityId:string};
export type EnterpriseCandidateBinding={kind:"existing";id:string}|{kind:"new";id:string}|{kind:"reject"};
export type UpdateDecision="pending"|"accepted"|"rejected";
type Entry={operationId:string;change:EnterpriseChange;decision:UpdateDecision;origin:"user-decision"|"reviewed-model-proposal";candidateId?:string};
export interface EnterpriseUpdatePlan {readonly id:string;readonly revision:number;readonly path:string;readonly sourceId:string;readonly expectedText:string;readonly proposedText:string;readonly baseFingerprint:string;readonly catalogDigest:string;readonly reportName:string;readonly reportText:string;}
/** Frozen base; never rebases, replaces with LLM output, or writes the catalog itself. */
export class EnterpriseUpdateSession {
 private entries:Entry[]=[];private revision=0;private completed=false;private plan?:EnterpriseUpdatePlan;private reportPersisted=false;
 private viewProposal?:EnterpriseProposal;private viewBindings=new Set<string>();
 private proposal?:EnterpriseProposal;private bindings=new Map<string,{kind:"bound";id:string}|{kind:"rejected"}>();private warningsReviewed=false;
 readonly sessionId=randomUUID();readonly base:EnterpriseCatalog;readonly baseFingerprint:string;readonly catalogDigest:string;
 private constructor(readonly path:string,readonly expectedText:string){const s=parseEnterpriseText(expectedText,pathModuleName(path));this.base=s.catalog;this.baseFingerprint=s.evidence.sourceBytesSha256;this.catalogDigest=s.catalogDigest;}
 static async capture(file:string,signal?:CancellationSignal){
   const loaded=await loadEnterpriseJson({kind:"enterprise-json",path:file},signal),text=await boundedText(file,1024*1024,signal);
   if(signal?.aborted)throw new EnterpriseError("cancelled");if(hash(text)!==loaded.evidence.sourceBytesSha256)throw new EnterpriseError("conflict");
   return new EnterpriseUpdateSession(file,text);
 }
 private available(){if(this.completed)throw new EnterpriseError("session-unavailable");}
 propose(change:EnterpriseChange,origin:Entry["origin"]="user-decision",candidateId?:string){
   this.available();if(this.entries.length>=1000)throw new EnterpriseError("too-large");
   const allowed:Record<EnterpriseChange["kind"],string[]>={"set-domain":["kind","id","name"],"delete-domain":["kind","id"],"set-value-stream":["kind","stream"],"delete-value-stream":["kind","id"],"set-scale":["kind","id","name","levels"],"patch-application":["kind","id","changes"],"add-capability":["kind","id","name","description","parentId"],"patch-capability":["kind","id","changes"],"delete-capability":["kind","id"],"add-application":["kind","id","name","description"],"delete-application":["kind","id"],"add-support":["kind","applicationId","capabilityId"],"delete-support":["kind","applicationId","capabilityId"]};
   if(!change||!allowed[change.kind]||Object.keys(change).some(k=>!allowed[change.kind].includes(k)))throw new EnterpriseError("invalid-change");
   if(change.kind==="patch-capability"&&(!change.changes||!Object.keys(change.changes).length||Object.keys(change.changes).some(k=>!["name","description","parentId","ratings"].includes(k))))throw new EnterpriseError("invalid-change");
   if(change.kind==="patch-application"&&(!change.changes||!Object.keys(change.changes).length||Object.keys(change.changes).some(k=>!["name","description","domainId","owner","lifecycle","ratings"].includes(k))))throw new EnterpriseError("invalid-change");
   const operationId=`change-${String(this.entries.length+1).padStart(4,"0")}`;
   this.entries.push({operationId,change:structuredClone(change),decision:"pending",origin,...(candidateId?{candidateId}:{})});this.revision++;this.plan=undefined;return operationId;
 }
 decide(operationId:string,decision:UpdateDecision){this.available();const e=this.entries.find(e=>e.operationId===operationId);if(!e||!["accepted","rejected","pending"].includes(decision))throw new EnterpriseError("invalid-selection");e.decision=decision;this.revision++;this.plan=undefined;}
 importProposal(proposal:EnterpriseProposal){this.available();if(this.proposal)throw new EnterpriseError("proposal-already-imported");this.proposal=deepFreeze(structuredClone(proposal));this.warningsReviewed=false;this.revision++;}
 candidates(){return deepFreeze((this.proposal?.candidates??[]).map(c=>({...c,boundTo:this.bindings.get(c.id)??null,suggestedTargets:this.base.capabilities.filter(b=>b.name===c.name).map(b=>b.id)})));}
 /** The target is chosen by the user, never inferred from a name or temporary candidate ID. */
 bindCandidate(candidateId:string,target:EnterpriseCandidateBinding){
   this.available();const c=this.proposal?.candidates.find(c=>c.id===candidateId);if(!c||this.bindings.has(c.id))throw new EnterpriseError("invalid-selection");
   if(target.kind==="reject"){this.bindings.set(c.id,{kind:"rejected"});this.revision++;return;}
   const parentBinding=c.parentId?this.bindings.get(c.parentId):undefined;
   if(c.parentId&&(!parentBinding||parentBinding.kind==="rejected"))throw new EnterpriseError("parent-binding-required");
   const parent=parentBinding?.kind==="bound"?parentBinding.id:undefined,id=target.id;
   if(target.kind==="existing"&&!this.base.capabilities.some(b=>b.id===id))throw new EnterpriseError("target-missing");
   this.propose(target.kind==="existing"?{kind:"patch-capability",id,changes:{name:c.name,description:c.description,parentId:parent??null}}:{kind:"add-capability",id,name:c.name,description:c.description,...(parent?{parentId:parent}:{})},"reviewed-model-proposal",c.id);
   this.bindings.set(c.id,{kind:"bound",id});
 }
 importViewProposal(proposal:EnterpriseProposal){this.available();if(this.viewProposal||!proposal.viewCandidates)throw new EnterpriseError("proposal-already-imported");this.viewProposal=deepFreeze(structuredClone(proposal));this.warningsReviewed=false;this.revision++;}
 bindViewCandidate(candidateId:string,change:EnterpriseChange|undefined){this.available();if(!this.viewProposal?.viewCandidates?.some(c=>c.id===candidateId)||this.viewBindings.has(candidateId))throw new EnterpriseError("invalid-selection");if(change)this.propose(change,"reviewed-model-proposal",candidateId);this.viewBindings.add(candidateId);this.revision++;}
 acknowledgeWarnings(){this.available();this.warningsReviewed=true;this.revision++;}
 private compose(version:string){
   let catalog=structuredClone(this.base);const conflicts:string[]=[],writes=new Map<string,string>();
   const mark=(key:string,value:unknown)=>{const encoded=canonical(value);if(writes.has(key)&&writes.get(key)!==encoded)conflicts.push(`conflict:${key}`);writes.set(key,encoded);};
   const proof=(fields:string[],recordId:string)=>({sourceId:catalog.source.id,recordId,fields,reference:{uri:`urn:archi-agent:enterprise-update:${this.sessionId}`,version,fragment:recordId}});
   const touch=(record:{provenance:Capability["provenance"]},fields:string[],present:string[],recordId:string)=>{
     record.provenance=record.provenance.map(p=>({...p,fields:p.fields.filter(f=>!fields.includes(f))})).filter(p=>p.fields.length);
     if(present.length)record.provenance.push(proof(present,recordId));
   };
   const upgrade=():EnterpriseCatalogV2|EnterpriseCatalogV3=>{if(catalog.schemaVersion===1)catalog={...catalog,schemaVersion:2,format:"archi-agent-enterprise/2",applications:[],supports:[],supportScope:{description:"User reviewed application support",applications:"partial",relationships:"partial"}};return catalog;};
   const upgradeViews=():EnterpriseCatalogV3=>{
     const cat=upgrade();if(cat.schemaVersion===3)return cat;
     catalog={...cat,schemaVersion:3,format:"archi-agent-enterprise/3",domains:[],valueStreams:[],
       valueStreamScope:{description:"User reviewed value streams",streams:"partial",relationships:"partial"},landscapeScope:{description:"User reviewed application landscape",domains:"partial",attributes:"partial"}};return catalog;
   };
   for(const entry of this.entries.filter(e=>e.decision==="accepted")){
     const c=entry.change,key="id"in c?c.id:c.kind==="set-value-stream"?c.stream.id:JSON.stringify([c.applicationId,c.capabilityId]);
     if(c.kind==="set-scale"){
       mark(`scale:${c.id}`,c);const current=catalog.scales.find(x=>x.id===c.id);const record:EnterpriseCatalog["scales"][number]={id:c.id,name:c.name,levels:structuredClone(c.levels),provenance:[proof(["/name","/levels"],entry.operationId)]};
       if(current){
         const changed=["/name","/levels"].filter(f=>canonical(current[f.slice(1) as "name"|"levels"])!==canonical(record[f.slice(1) as "name"|"levels"]));
         record.provenance=structuredClone(current.provenance);touch(record,changed,changed,entry.operationId);catalog.scales[catalog.scales.indexOf(current)]=record;
       }else catalog.scales.push(record);continue;
     }
     if(c.kind==="set-domain"||c.kind==="delete-domain"){
       const cat=upgradeViews();mark(`domain:${c.id}`,c);const current=cat.domains.find(x=>x.id===c.id);
       if(c.kind==="delete-domain"){if(!current)throw new EnterpriseError("target-missing");cat.domains=cat.domains.filter(x=>x.id!==c.id);}
       else if(!current)cat.domains.push({id:c.id,name:c.name,provenance:[proof(["/name"],entry.operationId)]});
       else if(current.name!==c.name){current.name=c.name;touch(current,["/name"],["/name"],entry.operationId);}
       if(c.kind==="set-domain"&&cat.landscapeScope.domains==="not-provided")cat.landscapeScope.domains="partial";continue;
     }
     if(c.kind==="set-value-stream"||c.kind==="delete-value-stream"){
       const cat=upgradeViews();mark(`stream:${key}`,c);const current=cat.valueStreams.find(x=>x.id===key);
       if(c.kind==="delete-value-stream"){if(!current)throw new EnterpriseError("target-missing");cat.valueStreams=cat.valueStreams.filter(x=>x.id!==c.id);}
       else{
         // Stable IDs identify records; changed fields point at this review, unchanged fields keep their evidence.
         const supplied={...structuredClone(c.stream),stages:c.stream.stages.map(stage=>({...structuredClone(stage),provenance:[proof(["/name","/capabilityIds",...(stage.outcome!==undefined?["/outcome"]:[])],entry.operationId)]})),provenance:[proof(["/name","/context","/stages",...(c.stream.outcome!==undefined?["/outcome"]:[])],entry.operationId)]};
         const preserve=(next:{provenance:Capability["provenance"]},old:{provenance:Capability["provenance"]},fields:string[],get:(v:unknown,key:string)=>unknown)=>{const changed=fields.filter(f=>canonical(get(next,f)??null)!==canonical(get(old,f)??null));next.provenance=structuredClone(old.provenance);touch(next,fields.filter(f=>changed.includes(f)),changed.filter(f=>get(next,f)!==undefined),entry.operationId);};
         if(current){
           for(const stage of supplied.stages){const old=current.stages.find(x=>x.id===stage.id);if(old)preserve(stage,old,["/name","/outcome","/capabilityIds"],(v,k)=>(v as Record<string,unknown>)[k.slice(1)]);}
           preserve(supplied,current,["/name","/context","/outcome","/stages"],(v,k)=>k==="/stages"?(v as typeof supplied).stages.map(x=>x.id):(v as Record<string,unknown>)[k.slice(1)]);
           cat.valueStreams[cat.valueStreams.indexOf(current)]=supplied;
         }else cat.valueStreams.push(supplied);
         if(cat.valueStreamScope.streams==="not-provided")cat.valueStreamScope.streams="partial";
         if(c.stream.stages.some(s=>s.capabilityIds.length)&&cat.valueStreamScope.relationships==="not-provided")cat.valueStreamScope.relationships="partial";
       }continue;
     }
     if(c.kind==="patch-application"){
       const cat=upgradeViews(),record=cat.applications.find(a=>a.id===c.id);if(!record)throw new EnterpriseError("target-missing");
       for(const [field,value] of Object.entries(c.changes)){
         mark(`application:${c.id}:${field}`,value);const previous=(record as Record<string,unknown>)[field];if(canonical(previous??null)===canonical(value))continue;
         if(field==="ratings"){
           const ratings=value as Record<string,number>,keys=[...new Set([...Object.keys(record.ratings??{}),...Object.keys(ratings)])],changed=keys.filter(k=>record.ratings?.[k]!==ratings[k]).map(k=>`/ratings/${k}`);
           record.ratings=structuredClone(ratings);touch(record,changed,changed.filter(f=>Object.hasOwn(ratings,f.slice(9))),entry.operationId);
         }else{if(value===null)delete (record as Record<string,unknown>)[field];else (record as Record<string,unknown>)[field]=value;touch(record,[`/${field}`],value===null?[]:[`/${field}`],entry.operationId);}
       }
       if(record.domainId&&cat.landscapeScope.domains==="not-provided")cat.landscapeScope.domains="partial";
       if(cat.landscapeScope.attributes==="not-provided"&&(record.owner!==undefined||record.lifecycle!==undefined||Object.keys(record.ratings??{}).length))cat.landscapeScope.attributes="partial";continue;
     }
     if(c.kind==="add-capability"){
       mark(`capability:${key}`,c);if(catalog.capabilities.some(v=>v.id===c.id))throw new EnterpriseError("duplicate-capability-id");
       const {kind:_kind,...record}=c;catalog.capabilities.push({...record,provenance:[proof(["/name","/description",...(c.parentId?["/parentId"]:[])],entry.operationId)]});
     }else if(c.kind==="patch-capability"){
       const record=catalog.capabilities.find(v=>v.id===c.id);if(!record)throw new EnterpriseError("target-missing");
       for(const [field,value] of Object.entries(c.changes)){
         if(field!=="ratings")mark(`capability:${c.id}:${field}`,value);const old=record[field as keyof Capability];
         if(canonical(old??null)===canonical(value))continue;
         if(field==="parentId"){if(value===null)delete record.parentId;else record.parentId=value as string;touch(record,["/parentId"],value?["/parentId"]:[],entry.operationId);}
         else if(field==="ratings"){
           const ratings=value as Record<string,number>;const keys=[...new Set([...Object.keys(record.ratings??{}),...Object.keys(ratings)])];
           const changed=keys.filter(k=>record.ratings?.[k]!==ratings[k]).map(k=>`/ratings/${k}`);
           for(const pointer of changed)mark(`capability:${c.id}:${pointer}`,ratings[pointer.slice(9)]??null);record.ratings=structuredClone(ratings);
           touch(record,changed,changed.filter(f=>Object.hasOwn(ratings,f.slice(9))),entry.operationId);
         }else{(record as unknown as Record<string,unknown>)[field]=value;touch(record,[`/${field}`],[`/${field}`],entry.operationId);}
       }
     }else if(c.kind==="delete-capability"){
       mark(`capability:${key}`,"delete");if(!catalog.capabilities.some(v=>v.id===c.id))throw new EnterpriseError("target-missing");catalog.capabilities=catalog.capabilities.filter(v=>v.id!==c.id);
     }else if(c.kind==="add-application"){
       const cat=upgrade();if(cat.supportScope.applications==="not-provided")cat.supportScope.applications="partial";mark(`application:${key}`,c);if(cat.applications.some(v=>v.id===c.id))throw new EnterpriseError("duplicate-application-id");
       const {kind:_kind,...record}=c;cat.applications.push({...record,provenance:[proof(["/name",...(c.description!==undefined?["/description"]:[])],entry.operationId)]});
     }else if(c.kind==="delete-application"){
       const cat=upgrade();mark(`application:${key}`,"delete");if(!cat.applications.some(v=>v.id===c.id))throw new EnterpriseError("target-missing");cat.applications=cat.applications.filter(v=>v.id!==c.id);
     }else if(c.kind==="add-support"){
       const cat=upgrade();if(cat.supportScope.relationships==="not-provided")cat.supportScope.relationships="partial";mark(`support:${key}`,c);if(cat.supports.some(v=>v.applicationId===c.applicationId&&v.capabilityId===c.capabilityId))throw new EnterpriseError("duplicate-support");
       cat.supports.push({applicationId:c.applicationId,capabilityId:c.capabilityId,provenance:[proof(["/applicationId","/capabilityId"],entry.operationId)]});
     }else{
       const cat=upgrade();mark(`support:${key}`,"delete");if(!cat.supports.some(v=>v.applicationId===c.applicationId&&v.capabilityId===c.capabilityId))throw new EnterpriseError("target-missing");cat.supports=cat.supports.filter(v=>v.applicationId!==c.applicationId||v.capabilityId!==c.capabilityId);
     }
   }
   // Delete/patch conflicts are checked separately from field collisions.
   for(const e of this.entries.filter(e=>e.decision==="accepted"&&e.change.kind==="delete-capability"))if(this.entries.some(v=>v.decision==="accepted"&&v.change.kind==="patch-capability"&&"id"in e.change&&v.change.id===e.change.id))conflicts.push(`conflict:delete:${(e.change as {id:string}).id}`);
   for(const e of this.entries.filter(e=>e.decision==="accepted"&&e.change.kind==="delete-application"))if(this.entries.some(v=>v.decision==="accepted"&&v.change.kind==="patch-application"&&"id"in e.change&&v.change.id===e.change.id))conflicts.push(`conflict:delete-application:${(e.change as {id:string}).id}`);
   if(conflicts.length)throw new EnterpriseError("update-conflict",conflicts.map(code=>({code,path:[]})));
   return validateEnterpriseCatalog(catalog);
 }
 state(){
   const issues:string[]=[];if(this.entries.some(e=>e.decision==="pending"))issues.push("pending-decisions");
   if(this.proposal?.candidates.some(c=>!this.bindings.has(c.id)))issues.push("unresolved-identity");
   if(this.viewProposal?.viewCandidates?.some(c=>!this.viewBindings.has(c.id)))issues.push("unresolved-view-proposals");
   const warnings=[...(this.viewProposal?.warnings??[]),...(this.viewProposal?.bundle.sources.flatMap(s=>s.conversion.warnings.map(w=>`${s.sourceId}: ${w}`))??[]),...(this.proposal?.warnings??[]),...(this.proposal?.bundle.sources.flatMap(s=>s.conversion.warnings.map(w=>`${s.sourceId}: ${w}`))??[])];
   if(warnings.length&&!this.warningsReviewed)issues.push("review-source-warnings");
   let proposed:EnterpriseCatalog|undefined;try{proposed=this.compose("unreviewed");}catch(e){issues.push(...(e instanceof EnterpriseError&&e.issues.length?e.issues.map(i=>`${i.code}: /${i.path.join("/")}`):[e instanceof EnterpriseError?e.code:"invalid-change"]));}
   return deepFreeze({revision:this.revision,completed:this.completed,base:this.base,proposed,issues:[...new Set(issues)],warnings,warningsReviewed:this.warningsReviewed,proposalImported:this.proposal!==undefined,viewProposalImported:this.viewProposal!==undefined,viewCandidates:(this.viewProposal?.viewCandidates??[]).map(c=>({...c,bound:this.viewBindings.has(c.id)})),
     entries:this.entries.map(e=>({...structuredClone(e),differences:this.classify(e),before:this.original(e.change),
       dependencies:e.change.kind==="delete-capability"?{stages:this.base.schemaVersion===3?this.base.valueStreams.flatMap(v=>v.stages.filter(s=>s.capabilityIds.includes((e.change as {id:string}).id)).map(s=>({streamId:v.id,stageId:s.id}))):[],children:this.base.capabilities.filter(c=>c.parentId===(e.change as {id:string}).id).map(c=>c.id),supports:this.base.schemaVersion!==1?this.base.supports.filter(r=>r.capabilityId===(e.change as {id:string}).id):[]}:e.change.kind==="delete-application"?{supports:this.base.schemaVersion!==1?this.base.supports.filter(r=>r.applicationId===(e.change as {id:string}).id):[]}:e.change.kind==="delete-domain"&&this.base.schemaVersion===3?{applications:this.base.applications.filter(a=>a.domainId===(e.change as {id:string}).id).map(a=>a.id)}:null})),candidates:this.candidates()});
 }
 private original(change:EnterpriseChange){
  if(change.kind==="set-scale")return this.base.scales.find(s=>s.id===change.id)??null;
  if(change.kind==="set-value-stream"||change.kind==="delete-value-stream")return this.base.schemaVersion===3?this.base.valueStreams.find(s=>s.id===(change.kind==="set-value-stream"?change.stream.id:change.id))??null:null;
  if(change.kind==="set-domain"||change.kind==="delete-domain")return this.base.schemaVersion===3?this.base.domains.find(s=>s.id===change.id)??null:null;

  if(change.kind==="add-application"||change.kind==="delete-application"||change.kind==="patch-application")return this.base.schemaVersion!==1?this.base.applications.find(a=>a.id===change.id)??null:null;
  if(change.kind==="add-support"||change.kind==="delete-support")return this.base.schemaVersion!==1?this.base.supports.find(r=>r.applicationId===change.applicationId&&r.capabilityId===change.capabilityId)??null:null;
  return this.base.capabilities.find(c=>c.id===change.id)??null;
 }
 private classify(entry:Entry){
  const c=entry.change;if(c.kind!=="patch-capability")return [c.kind];const original=this.base.capabilities.find(b=>b.id===c.id);if(!original)return ["conflict"];
  const fields=Object.keys(c.changes).filter(k=>canonical(original[k as keyof Capability]??null)!==canonical(c.changes[k as keyof Patch]??null));
  return fields.length?fields.map(k=>k==="parentId"?"parent-change":k==="ratings"?"explicit-rating-change":"name-description-change"): ["no-op"];
 }
 async checkBase(signal?:CancellationSignal){
   if(signal?.aborted)return {status:"cancelled" as const};
   try{const current=await loadEnterpriseJson({kind:"enterprise-json",path:this.path},signal);
     if(current.catalog.source.id!==this.base.source.id||current.catalogDigest!==this.catalogDigest)return {status:"stale-source" as const};
     if(current.evidence.sourceBytesSha256!==this.baseFingerprint)return {status:"conflict" as const};return {status:"prepared" as const};
   }catch{return {status:signal?.aborted?"cancelled" as const:"conflict" as const};}
 }
 prepareSave():EnterpriseUpdatePlan{
   this.available();if(this.state().issues.length)throw new EnterpriseError("invalid-draft");if(this.plan?.revision===this.revision)return this.plan;
   const report={format:"archi-agent-enterprise-update-review/1",sessionId:this.sessionId,base:{sourceId:this.base.source.id,catalogDigest:this.catalogDigest,sourceBytesSha256:this.baseFingerprint},
     revision:this.revision,proposal:this.proposal??null,viewProposal:this.viewProposal??null,viewBindings:[...this.viewBindings],bindings:[...this.bindings],decisions:this.entries,warningsReviewed:this.warningsReviewed,approvedAt:new Date().toISOString(),limitations:["User decisions do not become old source facts.","No automatic rebase, dependency deletion, coverage increase, transaction or crash recovery."]};
   const digest=enterpriseProposalDigest(report),proposed=this.compose(digest),proposedText=(JSON.stringify(proposed,null,2)+"\n").replace(/\n/g,this.expectedText.includes("\r\n")?"\r\n":"\n");
   parseEnterpriseText(proposedText,pathModuleName(this.path));const reportText=JSON.stringify({...report,digest},null,2)+"\n";
   if(Buffer.byteLength(reportText)>4*1024*1024)throw new EnterpriseError("too-large");
   this.plan=deepFreeze({id:randomUUID(),revision:this.revision,path:this.path,sourceId:this.base.source.id,expectedText:this.expectedText,proposedText,baseFingerprint:this.baseFingerprint,catalogDigest:this.catalogDigest,reportName:`enterprise-updates/${this.sessionId}/${this.revision}/enterprise.review.json`,reportText});this.reportPersisted=false;return this.plan;
 }
 async persistReview(plan:EnterpriseUpdatePlan,signal?:AbortSignal){
   if(plan!==this.plan||plan.revision!==this.revision)throw new EnterpriseError("stale-review");if(this.reportPersisted)return;
   await createExclusiveArtifactFiles(path.dirname(path.join(path.dirname(this.path),plan.reportName)),["enterprise.review.json"],[plan.reportText],{signal,requireNewDirectory:true,projectRoot:path.dirname(this.path)});this.reportPersisted=true;
 }
 async confirmSave(plan:EnterpriseUpdatePlan,signal?:CancellationSignal){
   if(signal?.aborted)return {status:"cancelled" as const};if(plan!==this.plan||plan.revision!==this.revision||!this.reportPersisted)return {status:"stale-source" as const};
   try{const loaded=await loadEnterpriseJson({kind:"enterprise-json",path:this.path},signal),text=await boundedText(this.path,1024*1024,signal),review=await boundedText(path.join(path.dirname(this.path),plan.reportName),4*1024*1024,signal);
     if(signal?.aborted)return {status:"cancelled" as const};
     if(loaded.evidence.sourceBytesSha256!==hash(plan.proposedText)||text!==plan.proposedText||review!==plan.reportText)return {status:"conflict" as const};
     this.completed=true;return {status:"saved" as const,path:this.path,catalog:loaded.catalog};
   }catch{return {status:signal?.aborted?"cancelled" as const:"failed" as const};}
 }
}
const pathModuleName=(file:string)=>path.basename(file);
export const captureEnterpriseUpdate=EnterpriseUpdateSession.capture;
