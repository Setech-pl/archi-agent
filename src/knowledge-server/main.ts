import{validateKnowledgeResponse}from"../runtime/index.js";
import{parseArgs}from"node:util";
import{loadLocalHostConfig}from"../hosts/local/config.js";
import{StructurizrKnowledgeAdapter}from"./adapter.js";
import{serveKnowledge}from"./server.js";
let outputFailed=false;process.stdout.on("error",()=>{outputFailed=true;process.exitCode=3;});process.stderr.on("error",()=>{process.exitCode=3;});
async function main(){
 const{values}=parseArgs({options:{config:{type:"string"},"check-source":{type:"string"},help:{type:"boolean"}},strict:true});
 if(values.help){process.stdout.write("Usage: archi-agent-knowledge-server --config /absolute/config.json [--check-source NAME]\n");return;}
 if(!values.config)throw Error();const config=await loadLocalHostConfig(values.config),adapter=new StructurizrKnowledgeAdapter(config);
 if(values["check-source"]){const response=await adapter.load(values["check-source"],new AbortController().signal),loaded=validateKnowledgeResponse(response,values["check-source"]);
  process.stdout.write(JSON.stringify({status:"valid",source:response.source,snapshot:response.snapshot,counts:Object.fromEntries(["systems","actors","relationships","aliases","rules"].map(t=>[t,loaded.pack[t as "systems"].length]))})+"\n");return;
 }
 await serveKnowledge(adapter);
}
void main().catch(()=>{process.stderr.write("knowledge-server: configuration-or-process-error.\n");process.exitCode=3;});
