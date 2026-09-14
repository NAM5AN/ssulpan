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
  const context=vm.createContext({document,location,fetch,URL,URLSearchParams,Response,TextEncoder,crypto:webcrypto,console,window:{history:{replaceState(){}},addEventListener(name,fn){windowEvents.set(name,fn);}},localStorage:{setItem:(k,v)=>backups.set(k,v),removeItem:k=>backups.delete(k),getItem:k=>backups.get(k)||null},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
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
