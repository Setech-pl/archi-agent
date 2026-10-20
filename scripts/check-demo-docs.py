#!/usr/bin/env python3
"""Check the bilingual DEMO1 sources and local tutorial links (developer tool)."""
from pathlib import Path
import ast, json, re
root=Path(__file__).resolve().parent.parent
assert (root/'examples/mission-control/adapter/adapter.ts').read_bytes()==(root/'src/knowledge-server/adapter.ts').read_bytes()
files=[root/p for p in ['README.md','README.pl.md','docs/en/tutorials.md','docs/pl/tutorials.md','docs/project-state.md']]
for slug in ['retail-checkout','mission-control']:
    d=root/'examples'/slug
    files+=list(d.rglob('*.md'))
    assert sorted(p.name for p in (d/'inputs/pl').iterdir())==sorted(p.name for p in (d/'inputs/en').iterdir())
    expected=json.loads((d/'expected/verification.json').read_text())
    assert len(expected['cases'])==14
    for test in expected['cases']:
        assert (d/test['file']).is_file()
        assert test['interfaceType'] in ['REST_API','EVENT']
    for p in d.rglob('*'):
        if not p.is_file() or p.suffix.lower() in ['.png','.pdf']:continue
        text=p.read_text()
        assert '/Users/' not in text and 'C:\\Users\\' not in text, p
        assert not re.search(r'\bsk-[A-Za-z0-9_-]{20,}',text),p
    for lang in ['pl','en']:
        text=(d/f'START-HERE.{lang}.md').read_text()
        for token in ['01-good.puml','02-direction.puml','03-mode.puml','04-unknown.puml','05-partial.puml','06-alias-after-save.puml','07-prose.txt','08-generate.md','09-async-good.puml','SecretStorage','ART1','DEFERRED','NOT_RUN']:
            assert token in text,(slug,lang,token)
for p in files:
    text=re.sub(r'```.*?```','',p.read_text(),flags=re.S)
    for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',text):
        if target.startswith(('http:','https:','mailto:','#')):continue
        assert (p.parent/target.split('#')[0]).exists(),(p,target)
for p in (root/'scripts').glob('*demo*.py'):ast.parse(p.read_text())
print(f'PASS: {len(files)} documents, both input sets, 28 VER1 contracts, local paths and privacy patterns')
