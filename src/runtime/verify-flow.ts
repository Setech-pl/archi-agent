import path from "node:path";
import { inspectArchitectureSource } from "./architecture-source.js";
import type { CancellationSignal, GeneratorConfig, KnowledgePackSourceConfig } from "./runtime-types.js";
import { interpretProse, freezeVerification, type InterpretedFlow, type InterpretationResult, type SyntaxIssue } from "../core/verification/flow-interpretation.js";
import { parseSequenceVerification } from "../core/verification/plantuml-sequence-parser.js";
import { compareFlow, type NameDecision, type VerifyFlowReport } from "../core/verification/compare-flow.js";
import type { StructuredChatClient } from "../core/llm/structured-chat-client.js";
import { stableDigest, sha256Hex } from "../core/util/stable-digest.js";
import { ParticipantDictionary, normalizeReferenceText } from "../core/grounding/participant-resolver.js";
import { normalizeGroundingReference } from "../core/grounding/reference-key.js";
import { composeStructurizrKnowledge } from "../core/architecture-sources/structurizr-json.js";
import { aliasRowSchema } from "../core/knowledge-pack/knowledge-pack.schema.js";
import { containsControlCharacter } from "../core/knowledge-pack/source-limits.js";

export interface VerifyFlowRequest {
  readonly input:{readonly format:"plantuml-sequence"|"prose";readonly text:string;readonly fileName?:string;readonly firstLine?:number;readonly language?:"pl"|"en"};
  readonly knowledgePack:KnowledgePackSourceConfig;
  readonly interpreter?:GeneratorConfig;
  readonly signal?:CancellationSignal;
}
export type VerifyFlowOutcome={readonly status:"completed"|"needs-resolution";readonly report:VerifyFlowReport}|
  {readonly status:"unsupported"|"invalid-input"|"stale-source"|"failed"|"cancelled";readonly code:string;readonly issues?:readonly SyntaxIssue[]};
export type VerifyFlowStart=VerifyFlowOutcome & {readonly session?:FlowVerificationSession};
type Loaded=Extract<Awaited<ReturnType<typeof inspectArchitectureSource>>,{ok:true}>;
export interface AliasSavePlan {readonly id:string;readonly path:string;readonly expectedText:string;readonly expectedSha256:string;readonly proposedText:string;readonly appendText:string;readonly snapshotDigest:string}
export type AliasSavePlanOutcome={status:"prepared";plan:AliasSavePlan}|{status:"unchanged"|"session-only"|"stale-source"|"conflict"|"cancelled"|"failed";code:string};

export async function startFlowVerification(request:VerifyFlowRequest,client:()=>Promise<StructuredChatClient>):Promise<VerifyFlowStart> {
  request={ ...request,input:freezeVerification({...request.input}),knowledgePack:freezeVerification({...request.knowledgePack}),...(request.interpreter?{interpreter:freezeVerification({...request.interpreter})}:{}) };
  if(request.signal?.aborted)return {status:"cancelled",code:"cancelled"};
  const {text,format,fileName,firstLine}=request.input;
  if(typeof text!=="string"||!text.trim()||!['plantuml-sequence','prose'].includes(format)||
    fileName!==undefined&&(!/^[^/\\\x00-\x1f]{1,160}$/.test(fileName))||
    firstLine!==undefined&&(!Number.isSafeInteger(firstLine)||firstLine<1)||
    containsControlCharacter(text.replace(/[\n\r\t]/g,""))||text.length>(format==="prose"?50_000:256*1024))return {status:"invalid-input",code:"input-invalid"};
  const parsed=format==="plantuml-sequence"?parseSequenceVerification(text):undefined;
  if(parsed&&!parsed.ok)return {status:parsed.code==="unsupported"?"unsupported":"invalid-input",code:parsed.code,issues:parsed.issues};
  const loaded=await inspectArchitectureSource(request.knowledgePack,request.signal);
  if(request.signal?.aborted)return {status:"cancelled",code:"cancelled"};
  if(!loaded.ok)return {status:"failed",code:loaded.code};
  let interpreted:InterpretationResult|undefined=parsed;
  if(!interpreted) {
    if(!request.interpreter)return {status:"failed",code:"interpreter-required"};
    try {interpreted=await interpretProse(text,await client(),request.signal);}catch{return {status:"failed",code:"interpreter-configuration-invalid"};}
  }
  if(!interpreted)return {status:"failed",code:"interpretation-failed"};
  if(!interpreted.ok)return {status:interpreted.code==="cancelled"?"cancelled":"failed",code:interpreted.code};
  const session=new FlowVerificationSession(request,loaded,interpreted.value,interpreted.issues);
  return {...session.current(),session};
}

/** One operation, one immutable interpretation/snapshot. No continuation invokes the client. */
export class FlowVerificationSession {
  readonly #request:VerifyFlowRequest;readonly #loaded:Loaded;readonly #interpretation:InterpretedFlow;readonly #issues:readonly SyntaxIssue[];
  #decisions:NameDecision[]=[];#savePlan:AliasSavePlan|undefined;
  constructor(request:VerifyFlowRequest,loaded:Loaded,interpretation:InterpretedFlow,issues:readonly SyntaxIssue[]) {
    this.#request=request;this.#loaded=loaded;this.#interpretation=interpretation;this.#issues=issues;
  }
  current():Extract<VerifyFlowOutcome,{report:VerifyFlowReport}> {
    const report=compareFlow({...this.#request.input,interpretation:this.#interpretation,syntaxIssues:this.#issues,
      pack:this.#loaded.pack,snapshot:this.#loaded.snapshot,decisions:this.#decisions,modelCalls:this.#request.input.format==="prose"?1:0});
    return {status:report.execution,report};
  }
  async #fresh(source:KnowledgePackSourceConfig,signal?:CancellationSignal):Promise<Loaded|undefined> {
    if(signal?.aborted||JSON.stringify(source)!==JSON.stringify(this.#request.knowledgePack))return undefined;
    const live=await inspectArchitectureSource(source,signal);
    return live.ok&&live.sourceFingerprint===this.#loaded.sourceFingerprint&&!signal?.aborted?live:undefined;
  }
  async resolveNames(request:{expectedSnapshotDigest:string;decisions:readonly NameDecision[];currentSource:KnowledgePackSourceConfig;signal?:CancellationSignal}):Promise<VerifyFlowOutcome> {
    if(request.signal?.aborted)return {status:"cancelled",code:"cancelled"};
    if(request.expectedSnapshotDigest!==this.#loaded.snapshot.digest||!await this.#fresh(request.currentSource,request.signal))return {status:"stale-source",code:"source-changed"};
    const dict=ParticipantDictionary.fromPack(this.#loaded.pack),seen=new Set<string>();
    for(const d of request.decisions) {
      const participant=this.#interpretation.participants.find(p=>p.id===d.mentionId),match=participant?dict.resolveReference(participant.mention):undefined;
      if(seen.has(d.mentionId)||!participant||!dict.target(d.targetElementId)||d.confirmed!==true||d.expectedSnapshotDigest!==this.#loaded.snapshot.digest||
        match?.status==="resolved"&&match.target.id!==d.targetElementId||match?.status==="ambiguous"&&!match.candidates.some(c=>c.id===d.targetElementId))return {status:"failed",code:"name-decision-invalid"};
      seen.add(d.mentionId);
    }
    const next=new Map(this.#decisions.map(d=>[d.mentionId,d]));request.decisions.forEach(d=>next.set(d.mentionId,freezeVerification({...d})));
    this.#decisions=[...next.values()];this.#savePlan=undefined;return this.current();
  }
  /** A plan only. The runtime never overwrites the existing overlay. */
  async prepareAliasSave(source:KnowledgePackSourceConfig,signal?:CancellationSignal):Promise<AliasSavePlanOutcome> {
    if(signal?.aborted)return {status:"cancelled",code:"cancelled"};
    if(JSON.stringify(source)!==JSON.stringify(this.#request.knowledgePack))return {status:"stale-source",code:"source-changed"};
    if(source.kind!=="structurizr-json")return {status:"session-only",code:"standalone-alias-session-only"};
    const live=await this.#fresh(source,signal);if(!live)return {status:"stale-source",code:"source-changed"};
    const dictionary=ParticipantDictionary.fromPack(live.pack),rows:string[]=[];
    const planned:{alias:string;targetId:string}[]=[];
    const all=[...live.pack.systems,...live.pack.actors];
    for(const d of this.#decisions) {
      const p=this.#interpretation.participants.find(p=>p.id===d.mentionId)!,target=all.find(e=>e.id===d.targetElementId)!;
      if(!aliasRowSchema.safeParse({alias:p.mention,target_id:target.id}).success||containsControlCharacter(p.mention))return {status:"conflict",code:"alias-invalid"};
      const proof=target.provenance?.find(p=>p.sourceId===source.sourceId&&p.fields?.includes("id"));
      if(!proof?.externalId)return {status:"conflict",code:"alias-target-unavailable"};
      const keys=[normalizeReferenceText,normalizeGroundingReference];
      if(keys.some(key=>all.some(e=>e.id!==target.id&&[e.id,e.canonicalName].some(n=>key(n)===key(p.mention)))||
        [...live.pack.aliases,...planned].some(a=>a.targetId!==target.id&&key(a.alias)===key(p.mention))))return {status:"conflict",code:"alias-collision"};
      if(dictionary.resolveReference(p.mention).status==="resolved"||planned.some(a=>a.alias===p.mention&&a.targetId===target.id))continue;
      const cell=(s:string)=>s.replaceAll("\\","\\\\").replaceAll("|","\\|");
      rows.push(`| ${cell(p.mention)} | ${source.sourceId} | ${cell(proof.externalId)} |`);planned.push({alias:p.mention,targetId:target.id});
    }
    if(!rows.length)return {status:"unchanged",code:"alias-already-known"};
    const old=live.sourceTexts["aliases.md"]!,eol=old.includes("\r\n")?"\r\n":"\n",append=(old.endsWith("\n")?"":eol)+rows.join(eol)+eol,proposed=old+append;
    try {composeStructurizrKnowledge(live.sourceTexts["workspace.json"]!,{ "aliases.md":proposed,"rules.md":live.sourceTexts["rules.md"]!,"relationships.md":live.sourceTexts["relationships.md"]!},source.sourceId);}catch{return {status:"conflict",code:"alias-overlay-invalid"};}
    const plan=freezeVerification({id:stableDigest([this.#loaded.sourceFingerprint,proposed]),path:path.join(source.overlayPath,"aliases.md"),expectedText:old,expectedSha256:sha256Hex(old),proposedText:proposed,appendText:append,snapshotDigest:this.#loaded.snapshot.digest});
    this.#savePlan=plan;return {status:"prepared",plan};
  }
  async confirmAliasSave(planId:string,source:KnowledgePackSourceConfig,signal?:CancellationSignal):Promise<{status:"saved"|"conflict"|"stale-source"|"cancelled";code:string}> {
    if(signal?.aborted)return {status:"cancelled",code:"cancelled"};
    if(!this.#savePlan||this.#savePlan.id!==planId)return {status:"conflict",code:"alias-plan-invalid"};
    if(JSON.stringify(source)!==JSON.stringify(this.#request.knowledgePack))return {status:"stale-source",code:"source-changed"};
    const live=await inspectArchitectureSource(source,signal);
    if(!live.ok||signal?.aborted)return {status:signal?.aborted?"cancelled":"conflict",code:"alias-save-unverified"};
    for(const [f,t] of Object.entries(this.#loaded.sourceTexts)) if(live.sourceTexts[f]!== (f==="aliases.md"?this.#savePlan.proposedText:t))return {status:"stale-source",code:"source-changed"};
    this.#savePlan=undefined;return {status:"saved",code:"alias-saved"};
  }
}
