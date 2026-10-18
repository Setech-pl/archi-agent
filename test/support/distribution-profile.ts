import{mkdirSync,writeFileSync,realpathSync}from'node:fs';import path from'node:path';import{createHash}from'node:crypto';
import{ocrRequiredResources}from'../../src/runtime/document-conversion-capabilities.js';
/** Synthetic inventory for unit tests of the guard, never OCR engine evidence. */
export function syntheticDistribution(directory:string,profile:'core'|'full'='full'){
 mkdirSync(directory,{recursive:true});const root=realpathSync(directory),sha=(b:string)=>createHash('sha256').update(b).digest('hex');
 if(profile==='core'){writeFileSync(path.join(root,'distribution-profile.json'),JSON.stringify({schemaVersion:1,profile,ocr:{required:false}}));return root;}
 const files=ocrRequiredResources.map(file=>{const absolute=path.join(root,'ux2-ocr',file);mkdirSync(path.dirname(absolute),{recursive:true});writeFileSync(absolute,'synthetic');return{path:file,bytes:9,sha256:sha('synthetic')};});
 const manifest=JSON.stringify({schema:2,files});writeFileSync(path.join(root,'ux2-ocr/resource-manifest.json'),manifest);writeFileSync(path.join(root,'distribution-profile.json'),JSON.stringify({schemaVersion:1,profile,ocr:{required:true,manifestSha256:sha(manifest)}}));return root;
}
