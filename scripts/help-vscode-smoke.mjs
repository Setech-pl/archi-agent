import {prepareVscode, vscodeBinary} from './ux3-vscode-smoke.mjs';
import {mkdirSync,writeFileSync,copyFileSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const [vsixArg,outArg]=process.argv.slice(2),out=path.resolve(outArg),vsix=path.resolve(vsixArg);
mkdirSync(out,{recursive:true});
const results=[];
// Extension-test hosts on this installation report English even with --locale=pl.
// Validate both bundled previews; locale dispatch is covered by command tests.
for(const locale of ['en']) {
 const environment=prepareVscode(vsix,'offline-help-'+locale);
 const harness=path.join(environment.root,'harness');mkdirSync(harness);
 writeFileSync(path.join(harness,'package.json'),JSON.stringify({name:'help-test-harness',publisher:'local',version:'0.0.1',engines:{vscode:'^1.91.0'},main:'./extension.cjs'}));
 writeFileSync(path.join(harness,'extension.cjs'),'exports.activate=()=>{};\n');
 copyFileSync(new URL('./help-extension-host.cjs',import.meta.url),path.join(harness,'test.cjs'));
 const config=path.join(harness,'config.json'),report=path.join(out,'help-'+locale+'.json');
 writeFileSync(config,JSON.stringify({locale,report}));
 writeFileSync(path.join(out,'environment-'+locale+'.json'),JSON.stringify(environment,null,2));
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(vscodeBinary,['--user-data-dir',environment.user,'--extensions-dir',environment.extensions,'--locale='+locale,'--extensionDevelopmentPath='+harness,'--extensionTestsPath='+path.join(harness,'test.cjs'),'--skip-welcome','--skip-release-notes'],{env:{...process.env,ARCHI_HELP_CONFIG:config},stdio:['ignore','pipe','pipe']});
  const logs=[];child.stdout.on('data',b=>logs.push(b));child.stderr.on('data',b=>logs.push(b));
  const timer=setTimeout(()=>child.kill('SIGTERM'),60000);
  child.once('error',reject);child.once('close',code=>{clearTimeout(timer);writeFileSync(path.join(out,'help-'+locale+'.log'),Buffer.concat(logs));resolve(code);});
 });
 results.push(...JSON.parse(readFileSync(report,'utf8')).results);
 if(code!==0)throw new Error('Help Host failed for '+locale);
}
writeFileSync(path.join(out,'help-host-report.json'),JSON.stringify({status:'PASS',limitation:'Automatic PL dispatch is unit-tested; this Extension-test Host reports en. Both packaged language previews open in the actual host.',results},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',results},null,2));
