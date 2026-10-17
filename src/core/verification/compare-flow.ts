import { ParticipantDictionary } from "../grounding/participant-resolver.js";
import { buildKnowledgePackIndexes } from "../knowledge-pack/knowledge-pack-loader.js";
import type { KnowledgePack, RelationshipRecord } from "../knowledge-pack/knowledge-pack.schema.js";
import type { KnowledgeSnapshot } from "../knowledge-pack/knowledge-snapshot.js";
import { stableDigest, sha256Hex } from "../util/stable-digest.js";
import { freezeVerification, type InputSpan, type InterpretedFlow, type SyntaxIssue } from "./flow-interpretation.js";

export interface NameDecision {readonly mentionId:string;readonly expectedSnapshotDigest:string;readonly targetElementId:string;readonly confirmed:true}
export interface VerificationFinding {readonly code:string;readonly stepId?:string;readonly mentionId?:string;readonly inputSpan?:InputSpan;readonly factIds:readonly string[];readonly details?:Readonly<Record<string,unknown>>}
export interface NameResolution {readonly mentionId:string;readonly mention:string;readonly status:"resolved"|"ambiguous"|"unknown";readonly targetId?:string;readonly candidateIds:readonly string[];readonly basis:string}
export interface VerifyFlowReport {
  readonly version:1;
  readonly execution:"completed"|"needs-resolution";
  readonly assessment:"conformant-within-scope"|"discrepancies"|"inconclusive";
  readonly snapshot:{readonly id:string;readonly digest:string};
  readonly input:{readonly format:string;readonly sha256:string;readonly fileName:string;readonly firstLine:number};
  readonly interpretation:InterpretedFlow;
  readonly interpretationDigest:string;
  readonly modelCalls:number;
  readonly resolutions:readonly NameResolution[];
  readonly decisions:readonly NameDecision[];
  readonly steps:readonly {readonly stepId:string;readonly status:"conformant"|"discrepant"|"unresolved";readonly factIds:readonly string[]}[];
  readonly findings:readonly VerificationFinding[];
  readonly coverage:{readonly steps:number;readonly conformant:number;readonly discrepant:number;readonly unresolved:number;readonly omitted:number;readonly findingsTruncated:boolean};
  readonly sourceProvenance:KnowledgeSnapshot;
  readonly limitations:readonly string[];
}
const relationEqual=(r:RelationshipRecord,v:RelationshipRecord)=>r.fromId===v.fromId&&r.toId===v.toId&&r.mode===v.mode&&r.interfaceType===v.interfaceType&&(r.interfaceName??null)===(v.interfaceName??null)&&r.purpose===v.purpose;
export function compareFlow(input:{text:string;format:string;fileName?:string;firstLine?:number;modelCalls:number;interpretation:InterpretedFlow;syntaxIssues:readonly SyntaxIssue[];pack:KnowledgePack;snapshot:KnowledgeSnapshot;decisions:readonly NameDecision[]}):VerifyFlowReport {
  const {pack,snapshot,interpretation:v}=input,dict=ParticipantDictionary.fromPack(pack),indexes=buildKnowledgePackIndexes(pack);
  const findings:VerificationFinding[]=[],resolutions:NameResolution[]=[],steps:VerifyFlowReport["steps"][number][]=[];
  const factIds=(rows:readonly RelationshipRecord[])=>snapshot.facts.filter(f=>f.table==="relationships"&&rows.some(r=>relationEqual(r,f.value as RelationshipRecord))).map(f=>f.id);
  for(const p of v.participants) {
    const decision=input.decisions.find(d=>d.mentionId===p.id),match=dict.resolveReference(p.mention);
    const target=decision?.targetElementId;
    if(target&&(!dict.target(target)||decision.expectedSnapshotDigest!==snapshot.digest||decision.confirmed!==true))throw new Error("name-decision-invalid");
    const status=target||match.status==="resolved"?"resolved":match.status==="ambiguous"?"ambiguous":"unknown";
    const targetId=target??(match.status==="resolved"?match.target.id:undefined);
    resolutions.push({mentionId:p.id,mention:p.mention,status,...(targetId?{targetId}:{}),candidateIds:match.status==="ambiguous"?match.candidates.map(c=>c.id):[],basis:target?"user-confirmed":match.status==="unresolved"?"none":match.matchKind});
    if(status!=="resolved")findings.push({code:status==="unknown"?"unknown-element":"ambiguous-element",mentionId:p.id,inputSpan:p.evidence,factIds:[]});
  }
  const byId=new Map(resolutions.map(r=>[r.mentionId,r]));
  for(const s of v.steps) {
    const from=byId.get(s.from)?.targetId,to=byId.get(s.to)?.targetId;
    let status:"conformant"|"discrepant"|"unresolved"="conformant",facts:string[]=[];
    const issue=(code:string,rows:readonly RelationshipRecord[]=[],details?:Readonly<Record<string,unknown>>)=>findings.push({code,stepId:s.id,inputSpan:s.evidence,factIds:factIds(rows),...(details?{details}:{})});
    if(!from||!to)status="unresolved";
    else if(s.isResponse===null||s.async===null) {
      const candidates=indexes.relationships.find(from,to).filter(r=>(s.interfaceType===null||r.interfaceType===s.interfaceType)&&(s.interfaceName===null||r.interfaceName===s.interfaceName));
      issue("insufficient-data",candidates);
      if(candidates.length>1&&new Set(candidates.map(r=>JSON.stringify([r.interfaceType,r.interfaceName,r.mode]))).size>1)issue("relationship-ambiguous",candidates);
      status="unresolved";
    }
    else if(from===to) { /* A local operation proves no architecture relationship. */ }
    else {
      const response=s.isResponse===true,request=response?v.steps.find(r=>r.id===s.responseTo):undefined;
      if(response&&(!request||request.from!==s.to||request.to!==s.from||request.async!==false||s.async!==false||
        request.interfaceType!==null&&s.interfaceType!==null&&request.interfaceType!==s.interfaceType||request.interfaceName!==null&&s.interfaceName!==null&&request.interfaceName!==s.interfaceName)) {issue("insufficient-data");status="unresolved";}
      else {
        const a=response?to:from,b=response?from:to;
        const all=indexes.relationships.find(a,b),reverse=indexes.relationships.find(b,a);
        const selected=all.filter(r=>(s.interfaceType===null||r.interfaceType===s.interfaceType)&&(s.interfaceName===null||r.interfaceName===s.interfaceName)&&(!request||request.interfaceType===null||r.interfaceType===request.interfaceType)&&(!request||request.interfaceName===null||r.interfaceName===request.interfaceName));
        const matching=selected.filter(r=>r.mode===(s.async?"asynchronous":"synchronous"));
        if(pack.rules.some(r=>r.rule==="forbid"&&r.fromId===a&&r.toId===b)) {
          issue("forbidden-interaction",selected);status="discrepant";
        } else if(!all.length) {
          issue("relationship-not-in-model",[],{scope:"loaded-model-only"});status="discrepant";
          if(reverse.some(r=>(s.interfaceType===null||s.interfaceType===r.interfaceType)&&(s.interfaceName===null||s.interfaceName===r.interfaceName)))issue("direction-mismatch",reverse);
        } else if(!selected.length) {issue("relationship-not-in-model",all,{scope:"explicit-interface-not-in-loaded-model"});status="discrepant";
          if(reverse.some(r=>(s.interfaceType===null||s.interfaceType===r.interfaceType)&&(s.interfaceName===null||s.interfaceName===r.interfaceName)))issue("direction-mismatch",reverse);}
        else if(!matching.length) {issue("interaction-mode-conflict",selected,{observed:s.async?"asynchronous":"synchronous",expected:[...new Set(selected.map(r=>r.mode))]});status="discrepant";}
        else {facts=factIds(matching);}
      }
    }
    steps.push({stepId:s.id,status,factIds:facts});
  }
  const selectedIds=new Set(resolutions.flatMap(r=>r.targetId?[r.targetId]:[]));
  for(const rule of pack.rules.filter(r=>r.rule==="require"&&selectedIds.has(r.fromId)&&selectedIds.has(r.toId))) {
    if(!v.steps.some(s=>!s.isResponse&&byId.get(s.from)?.targetId===rule.fromId&&byId.get(s.to)?.targetId===rule.toId))
      findings.push({code:"required-interaction-not-shown",factIds:snapshot.facts.filter(f=>f.table==="rules"&&f.value.rule==="require"&&f.value.fromId===rule.fromId&&f.value.toId===rule.toId).map(f=>f.id)});
  }
  for(const gap of v.unexamined)findings.push({code:input.format==="prose"?"insufficient-data":"syntax-not-covered",inputSpan:gap.span,factIds:[],details:{reason:gap.reason}});
  for(const s of input.syntaxIssues)if(!findings.some(f=>f.code===s.code&&f.inputSpan?.start===s.span?.start))findings.push({code:s.code,...(s.span?{inputSpan:s.span}:{}),factIds:[]});
  const omissions=snapshot.sources.flatMap(s=>(s.omissions??[]).filter(o=>o.count>0).map(o=>({sourceId:s.id,...o})));
  if(omissions.length)findings.push({code:"source-not-covered",factIds:[],details:{omissions,scope:"outside-imported-projection"}});
  const discrepant=steps.filter(s=>s.status==="discrepant").length,unresolved=steps.filter(s=>s.status==="unresolved").length;
  const coverage={steps:steps.length,conformant:steps.filter(s=>s.status==="conformant").length,discrepant,unresolved,omitted:v.unexamined.length,findingsTruncated:findings.length>100};
  return freezeVerification({version:1,execution:resolutions.some(r=>r.status!=="resolved")?"needs-resolution":"completed",
    assessment:discrepant?"discrepancies":unresolved||v.unexamined.length||input.syntaxIssues.length||coverage.findingsTruncated||!steps.length||findings.some(f=>f.code==="required-interaction-not-shown")?"inconclusive":"conformant-within-scope",
    snapshot:{id:snapshot.id,digest:snapshot.digest},input:{format:input.format,sha256:sha256Hex(input.text),fileName:input.fileName??"flow",firstLine:input.firstLine??1},
    interpretation:v,interpretationDigest:stableDigest(v),modelCalls:input.modelCalls,resolutions,decisions:[...input.decisions],steps,findings:findings.slice(0,100),coverage,sourceProvenance:snapshot,
    limitations:["Assessment concerns the captured input and imported source projection; absent relationships do not prove nonexistence.",
      "Conditions, loop counts, process completeness and self-operation internals are not verified.",
      ...(input.format==="prose"?["Compliance concerns the displayed model interpretation; natural-language extraction has no independent semantic review."]:[]),
      ...(omissions.length?["Source omissions are listed; confirmed interactions in the imported projection do not establish completeness of the architecture."]:[])]});
}
