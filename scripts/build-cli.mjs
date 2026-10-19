import{bundleNotices}from"./bundle-notices.mjs";
import {build}from'esbuild';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync}from'node:fs';
import path from'node:path';
import {fileURLToPath}from'node:url';
import {buildExtensionBundles,projectRoot}from'../vscode-extension/scripts/build.mjs';
export async function buildCli(outDir=path.join(projectRoot,'build/mcp1/cli')){
 const bin=path.join(outDir,'bin');mkdirSync(bin,{recursive:true});
 copyFileSync(path.join(projectRoot,'distribution/cli/package.json'),path.join(outDir,'package.json'));
 const bundles=await buildExtensionBundles({outDir:path.join(outDir,'.bundles')});copyFileSync(bundles.runtimeFile,path.join(bin,'archi-agent-runtime.js'));
 const runtimeEntry=path.join(projectRoot,'src/runtime/index.ts');
 const plugin={name:'shared-runtime',setup(b){b.onResolve({filter:/runtime\/index\.js$/},args=>path.resolve(args.resolveDir,args.path.replace(/\.js$/,'.ts'))===runtimeEntry?{path:'./archi-agent-runtime.js',external:true}:undefined);}};
 const common={bundle:true,platform:'node',format:'cjs',target:['node22'],sourcemap:false,minify:false,legalComments:'none',treeShaking:true,absWorkingDir:projectRoot,plugins:[plugin],metafile:true};
 const cli=await build({...common,entryPoints:['src/cli/main.ts'],outfile:path.join(bin,'archi-agent.cjs'),banner:{js:'#!/usr/bin/env node'}});
 const knowledge=await build({...common,entryPoints:['src/knowledge-server/main.ts'],outfile:path.join(bin,'archi-agent-knowledge-server.cjs'),banner:{js:'#!/usr/bin/env node'}});
 const mcp=await build({...common,entryPoints:['src/mcp/server.ts'],outfile:path.join(bin,'archi-agent-mcp.cjs')});
 writeFileSync(path.join(outDir,'build-inputs.json'),JSON.stringify({cli:cli.metafile.inputs,mcp:mcp.metafile.inputs,knowledge:knowledge.metafile.inputs},null,2));
 const notices=bundleNotices(readFileSync(path.join(projectRoot,'vscode-extension/THIRD_PARTY_NOTICES.md'),'utf8'),{...cli.metafile.inputs,...mcp.metafile.inputs,...knowledge.metafile.inputs,...bundles.runtimeMetafile.inputs},projectRoot);
 writeFileSync(path.join(outDir,'THIRD_PARTY_NOTICES.md'),notices);
 return outDir;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(await buildCli(process.argv[2]?path.resolve(process.argv[2]):undefined));
