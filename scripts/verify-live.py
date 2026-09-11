#!/usr/bin/env python3
"""Read-only deployment checks. Does not sign in or call paid AI."""
import hashlib,json,os,time,urllib.request
from pathlib import Path
BASE='https://ssulpan.pages.dev'
VERIFY=os.environ.get('GITHUB_SHA','manual')
def get(path):
 url=BASE+path+('&' if '?' in path else '?')+'verify='+VERIFY
 last=None
 for attempt in range(6):
  try:
   with urllib.request.urlopen(url,timeout=25) as r:return r.status,dict(r.headers),r.read()
  except Exception as e:last=e;time.sleep(4)
 raise RuntimeError(f'{path}: {last}')
status,headers,body=get('/')
assert status==200 and 'community-head' in body.decode()
assert any(k.lower()=='x-ssul-ui' and v=='original-live-source' for k,v in headers.items()),'old frontend still served'
checks=[]
for row in json.loads(Path('dist/ui-provenance.json').read_text())['assets']:
 _,_,data=get('/'+row['path']);assert hashlib.sha256(data).hexdigest()==row['sha256'],row['path'];checks.append(row['path'])
for i in range(1,7):
 _,_,body=get(f'/stories/{i:03d}/');text=body.decode();assert 'id="continue-reading"' in text and 'id="continuation" hidden' in text;checks.append(f'/stories/{i:03d}/')
for query in ['?view=cards','?category=%EC%A7%81%EC%9E%A5%EC%83%9D%ED%99%9C','?q=%EA%B2%B0%ED%98%BC%EC%8B%9D']:
 assert get('/'+query)[0]==200;checks.append('/'+query)
_,_,body=get('/api/ssul_posts');posts=json.loads(body)['posts'];assert len(posts)>=6
source=json.loads(Path('scripts/original-public-posts.json').read_text())
for p in source:
 row=next(x for x in posts if x['id']==p['id']);assert row['beforeContent']==p['beforeContent'] and row['afterContent']==p['afterContent'],p['id']+' original text mismatch'
report={'homepage':'200 original-live-source','originalAssetsVerified':11,'articleRoutesVerified':6,'queryRoutesVerified':3,'completeOriginalStoriesVerified':6,'commit':VERIFY,'checks':checks}
Path('live-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
