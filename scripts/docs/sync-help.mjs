// One instruction source per language; installed destinations remain local where bundled.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
for(const [language,file] of [['en','README.md'],['pl','README.pl.md']]) {
 const guide=`docs/${language}/user-guide.md`;
 const text=readFileSync(guide,'utf8').replace(/(!?\[[^\]]*\])\(([^)]+)\)/g,(_,label,target)=>{
  if(/^(https?:|#)/.test(target))return `${label}(${target})`;
  const local={'../pl/user-guide.md':'README.pl.md','../en/user-guide.md':'readme.md','../../LICENSE':'LICENSE.txt','../../vscode-extension/THIRD_PARTY_NOTICES.md':'THIRD_PARTY_NOTICES.md'};
  if(target.startsWith('../assets/screenshots/')&&target.endsWith('.png'))return `${label}(help-assets/${path.basename(target)})`;
  if(local[target])return `${label}(${local[target]})`;
  const [file,anchor]=target.split('#'),resolved=path.relative(process.cwd(),path.resolve(path.dirname(guide),file)).split(path.sep).join('/');
  return `${label}(https://github.com/Setech-pl/archi-agent/blob/main/${resolved}${anchor?'#'+anchor:''})`;
 });
 const destination=`vscode-extension/${file}`,rendered=text+'\nOCR notices: [ux2-ocr/TRIAL_NOTICES.md](ux2-ocr/TRIAL_NOTICES.md).\n';
 if(process.argv.includes('--check')) {
  if(readFileSync(destination,'utf8')!==rendered)throw new Error(`Help is stale: ${destination}; run node scripts/docs/sync-help.mjs`);
 } else writeFileSync(destination,rendered);
}
