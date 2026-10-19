import {execFileSync}from'node:child_process';
import {mkdtempSync,readFileSync,realpathSync}from'node:fs';
import {tmpdir}from'node:os';
import path from'node:path';
import {createHash}from'node:crypto';
const file=path.resolve(process.argv[2]),root=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-cli-check-')));
const names=execFileSync('tar',['-tzf',file],{encoding:'utf8'}).trim().split('\n').filter(n=>!n.endsWith('/'));
const allowed=['package/bin/archi-agent.cjs','package/bin/archi-agent-knowledge-server.cjs','package/bin/archi-agent-mcp.cjs','package/bin/archi-agent-runtime.js','package/package.json','package/distribution-profile.json','package/THIRD_PARTY_NOTICES.md','package/README.md','package/README.pl.md','package/LICENSE.txt'];
if(names.length!==allowed.length||names.some(n=>!allowed.includes(n)))throw Error('CLI archive allowlist mismatch');
execFileSync('tar',['-xzf',file,'-C',root]);
const p=JSON.parse(readFileSync(path.join(root,'package/package.json')));if(p.dependencies||p.scripts||p.engines.node!=='>=22.12.0')throw Error('CLI manifest invalid');
for(const name of ['README.md','README.pl.md'])for(const match of readFileSync(path.join(root,'package',name),'utf8').replace(/```[\s\S]*?```/g,'').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
 const target=match[1];if(/^(https?:|#)/.test(target))continue;
 if(!allowed.includes('package/'+target.split('#')[0]))throw Error('Broken offline CLI guide link: '+target);
}
for(const name of allowed){const bytes=readFileSync(path.join(root,name));if(bytes.includes(Buffer.from(process.cwd()))||/\b(?:require|import)\(["'](?:vscode|@modelcontextprotocol|\.\.\/)/.test(bytes.toString()))throw Error('External runtime import or repository path: '+name);}
const version=execFileSync(process.execPath,[path.join(root,'package/bin/archi-agent.cjs'),'--version'],{cwd:root,env:{...process.env,PATH:'',NODE_PATH:''},encoding:'utf8'}).trim();if(version!==p.version)throw Error('CLI version mismatch');
const prefix=path.join(root,'installed');
execFileSync('npm',['install','--global','--prefix',prefix,'--offline','--ignore-scripts','--no-audit','--no-fund',file],{cwd:root,stdio:'pipe'});
const installed=path.join(prefix,process.platform==='win32'?'node_modules/@setech-pl/archi-agent-cli/bin/archi-agent.cjs':'lib/node_modules/@setech-pl/archi-agent-cli/bin/archi-agent.cjs');
if(execFileSync(process.execPath,[installed,'--version'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:'',NODE_PATH:''}}).trim()!==p.version)throw Error('Installed CLI failed');
console.log(JSON.stringify({installedPrefix:prefix,status:'PASS',file,bytes:readFileSync(file).length,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),entries:names,extracted:root,version},null,2));
