import{validateKnowledgeResponse,createEnterpriseResponse,validateEnterpriseResponse,createEnterpriseResponseV2,validateEnterpriseResponseV2}from"../runtime/index.js";
import{parseArgs}from"node:util";
import{loadLocalHostConfig}from"../hosts/local/config.js";
import{StructurizrKnowledgeAdapter,EnterpriseJsonAdapter}from"./adapter.js";
import{serveKnowledge}from"./server.js";
let outputFailed=false;process.stdout.on("error",()=>{outputFailed=true;process.exitCode=3;});process.stderr.on("error",()=>{process.exitCode=3;});
async function main(){
 const{values}=parseArgs({options:{config:{type:"string"},"check-source":{type:"string"},type:{type:"string"},help:{type:"boolean"}},strict:true});
 if(values.help){process.stdout.write("Usage: archi-agent-knowledge-server --config /absolute/config.json [--check-source NAME [--type enterprise]]\n");return;}
 if(!values.config||values.type!==undefined&&(values.type!=="enterprise"||!values["check-source"]))throw Error();
 const config=await loadLocalHostConfig(values.config),adapter=new StructurizrKnowledgeAdapter(config);
 const enterprise=Object.keys(config.enterpriseSources).length?new EnterpriseJsonAdapter(config):undefined;
 if(values["check-source"]&&values.type==="enterprise"){
  if(!enterprise)throw Error();const id=values["check-source"],catalog=await enterprise.load(id,new AbortController().signal),response=(catalog.schemaVersion===2?createEnterpriseResponseV2:createEnterpriseResponse)(id,catalog);
  const snapshot=catalog.schemaVersion===2?validateEnterpriseResponseV2(response,id):validateEnterpriseResponse(response,id);
  process.stdout.write(JSON.stringify({status:"valid",source:response.source,snapshot:response.snapshot,counts:{capabilities:snapshot.catalog.capabilities.length,scales:snapshot.catalog.scales.length}})+"\n");return;
 }
 if(values["check-source"]){const response=await adapter.load(values["check-source"],new AbortController().signal),loaded=validateKnowledgeResponse(response,values["check-source"]);
  process.stdout.write(JSON.stringify({status:"valid",source:response.source,snapshot:response.snapshot,counts:Object.fromEntries(["systems","actors","relationships","aliases","rules"].map(t=>[t,loaded.pack[t as "systems"].length]))})+"\n");return;
 }
 await serveKnowledge(Object.keys(config.sources).length||!enterprise?adapter:undefined,enterprise);
}
void main().catch(()=>{process.stderr.write("knowledge-server: configuration-or-process-error.\n");process.exitCode=3;});
