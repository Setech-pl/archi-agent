import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [bundle,catalogFile,outArg]=process.argv.slice(2),out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const runtime=createRequire(import.meta.url)(path.resolve(bundle)),results=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const source={kind:'enterprise-json',path:path.join(out,'enterprise.json')};writeFileSync(source.path,readFileSync(catalogFile));
const check=async(id,fn)=>{await fn();results.push({id,status:'PASS',layer:'exact packaged runtime outside repository'});};
try{
 const i=await runtime.inspectEnterpriseSource(source);assert.equal(i.status,'success');
 const selection={rootIds:[],maxLevel:3,colorBy:{kind:'rating',scaleId:'maturity'},language:'pl',expectedCatalogDigest:i.snapshot.catalogDigest};let result;
 await check('EA1-no-provider-hierarchy-provenance',async()=>{result=await runtime.generateCapabilityMap({source,selection});assert.equal(result.status,'success',JSON.stringify(result));assert.equal(result.report.modelCalls,0);assert.equal(result.report.visible.length,11);assert.equal(result.report.semanticReview.status,'not-applicable');assert.equal(result.report.source.sourceBytesSha256,sha(readFileSync(source.path)));assert.equal(result.report.visible.find(v=>v.capability.id==='payment').hierarchy.level,3);});
 await check('EA1-permutation-formatting-and-view-digest',async()=>{const c=JSON.parse(readFileSync(source.path));c.capabilities.reverse();writeFileSync(source.path,JSON.stringify(c));const again=await runtime.generateCapabilityMap({source,selection});assert.equal(again.status,'success');assert.equal(again.plantUml,result.plantUml);assert.equal(again.report.projectionDigest,result.report.projectionDigest);assert.notEqual(again.report.source.sourceBytesSha256,result.report.source.sourceBytesSha256);
  const scoped=await runtime.generateCapabilityMap({source,selection:{...selection,rootIds:['sales'],maxLevel:2,colorBy:{kind:'none'}}});assert.equal(scoped.status,'success');assert(scoped.report.excluded.some(e=>e.reason==='below-detail-level'));assert(scoped.report.excluded.some(e=>e.reason==='outside-selected-scope'));assert.notEqual(scoped.report.projectionDigest,result.report.projectionDigest);});
 await check('EA1-cancel-no-artifact',async()=>{const o=await runtime.generateCapabilityMap({source,selection},{aborted:true});assert.equal(o.code,'cancelled');assert(!o.artifact);assert.deepEqual(readdirSync(out),['enterprise.json']);});
 await check('EA1-frozen-ART1-original',async()=>{writeFileSync(source.path,'source changed');const saved=await runtime.saveDiagramBundle(out,result.artifact,runtime.planDiagramBundle());assert.equal(readFileSync(path.join(saved.directory,'diagram.puml'),'utf8'),result.plantUml);const r=JSON.parse(readFileSync(path.join(saved.directory,'report.json')));assert.deepEqual(r.generationReport,result.report);assert.equal(r.diagram.sha256,sha(readFileSync(path.join(saved.directory,'diagram.puml'))));assert.equal(r.sourceReferences.enterpriseCatalog.reference,'enterprise.json');assert(!JSON.stringify(r).includes(out));});
}catch(e){results.push({id:'EA1-error',status:'FAIL',error:e.stack});process.exitCode=1;}
writeFileSync(path.join(out,'runtime-report.json'),JSON.stringify({bundleSha256:sha(readFileSync(bundle)),node:process.version,PATH:process.env.PATH,NODE_PATH:process.env.NODE_PATH,results},null,2)+'\n');
console.log(JSON.stringify(results));
