import {randomUUID,createHash}from"node:crypto";
import {parseLocalJson,createArchiAgentRuntime,inspectKnowledgeForHost,inspectEnterpriseSource,generateCapabilityMap,portableVerificationOutcome,portableDiagramOutcome,validateHostResult,HostResultError,
  type ArchiAgentRuntime,type FlowVerificationSession,type VerifyFlowOutcome,type HostResultV1,type KnowledgePackSourceConfig}from"../../runtime/index.js";
import {LocalHostError,readHostInput,hostGenerator,type LocalHostConfig,type FileReference}from"./config.js";
import {inspectInputSchema,verifyInputSchema,resolveInputSchema,generateInputSchema,verificationDecisionsSchema,generationDecisionsSchema}from"./schemas.js";
import type{z}from"zod";
export const shaText=(text:string)=>createHash("sha256").update(text).digest("hex");
type Pending={id:string;expiresAt:number;session:FlowVerificationSession;source:KnowledgePackSourceConfig};
export class LocalOperations {
  readonly runtime:ArchiAgentRuntime;pending?:Pending;
  constructor(readonly config:LocalHostConfig,readonly adapter:"cli"|"mcp",runtime?:ArchiAgentRuntime){this.runtime=runtime??createArchiAgentRuntime({localReadPolicy:config.policy});}
  source(name:string){const source=Object.hasOwn(this.config.sources,name)?this.config.sources[name]:undefined;if(!source)throw new LocalHostError(Object.hasOwn(this.config.enterpriseSources,name)?"source-kind-incompatible":"source-unknown");return source;}
  enterpriseSource(name:string){const source=Object.hasOwn(this.config.enterpriseSources,name)?this.config.enterpriseSources[name]:undefined;if(!source)throw new LocalHostError(Object.hasOwn(this.config.sources,name)?"source-kind-incompatible":"source-unknown");return source;}
  async inspect(input:z.infer<typeof inspectInputSchema>,signal:AbortSignal){
    if("diagramType"in input){
      const result=await inspectEnterpriseSource(this.enterpriseSource(input.source),signal,this.config.policy);
      if(result.status!=="success")return this.enterpriseFailure(result);
      const s=result.snapshot,e=s.evidence;
      if(input.expectedCatalogDigest&&input.expectedCatalogDigest!==s.catalogDigest)return this.failure("knowledge.inspect","stale-source",true);
      return {status:"success",diagramType:"capability-map",source:s.catalog.source,snapshot:{id:`enterprise-${s.catalogDigest}`,catalogDigest:s.catalogDigest},
        sourceEvidence:"kind"in e?{kind:e.kind,sourceId:e.sourceId,sourceVersion:e.sourceVersion,responseFingerprint:e.responseFingerprint,tool:e.tool,contractVersion:e.contractVersion}:
          {kind:"enterprise-json",file:e.file,sourceBytesSha256:e.sourceBytesSha256},counts:{capabilities:s.catalog.capabilities.length,scales:s.catalog.scales.length},
        roots:s.hierarchy.filter(h=>h.level===1).map(h=>({id:h.id,name:s.catalog.capabilities.find(c=>c.id===h.id)!.name})),scales:s.catalog.scales.map(s=>({id:s.id,name:s.name}))};
    }
    return inspectKnowledgeForHost(this.source(input.source),{...input,localReadPolicy:this.config.policy,signal});
  }
  async verify(input:z.infer<typeof verifyInputSchema>,signal:AbortSignal,decisionsFile?:FileReference):Promise<unknown>{
    const source=this.source(input.source),file=await readHostInput(this.config,input.input,input.format==="prose"?200000:1024*1024,signal);
    const interpreter=input.format==="prose"?hostGenerator(this.config,input.provider):undefined;
    const start=await this.runtime.startFlowVerification!({input:{format:input.format,text:file.text,fileName:file.fileName,firstLine:1,language:input.language},knowledgePack:source,interpreter,signal});
    let outcome:VerifyFlowOutcome=start;
    if(start.session&&"report"in start){
      this.pending=undefined;
      if(decisionsFile){const d=verificationDecisionsSchema.safeParse(parseLocalJson((await readHostInput(this.config,decisionsFile,64*1024,signal)).text));
        if(!d.success)throw new LocalHostError("decisions-invalid");this.checkHashes(start.report,d.data);
        outcome=await start.session.resolveNames({currentSource:source,expectedSnapshotDigest:d.data.expectedSnapshotDigest,decisions:d.data.decisions,signal});}
      if(outcome.status==="needs-resolution")this.pending={id:randomUUID(),expiresAt:Date.now()+600000,session:start.session,source};
    }
    return portableVerificationOutcome(outcome);
  }
  checkHashes(report:Extract<VerifyFlowOutcome,{report:unknown}>["report"],d:{expectedInputSha256:string;expectedInterpretationDigest:string;expectedSnapshotDigest:string}){
    if(report.input.sha256!==d.expectedInputSha256||report.interpretationDigest!==d.expectedInterpretationDigest||report.snapshot.digest!==d.expectedSnapshotDigest)throw new LocalHostError("decision-binding-stale");
  }
  async resolve(input:z.infer<typeof resolveInputSchema>,signal:AbortSignal){
    const p=this.pending;if(!p||p.id!==input.sessionId||Date.now()>=p.expiresAt){if(p&&Date.now()>=p.expiresAt)this.pending=undefined;throw new LocalHostError("session-unavailable");}
    this.checkHashes(p.session.current().report,input);
    const outcome=await p.session.resolveNames({currentSource:p.source,expectedSnapshotDigest:input.expectedSnapshotDigest,decisions:input.decisions,signal});
    if(outcome.status==="completed"||outcome.status==="stale-source")this.pending=undefined;
    return portableVerificationOutcome(outcome);
  }
  async generate(input:z.infer<typeof generateInputSchema>,signal:AbortSignal){
    if(input.diagramType==="capability-map"){
      const result=await generateCapabilityMap({source:this.enterpriseSource(input.source),selection:input.selection},signal,this.config.policy);
      if(result.status!=="success")return this.enterpriseFailure(result);
      return {status:result.status,diagramType:result.diagramType,plantUml:result.plantUml,report:result.report};
    }
    const source=this.source(input.source),file=await readHostInput(this.config,input.input,200000,signal);
    let decisions:z.infer<typeof generationDecisionsSchema>|undefined;
    if("decisionsFile"in input&&input.decisionsFile){
      const raw=await readHostInput(this.config,input.decisionsFile,64*1024,signal);const parsed=generationDecisionsSchema.safeParse(parseLocalJson(raw.text));if(!parsed.success)throw new LocalHostError("decisions-invalid");decisions=parsed.data;
      if(decisions.expectedInputSha256!==shaText(file.text))throw new LocalHostError("decision-binding-stale");
    }
    return portableDiagramOutcome(await this.runtime.generateDiagram!({diagramType:input.diagramType,flow:{kind:"document",text:file.text,fileName:file.fileName},knowledgePack:source,
      generator:hostGenerator(this.config,input.provider),signal,...("c4Selection"in input?{c4Selection:input.c4Selection}:{}),
      ...(decisions?{selections:decisions.selections,confirmedNewParticipants:decisions.confirmedNewParticipants,expectedKnowledgeDigest:decisions.expectedSnapshotDigest}:{})}));
  }
  enterpriseFailure(result:{code:string;issues?:readonly unknown[];count?:number}){
    return {status:["enterprise-unsupported","enterprise-version-unsupported"].includes(result.code)?"unsupported":"failed",diagramType:"capability-map",code:result.code,issues:result.issues??[],...(result.count!==undefined?{count:result.count}:{})};
  }
  async run(operation:HostResultV1["operation"],work:()=>Promise<unknown>,signal:AbortSignal,deadlineAt=Date.now()+(operation==="diagram.generate"?240000:120000),enterprise=false):Promise<HostResultV1>{
    const started=Date.now(),runId=randomUUID();let outcome:unknown;
    try{outcome=await work();if(Date.now()>=deadlineAt)throw new LocalHostError("timeout");if(signal.aborted)throw new LocalHostError(signal.reason==="timeout"?"timeout":"cancelled");}
    catch(e){const code=e instanceof LocalHostError||e instanceof HostResultError?e.code:"operation-failed";outcome=this.failure(operation,code,enterprise);}
    const result={schemaVersion:1,operation,outcome,meta:{adapter:this.adapter,runId,startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started}};
    try{const validated=validateHostResult(result);if(Date.now()>=deadlineAt)return validateHostResult({...result,outcome:this.failure(operation,"timeout",enterprise)});return validated;}catch(e){return validateHostResult({...result,outcome:this.failure(operation,e instanceof HostResultError?e.code:"result-contract-invalid",enterprise)});}
  }
  failure(operation:HostResultV1["operation"],code:string,enterprise=false):unknown{
    if(enterprise)return this.enterpriseFailure({code});
    if(operation==="diagram.generate")return {status:"failed",stage:"generator-configuration",issues:[{severity:"error",code,message:"Operation failed. Check configuration and input."}],ambiguities:[],unconfirmedNewParticipants:[]};
    return {status:code==="cancelled"?"cancelled":"failed",code};
  }
  continuation(result:HostResultV1){const p=this.pending;return result.operation==="flow.verify"&&result.outcome.status==="needs-resolution"&&p?{sessionId:p.id,expiresAt:new Date(p.expiresAt).toISOString()}:undefined;}
}
