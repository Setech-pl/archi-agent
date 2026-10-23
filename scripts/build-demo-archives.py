#!/usr/bin/env python3
"""Build repeatable demo ZIPs from Git-tracked examples (never from build output).

Developer tool: Python 3, Git. --draft includes untracked draft files for validation only.
The default requires clean example sources matching HEAD and embeds their SHA-256 manifest.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess, zipfile
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out',default='build/demo1/archives')
parser.add_argument('--version',default='0.3.0-alpha.8')
parser.add_argument('--draft',action='store_true')
a=parser.parse_args()
if not all(c.isalnum() or c in '.-' for c in a.version): parser.error('Unsafe version')
root=Path(__file__).resolve().parent.parent
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
artifacts=[]
for slug in ['retail-checkout','mission-control']:
    relative=f'examples/{slug}/'
    if a.draft:
        files=sorted(p for p in (root/relative).rglob('*') if p.is_file())
    else:
        if subprocess.check_output(['git','status','--porcelain','--',relative],cwd=root):
            raise SystemExit('Commit example sources before final packaging: '+relative)
        names=subprocess.check_output(['git','ls-files','-z','--',relative],cwd=root).decode().split('\0')
        files=[root/n for n in names if n]
    if not files: raise SystemExit('No versioned sources: '+relative)
    for p in files:
        if p.is_symlink(): raise SystemExit('No symlinks: '+str(p))
        if any(x in p.parts for x in ['node_modules','local-config','archi-agent-results','.git']):raise SystemExit('Unexpected runtime file: '+str(p))
    manifest={'schemaVersion':1,'sourceCommit':sha,'version':a.version,'draft':a.draft,'files':[{'path':p.relative_to(root/relative).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
    name=f'archi-agent-demo-{slug}-{a.version}.zip';target=out/name
    if target.exists():raise SystemExit('Refusing to replace an existing archive: '+str(target))
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for filename,data in [(f'{slug}/{p.relative_to(root/relative).as_posix()}',p.read_bytes()) for p in files]+[(f'{slug}/SOURCE-MANIFEST.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode())]:
            info=zipfile.ZipInfo(filename,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            z.writestr(info,data)
    artifacts.append({'file':name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sourceCommit':sha,'draft':a.draft})
(out/'demos.json').write_text(json.dumps(artifacts,indent=2)+'\n')
print(json.dumps(artifacts,indent=2))
