import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {renderHome,renderStory,storyUrl,dbId} from '../dist/ssul-render.mjs';
import T from '../dist/ssul-templates.mjs';
import source from '../dist/ssul-source-data.mjs';
import worker from '../dist/_worker.js';
const rows=source.originals.map((p,i)=>({...p,date:`2026-09-${String(10-i).padStart(2,'0')}`,tags:['테스트']}));
test('11 original CSS, JS, logo, images remain byte-identical',()=>{
 const report=JSON.parse(fs.readFileSync('dist/ui-provenance.json'));
 assert.equal(report.assets.length,11);
 for(const asset of report.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('dist/'+asset.path)).digest('hex'),asset.sha256,asset.path);
});
test('source templates retain original public UI classes, never reconstructed main CSS',()=>{
 const h=renderHome(rows,new URL('https://ssulpan.test/'));
 for(const text of ['community-head','community-brand','/brand/ssulpan-logo.png','/style.css','/community.css','/community.js','/community/office.png'])assert.ok(h.includes(text),text);
 assert.equal((h.match(/class="story-row"/g)||[]).length,6);
 assert.ok(!h.includes('/styles.css'));assert.ok(!h.includes('/app.js'));assert.ok(!h.includes('__CF$cv$params'));
});
test('original list/card, category, keyword, order and pagination bindings',()=>{
 const home=path=>renderHome(rows,new URL('https://ssulpan.test'+path));
 assert.equal((home('/?category=직장생활').match(/class="story-row"/g)||[]).length,2);
 assert.equal((home('/?q=결혼식').match(/class="story-row"/g)||[]).length,1);
 assert.equal((home('/?view=cards').match(/data-story-thumbnail/g)||[]).length,6);
 assert.ok(home('/?view=cards').includes('/thumbnails.js'));
 assert.ok(home('/?order=oldest').indexOf('class="story-row" href="/stories/006/')>0);
});
test('all six original complete articles and continue-reading DOM survive',()=>{
 for(const p of rows){const h=renderStory(p,rows);assert.ok(h.includes('id="continue-reading"'));assert.ok(h.includes('id="continuation" hidden'));assert.ok(h.includes('rel="prev"'));assert.ok(h.includes('rel="next"'));assert.ok(h.includes('이야기 끝'));assert.ok(h.includes(p.afterContent.split('\n\n').at(-1)));}
 assert.equal(dbId('001'),'1');assert.equal(storyUrl('1'),'/stories/001/');assert.equal(storyUrl('draft-abc'),'/stories/draft-abc/');
});
test('stored article text cannot inject HTML',()=>{const h=renderStory({...rows[0],title:'<img src=x onerror=alert(1)>',beforeContent:'<script>alert(1)</script>'},rows);assert.ok(h.includes('&lt;script&gt;'));assert.ok(!h.includes('<img src=x'));});
test('canonical recovered sample content via compatibility API without overwriting new edits',async()=>{
 const saved=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({ok:true,posts:source.previousSeeds});
  const response=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{}),result=await response.json();
  assert.equal(result.posts[0].beforeContent,source.originals[0].beforeContent);
  globalThis.fetch=async()=>Response.json({ok:true,posts:[{...source.previousSeeds[0],beforeContent:'새로 작성한 내용'}]});
  const changed=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{});
  assert.equal((await changed.json()).posts[0].beforeContent,'새로 작성한 내용');
 } finally {globalThis.fetch=saved;}
});
test('the exact six stored DB samples receive complete recovered text but preserve live counts',async()=>{
 const saved=globalThis.fetch;
 const stored=source.previousSeeds.map(p=>({...p,views:37}));
 stored[1].beforeContent='12년을 친구로 지낸 사람이었다. 내 결혼식에는 가족 일이 생겨 정말 미안하다며 오지 못한다고 했다.\n\n서운했지만 이해하려 했다. 그런데 우연히 본 사진 한 장에서 그 친구가 다른 결혼식장에 있었다.';
 stored[1].afterContent='처음에는 날짜를 잘못 본 줄 알았다. 사진을 확대해 보고, 올라온 시간을 다시 확인했다.\n\n내 결혼식이 끝난 다음 날도 아니었다. 같은 날, 다른 시간대 식장이었다.\n\n사진 속 표정이 너무 밝아서 오히려 무슨 말을 해야 할지 모르겠더라.';
 try {
  globalThis.fetch=async()=>Response.json({ok:true,posts:stored});
  const response=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{});
  const {posts}=await response.json();
  for(const p of posts){const original=source.originals.find(x=>x.id===p.id);assert.equal(p.beforeContent,original.beforeContent);assert.equal(p.afterContent,original.afterContent);assert.equal(p.views,37);}
  stored[1].afterContent='관리자가 실제로 수정한 결말';
  const edited=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{});
  assert.equal((await edited.json()).posts[1].afterContent,'관리자가 실제로 수정한 결말');
 }finally{globalThis.fetch=saved;}
});
test('legacy details redirect and the original reader view endpoint maps 001 to DB id 1',async()=>{
 const old=await worker.fetch(new Request('https://ssulpan.test/post.html?id=1'),{});
 assert.equal(old.status,302);assert.equal(old.headers.get('location'),'https://ssulpan.test/stories/001/');
 const saved=globalThis.fetch;let submitted;
 try{
  globalThis.fetch=async(u,o)=>{submitted=JSON.parse(o.body);return Response.json({ok:true,views:18});};
  const r=await worker.fetch(new Request('https://ssulpan.test/api/stories/001/view',{method:'POST'}),{});
  assert.equal(r.status,200);assert.equal(submitted.id,'1');assert.equal((await r.json()).views,18);
 }finally{globalThis.fetch=saved;}
});

test('studio and studio APIs open without login, cookie or access token',async()=>{
 const saved=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options={})=>{
   const body=JSON.parse(options.body||'{}'),headers=new Headers(options.headers||{});
   calls.push({url:String(url),body,headers});
   if(body.action==='drafts_list')return Response.json({ok:true,drafts:[]});
   return Response.json({ok:true});
  };
  const env={ASSETS:{fetch:async()=>new Response('<button id="new-story">새 원고</button>',{headers:{'Content-Type':'text/html'}})}};
  const studio=await worker.fetch(new Request('https://ssulpan.test/studio/'),env);
  assert.equal(studio.status,200);
  const studioHtml=await studio.text();
  assert.ok(studioHtml.includes('new-story'));
  assert.ok(!studioHtml.includes('story-select'));
  assert.equal(calls.length,0);
  const drafts=await worker.fetch(new Request('https://ssulpan.test/api/drafts'),env);
  assert.equal(drafts.status,200);
  assert.deepEqual(await drafts.json(),{ok:true,drafts:[]});
  assert.equal(calls.at(-1).headers.has('x-studio-token'),false);
  await worker.fetch(new Request('https://ssulpan.test/api/settings',{method:'POST',headers:{Origin:'https://ssulpan.test','Content-Type':'application/json'},body:JSON.stringify({key:'sk-ant-test',model:'claude-sonnet-5'})}),env);
  assert.equal(calls.at(-1).body.action,'settings_save');
  assert.equal(calls.at(-1).body.model,'claude-sonnet-5');
  await worker.fetch(new Request('https://ssulpan.test/api/jobs/00000000-0000-0000-0000-000000000099/candidate'),env);
  assert.equal(calls.at(-1).body.action,'job_candidate');
  const legacy=await worker.fetch(new Request('https://ssulpan.test/studio/access/abcdefghijklmnopqrstuvwxyz'),env);
  assert.equal(legacy.status,302);
  assert.equal(legacy.headers.get('location'),'https://ssulpan.test/studio/');
 }finally{globalThis.fetch=saved;}
});
test('cross-origin pages cannot silently mutate the shared studio',async()=>{
 let called=false;const saved=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{called=true;return Response.json({ok:true})};
  const response=await worker.fetch(new Request('https://ssulpan.test/api/settings',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'}),{});
  assert.equal(response.status,403);assert.equal(called,false);
 }finally{globalThis.fetch=saved;}
});
test('studio job responses stream start, progress and the complete proposal metadata',async()=>{
 const saved=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({ok:true,id:'job-1',result:{title:'결과'},usage:[{input_tokens:1}],model:'claude-sonnet-5',calls:1,promptUsage:null,promptRevision:3,baseData:'{"title":"hash"}',target:'before'});
  const response=await worker.fetch(new Request('https://ssulpan.test/api/jobs',{method:'POST',headers:{Origin:'https://ssulpan.test','Content-Type':'application/json'},body:JSON.stringify({jobId:'job-1',draftId:'draft-1',action:'generate',data:{}})}),{});
  assert.equal(response.headers.get('content-type'),'application/x-ndjson; charset=utf-8');
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events[0].type,'started');
  assert.ok(events.some(event=>event.type==='progress'));
  const done=events.find(event=>event.type==='done');
  assert.equal(done.baseData,'{"title":"hash"}');
  assert.equal(done.promptRevision,3);
 }finally{globalThis.fetch=saved;}
});
