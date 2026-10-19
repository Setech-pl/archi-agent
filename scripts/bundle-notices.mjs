import{readFileSync}from'node:fs';import path from'node:path';
/** Licenses for the packages actually bundled; no unused SDK HTTP/OAuth adapters. */
export function bundleNotices(base,inputs,root){
 const packages=new Set(Object.keys(inputs).flatMap(f=>{const m=f.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/);return m?[m[1]]:[];}));let notices=base;
 for(const name of [...packages].sort()){
  if(notices.includes(`## ${name} `))continue;
  const directory=path.join(root,'node_modules',name),p=JSON.parse(readFileSync(path.join(directory,'package.json')));let license='';
  for(const file of['LICENSE','LICENSE.md','LICENSE.txt','license','license.md'])try{license=readFileSync(path.join(directory,file),'utf8');break;}catch{}
  if(!license)throw Error('Missing bundled license: '+name);notices+=`\n\n## ${name} ${p.version} (${p.license})\n\n${license}`;
 }
 return notices;
}
