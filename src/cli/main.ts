import {parseArgs}from"node:util";
import {loadLocalHostConfig,LocalHostError,type FileReference}from"../hosts/local/config.js";
import {LocalOperations}from"../hosts/local/operations.js";
import {inspectInputSchema,verifyInputSchema,generateInputSchema,timeoutSchema}from"../hosts/local/schemas.js";
import {resultExitCode,resultText}from"../hosts/local/results.js";
let outputFailed=false;
process.stdout.on("error",()=>{outputFailed=true;process.exitCode=3;});
process.stderr.on("error",()=>{process.exitCode=3;});
async function writeOutput(text:string):Promise<void>{await new Promise<void>((resolve,reject)=>process.stdout.write(text,error=>error?reject(error):resolve()));}
export const version="0.3.0-alpha.7";
const help=`Archi Agent ${version}\nUsage:\n  archi-agent knowledge inspect --config /absolute/config.json --source NAME [--query TEXT] [--offset N] [--limit N]\n  archi-agent flow verify --config /absolute/config.json --source NAME --input ROOT:PATH --input-format plantuml-sequence|prose [--provider NAME] [--language pl|en] [--decisions ROOT:PATH]\n  archi-agent diagram generate --config /absolute/config.json --source NAME --input ROOT:PATH --type sequence|component|c4-context|c4-container --provider NAME [--system-id ID --expected-knowledge-digest SHA256] [--decisions ROOT:PATH]\n  archi-agent mcp serve --config /absolute/config.json\nOptions: --format text|json (default text), --timeout-ms N (1..600000).\nVerification exit codes: 0 conformant within scope, 1 discrepancies, 2 partial/unsupported, 3 execution error, 124 timeout, 130 SIGINT, 143 SIGTERM.\n`;
function reference(value:string|undefined):FileReference{const m=value?.match(/^([a-z][a-z0-9-]{0,55}):(.+)$/);if(!m)throw new LocalHostError("file-reference-invalid");return {root:m[1]!,path:m[2]!};}
function integer(value:string|undefined){if(value===undefined)return undefined;if(!/^\d+$/.test(value))throw new LocalHostError("argument-invalid");return Number(value);}
export async function main(argv=process.argv.slice(2)):Promise<number>{
  if(argv.length===1&&argv[0]==="--version"){await writeOutput(version+"\n");return 0;}
  if(argv.length===1&&argv[0]==="--help"){await writeOutput(help);return 0;}
  const command=argv.slice(0,2).join(" ");
  const specific:Record<string,string[]>={"knowledge inspect":["query","offset","limit","expected-knowledge-digest"],"flow verify":["input","input-format","provider","language","decisions"],"diagram generate":["input","type","provider","system-id","expected-knowledge-digest","decisions"],"mcp serve":[]};
  const flags=specific[command];if(!flags)throw new LocalHostError("command-unknown");
  const names=["config",...(command==="mcp serve"?[]:["source","format","timeout-ms"]),...flags];
  const parsed=parseArgs({args:argv.slice(2),options:Object.fromEntries(names.map(n=>[n,{type:"string"as const}])),strict:true,allowPositionals:false,tokens:true});
  const seen=new Set<string>();for(const t of parsed.tokens??[]){if(t.kind==="option"){if(seen.has(t.name))throw new LocalHostError("argument-duplicate");seen.add(t.name);}}
  const v=parsed.values;
  if(!v.config)throw new LocalHostError("config-required");
  const config=await loadLocalHostConfig(v.config);
  if(command==="mcp serve"){const {serve}=await import("./mcp-entry.js");await serve(config);return 0;}
  if(v.format!==undefined&&v.format!=="json"&&v.format!=="text")throw new LocalHostError("format-invalid");
  const timeout=timeoutSchema.parse(integer(v["timeout-ms"])??(command==="diagram generate"?240000:120000));
  const controller=new AbortController();let signalCode=0;
  const interrupt=()=>{signalCode=130;controller.abort("SIGINT");},terminate=()=>{signalCode=143;controller.abort("SIGTERM");};
  process.once("SIGINT",interrupt);process.once("SIGTERM",terminate);
  const timer=setTimeout(()=>{signalCode=124;controller.abort("timeout");},timeout);
  const ops=new LocalOperations(config,"cli"),deadlineAt=Date.now()+timeout;
  try{
    let result;
    if(command==="knowledge inspect"){
      const input=inspectInputSchema.parse({source:v.source,query:v.query,offset:integer(v.offset),limit:integer(v.limit),expectedKnowledgeDigest:v["expected-knowledge-digest"]});
      result=await ops.run("knowledge.inspect",()=>ops.inspect(input,controller.signal),controller.signal,deadlineAt);
    }else if(command==="flow verify"){
      const input=verifyInputSchema.parse({source:v.source,input:reference(v.input),format:v["input-format"],provider:v.provider,language:v.language});
      result=await ops.run("flow.verify",()=>ops.verify(input,controller.signal,v.decisions?reference(v.decisions):undefined),controller.signal,deadlineAt);
    }else{
      const input=generateInputSchema.parse({source:v.source,input:reference(v.input),diagramType:v.type,provider:v.provider,
        ...(v["system-id"]!==undefined||v["expected-knowledge-digest"]!==undefined?{c4Selection:{systemId:v["system-id"],expectedKnowledgeDigest:v["expected-knowledge-digest"]}}:{}),...(v.decisions?{decisionsFile:reference(v.decisions)}:{})});
      result=await ops.run("diagram.generate",()=>ops.generate(input,controller.signal),controller.signal,deadlineAt);
    }
    const output=v.format==="json"?JSON.stringify(result)+"\n":resultText(result);
    await writeOutput(output);
    return signalCode||resultExitCode(result);
  }finally{clearTimeout(timer);process.off("SIGINT",interrupt);process.off("SIGTERM",terminate);}
}
void main().then(code=>{process.exitCode=outputFailed?3:code;},()=>{process.stderr.write("archi-agent: invalid configuration, arguments or process transport (execution-error).\n");process.exitCode=3;});
