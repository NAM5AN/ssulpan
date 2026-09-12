#!/usr/bin/env python3
from pathlib import Path

p = Path('dist/_worker.js')
s = p.read_text(encoding='utf-8')

# Cloudflare Pages canonicalizes *.html to extensionless pretty URLs. Read an
# internal non-HTML copy so /studio never redirects back into the Worker.
s = s.replace("new URL('/studio.html',url)", "new URL('/studio-shell.txt',url)")

for forbidden in ('STUDIO_TOKEN_HASH', 'requireStudio', 'validStudioToken', 'x-studio-token', 'ssul_studio='):
    if forbidden in s:
        raise SystemExit(f'public studio still contains authentication: {forbidden}')
for required in ("if(path==='/studio'||path==='/studio/')", "studioApi(request,path)", "studio-shell.txt"):
    if required not in s:
        raise SystemExit(f'public studio marker missing: {required}')

p.write_text(s, encoding='utf-8')
print('Verified public shared studio: direct route, direct API and no auth token')
