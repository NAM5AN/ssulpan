#!/usr/bin/env python3
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent
PUBLIC=ROOT/'public'
OUT=ROOT/'.sites-runtime'/'assets.json'
assets={}
for p in sorted(PUBLIC.rglob('*')):
    if not p.is_file(): continue
    rel='/' + p.relative_to(PUBLIC).as_posix()
    assets[rel]=p.read_text(encoding='utf-8')
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(assets,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'wrote {OUT} ({len(assets)} assets)')
