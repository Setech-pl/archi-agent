// Development-only reproduction: real local PlantUML, never a remote rendering service.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const [java,jar,outArg]=process.argv.slice(2);
if(!java||!jar||!outArg)throw Error('Usage: node scripts/ea1-render-reference.mjs <java> <plantuml.jar> <new-output-directory>');
const out=path.resolve(outArg);mkdirSync(out,{recursive:true});
const runtime=createRequire(import.meta.url)('../vscode-extension/dist/archi-agent-runtime.js');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source={kind:'enterprise-json',path:path.resolve('examples/retail-checkout/architecture/enterprise.json')};
const inspected=await runtime.inspectEnterpriseSource(source);if(inspected.status!=='success')throw Error(JSON.stringify(inspected));
const maps=[];
for(const [name,rootIds,maxLevel,colorBy,language] of [
 ['retail-capability-map',[],3,{kind:'rating',scaleId:'maturity'},'pl'],
 ['small',['customer'],1,{kind:'none'},'en'],
 ['three-level',['sales'],3,{kind:'none'},'pl'],
 ['long-polish',['sales'],3,{kind:'rating',scaleId:'maturity'},'pl']]){
 const result=await runtime.generateCapabilityMap({source,selection:{rootIds,maxLevel,colorBy,language,expectedCatalogDigest:inspected.snapshot.catalogDigest}});
 if(result.status!=='success')throw Error(JSON.stringify(result));
 const file=path.join(out,name+'.puml');writeFileSync(file,result.plantUml);writeFileSync(path.join(out,name+'.report.json'),JSON.stringify(result.report,null,2)+'\n');
 execFileSync(java,['-Djava.awt.headless=true','-jar',jar,'-tpng',file],{stdio:'pipe'});
 maps.push({name,plantUmlSha256:hash(readFileSync(file)),imageSha256:hash(readFileSync(path.join(out,name+'.png'))),selection:result.report.selection,projectionDigest:result.report.projectionDigest});
}
writeFileSync(path.join(out,'provenance.json'),JSON.stringify({input:'examples/retail-checkout/architecture/enterprise.json',inputSha256:hash(readFileSync(source.path)),
 catalogDigest:inspected.snapshot.catalogDigest,renderer:execFileSync('/usr/bin/unzip',['-p',jar,'META-INF/MANIFEST.MF'],{encoding:'utf8'}),jarSha256:hash(readFileSync(jar)),maps},null,2)+'\n');
// Explicit documentation assets only; no release archives are written.
const assets='examples/retail-checkout/assets';
for(const suffix of ['puml','png'])copyFileSync(path.join(out,'retail-capability-map.'+suffix),path.join(assets,'capability-map.'+suffix));
copyFileSync(path.join(out,'provenance.json'),path.join(assets,'capability-map-provenance.json'));
console.log('Rendered four EA1 maps: '+out);
