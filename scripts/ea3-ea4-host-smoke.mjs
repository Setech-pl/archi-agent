import {runHostSmoke} from './ux3-vscode-smoke.mjs';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';import path from 'node:path';
const [core,full,outputArg]=process.argv.slice(2);if(!core||!full||!outputArg)throw Error('Supply Core VSIX, Full VSIX and output directory');
const output=path.resolve(outputArg);
process.env.EA34_CATALOG=path.resolve('examples/retail-checkout/architecture/enterprise-views.json');
const reports=[];mkdirSync(output,{recursive:true});
for(const [profile,file]of [['core',core],['full',full]]){const out=path.join(output,profile);mkdirSync(out,{recursive:true});const results=await runHostSmoke(path.resolve(file),out,'ea3-ea4-extension-host.cjs','ea34');reports.push({profile,results});console.log(JSON.stringify({profile,results},null,2));if(results.some(r=>r.status!=='PASS'))for(const file of readdirSync(out).filter(f=>f.endsWith('.log')))console.log(file+'\n'+readFileSync(path.join(out,file),'utf8'));writeFileSync(path.join(output,'results.json'),JSON.stringify(reports,null,2));}
if(reports.some(r=>r.results.some(x=>x.status!=='PASS')))process.exitCode=1;
