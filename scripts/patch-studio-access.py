#!/usr/bin/env python3
from pathlib import Path

p=Path('dist/_worker.js')
s=p.read_text(encoding='utf-8')

needle="async function requireStudio(request){const token=cookieValue(request,'ssul_studio');if(!await validStudioToken(token))return null;return token}"
insert="""async function requireStudio(request){const token=cookieValue(request,'ssul_studio');if(!await validStudioToken(token))return null;return token}\nfunction studioTokenFromReferer(request){try{const ref=request.headers.get('Referer')||'';const m=new URL(ref).pathname.match(/^\\/studio\\/access\\/([A-Za-z0-9_-]{20,100})\\/?$/);return m?.[1]||''}catch{return''}}\nasync function studioToken(request){const header=request.headers.get('x-studio-token')||'';if(await validStudioToken(header))return header;const ref=studioTokenFromReferer(request);if(await validStudioToken(ref))return ref;return await requireStudio(request)}\nfunction studioBootstrap(token){const encoded=JSON.stringify(token);return `<script>(()=>{const T=${encoded};const F=window.fetch.bind(window);window.fetch=(input,init={})=>{try{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/api/')){const h=new Headers(init.headers||(input instanceof Request?input.headers:undefined));h.set('x-studio-token',T);init={...init,headers:h}}}catch{}return F(input,init)}})();<\\/script>`}"""
if needle not in s:
    raise SystemExit('requireStudio anchor not found')
s=s.replace(needle,insert,1)

old="""const access=path.match(/^\\/studio\\/access\\/([A-Za-z0-9_-]{20,100})\\/?$/);if(access){if(!await validStudioToken(access[1]))return html('<!doctype html><meta charset=\"utf-8\"><title>404</title>',404);return new Response(null,{status:302,headers:{Location:'/studio/','Set-Cookie':`ssul_studio=${encodeURIComponent(access[1])}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`,'Cache-Control':'no-store'}})}"""
new="""const access=path.match(/^\\/studio\\/access\\/([A-Za-z0-9_-]{20,100})\\/?$/);if(access){if(!await validStudioToken(access[1]))return html('<!doctype html><meta charset=\"utf-8\"><title>404</title>',404);const assetReq=new Request(new URL('/studio.html',url),request);const res=await env.ASSETS.fetch(assetReq);let text=await res.text();text=text.replace('<script src=\"/studio.js\"></script>',studioBootstrap(access[1])+'<script src=\"/studio.js\"></script>');return new Response(text,{status:res.status,headers:{...Object.fromEntries(res.headers),'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Set-Cookie':`ssul_studio=${encodeURIComponent(access[1])}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`}})}"""
if old not in s:
    raise SystemExit('access route anchor not found')
s=s.replace(old,new,1)

s=s.replace("if(path==='/studio/preview/'){const token=await requireStudio(request);", "if(path==='/studio/preview/'){const token=await studioToken(request);",1)
s=s.replace("if(path.startsWith('/api/')&&!['/api/ssul_posts'].includes(path)&&!/^\\/api\\/stories\\//.test(path)){const token=await requireStudio(request);", "if(path.startsWith('/api/')&&!['/api/ssul_posts'].includes(path)&&!/^\\/api\\/stories\\//.test(path)){const token=await studioToken(request);",1)

if 'studioBootstrap(access[1])' not in s or 'await studioToken(request)' not in s:
    raise SystemExit('studio patch verification failed')
p.write_text(s,encoding='utf-8')
print('Patched production studio access: direct render + header/referrer auth fallback')
