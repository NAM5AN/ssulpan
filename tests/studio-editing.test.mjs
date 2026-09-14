import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {cleanDraft,publicPost} from '../supabase/functions/ssul_studio/core.mjs';
import {articlePage} from '../dist/ssul-render.mjs';

const initial=cleanDraft({title:'편집 테스트',beforeContent:'첫 문단\n\n둘째 문단',afterContent:'셋째 문단\n\n마지막 문단',gateLine:'계속 읽기',fadeHeight:180});
async function editor(seed=initial){
  const elements=new Map(),timers=new Map(),requests=[],backups=new Map(),windowEvents=new Map();let timerId=0,delaySave=null,published=null;
  let stored={id:'editor-test',revision:1,updatedAt:1,data:structuredClone(seed)};
  function element(id){if(!elements.has(id)){const attributes=new Map();elements.set(id,{id,value:'',textContent:'',disabled:false,hidden:false,children:[],selectionStart:0,selectionEnd:0,events:{},dataset:{},classList:{add(){},remove(){},toggle(){}},contentWindow:{postMessage(){}},addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){attributes.set(name,String(value));},getAttribute:name=>attributes.has(name)?attributes.get(name):null,querySelectorAll(){return[];},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},focus(){},scrollIntoView(){},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}});}return elements.get(id);}
  const markup=fs.readFileSync('studio.html','utf8');for(const match of markup.matchAll(/\bid="([^"]+)"/g))element(match[1]);
  const controls=[...markup.matchAll(/<(input|textarea|select|button)\b[^>]*id="([^"]+)"/g)].map(m=>element(m[2]));
  const document={getElementById:element,querySelectorAll:selector=>selector.startsWith('.studio-wrap')?controls:[],createElement:()=>element('created-'+elements.size),body:{append(){}}};
  for(const id of ['body-boundary-editor','ad-boundary','before-editor','after-editor']){
    const el=element(id);el.clientTop=id==='body-boundary-editor'?1:0;el.style={};el.rect={top:id==='ad-boundary'?350:id==='before-editor'?60:id==='after-editor'?440:0,height:id==='ad-boundary'?54:200};
    el.getBoundingClientRect=()=>({...el.rect,bottom:el.rect.top+el.rect.height});
  }
  element('boundary-drag-map').style={};element('boundary-drag-map').hidden=true;
  document.createTreeWalker=el=>{const nodes=el.textNodes||[{get data(){return el.textContent;},owner:el}];let i=0;return {nextNode:()=>nodes[i++]||null};};
  document.createRange=()=>{let node,offset;return {setStart(n,o){node=n;offset=o;},setEnd(){},getBoundingClientRect(){const lines=node.data.slice(0,offset).split('\n'),wrap=20;let line=0;for(const text of lines.slice(0,-1))line+=Math.max(1,Math.ceil(text.length/wrap));line+=Math.floor(lines.at(-1).length/wrap);const top=node.owner.rect.top+(node.lineOffset||0)+line*32;return {top,bottom:top+32,height:32};}};};
  const location={origin:'https://ssulpan.test',href:'https://ssulpan.test/studio/',search:'',assign(url){this.href=url;}};
  element('delete-dialog').showModal=function(){this.open=true;};element('delete-dialog').close=function(){this.open=false;};
  const fetch=async(path,options={})=>{
    const body=options.body?JSON.parse(options.body):null;requests.push({path,body,method:options.method||'GET'});
    if(path==='/api/settings')return Response.json({configured:false,model:'test'});
    if(path==='/api/writing-prompt')return Response.json({prompt:'',revision:1});
    if(path==='/api/drafts')return Response.json({drafts:[{id:stored.id,revision:stored.revision,published:!!published}]});
    if(path==='/api/drafts/editor-test'&&options.method==='PUT'){
      if(delaySave){const waiting=delaySave;delaySave=null;await waiting;}
      assert.equal(body.revision,stored.revision);
      stored={...stored,data:cleanDraft(body.data),revision:stored.revision+1,updatedAt:Date.now()};return Response.json(stored);
    }
    if(path==='/api/drafts/editor-test'&&options.method==='DELETE'){assert.equal(body.revision,stored.revision);published=null;return Response.json({id:stored.id,deleted:true});}
    if(path==='/api/drafts/editor-test')return Response.json(stored);
    if(path==='/api/drafts/editor-test/publish'){assert.equal(body.revision,stored.revision);published={id:stored.id,...publicPost(stored.data)};return Response.json({url:'/stories/editor-test/'});}
    if(path==='/api/ssul_posts?id=editor-test')return Response.json({post:published});
    throw new Error('Unexpected request: '+path);
  };
  const context=vm.createContext({document,NodeFilter:{SHOW_TEXT:4},location,fetch,URL,URLSearchParams,Response,TextEncoder,crypto:webcrypto,console,window:{history:{replaceState(){}},addEventListener(name,fn){windowEvents.set(name,fn);}},localStorage:{setItem:(k,v)=>backups.set(k,v),removeItem:k=>backups.delete(k),getItem:k=>backups.get(k)||null},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync('studio.js','utf8'),context);
  for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('before-content').value,seed.beforeContent);
  return {element,requests,location,get stored(){return stored;},get published(){return published;},delayNextSave(promise){delaySave=promise;},windowEvent(name,event){return windowEvents.get(name)?.(event);},input(id,value){const el=element(id);assert.equal(el.disabled,false);el.value=value;el.events.input?.();},async flush(){for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
test('embedded boundary moves by paragraph, survives reopen, and published reader uses that exact split',async()=>{
  const e=await editor();await e.element('ad-boundary').events.keydown({key:'ArrowDown',preventDefault(){}});
  assert.equal(e.stored.data.beforeContent,'첫 문단\n\n둘째 문단\n\n셋째 문단');assert.equal(e.stored.data.afterContent,'마지막 문단');
  const reopened=await editor(e.stored.data);assert.equal(reopened.element('before-editor').textContent,'첫 문단\n\n둘째 문단\n\n셋째 문단');assert.equal(reopened.element('after-editor').textContent,'마지막 문단');
  await reopened.element('publish-story').onclick();assert.equal(reopened.published.beforeContent,reopened.stored.data.beforeContent);assert.equal(reopened.published.afterContent,'마지막 문단');
  const html=articlePage(reopened.published,[]);const opening=html.match(/<div id="opening">([\s\S]*?)<\/div>/)[1];assert.ok(opening.includes('셋째 문단'));assert.ok(!opening.includes('마지막 문단'));
  assert.match(reopened.element('status').textContent,/게시본까지 확인/);assert.ok(!reopened.requests.some(x=>x.path==='/api/jobs'));
});
test('direct editor changes survive a pending autosave followed immediately by publish',async()=>{
  const e=await editor();let release;const waiting=new Promise(resolve=>release=resolve);e.delayNextSave(waiting);
  e.input('before-content','이전 편집');const saving=e.element('save-draft').onclick();await e.flush();
  e.input('before-content','사용자가 마지막으로 쓴 앞부분\n\n공개 마지막 문장');e.input('after-content','광고 뒤에만 보일 결말');e.input('fade-height','240');
  const publishing=e.element('publish-story').onclick();await e.flush();
  assert.equal(e.element('before-content').disabled,true);assert.equal(e.element('after-content').disabled,true);assert.equal(e.element('new-story').disabled,true);
  release();await saving;await publishing;
  assert.equal(e.published.beforeContent,'사용자가 마지막으로 쓴 앞부분\n\n공개 마지막 문장');assert.equal(e.published.afterContent,'광고 뒤에만 보일 결말');assert.equal(e.published.fadeHeight,240);
  assert.equal(e.element('before-content').disabled,false);assert.equal(e.element('after-content').value,e.published.afterContent);
});
test('publish is blocked while the embedded boundary is actively being dragged',async()=>{
  const e=await editor();e.element('ad-boundary').events.pointerdown({button:0,pointerId:7,preventDefault(){}});await e.element('publish-story').onclick();
  assert.equal(e.published,null);assert.match(e.element('status').textContent,/이동을 먼저 마쳐/);
  e.windowEvent('pointercancel',{pointerId:7});await e.element('publish-story').onclick();assert.equal(e.published.beforeContent,initial.beforeContent);
});
test('delete confirmation cancels safely, then saves latest edit before deleting the exact revision',async()=>{
  const e=await editor();await e.element('delete-story').onclick();
  assert.equal(e.element('delete-dialog').open,true);assert.equal(e.element('delete-story-title').textContent,initial.title);
  e.element('cancel-delete').onclick();assert.equal(e.element('delete-dialog').open,false);assert.ok(!e.requests.some(r=>r.method==='DELETE'));
  e.input('before-content','삭제 전 마지막 수정');let release;e.delayNextSave(new Promise(resolve=>release=resolve));
  const saving=e.element('save-draft').onclick();await e.flush();
  await e.element('delete-story').onclick();const deleting=e.element('confirm-delete').onclick();await e.flush();
  assert.equal(e.element('save-draft').disabled,true);assert.ok(!e.requests.some(r=>r.method==='DELETE'));
  release();await saving;await deleting;
  assert.equal(e.stored.data.beforeContent,'삭제 전 마지막 수정');assert.equal(e.requests.filter(r=>r.method==='DELETE').length,1);assert.equal(e.location.href,'/');
});
const pointer=(y=377,id=9)=>({button:0,pointerId:id,clientY:y,preventDefault(){}});
test('press/release and small pointer jitter do not change the boundary or save',async()=>{
  const e=await editor(),before=e.element('before-editor').textContent,after=e.element('after-editor').textContent;
  e.element('ad-boundary').events.pointerdown(pointer());e.windowEvent('pointermove',pointer(380));
  assert.equal(e.element('boundary-drag-map').hidden,true);assert.equal(e.element('before-editor').textContent,before);assert.equal(e.element('after-editor').textContent,after);
  e.windowEvent('pointerup',pointer(380));await e.flush();assert.ok(!e.requests.some(r=>r.method==='PUT'));assert.equal(e.stored.revision,1);
});
test('drag uses existing text geometry; preview never rebuilds the paragraphs or changes the data until drop',async()=>{
  const e=await editor();e.element('ad-boundary').events.pointerdown(pointer());
  const before=e.element('before-editor').textContent,after=e.element('after-editor').textContent;
  e.windowEvent('pointermove',pointer(488));
  assert.equal(e.element('boundary-drag-map').hidden,false);assert.equal(e.element('boundary-drag-map').style.top,'487px');
  assert.equal(e.element('boundary-drag-map').children.length,0);assert.equal(e.element('before-editor').textContent,before);assert.equal(e.element('after-editor').textContent,after);
  assert.ok(!e.requests.some(r=>r.method==='PUT'));
  for(const y of [487,489,488])e.windowEvent('pointermove',pointer(y));assert.equal(e.element('boundary-drag-map').style.top,'487px');
  e.windowEvent('pointerup',pointer(488));await e.flush();assert.equal(e.stored.data.afterContent,'마지막 문단');assert.equal(e.stored.revision,2);
});
test('grab offset, page scroll, cancellation and lost capture cannot accidentally commit',async()=>{
  for(const cancel of ['pointercancel','blur','resize','keydown','lostpointercapture']){
    const e=await editor();e.element('ad-boundary').events.pointerdown(pointer(397));
    e.windowEvent('pointermove',pointer(508));assert.equal(e.element('boundary-drag-map').style.top,'487px');
    e.element('body-boundary-editor').rect.top=-200;e.windowEvent('pointermove',pointer(308));assert.equal(e.element('boundary-drag-map').style.top,'487px');
    if(cancel==='lostpointercapture')e.element('ad-boundary').events.lostpointercapture();else e.windowEvent(cancel,{...pointer(308),key:'Escape'});
    e.windowEvent('pointerup',pointer(308));await e.flush();assert.equal(e.element('boundary-drag-map').hidden,true);assert.equal(e.stored.revision,1);
  }
});
test('text nodes split by rich text blocks retain their actual paragraph boundary',async()=>{
  const e=await editor(),surface=e.element('after-editor');surface.textNodes=[{data:'셋째 ',owner:surface},{data:'문단',owner:surface},{data:'마지막 문단',owner:surface,lineOffset:100}];
  e.element('ad-boundary').events.pointerdown(pointer());e.windowEvent('pointermove',pointer(506));
  assert.equal(e.element('boundary-drag-map').style.top,'505px');
  e.windowEvent('pointerup',pointer(506));await e.flush();assert.equal(e.stored.data.afterContent,'마지막 문단');
});
