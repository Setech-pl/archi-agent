#!/usr/bin/env python3
"""Extract all Mermaid fences, render locally with pinned mmdc and local Chrome."""
from pathlib import Path
import json,re,subprocess,sys,hashlib
cli,out=sys.argv[1:3];selected=sys.argv[3] if len(sys.argv)>3 else 'ABCDE';out=Path(out);out.mkdir(parents=True,exist_ok=True)
config=out/'puppeteer.json';config.write_text(json.dumps({'executablePath':'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','args':['--no-sandbox']}))
report=[]
for lang in ['en','pl']:
 source=Path(f'docs/{lang}/architecture.md')
 for index,code in enumerate(re.findall(r'```mermaid\n(.*?)```',source.read_text(),re.S)):
  if chr(65+index) not in selected: continue
  stem=f'{lang}-{chr(65+index)}';mmd=out/(stem+'.mmd');mmd.write_text(code)
  for suffix in ['svg','png']:
   target=out/(stem+'.'+suffix)
   r=subprocess.run([cli,'-i',str(mmd),'-o',str(target),'-p',str(config),'--size','1800','-b','white'],capture_output=True,text=True)
   (out/(stem+'-'+suffix+'.log')).write_text(r.stdout+r.stderr)
   if r.returncode: print(r.stderr);sys.exit(r.returncode)
  report.append({'source':str(source),'diagram':stem,'status':'PASS','sha256Source':hashlib.sha256(code.encode()).hexdigest()})
(out/'render-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'PASS: {len(report)} Mermaid diagrams rendered as SVG and PNG with local Chrome')
