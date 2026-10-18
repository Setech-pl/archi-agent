import {randomUUID,createHash}from"node:crypto";
import {parseLocalJson,createArchiAgentRuntime,inspectKnowledgeForHost,portableVerificationOutcome,portableDiagramOutcome,validateHostResult,HostResultError,
  type ArchiAgentRuntime,type FlowVerificationSession,type VerifyFlowOutcome,type HostResultV1,type KnowledgePackSourceConfig}from"../../runtime/index.js";
import {LocalHostError,readHostInput,hostGenerator,type LocalHostConfig,type FileReference}from"./config.js";
import {inspectInputSchema,verifyInputSchema,resolveInputSchema,generateInputSchema,verificationDecisionsSchema,generationDecisionsSchema}from"./schemas.js";
import type{z}from"zod";
export const shaText=(text:string)=>createHash("sha256").update(text).digest("hex");
type Pending={id:string;expiresAt:number;session:FlowVerificationSession;source:KnowledgePackSourceConfig};
export class LocalOperations {
  readonly runtime:ArchiAgentRuntime;pending?:Pending;
  constructor(readonly config:LocalHostConfig,readonly adapter:"cli"|"mcp",runtime?:ArchiAgentRuntime){this.runtime=runtime??createArchiAgentRuntime({localReadPolicy:config.policy});}
  source(name:string){const source=Object.hasOwn(this.config.sources,name)?this.config.sources[name]:undefined;if(!source)throw new LocalHostError("source-unknown");return source;}
  async inspect(input:z.infer<typeof inspectInputSchema>,signal:AbortSignal){return inspectKnowledgeForHost(this.source(input.source),{...input,localReadPolicy:this.config.policy,signal});}
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
  async run(operation:HostResultV1["operation"],work:()=>Promise<unknown>,signal:AbortSignal,deadlineAt=Date.now()+(operation==="diagram.generate"?240000:120000)):Promise<HostResultV1>{
    const started=Date.now(),runId=randomUUID();let outcome:unknown;
    try{outcome=await work();if(Date.now()>=deadlineAt)throw new LocalHostError("timeout");if(signal.aborted)throw new LocalHostError(signal.reason==="timeout"?"timeout":"cancelled");}
    catch(e){const code=e instanceof LocalHostError||e instanceof HostResultError?e.code:"operation-failed";outcome=this.failure(operation,code);}
    const result={schemaVersion:1,operation,outcome,meta:{adapter:this.adapter,runId,startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started}};
    try{const validated=validateHostResult(result);if(Date.now()>=deadlineAt)return validateHostResult({...result,outcome:this.failure(operation,"timeout")});return validated;}catch(e){return validateHostResult({...result,outcome:this.failure(operation,e instanceof HostResultError?e.code:"result-contract-invalid")});}
  }
  failure(operation:HostResultV1["operation"],code:string):unknown{
    if(operation==="diagram.generate")return {status:"failed",stage:"generator-configuration",issues:[{severity:"error",code,message:"Operation failed. Check configuration and input."}],ambiguities:[],unconfirmedNewParticipants:[]};
    return {status:code==="cancelled"?"cancelled":"failed",code};
  }
  continuation(result:HostResultV1){const p=this.pending;return result.operation==="flow.verify"&&result.outcome.status==="needs-resolution"&&p?{sessionId:p.id,expiresAt:new Date(p.expiresAt).toISOString()}:undefined;}
}
