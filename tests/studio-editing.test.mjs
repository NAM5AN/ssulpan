import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {cleanDraft,publicPost} from '../supabase/functions/ssul_studio/core.mjs';
import {articlePage} from '../dist/ssul-render.mjs';

const initial=cleanDraft({title:'편집 테스트',beforeContent:'첫 문단\n\n둘째 문단',afterContent:'셋째 문단\n\n마지막 문단',gateLine:'계속 읽기',fadeHeight:180});
async function editor(){
  const elements=new Map(),timers=new Map(),requests=[],backups=new Map();let timerId=0,delaySave=null,published=null;
  let stored={id:'editor-test',revision:1,updatedAt:1,data:structuredClone(initial)};
  function element(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',disabled:false,hidden:false,children:[],selectionStart:0,selectionEnd:0,events:{},contentWindow:{postMessage(){}},addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},focus(){},scrollIntoView(){},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}});return elements.get(id);}
  const markup=fs.readFileSync('studio.html','utf8');for(const match of markup.matchAll(/\bid="([^"]+)"/g))element(match[1]);
  const controls=[...markup.matchAll(/<(input|textarea|select|button)\b[^>]*id="([^"]+)"/g)].map(m=>element(m[2]));
  const document={getElementById:element,querySelectorAll:selector=>selector.startsWith('.studio-wrap')?controls:[],createElement:()=>element('created-'+elements.size),body:{append(){}}};
  const location={origin:'https://ssulpan.test',href:'https://ssulpan.test/studio/',search:''};
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
    if(path==='/api/drafts/editor-test')return Response.json(stored);
    if(path==='/api/drafts/editor-test/publish'){assert.equal(body.revision,stored.revision);published={id:stored.id,...publicPost(stored.data)};return Response.json({url:'/stories/editor-test/'});}
    if(path==='/api/ssul_posts?id=editor-test')return Response.json({post:published});
    throw new Error('Unexpected request: '+path);
  };
  const context=vm.createContext({document,location,fetch,URL,URLSearchParams,Response,TextEncoder,crypto:webcrypto,console,window:{history:{replaceState(){}},addEventListener(){}},localStorage:{setItem:(k,v)=>backups.set(k,v),removeItem:k=>backups.delete(k),getItem:k=>backups.get(k)||null},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync('studio.js','utf8'),context);
  for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('before-content').value,initial.beforeContent);
  return {element,requests,get stored(){return stored;},get published(){return published;},delayNextSave(promise){delaySave=promise;},input(id,value){const el=element(id);assert.equal(el.disabled,false);el.value=value;el.events.input?.();},async flush(){for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
test('manual boundary moves text both ways, saves it, and published reader uses that exact split',async()=>{
  const e=await editor();await e.element('open-split-editor').onclick();
  const full=e.element('split-content');assert.equal(full.value,initial.beforeContent+'\n\n'+initial.afterContent);
  full.setSelectionRange(4,4);await e.element('apply-manual-split').onclick();
  assert.equal(e.stored.data.beforeContent,'첫 문단');assert.equal(e.stored.data.afterContent,'둘째 문단\n\n셋째 문단\n\n마지막 문단');
  await e.element('open-split-editor').onclick();const cut=full.value.indexOf('마지막 문단');full.setSelectionRange(cut,cut);await e.element('apply-manual-split').onclick();
  assert.equal(e.stored.data.beforeContent,'첫 문단\n\n둘째 문단\n\n셋째 문단');assert.equal(e.stored.data.afterContent,'마지막 문단');
  await e.element('publish-story').onclick();assert.equal(e.published.beforeContent,e.stored.data.beforeContent);assert.equal(e.published.afterContent,'마지막 문단');
  const html=articlePage(e.published,[]);const opening=html.match(/<div id="opening">([\s\S]*?)<\/div>/)[1];assert.ok(opening.includes('셋째 문단'));assert.ok(!opening.includes('마지막 문단'));
  assert.match(e.element('status').textContent,/게시본까지 확인/);assert.ok(!e.requests.some(x=>x.path==='/api/jobs'));
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
test('boundary editor cannot silently publish unapplied edits or overwrite newer body text',async()=>{
  const e=await editor();await e.element('open-split-editor').onclick();await e.element('publish-story').onclick();
  assert.equal(e.published,null);assert.match(e.element('status').textContent,/먼저 적용/);
  e.input('before-content','더 최근에 수정한 본문');e.element('split-content').setSelectionRange(4,4);await e.element('apply-manual-split').onclick();
  assert.equal(e.element('before-content').value,'더 최근에 수정한 본문');assert.match(e.element('status').textContent,/본문이 변경/);
  e.element('cancel-manual-split').onclick();await e.element('publish-story').onclick();assert.equal(e.published.beforeContent,'더 최근에 수정한 본문');
});
