#!/usr/bin/env python3
"""Package captured original UI; never regenerate styles, logos or components."""
import hashlib, html, json, re, shutil, subprocess
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'recovered/sseolzip/live-ui-snapshot'
OUT=ROOT/'dist'

class Node:
    def __init__(self,tag,attrs,start,open_end):
        self.tag=tag; self.attrs=dict(attrs); self.start=start; self.open_end=open_end
        self.close_start=open_end; self.end=open_end; self.children=[]
    def has(self,cl): return cl in (self.attrs.get('class') or '').split()
class Document(HTMLParser):
    VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self,text):
        super().__init__(convert_charrefs=False); self.text=text; self.nodes=[]; self.stack=[]
        self.lines=[0]+[m.end() for m in re.finditer('\n',text)]; self.feed(text)
    def pos(self):
        l,c=self.getpos(); return self.lines[l-1]+c
    def handle_starttag(self,tag,attrs):
        i=self.pos(); n=Node(tag,attrs,i,i+len(self.get_starttag_text())); self.nodes.append(n)
        if self.stack: self.stack[-1].children.append(n)
        if tag not in self.VOID: self.stack.append(n)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in self.VOID: self.stack.pop()
    def handle_endtag(self,tag):
        for k in range(len(self.stack)-1,-1,-1):
            if self.stack[k].tag==tag:
                n=self.stack[k]; n.close_start=self.pos(); n.end=self.text.find('>',self.pos())+1
                del self.stack[k:]; break
    def one(self,cl=None,id=None,tag=None):
        return next(n for n in self.nodes if (cl is None or n.has(cl)) and (id is None or n.attrs.get('id')==id) and (tag is None or n.tag==tag))
    def raw(self,n): return self.text[n.start:n.end]
    def inner(self,n): return self.text[n.open_end:n.close_start]
    def edit(self,changes):
        s=self.text; last=len(s)+1
        for a,b,v in sorted(changes,reverse=True):
            assert b<=last, 'overlapping source edits'
            s=s[:a]+v+s[b:]; last=a
        return s
    def put(self,n,value): return n.open_end,n.close_start,value
    def replace(self,n,value): return n.start,n.end,value
    def attr(self,n,key,value):
        # Replace only one attribute; all other original markup remains byte-identical.
        opening=self.text[n.start:n.open_end]
        pattern=re.compile(r'\s'+re.escape(key)+r'(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?')
        new='' if value is None else ' '+key+'="'+value+'"'
        if pattern.search(opening): opening=pattern.sub(lambda _:new,opening,count=1)
        else: opening=opening[:-1]+new+opening[-1:]
        return n.start,n.open_end,opening

def cleaned(s):
    # The old host injected a challenge script; this is not application UI/source.
    return re.sub(r'<script\b[^>]*>[\s\S]*?</script>',lambda m:'' if '__CF$cv$params' in m[0] else m[0],s,flags=re.I)

def read(name): return cleaned((SRC/name).read_text(encoding='utf-8'))
def text(s): return html.unescape(re.sub('<[^>]+>','',s))
def esc(s): return html.escape(str(s),quote=True)
def subnode(d,parent,tag=None,cl=None):
    return next(n for n in d.nodes if parent.start<n.start<parent.end and (not tag or n.tag==tag) and (not cl or n.has(cl)))

def component(raw, edits):
    d=Document(raw); return d.edit(edits(d))

def main():
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir()
    manifest=json.loads((SRC/'capture-manifest.json').read_text())
    records={r.get('path'):r for r in manifest['resources'] if 'path' in r}
    exact=[]
    assets=['style.css','community.css','community.js','reader.js','cover.js','thumbnails.js','brand/ssulpan-logo.png','community/office.png','community/friends.png','community/night.png']
    for name in assets:
        data=(SRC/name).read_bytes(); digest=hashlib.sha256(data).hexdigest()
        assert digest==records[name]['sha256'],name+' source hash mismatch'
        dest=OUT/name; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(data)
        exact.append({'path':name,'sha256':digest,'bytes':len(data)})
    fav=next(r for r in records.values() if r['url'].split('?')[0].endswith('/favicon.png'))
    shutil.copyfile(SRC/fav['path'],OUT/'favicon.png')
    exact.append({'path':'favicon.png','sha256':fav['sha256'],'bytes':fav['bytes']})
    home=Document(read('index.html')); cards=Document(read('index__q_fbed1247c1.html'))
    reader=Document(read('stories/001/index.html'))
    templates={}
    templates['home']=home.text
    templates['reader']=reader.text
    # The templates below are slices of the original DOM, not newly drawn components.
    for key,doc,node in [
        ('row',home,home.one(cl='community-stories').children[0]),
        ('card',cards,cards.one(cl='community-stories').children[0]),
        ('slide',home,home.one(cl='spotlight-slide')),
        ('hero',home,home.one(cl='spotlight')),
        ('pick',home,home.one(cl='reading-picks').children[0]),
        ('board',home,home.one(cl='board-directory').children[0]),
        ('roundup',home,home.one(cl='board-roundup')),
        ('tag',home,home.one(cl='topic-tags').children[0]),
        ('related',reader,reader.one(cl='related'))]:
        templates[key]=doc.raw(node)
    for key in ['row','card']:
        d=Document(templates[key]); e=[d.attr(d.one(cl='story-row'),'href','{{url}}'),d.put(d.one(cl='card-category'),'{{category}}'),d.put(d.one(tag='h2'),'{{title}}'),d.put(d.one(cl='card-teaser'),'{{teaser}}'),d.put(d.one(cl='row-views'),'조회 {{views}}')]
        if key=='card':
            thumb=d.one(cl='story-thumbnail'); o=d.text[thumb.start:thumb.open_end]
            for attr,val in [('data-hook','{{hook}}'),('data-category','{{category}}'),('data-detail','{{detail}}'),('aria-label','{{hookLabel}}')]:
                o=re.sub(r'('+attr+r'=")[^"]*(")',lambda m:m[1]+val+m[2],o)
            e.append((thumb.start,thumb.open_end,o))
            fall=d.one(cl='thumbnail-fallback'); spans=[n for n in fall.children if n.tag=='span']
            e.extend([d.put(spans[0],'{{category}}'),d.put(d.one(tag='strong'),'{{hook}}'),d.put(spans[-1],'{{detail}}')])
        templates[key]=d.edit(e)
    d=Document(templates['slide']); art=d.one(tag='article'); op=d.text[art.start:art.open_end]
    op=re.sub(r'data-slide="[^"]*"','data-slide="{{slideIndex}}"',op).replace(' hidden','')
    templates['slide']=d.edit([(art.start,art.open_end,op),d.attr(d.one(cl='spotlight-link'),'href','{{url}}'),d.put(d.one(cl='spotlight-category'),'{{category}}'),d.put(d.one(tag='h2'),'{{title}}'),d.put(d.one(tag='p'),'{{teaser}}'),d.attr(d.one(tag='img'),'src','{{image}}')])
    d=Document(templates['hero']); templates['hero']=d.edit([d.put(d.one(cl='spotlight-slides'),'{{slides}}'),d.put(d.one(cl='slide-count'),'1 / {{slideCount}}')])
    d=Document(templates['pick']); templates['pick']=d.edit([d.attr(d.one(tag='a'),'href','{{url}}'),d.put(d.one(tag='h3'),'{{title}}'),d.put(d.one(tag='small'),'{{category}} · 조회 {{views}}')])
    d=Document(templates['board']); spans=[n for n in d.nodes if n.tag=='span']; templates['board']=d.edit([d.attr(d.one(tag='a'),'href','{{url}}'),d.put(spans[0],'{{category}}'),d.put(spans[1],'{{count}}')])
    d=Document(templates['tag']); templates['tag']=d.edit([d.attr(d.one(tag='a'),'href','{{url}}'),d.put(d.one(tag='a'),'#{{tag}}')])
    d=Document(templates['roundup']); edits=[]
    for i,section in enumerate(d.one(cl='board-roundup').children):
        li=next(n for n in d.nodes if section.start<n.start<section.end and n.tag=='ul')
        edits.append(d.put(li,'{{roundup'+str(i)+'}}'))
    templates['roundup']=d.edit(edits)
    d=Document(templates['related']); edits=[]
    for kind in ['prev','next']:
        a=next(n for n in d.nodes if n.tag=='a' and n.attrs.get('rel')==kind)
        edits.extend([d.attr(a,'href','{{'+kind+'Url}}'),d.put(a.children[0],'{{'+kind+'Title}}')])
    templates['related']=d.edit(edits)
    # Page data slots. Original shell/class names/spacing/CSS are unmodified.
    d=home; edits=[d.replace(d.one(cl='spotlight'),'{{hero}}'),d.put(d.one(id='feed-title'),'{{feedTitle}} <span>{{count}}</span>'),d.put(d.one(cl='community-stories'),'{{rows}}'),d.attr(d.one(cl='community-stories'),'class','community-stories {{listClass}}'),d.put(d.one(cl='reading-picks'),'{{picks}}'),d.put(d.one(cl='board-directory'),'{{boards}}'),d.put(d.one(cl='topic-tags'),'{{tags}}'),d.replace(d.one(cl='board-roundup'),'{{roundup}}'),d.put(d.one(cl='community-pagination'),'{{pagination}}'),d.put(d.one(cl='community-list-count'),'전체 {{count}}편 · {{page}} / {{pages}} 페이지'),d.attr(d.one(id='site-search'),'value','{{query}}'),d.put(d.one(tag='title'),'{{pageTitle}} | 썰판')]
    for cl in ['feed-sort','view-options','feed-tabs','community-nav']:
        parent=d.one(cl=cl)
        for i,a in enumerate(n for n in parent.children if n.tag=='a'):
            op=d.text[a.start:a.open_end]
            op=re.sub(r'\saria-current="[^"]*"','',op)
            if cl in ['feed-sort','view-options','feed-tabs']:
                op=re.sub(r'href="[^"]*"','href="{{'+cl+str(i)+'Url}}"',op)
            op=op[:-1]+' {{'+cl+str(i)+'Current}}'+op[-1:]
            edits.append((a.start,a.open_end,op))
    templates['home']=d.edit(edits).replace('<script src="/community.js" defer></script>','{{thumbnailScripts}}<script src="/community.js" defer></script>')
    d=reader; gate=d.one(id='read-gate'); op=d.text[gate.start:gate.open_end]; op=re.sub(r'--fade-height:\d+px','--fade-height:{{fade}}px',op); op=op[:-1]+' {{gateHidden}}'+op[-1:]
    templates['reader']=d.edit([d.put(d.one(tag='title'),'{{title}} | 썰판'),d.put(d.one(cl='article-category'),'{{category}}'),d.put(subnode(d,d.one(cl='article-heading'),tag='h1'),'{{title}}'),d.put(d.one(id='story-view-count'),'{{views}}'),d.put(d.one(id='opening'),'{{beforeHtml}}'),d.put(d.one(id='continuation'),'{{afterHtml}}'),d.put(d.one(id='fade-sample'),'{{sampleHtml}}'),d.put(d.one(id='gate-heading'),'{{gateLine}}'),(gate.start,gate.open_end,op),d.put(d.one(id='reader-data'),'{{readerData}}'),d.replace(d.one(cl='related'),'{{related}}')])
    # Extract exact full public text, including content hidden until Continue reading.
    seeds=[]
    for i in range(1,7):
        d=Document(read(f'stories/{i:03d}/index.html')); row=home.one(cl='community-stories').children[i-1]; rowdoc=Document(home.raw(row)); cr=Document(cards.raw(cards.one(cl='community-stories').children[i-1])); thumb=cr.one(cl='story-thumbnail')
        def paras(id):
            el=d.one(id=id)
            return '\n\n'.join(text(d.inner(n)) for n in el.children if n.tag=='p')
        seeds.append({'id':str(i),'legacyId':f'{i:03d}','title':text(rowdoc.inner(rowdoc.one(tag='h2'))),'category':text(rowdoc.inner(rowdoc.one(cl='card-category'))),'teaser':text(rowdoc.inner(rowdoc.one(cl='card-teaser'))),'beforeContent':paras('opening'),'afterContent':paras('continuation'),'gateLine':text(d.inner(d.one(id='gate-heading'))),'hook':thumb.attrs['data-hook'],'coverDetail':thumb.attrs['data-detail'],'views':int(text(d.inner(d.one(id='story-view-count'))).replace(',','') or 0),'fadeHeight':json.loads(d.inner(d.one(id='reader-data'))).get('fadeHeight',180)})
        dest=OUT/f'stories/{i:03d}/index.html';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(d.text)
    (OUT/'index.html').write_text(home.text)
    (OUT/'ssul-templates.mjs').write_text('export default '+json.dumps(templates,ensure_ascii=False)+';\n')
    (ROOT/'scripts/original-public-posts.json').write_text(json.dumps(seeds,ensure_ascii=False,indent=2))
    legacy=json.loads(subprocess.check_output(['node','-e',"const fs=require('fs'),vm=require('vm');const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync('data.js','utf8'),c);console.log(JSON.stringify(c.window.SSULPAN_DATA.SEEDS));"],cwd=ROOT,text=True))
    (OUT/'ssul-source-data.mjs').write_text('export default '+json.dumps({'originals':seeds,'previousSeeds':legacy},ensure_ascii=False)+';\n')
    # Studio UI assets stay separate from the captured public community UI.
    for f in ['config.js','data.js','styles.css','studio.html','studio.js','instagram.html','instagram.js','manuscript.html','manuscript.js','robots.txt','_headers','_redirects','_routes.json','_worker.js']:
        if (ROOT/f).exists(): shutil.copyfile(ROOT/f,OUT/f)
    for f in ['ssul-render.mjs','ssul-community.mjs','studio-entry.js','studio-entry.css']:
        shutil.copyfile(ROOT/f,OUT/f)
    for name in ['_headers','_redirects']:
        if not (OUT/name).exists(): (OUT/name).write_text('')
    (OUT/'ui-provenance.json').write_text(json.dumps({'source':manifest['origin'],'capturedAt':manifest['capturedAt'],'assets':exact,'htmlChanges':['remove old hosting platform challenge injection','bind original DOM data slots to Supabase; no replacement styles or components'],'protectedStudioRecovered':False},ensure_ascii=False,indent=2))
    print('Original UI packaged:',len(exact),'byte-exact assets;',len(seeds),'full original stories.')

if __name__=='__main__': main()
