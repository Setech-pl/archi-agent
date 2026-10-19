// Minimal dependency-free stdio MCP client, demonstrating the OTHER direction.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const {node,cli}=JSON.parse(readFileSync(new URL('local-config/runtime.json',root),'utf8'));
const child=spawn(node,[cli,'mcp','serve','--config',fileURLToPath(new URL('local-config/archi-agent.json',root))],{stdio:['pipe','pipe','inherit']});
let id=0;const pending=new Map();
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(JSON.stringify(r.error))):p.resolve(r.result);}});
const send=(method,params)=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');});
child.on('error',error=>{for(const p of pending.values())p.reject(error);});
child.on('close',()=>{for(const p of pending.values())p.reject(new Error('MCP closed before a response.'));});
const timer=setTimeout(()=>{console.error('MCP deadline exceeded.');child.kill();process.exitCode=3;},30000);
try{
 await send('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'mission-control-demo',version:'1'}});
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const tools=await send('tools/list',{});console.error('Functions: '+tools.tools.map(t=>t.name).join(', '));
 const result=await send('tools/call',{name:'verify_flow',arguments:{source:'mission-mcp',input:{root:'project',path:'inputs/en/01-good.puml'},format:'plantuml-sequence'}});
 console.log(JSON.stringify(result.structuredContent,null,2));
 if(result.isError||result.structuredContent?.outcome?.report?.report?.assessment!=='conformant-within-scope')process.exitCode=1;
}finally{clearTimeout(timer);lines.close();child.stdin.end();}
