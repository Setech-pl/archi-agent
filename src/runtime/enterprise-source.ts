import {loadEnterpriseJson} from "../node/enterprise-json-source.js";
import {fetchMcpEnterprise,type McpKnowledgeServerConfig} from "../node/mcp-knowledge-source.js";
import type {LocalReadPolicy} from "../node/local-read-policy.js";
import type {CancellationSignal} from "./runtime-types.js";
import {EnterpriseError} from "../core/enterprise/enterprise-catalog.js";

export type EnterpriseSourceConfig = {readonly kind:"enterprise-json";readonly path:string} |
  {readonly kind:"mcp";readonly sourceId:string;readonly server:McpKnowledgeServerConfig};
export async function loadEnterpriseSource(source:EnterpriseSourceConfig,signal?:CancellationSignal,policy?:LocalReadPolicy,deadlineAt?:number){
  if(source?.kind==="mcp"){
    if(Object.keys(source).sort().join(",")!=="kind,server,sourceId")throw new EnterpriseError("invalid-source");
    return fetchMcpEnterprise(source.server,source.sourceId,signal,deadlineAt);
  }
  return loadEnterpriseJson(source,signal,policy);
}
