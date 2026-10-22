import {loadEnterpriseJson,parseEnterpriseText} from "../node/enterprise-json-source.js";
import {fetchMcpEnterprise,type McpKnowledgeServerConfig} from "../node/mcp-knowledge-source.js";
import type {LocalReadPolicy} from "../node/local-read-policy.js";
import type {CancellationSignal} from "./runtime-types.js";
import {EnterpriseError} from "../core/enterprise/enterprise-catalog.js";

export type EnterpriseTextSource = {readonly kind:"enterprise-text";readonly text:string;readonly name:string};
export type EnterpriseSourceConfig = {readonly kind:"enterprise-json";readonly path:string} | EnterpriseTextSource |
  {readonly kind:"mcp";readonly sourceId:string;readonly contractVersion?:2;readonly server:McpKnowledgeServerConfig};
export async function loadEnterpriseSource(source:EnterpriseSourceConfig,signal?:CancellationSignal,policy?:LocalReadPolicy,deadlineAt?:number){
  if(source?.kind==="enterprise-text"){
    if(Object.keys(source).sort().join(",")!=="kind,name,text"||typeof source.name!=="string"||source.name.length<1||
      [...source.name].length>160||source.name==="."||source.name===".."||/[/\\\p{Cc}\p{Cf}]/u.test(source.name))throw new EnterpriseError("invalid-source");
    return parseEnterpriseText(source.text,`editor-buffer:${source.name}`,signal);
  }
  if(source?.kind==="mcp"){
    if(Object.keys(source).filter(k=>k!=="contractVersion").sort().join(",")!=="kind,server,sourceId"||(source.contractVersion!==undefined&&source.contractVersion!==2))throw new EnterpriseError("invalid-source");
    return fetchMcpEnterprise(source.server,source.sourceId,signal,deadlineAt,source.contractVersion??1);
  }
  return loadEnterpriseJson(source,signal,policy);
}
