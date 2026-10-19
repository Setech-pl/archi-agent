import { containsCredential } from "./sensitive-response.js";
import path from"node:path";
import{Client}from"@modelcontextprotocol/sdk/client/index.js";
import{StdioClientTransport}from"@modelcontextprotocol/sdk/client/stdio.js";
import{z}from"zod";
import{validateKnowledgeResponse,KnowledgeTransferError}from"../core/knowledge-pack/knowledge-transfer.js";
import type{CancellationSignal}from"../core/knowledge-pack/knowledge-pack-source.js";
export const mcpKnowledgeServerSchema=z.strictObject({command:z.string().min(1).max(8192).refine(v=>path.isAbsolute(v)&&!/[\x00-\x1f\x7f]/.test(v)&&(process.platform!=="win32"||/\.exe$/i.test(v))),
 args:z.array(z.string().max(1024).refine(v=>!/[\x00-\x1f\x7f]/.test(v))).max(32),credentialEnv:z.array(z.string().regex(/^ARCHI_AGENT_[A-Z0-9_]{1,80}$/)).max(8).optional(),timeoutMs:z.number().int().min(1).max(120000).optional()});
export type McpKnowledgeServerConfig=z.infer<typeof mcpKnowledgeServerSchema>;
export class McpKnowledgeError extends Error{constructor(readonly code:string){super(code);}}
/** One trusted process/source, one fixed tool call. No model or tool discovery participates. */
export async function fetchMcpKnowledge(server:McpKnowledgeServerConfig,sourceId:string,signal?:CancellationSignal){
 const checked=mcpKnowledgeServerSchema.safeParse(server);if(!checked.success||!/^[a-z][a-z0-9-]{0,55}$/.test(sourceId))throw new McpKnowledgeError("mcp-knowledge-configuration-invalid");
 if(signal?.aborted)throw new McpKnowledgeError("cancelled");
 const config=checked.data,env:Record<string,string>={};for(const name of config.credentialEnv??[]){const value=process.env[name];if(value!==undefined)env[name]=value;}
 const transport=new StdioClientTransport({command:config.command,args:config.args,env,stderr:"ignore",maxBufferSize:64*1024*1024});
 let closed=false;let confirmClose!:()=>void;const childClosed=new Promise<void>(resolve=>{confirmClose=resolve;});
 transport.onclose=()=>{closed=true;confirmClose();};
 const client=new Client({name:"archi-agent-knowledge-client",version:"0.3.0-alpha.7"});
 const controller=new AbortController();let timedOut=false;const deadlineAt=Date.now()+(config.timeoutMs??120000);
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},config.timeoutMs??120000);
 const poll=setInterval(()=>{if(signal?.aborted)controller.abort();},20);
 let pid:number|null=null;
 const aborted=new Promise<never>((_resolve,reject)=>{controller.signal.addEventListener("abort",()=>{pid=pid??transport.pid;void transport.close();reject(new McpKnowledgeError(timedOut?"mcp-knowledge-timeout":"cancelled"));},{once:true});});
 const start=transport.start.bind(transport);transport.start=async()=>{await start();pid=transport.pid;};
 try{
  const connecting=client.connect(transport,{timeout:config.timeoutMs??120000,signal:controller.signal});
  await Promise.race([connecting,aborted]);pid=transport.pid;
  const result=await Promise.race([client.callTool({name:"get_knowledge_snapshot",arguments:{sourceId}},undefined,{signal:controller.signal,timeout:config.timeoutMs??120000}),aborted]);
  if(controller.signal.aborted||signal?.aborted)throw new McpKnowledgeError(timedOut?"mcp-knowledge-timeout":"cancelled");
  if(result.isError||!result.structuredContent)throw new McpKnowledgeError("mcp-knowledge-source-failed");
  const serialized=JSON.stringify(result);
  if(containsCredential(result,Object.values(env)))throw new McpKnowledgeError("mcp-knowledge-sensitive-response");
  if(Buffer.byteLength(serialized)>64*1024*1024)throw new McpKnowledgeError("mcp-knowledge-result-too-large");
  const loaded=validateKnowledgeResponse(result.structuredContent,sourceId);
  if(signal?.aborted||controller.signal.aborted||Date.now()>=deadlineAt)throw new McpKnowledgeError(signal?.aborted?"cancelled":"mcp-knowledge-timeout");
  return loaded;
 }catch(e){if(e instanceof KnowledgeTransferError||e instanceof McpKnowledgeError)throw e;throw new McpKnowledgeError(signal?.aborted?"cancelled":timedOut?"mcp-knowledge-timeout":"mcp-knowledge-unavailable");}
 finally{
  clearTimeout(timer);clearInterval(poll);pid=pid??transport.pid;await client.close().catch(()=>{});await transport.close().catch(()=>{});
  // SDK close can return immediately after SIGKILL. Await its actual close notification.
  if(pid!==null&&!closed){let expired=false;const deadline=setTimeout(()=>{expired=true;confirmClose();},5000);await childClosed;clearTimeout(deadline);if(expired)throw new McpKnowledgeError("mcp-knowledge-cleanup-unconfirmed");}
 }
}
