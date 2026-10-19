import{inspectArchitectureSource,createKnowledgeResponse,type KnowledgeResponseV1}from"../runtime/index.js";
import type{LocalHostConfig}from"../hosts/local/config.js";
/** Add source adapters here; the transport and Archi Agent client keep this normalized contract. */
export interface KnowledgeAdapter {load(sourceId:string,signal:AbortSignal):Promise<KnowledgeResponseV1>;}
export class SourceAdapterError extends Error{constructor(readonly code:string){super(code);}}
export class StructurizrKnowledgeAdapter implements KnowledgeAdapter{
 constructor(private readonly config:LocalHostConfig){}
 async load(sourceId:string,signal:AbortSignal):Promise<KnowledgeResponseV1>{
  const source=Object.hasOwn(this.config.sources,sourceId)?this.config.sources[sourceId]:undefined;
  if(!source||source.kind!=="structurizr-json")throw new SourceAdapterError("source-unknown");
  const loaded=await inspectArchitectureSource(source,signal,this.config.policy);
  if(!loaded.ok)throw new SourceAdapterError(loaded.code);
  if(!("contributions"in loaded)||!loaded.contributions)throw new SourceAdapterError("source-format-invalid");
  return createKnowledgeResponse(sourceId,loaded.contributions);
 }
}
