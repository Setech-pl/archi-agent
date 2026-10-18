#!/usr/bin/env node
import{bundleNotices}from"../../scripts/bundle-notices.mjs";
import {copyFileSync,mkdirSync,readFileSync,rmSync,writeFileSync}from'node:fs';
import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{createVSIX}from'@vscode/vsce';import{execFileSync}from'node:child_process';
import{buildExtensionBundles,extensionRoot,projectRoot}from'./build.mjs';
export async function packageExtension(options={}){
 const profile=options.profile??'core';if(!['core','full'].includes(profile))throw Error('Invalid distribution profile');
 const outDir=path.resolve(options.outDir??path.join(extensionRoot,'build')),stage=path.join(outDir,`.stage-${profile}`);
 mkdirSync(outDir,{recursive:true});rmSync(stage,{recursive:true,force:true});mkdirSync(stage,{recursive:true});
 const manifest=JSON.parse(readFileSync(path.join(extensionRoot,'package.json')));manifest.name=profile==='core'?'archi-agent-core':'archi-agent';manifest.displayName=`Archi Agent ${profile==='core'?'Core':'Full'}`;
 writeFileSync(path.join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 for(const name of ['.vscodeignore','README.md','README.pl.md','LICENSE.txt','THIRD_PARTY_NOTICES.md'])copyFileSync(path.join(extensionRoot,name),path.join(stage,name));
 if(profile==='core')for(const name of ['README.md','README.pl.md']){const file=path.join(stage,name);writeFileSync(file,readFileSync(file,'utf8').replace('](ux2-ocr/TRIAL_NOTICES.md)','](https://github.com/Setech-pl/archi-agent/blob/main/experiments/ux2-ocr/TRIAL_NOTICES.md)'));}
 const bundles=await buildExtensionBundles({outDir:path.join(stage,'dist')});
 writeFileSync(path.join(stage,'THIRD_PARTY_NOTICES.md'),bundleNotices(readFileSync(path.join(extensionRoot,'THIRD_PARTY_NOTICES.md'),'utf8'),bundles.runtimeMetafile.inputs,projectRoot));
 const images=new Set(['README.md','README.pl.md'].flatMap(name=>[...readFileSync(path.join(stage,name),'utf8').matchAll(/help-assets\/([a-z0-9-]+\.png)/g)].map(m=>m[1])));
 mkdirSync(path.join(stage,'help-assets'));for(const name of images)copyFileSync(path.join(projectRoot,'docs/assets/screenshots',name),path.join(stage,'help-assets',name));
 const declaration={schemaVersion:1,profile,ocr:{required:profile==='full'}};
 if(profile==='full'){
  execFileSync(process.execPath,[path.join(projectRoot,'experiments/ux2-ocr/build-trial.mjs'),'--product-assets'],{stdio:'pipe'});
  declaration.ocr.manifestSha256=createHash('sha256').update(readFileSync(path.join(projectRoot,'build/ux2-ocr/phase2/stage/extension/ux2-ocr/resource-manifest.json'))).digest('hex');
 }
 writeFileSync(path.join(stage,'distribution-profile.json'),JSON.stringify(declaration)+'\n');
 const packagePath=path.join(outDir,`archi-agent-${profile}-${manifest.version}.vsix`);rmSync(packagePath,{force:true});
 await createVSIX({cwd:stage,packagePath,dependencies:false,rewriteRelativeLinks:false,skipLicense:true,allowMissingRepository:true,updatePackageJson:false});
 if(profile==='full')execFileSync('zip',['-q','-r','-D','-X',packagePath,'extension/ux2-ocr'],{cwd:path.join(projectRoot,'build/ux2-ocr/phase2/stage')});
 return packagePath;
}
function parseArguments(argv){const result={};for(let i=0;i<argv.length;i++){if(argv[i]==='--out'&&argv[i+1])result.outDir=argv[++i];else if(argv[i]==='--profile'&&argv[i+1])result.profile=argv[++i];else throw Error('usage: package-vsix.mjs [--profile core|full] [--out directory]');}return result;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log('VSIX written: '+await packageExtension(parseArguments(process.argv.slice(2))));}
 catch(e){process.stderr.write((e instanceof Error?e.message:'Packaging failed')+'\n');process.exitCode=1;}
}
