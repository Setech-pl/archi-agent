// Runnable knowledge-server launcher. Stdout is reserved for MCP frames.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../',import.meta.url);
const {node,server} = JSON.parse(readFileSync(new URL('local-config/runtime.json',root),'utf8'));
const child = spawn(node,[server,'--config',fileURLToPath(new URL('local-config/knowledge.json',root)),...process.argv.slice(2)],{stdio:'inherit'});
child.on('error',()=>{console.error('Cannot start the configured knowledge server.');process.exitCode=3;});
child.on('exit',code=>{process.exitCode=code??3;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
