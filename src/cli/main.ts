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
const help=`Archi Agent ${version}\nUsage:\n  archi-agent knowledge inspect --config /absolute/config.json --source NAME [--query TEXT] [--offset N] [--limit N]\n  archi-agent knowledge inspect --config /absolute/config.json --source NAME --type capability-map [--expected-catalog-digest SHA256]\n  archi-agent flow verify --config /absolute/config.json --source NAME --input ROOT:PATH --input-format plantuml-sequence|prose [--provider NAME] [--language pl|en] [--decisions ROOT:PATH]\n  archi-agent diagram generate --config /absolute/config.json --source NAME --input ROOT:PATH --type sequence|component|c4-context|c4-container --provider NAME [--system-id ID --expected-knowledge-digest SHA256] [--decisions ROOT:PATH]\n  archi-agent diagram generate --config /absolute/config.json --source NAME --type capability-map [--root ID] [--max-level 1|2|3] [--color-scale ID] [--language pl|en] [--expected-catalog-digest SHA256]\n  archi-agent diagram generate --config /absolute/config.json --source NAME --type capability-application-map [--capability ID] [--include-descendants true|false] [--language pl|en]\n  archi-agent mcp serve --config /absolute/config.json\nOptions: --format text|json (default text), --timeout-ms N (1..600000).\nCapability Map: zero LLM calls; defaults whole map, level 3, no rating colors, language en. No file writes.\nVerification exit codes: 0 conformant within scope, 1 discrepancies, 2 partial/unsupported, 3 execution error, 124 timeout, 130 SIGINT, 143 SIGTERM.\n`;
function reference(value:string|undefined):FileReference{const m=value?.match(/^([a-z][a-z0-9-]{0,55}):(.+)$/);if(!m)throw new LocalHostError("file-reference-invalid");return {root:m[1]!,path:m[2]!};}
function integer(value:string|undefined){if(value===undefined)return undefined;if(!/^\d+$/.test(value))throw new LocalHostError("argument-invalid");return Number(value);}
export async function main(argv=process.argv.slice(2)):Promise<number>{
  if(argv.length===1&&argv[0]==="--version"){await writeOutput(version+"\n");return 0;}
  if(argv.length===1&&argv[0]==="--help"){await writeOutput(help);return 0;}
  const command=argv.slice(0,2).join(" ");
  const specific:Record<string,string[]>={"knowledge inspect":["query","offset","limit","expected-knowledge-digest","type","expected-catalog-digest"],"flow verify":["input","input-format","provider","language","decisions"],"diagram generate":["input","type","provider","system-id","expected-knowledge-digest","decisions","root","max-level","color-scale","language","expected-catalog-digest","capability","include-descendants"],"mcp serve":[]};
  const flags=specific[command];if(!flags)throw new LocalHostError("command-unknown");
  const names=["config",...(command==="mcp serve"?[]:["source","format","timeout-ms"]),...flags];
  const parsed=parseArgs({args:argv.slice(2),options:Object.fromEntries(names.map(n=>[n,{type:"string"as const}])),strict:true,allowPositionals:false,tokens:true});
  const seen=new Set<string>();for(const t of parsed.tokens??[]){if(t.kind==="option"){if(seen.has(t.name))throw new LocalHostError("argument-duplicate");seen.add(t.name);}}
  const v=parsed.values;
  const applicationMap=v.type==="capability-application-map",enterprise=v.type==="capability-map"||applicationMap;
  if(v["include-descendants"]!==undefined&&!["true","false"].includes(v["include-descendants"]!))throw new LocalHostError("arguments-invalid");
  const reject=(flags:string[])=>{if(flags.some(f=>v[f]!==undefined))throw new LocalHostError("arguments-invalid");};
  if(command==="knowledge inspect"){
    if(v.type!==undefined&&!enterprise)throw new LocalHostError("arguments-invalid");
    reject(enterprise?["query","offset","limit","expected-knowledge-digest"]:["expected-catalog-digest"]);
  }
  if(command==="diagram generate"){
    if(applicationMap)reject(["root","max-level","color-scale"]);else reject(["capability","include-descendants"]);
    reject(enterprise?["input","provider","decisions","system-id","expected-knowledge-digest"]:["root","max-level","color-scale","language","expected-catalog-digest","capability","include-descendants"]);
    if(!enterprise&&!["c4-context","c4-container"].includes(v.type??""))reject(["system-id","expected-knowledge-digest"]);
    if(v.type?.startsWith("c4-"))reject(["decisions"]);
  }
  if(!v.config)throw new LocalHostError("config-required");
  const config=await loadLocalHostConfig(v.config);
  if(command==="mcp serve"){const {serve}=await import("./mcp-entry.js");await serve(config);return 0;}
  if(v.format!==undefined&&v.format!=="json"&&v.format!=="text")throw new LocalHostError("format-invalid");
  const timeout=timeoutSchema.parse(integer(v["timeout-ms"])??(enterprise?30000:command==="diagram generate"?240000:120000));
  const controller=new AbortController();let signalCode=0;
  const interrupt=()=>{signalCode=130;controller.abort("SIGINT");},terminate=()=>{signalCode=143;controller.abort("SIGTERM");};
  process.once("SIGINT",interrupt);process.once("SIGTERM",terminate);
  const timer=setTimeout(()=>{signalCode=124;controller.abort("timeout");},timeout);
  const ops=new LocalOperations(config,"cli"),deadlineAt=Date.now()+timeout;
  try{
    let result;
    if(command==="knowledge inspect"){
      const input=inspectInputSchema.parse(enterprise?{source:v.source,diagramType:v.type,expectedCatalogDigest:v["expected-catalog-digest"]}:
        {source:v.source,query:v.query,offset:integer(v.offset),limit:integer(v.limit),expectedKnowledgeDigest:v["expected-knowledge-digest"]});
      result=await ops.run("knowledge.inspect",()=>ops.inspect(input,controller.signal),controller.signal,deadlineAt,applicationMap?"capability-application-map":enterprise);
    }else if(command==="flow verify"){
      const input=verifyInputSchema.parse({source:v.source,input:reference(v.input),format:v["input-format"],provider:v.provider,language:v.language});
      result=await ops.run("flow.verify",()=>ops.verify(input,controller.signal,v.decisions?reference(v.decisions):undefined),controller.signal,deadlineAt);
    }else{
      const input=generateInputSchema.parse(applicationMap?{source:v.source,diagramType:v.type,selection:{capabilityIds:v.capability?[v.capability]:[],includeDescendants:v["include-descendants"]!=="false",language:v.language??"en",expectedCatalogDigest:v["expected-catalog-digest"]}}:enterprise?{source:v.source,diagramType:"capability-map",selection:{rootIds:v.root===undefined?[]:[v.root],maxLevel:integer(v["max-level"])??3,
        colorBy:v["color-scale"]===undefined?{kind:"none"}:{kind:"rating",scaleId:v["color-scale"]},language:v.language??"en",expectedCatalogDigest:v["expected-catalog-digest"]}}:{source:v.source,input:reference(v.input),diagramType:v.type,provider:v.provider,
        ...(v["system-id"]!==undefined||v["expected-knowledge-digest"]!==undefined?{c4Selection:{systemId:v["system-id"],expectedKnowledgeDigest:v["expected-knowledge-digest"]}}:{}),...(v.decisions?{decisionsFile:reference(v.decisions)}:{})});
      result=await ops.run("diagram.generate",()=>ops.generate(input,controller.signal),controller.signal,deadlineAt,applicationMap?"capability-application-map":enterprise);
    }
    const output=v.format==="json"?JSON.stringify(result)+"\n":resultText(result);
    await writeOutput(output);
    return signalCode||resultExitCode(result);
  }finally{clearTimeout(timer);process.off("SIGINT",interrupt);process.off("SIGTERM",terminate);}
}
void main().then(code=>{process.exitCode=outputFailed?3:code;},()=>{process.stderr.write("archi-agent: invalid configuration, arguments or process transport (execution-error).\n");process.exitCode=3;});
