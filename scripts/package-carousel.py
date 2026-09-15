#!/usr/bin/env python3
"""Add the carousel without rewriting captured UI or relaxing studio access."""
from pathlib import Path
import shutil, subprocess
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
ASSETS = ('studio-carousel.js', 'studio-carousel-gate-sync.js', 'studio-carousel-core.mjs', 'studio-carousel-contract.mjs', 'studio-carousel.css', 'ssul-instagram-api.mjs')
for name in ASSETS:
    shutil.copyfile(ROOT / name, OUT / name)
    if name.endswith(('.js', '.mjs')):
        subprocess.run(['node', '--check', str(OUT / name)], check=True)

# The public path is stable, so version the module dependency as well as the entry
# script to prevent an older ending-card renderer from surviving a browser cache.
carousel = OUT / 'studio-carousel.js'
carousel_source = carousel.read_text(encoding='utf-8')
carousel_source = carousel_source.replace("'./studio-carousel-core.mjs'", "'./studio-carousel-core.mjs?v=20260915-3'", 1)
carousel.write_text(carousel_source, encoding='utf-8')
subprocess.run(['node', '--check', str(carousel)], check=True)

for name in ('studio.html', 'studio-shell.txt'):
    path=OUT/name
    content=path.read_text(encoding='utf-8')
    marker='<script type="module" src="/studio-carousel.js?v=20260915-3"></script>'
    gate_marker='<script src="/studio-carousel-gate-sync.js?v=20260915-3" defer></script>'
    if marker not in content:
        assert '</body>' in content, f'{name}: expected closing body'
        content=content.replace('</body>',marker+'</body>',1)
    if gate_marker not in content:
        assert '</body>' in content, f'{name}: expected closing body for gate sync'
        content=content.replace('</body>',gate_marker+'</body>',1)
    path.write_text(content,encoding='utf-8')
worker=OUT/'_worker.js'
s=worker.read_text(encoding='utf-8')
original="async function studioApi(request,path){const method=request.method,u=new URL(request.url);"
insert=original+"\n  if(path.startsWith('/api/instagram-decks/'))return instagramApi(request,path,cookieValue(request,STUDIO_COOKIE));"
if "import { instagramApi }" not in s:
    assert s.count(original)==1,'studio API entry point changed; refusing unsafe injection'
    s="import { instagramApi } from './ssul-instagram-api.mjs';\n"+s.replace(original,insert,1)
worker.write_text(s,encoding='utf-8')
subprocess.run(['node','--test',str(ROOT/'tests/carousel.test.mjs')],check=True,cwd=ROOT)
print('Packaged studio carousel with studio gate-line sync; existing session and origin guards remain in place.')
