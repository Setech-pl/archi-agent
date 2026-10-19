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
  return `${label}(https://github.com/Setech-pl/archi-agent/blob/6b96ff629c33cf6deea65a329cf2b36b54a6539d/${resolved}${anchor?'#'+anchor:''})`;
 });
 writeFileSync(`vscode-extension/${file}`,text+'\nOCR notices: [ux2-ocr/TRIAL_NOTICES.md](ux2-ocr/TRIAL_NOTICES.md).\n');
}
