// Uses the extracted delivered Full, real PDF.js/canvas/Tesseract and synthetic PDF scans.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,realpathSync,readFileSync,writeFileSync,copyFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {openVsix} from '../vscode-extension/scripts/vsix-zip.mjs';
const [file,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});const root=realpathSync(mkdtempSync(path.join(tmpdir(),'mcp1-full-'))),a=openVsix(file),results=[];
for(const e of a.entries){if(e.name.endsWith('/'))continue;const f=path.join(root,e.name);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,a.read(e.name));}
const extension=path.join(root,'extension'),runtime=createRequire(import.meta.url)(path.join(extension,'dist/archi-agent-runtime.js'));
const fixtures=path.join(root,'fixtures');execFileSync(process.execPath,['experiments/ux2-ocr/make-fixtures.mjs',fixtures],{stdio:'pipe'});
const check=async(id,fn)=>{try{await fn();results.push({id,status:'PASS'});}catch(e){results.push({id,status:'FAIL',error:e.stack});throw e;}};
const report={root,vsix:path.resolve(file),sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),nativePlatform:process.platform+'-'+process.arch,realOcr:true,realLlm:false,results};
try{
 await check('Full-inventory-and-hashes',async()=>assert.deepEqual(await runtime.getDocumentConversionCapabilities({validateOcr:true}),{profile:'full',ocr:'available',languages:['pl','en']}));
 for(const lang of ['pl','en'])await check('Full-real-offline-OCR-'+lang,async()=>{const r=await runtime.convertDocument(path.join(fixtures,lang+'-clean-200.pdf'),{pdfOcrMode:'auto'});assert.equal(r.status,'success',JSON.stringify(r));assert(r.markdown.includes('(OCR)'));assert(r.markdown.length>60);});
 await check('Full-text-and-all',async()=>{assert.equal((await runtime.convertDocument(path.join(fixtures,'text-only.pdf'),{pdfOcrMode:'none'})).status,'success');assert.equal((await runtime.convertDocument(path.join(fixtures,'mixed.pdf'),{pdfOcrMode:'all'})).status,'success');});
 await check('Full-cancel-no-partial-Markdown',async()=>{const c=new AbortController();const r=await runtime.convertDocument(path.join(fixtures,'pl-clean-200.pdf'),{pdfOcrMode:'all',signal:c.signal,onProgress:stage=>{if(stage==='recognize')c.abort();}});assert.deepEqual(r,{status:'cancelled'});});
 await check('broken-Full-missing-inventory-resource',async()=>{const f=path.join(extension,'ux2-ocr/assets/lang/pol.traineddata');renameSync(f,f+'.disabled');try{assert.equal((await runtime.getDocumentConversionCapabilities()).ocr,'installation-error');const r=await runtime.convertDocument(path.join(fixtures,'pl-clean-200.pdf'),{pdfOcrMode:'auto'});assert.equal(r.code,'ocr-installation-invalid');assert.equal(r.markdown,undefined);}finally{renameSync(f+'.disabled',f);}});
 await check('broken-Full-same-size-hash-corruption',async()=>{const f=path.join(extension,'ux2-ocr/assets/lang/eng.traineddata'),b=readFileSync(f),bad=Buffer.from(b);bad[0]^=1;writeFileSync(f,bad);try{assert.equal((await runtime.getDocumentConversionCapabilities({validateOcr:true})).ocr,'installation-error');const r=await runtime.convertDocument(path.join(fixtures,'en-clean-200.pdf'),{pdfOcrMode:'all'});assert.equal(r.code,'ocr-installation-invalid');}finally{writeFileSync(f,b);}});
}catch(e){report.error=e.stack;process.exitCode=1;}
report.status=report.error?'FAIL':'PASS';writeFileSync(path.join(out,'full-ocr.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
