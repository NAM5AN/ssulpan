#!/usr/bin/env python3
from pathlib import Path

p = Path('dist/_worker.js')
s = p.read_text(encoding='utf-8')

# Cloudflare Pages canonicalizes *.html to extensionless pretty URLs. Read an
# internal non-HTML copy so /studio never redirects back into the Worker.
s = s.replace("new URL('/studio.html',url)", "new URL('/studio-shell.txt',url)")

former_pin=''.join(chr(value) for value in (50,56,53,52))
for forbidden in ('STUDIO_TOKEN_HASH', 'x-studio-token', 'ssul_studio=', "body.password!=='", former_pin):
    if forbidden in s:
        raise SystemExit(f'public bundle contains a forbidden password/token marker: {forbidden}')
for required in ("if(path==='/studio'||path==='/studio/')", "studioApi(request,path)", "studio-shell.txt", "STUDIO_COOKIE='__Host-ssulpan_studio'", "action:'studio_access_verify'", 'HttpOnly; Secure; SameSite=Strict'):
    if required not in s:
        raise SystemExit(f'server-verified studio marker missing: {required}')

p.write_text(s, encoding='utf-8')
print('Verified protected studio: server password check, HttpOnly session and guarded direct routes')
