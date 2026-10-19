import path from "node:path";
import { z } from "zod";
import { mcpKnowledgeServerSchema,createLocalReadPolicy,readLocalTextInput,parseLocalJson,resolveLocalReadReference,parseLoopbackEndpoint,isSafeModelId,validateApiKey,
  type LocalReadPolicy,type KnowledgePackSourceConfig,type EnterpriseSourceConfig,type GeneratorConfig } from "../../runtime/index.js";
export const nameSchema=z.string().regex(/^[a-z][a-z0-9-]{0,55}$/);
export const fileReferenceSchema=z.strictObject({root:nameSchema,path:z.string().min(1).max(256)});
export type FileReference=z.infer<typeof fileReferenceSchema>;
const absolute=z.string().min(1).max(8192).refine(v=>path.isAbsolute(v)&&!/[\x00-\x1f\x7f]/.test(v));
const common={modelId:z.string().min(1).max(256).refine(isSafeModelId),timeoutMs:z.number().int().min(1).max(600000).optional()};
const provider=z.union([
  z.strictObject({...common,profileId:z.enum(["local-lm-studio","local-ollama"]),baseUrl:z.string().max(2048).refine(v=>parseLoopbackEndpoint(v).ok).optional()}),
  z.strictObject({...common,profileId:z.enum(["cloud-anthropic","cloud-openai","cloud-openrouter"]),credentialEnv:z.string().regex(/^ARCHI_AGENT_[A-Z0-9_]{1,80}$/)})
]);
const boundedMap=<T extends z.ZodType>(value:T,max:number)=>z.record(nameSchema,value).refine(v=>Object.keys(v).length<=max);
export const localConfigSchema=z.strictObject({schemaVersion:z.literal(1),readRoots:boundedMap(absolute,16).refine(v=>Object.keys(v).length>0),
  sources:boundedMap(z.discriminatedUnion("kind",[
    z.strictObject({kind:z.literal("local-directory"),directory:fileReferenceSchema}),
    z.strictObject({kind:z.literal("structurizr-json"),sourceId:nameSchema,model:fileReferenceSchema,overlay:fileReferenceSchema}),
    z.strictObject({kind:z.literal("mcp"),server:nameSchema,sourceId:nameSchema})]),16),
  knowledgeServers:boundedMap(mcpKnowledgeServerSchema,1).optional(),
  providers:boundedMap(provider,5)});
export const localConfigV2Schema=localConfigSchema.extend({schemaVersion:z.literal(2),enterpriseSources:boundedMap(z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("enterprise-json"),file:fileReferenceSchema}),
  z.strictObject({kind:z.literal("mcp"),server:nameSchema,sourceId:nameSchema})]),16)});
export class LocalHostError extends Error {constructor(readonly code:string){super(code);}}
export interface LocalHostConfig {readonly roots:Readonly<Record<string,string>>;readonly sources:Readonly<Record<string,KnowledgePackSourceConfig>>;
  readonly enterpriseSources:Readonly<Record<string,EnterpriseSourceConfig>>;
  readonly providers:z.infer<typeof localConfigSchema>["providers"];readonly policy:LocalReadPolicy;}
export async function loadLocalHostConfig(file:string):Promise<LocalHostConfig> {
  try {
    if(!path.isAbsolute(file))throw new LocalHostError("config-path-invalid");
    const configPolicy=await createLocalReadPolicy([path.dirname(file)]);
    const input=await readLocalTextInput(path.dirname(file),path.basename(file),{maxBytes:64*1024,localReadPolicy:configPolicy});
    const parsed=z.union([localConfigSchema,localConfigV2Schema]).safeParse(parseLocalJson(input.text));if(!parsed.success)throw new LocalHostError("config-invalid");
    const c=parsed.data,policy=await createLocalReadPolicy(Object.values(c.readRoots)),roots=Object.freeze({...c.readRoots});
    const resolve=async(ref:FileReference)=>{const root=roots[ref.root];if(!root)throw new LocalHostError("root-unknown");return resolveLocalReadReference(root,ref.path,policy,true);};
    const sources:Record<string,KnowledgePackSourceConfig>={};
    const serverConfig=(name:string)=>{
      const server=c.knowledgeServers&&Object.hasOwn(c.knowledgeServers,name)?c.knowledgeServers[name]:undefined;
      if(!server)throw new LocalHostError("knowledge-server-unknown");
      return Object.freeze({...server,args:Object.freeze([...server.args]) as unknown as string[],...(server.credentialEnv?{credentialEnv:Object.freeze([...server.credentialEnv]) as unknown as string[]}:{})});
    };
    for(const [name,s]of Object.entries(c.sources)){
      if(s.kind==="mcp"){
        sources[name]=Object.freeze({kind:"mcp",sourceId:s.sourceId,server:serverConfig(s.server)});
      }else sources[name]=Object.freeze(s.kind==="local-directory"?{kind:s.kind,path:await resolve(s.directory)}:{kind:s.kind,sourceId:s.sourceId,modelPath:await resolve(s.model),overlayPath:await resolve(s.overlay)});
    }
    const enterpriseSources:Record<string,EnterpriseSourceConfig>={};
    if(c.schemaVersion===2)for(const [name,s]of Object.entries(c.enterpriseSources))enterpriseSources[name]=Object.freeze(s.kind==="enterprise-json"?
      {kind:s.kind,path:await resolve(s.file)}:{kind:s.kind,sourceId:s.sourceId,server:serverConfig(s.server)});
    Object.values(c.providers).forEach(Object.freeze);
    return Object.freeze({roots,sources:Object.freeze(sources),enterpriseSources:Object.freeze(enterpriseSources),providers:Object.freeze(c.providers),policy});
  }catch(e){if(e instanceof LocalHostError)throw e;throw new LocalHostError("config-invalid");}
}
export async function readHostInput(config:LocalHostConfig,reference:FileReference,maxBytes:number,signal?:AbortSignal) {
  const root=Object.hasOwn(config.roots,reference.root)?config.roots[reference.root]:undefined;if(!root)throw new LocalHostError("root-unknown");
  try{return await readLocalTextInput(root,reference.path,{maxBytes,localReadPolicy:config.policy,signal});}
  catch(e){if(signal?.aborted)throw new LocalHostError("cancelled");throw new LocalHostError(e&&typeof e==="object"&&"code"in e?String(e.code):"input-read-failed");}
}
/** Credentials are read only when explicitly requested by an operation using this provider. */
export function hostGenerator(config:LocalHostConfig,name:string,environment:NodeJS.ProcessEnv=process.env):GeneratorConfig {
  const p=Object.hasOwn(config.providers,name)?config.providers[name]:undefined;if(!p)throw new LocalHostError("provider-unknown");
  if("credentialEnv"in p){const key=environment[p.credentialEnv];if(!key||!validateApiKey(key).ok)throw new LocalHostError("credential-invalid");
    return {kind:"remote-provider",profileId:p.profileId,modelId:p.modelId,timeoutMs:p.timeoutMs,credential:{type:"api-key",value:key}};}
  return {kind:"openai-compatible-local",profileId:p.profileId,modelId:p.modelId,timeoutMs:p.timeoutMs,...(p.baseUrl?{baseUrl:p.baseUrl}:{})};
}
