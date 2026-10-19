import {mkdirSync,copyFileSync,writeFileSync,readFileSync,chmodSync}from'node:fs';
import {execFileSync}from'node:child_process';
import path from'node:path';
import {buildCli}from'./build-cli.mjs';
const out=path.resolve(process.argv[2]??'build/mcp1/cli-package');mkdirSync(out,{recursive:true});
const stage=path.join(out,'package');await buildCli(stage);
for(const [source,target]of [['distribution/cli/package.json','package.json'],['LICENSE','LICENSE.txt'],['docs/en/cli-mcp.md','README.md'],['docs/pl/cli-mcp.md','README.pl.md']])copyFileSync(source,path.join(stage,target));
// Keep the language switch offline; supplementary repository docs are online.
for(const [language,name]of [['en','README.md'],['pl','README.pl.md']]){
 const file=path.join(stage,name),sourceDir=path.resolve('docs',language);
 writeFileSync(file,readFileSync(file,'utf8').replace(/(!?\[[^\]]*\])\(([^)]+)\)/g,(_,label,target)=>{
  if(/^(https?:|#)/.test(target))return `${label}(${target})`;
  if(target===`../${language==='en'?'pl':'en'}/cli-mcp.md`)return `${label}(${language==='en'?'README.pl.md':'README.md'})`;
  const [relative,anchor]=target.split('#'),repoFile=path.relative(process.cwd(),path.resolve(sourceDir,relative)).split(path.sep).join('/');
  return `${label}(https://github.com/Setech-pl/archi-agent/blob/main/${repoFile}${anchor?'#'+anchor:''})`;
 }));
}
writeFileSync(path.join(stage,'distribution-profile.json'),JSON.stringify({schemaVersion:1,profile:'core',ocr:{required:false}})+'\n');
chmodSync(path.join(stage,'bin/archi-agent.cjs'),0o755);chmodSync(path.join(stage,'bin/archi-agent-knowledge-server.cjs'),0o755);
const p=JSON.parse(readFileSync(path.join(stage,'package.json'))),file=path.join(out,`archi-agent-cli-${p.version}.tgz`);
execFileSync('tar',['-czf',file,'--exclude=package/.bundles','--exclude=package/build-inputs.json','package'],{cwd:out});
console.log(file);
