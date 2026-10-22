import {enterpriseToolV2,validateEnterpriseResponseV2} from "../core/enterprise/enterprise-transfer-v2.js";
import { containsCredential } from "./sensitive-response.js";
import path from"node:path";
import{Client}from"@modelcontextprotocol/sdk/client/index.js";
import{StdioClientTransport}from"@modelcontextprotocol/sdk/client/stdio.js";
import{z}from"zod";
import {$ZodError} from "zod/v4/core";
import{validateKnowledgeResponse,KnowledgeTransferError}from"../core/knowledge-pack/knowledge-transfer.js";
import {enterpriseTool,enterpriseStateSchema,validateEnterpriseResponse} from "../core/enterprise/enterprise-transfer.js";
import {EnterpriseError} from "../core/enterprise/enterprise-catalog.js";
import {McpError,ErrorCode,ListToolsResultSchema,CallToolResultSchema} from "@modelcontextprotocol/sdk/types.js";
import type{CancellationSignal}from"../core/knowledge-pack/knowledge-pack-source.js";
export const mcpKnowledgeServerSchema=z.strictObject({command:z.string().min(1).max(8192).refine(v=>path.isAbsolute(v)&&!/[\x00-\x1f\x7f]/.test(v)&&(process.platform!=="win32"||/\.exe$/i.test(v))),
 args:z.array(z.string().max(1024).refine(v=>!/[\x00-\x1f\x7f]/.test(v))).max(32),credentialEnv:z.array(z.string().regex(/^ARCHI_AGENT_[A-Z0-9_]{1,80}$/)).max(8).optional(),timeoutMs:z.number().int().min(1).max(120000).optional()});
export type McpKnowledgeServerConfig=z.infer<typeof mcpKnowledgeServerSchema>;
export class McpKnowledgeError extends Error{constructor(readonly code:string){super(code);}}
/** One trusted process/source, one fixed tool call. No model or tool discovery participates. */
export async function fetchMcpKnowledge(server:McpKnowledgeServerConfig,sourceId:string,signal?:CancellationSignal){
 return fetchMcpSource(server,sourceId,signal,false) as Promise<ReturnType<typeof validateKnowledgeResponse>>;
}
export async function fetchMcpEnterprise(server:McpKnowledgeServerConfig,sourceId:string,signal?:CancellationSignal,deadlineAt?:number,contractVersion:1|2=1){
 return fetchMcpSource(server,sourceId,signal,true,deadlineAt,contractVersion) as Promise<ReturnType<typeof validateEnterpriseResponse>>;
}
async function fetchMcpSource(server:McpKnowledgeServerConfig,sourceId:string,signal:CancellationSignal|undefined,enterprise:boolean,operationDeadline?:number,contractVersion:1|2=1){
 const tool=contractVersion===2?enterpriseToolV2:enterpriseTool;
 const checked=mcpKnowledgeServerSchema.safeParse(server);if(!checked.success||!/^[a-z][a-z0-9-]{0,55}$/.test(sourceId))throw new McpKnowledgeError("mcp-knowledge-configuration-invalid");
 if(signal?.aborted)throw new McpKnowledgeError("cancelled");
 const config=checked.data,env:Record<string,string>={};for(const name of config.credentialEnv??[]){const value=process.env[name];if(value!==undefined)env[name]=value;}
 const transport=new StdioClientTransport({command:config.command,args:config.args,env,stderr:"ignore",maxBufferSize:64*1024*1024});
 let closed=false;let confirmClose!:()=>void;const childClosed=new Promise<void>(resolve=>{confirmClose=resolve;});
 transport.onclose=()=>{closed=true;confirmClose();};
 const client=new Client({name:"archi-agent-knowledge-client",version:"0.3.0-alpha.7"});
 const controller=new AbortController();let timedOut=false,oversized=false;const deadlineAt=Math.min(Date.now()+(config.timeoutMs??120000),operationDeadline??Infinity);
 client.onerror=e=>{if(enterprise&&e.message.startsWith("ReadBuffer exceeded maximum size of ")){oversized=true;controller.abort();}};
 const remaining=()=>Math.max(1,deadlineAt-Date.now());
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},remaining());
 const poll=setInterval(()=>{if(signal?.aborted)controller.abort();},20);
 let pid:number|null=null;
 const aborted=new Promise<never>((_resolve,reject)=>{controller.signal.addEventListener("abort",()=>{pid=pid??transport.pid;void transport.close();reject(new McpKnowledgeError(oversized?"mcp-knowledge-result-too-large":timedOut?"mcp-knowledge-timeout":"cancelled"));},{once:true});});
 const start=transport.start.bind(transport);transport.start=async()=>{await start();pid=transport.pid;};
 try{
  const connecting=client.connect(transport,{timeout:remaining(),signal:controller.signal});
  await Promise.race([connecting,aborted]);pid=transport.pid;
  if(enterprise){
   let cursor:string|undefined,found=false,bytes=0,count=0;const cursors=new Set<string>();
   for(let page=0;page<16;page++){
    let list;
    // Do not compile/cache source-authored outputSchema or execute task metadata from discovery.
    try{list=await Promise.race([client.request({method:"tools/list",params:cursor?{cursor}:undefined},ListToolsResultSchema,{signal:controller.signal,timeout:remaining()}),aborted]);}
    catch(e){if(e instanceof McpError&&e.code===ErrorCode.MethodNotFound)throw new EnterpriseError("enterprise-unsupported");if(e instanceof $ZodError)throw new EnterpriseError("enterprise-response-invalid");throw e;}
    if(containsCredential(list,Object.values(env)))throw new McpKnowledgeError("mcp-knowledge-sensitive-response");
    bytes+=Buffer.byteLength(JSON.stringify(list));count+=list.tools.length;
    if(bytes>1024*1024||count>256)throw new EnterpriseError("enterprise-response-invalid");
    found ||= list.tools.some(entry=>entry.name===tool);
    if(!list.nextCursor){if(!found)throw new EnterpriseError("enterprise-unsupported");break;}
    if(page===15||cursors.has(list.nextCursor))throw new EnterpriseError("enterprise-response-invalid");
    cursor=list.nextCursor;cursors.add(cursor);
   }
  }
  let result;
  try{result=await Promise.race([enterprise?
    client.request({method:"tools/call",params:{name:tool,arguments:{sourceId,contractVersion}}},CallToolResultSchema,{signal:controller.signal,timeout:remaining()}):
    client.callTool({name:"get_knowledge_snapshot",arguments:{sourceId}},undefined,{signal:controller.signal,timeout:remaining()}),aborted]);}
  catch(e){if(enterprise&&e instanceof McpError&&e.code===ErrorCode.InvalidParams)throw new EnterpriseError("enterprise-unsupported");if(enterprise&&e instanceof $ZodError)throw new EnterpriseError("enterprise-response-invalid");throw e;}
  if(controller.signal.aborted||signal?.aborted)throw new McpKnowledgeError(timedOut?"mcp-knowledge-timeout":"cancelled");
  const serialized=JSON.stringify(result);
  if(containsCredential(result,Object.values(env)))throw new McpKnowledgeError("mcp-knowledge-sensitive-response");
  if(Buffer.byteLength(serialized)>64*1024*1024)throw new McpKnowledgeError("mcp-knowledge-result-too-large");
  if(enterprise){
   const state=enterpriseStateSchema.safeParse(result.structuredContent);
   if(state.success){
    const code=state.data.code;
    if(state.data.status==="unsupported"&&!result.isError)throw new EnterpriseError(code);
    if(state.data.status==="failed"&&result.isError)throw new McpKnowledgeError(code==="result-too-large"?"mcp-knowledge-result-too-large":code==="cancelled"||code==="deadline-exceeded"?code:"mcp-knowledge-source-failed");
    throw new EnterpriseError("enterprise-response-invalid");
   }
  }
  if(result.isError||!result.structuredContent)throw new McpKnowledgeError("mcp-knowledge-source-failed");
  const loaded=enterprise?(contractVersion===2?validateEnterpriseResponseV2(result.structuredContent,sourceId):validateEnterpriseResponse(result.structuredContent,sourceId)):validateKnowledgeResponse(result.structuredContent,sourceId);
  if(signal?.aborted||controller.signal.aborted||Date.now()>=deadlineAt)throw new McpKnowledgeError(signal?.aborted?"cancelled":"mcp-knowledge-timeout");
  return loaded;
 }catch(e){if(e instanceof KnowledgeTransferError||e instanceof McpKnowledgeError||e instanceof EnterpriseError)throw e;throw new McpKnowledgeError(signal?.aborted?"cancelled":timedOut||Date.now()>=deadlineAt?"mcp-knowledge-timeout":"mcp-knowledge-unavailable");}
 finally{
  clearTimeout(timer);clearInterval(poll);pid=pid??transport.pid;await client.close().catch(()=>{});await transport.close().catch(()=>{});
  // SDK close can return immediately after SIGKILL. Await its actual close notification.
  if(pid!==null&&!closed){let expired=false;const deadline=setTimeout(()=>{expired=true;confirmClose();},5000);await childClosed;clearTimeout(deadline);if(expired)throw new McpKnowledgeError("mcp-knowledge-cleanup-unconfirmed");}
 }
}
