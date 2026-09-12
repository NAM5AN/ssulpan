import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as generationSupport from '../supabase/functions/ssul_studio/generation-support.mjs';
import * as socialRepair from '../supabase/functions/ssul_studio/social-repair.mjs';
import * as preservation from '../supabase/functions/ssul_studio/source-preservation.mjs';
import * as writingStyle from '../supabase/functions/ssul_studio/writing-style.mjs';
import * as studioCore from '../supabase/functions/ssul_studio/core.mjs';
import {listPage,articlePage} from '../dist/ssul-render.mjs';
import T from '../dist/ssul-templates.mjs';
import source from '../dist/ssul-source-data.mjs';
import worker,{dbId,storyUrl} from '../dist/_worker.js';
const rows=source.originals.map((p,i)=>({...p,date:`2026-09-${String(10-i).padStart(2,'0')}`,tags:['테스트']}));
test('11 original CSS, JS, logo, images remain byte-identical',()=>{
 const report=JSON.parse(fs.readFileSync('dist/ui-provenance.json'));
 assert.equal(report.assets.length,11);
 for(const asset of report.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('dist/'+asset.path)).digest('hex'),asset.sha256,asset.path);
});
test('source templates retain original public UI classes, never reconstructed main CSS',()=>{
 const h=listPage(rows,1,{});
 for(const text of ['community-head','community-brand','/brand/ssulpan-logo.png','/style.css','/community.css','/community.js','/community/office.png'])assert.ok(h.includes(text),text);
 assert.equal((h.match(/class="story-row"/g)||[]).length,6);
 assert.ok(!h.includes('/styles.css'));assert.ok(!h.includes('/app.js'));assert.ok(!h.includes('__CF$cv$params'));
});
test('original list/card, category, keyword, order and pagination bindings',()=>{
 const home=path=>{const url=new URL('https://ssulpan.test'+path),page=url.pathname==='/'?1:Number(url.pathname.split('/')[2]);return listPage(rows,page,Object.fromEntries(url.searchParams));};
 assert.equal((home('/?category=직장생활').match(/class="story-row"/g)||[]).length,2);
 assert.equal((home('/?q=결혼식').match(/class="story-row"/g)||[]).length,1);
 assert.equal((home('/?view=cards').match(/data-story-thumbnail/g)||[]).length,6);
 assert.ok(home('/?view=cards').includes('/thumbnails.js'));
 assert.ok(home('/?order=oldest').indexOf(`class="story-row" href="/stories/${rows.at(-1).id}/`)>0);
});
test('current GPT Sites renderer keeps twenty stories on each list page',()=>{
 const many=Array.from({length:25},(_,i)=>({...rows[i%rows.length],id:`post-${i+1}`,title:`글 ${i+1}`}));
 assert.equal((listPage(many,1,{}).match(/class="story-row"/g)||[]).length,20);
 assert.equal((listPage(many,2,{}).match(/class="story-row"/g)||[]).length,5);
});
test('all six original complete articles and continue-reading DOM survive',()=>{
 for(const p of rows){const h=articlePage(p,rows);assert.ok(h.includes('id="continue-reading"'));assert.ok(h.includes('id="continuation" hidden'));assert.ok(h.includes('rel="prev"'));assert.ok(h.includes('rel="next"'));assert.ok(h.includes('이야기 끝'));assert.ok(h.includes(p.afterContent.split('\n\n').at(-1)));}
 assert.equal(dbId('001'),'1');assert.equal(storyUrl('1'),'/stories/001/');assert.equal(storyUrl('draft-abc'),'/stories/draft-abc/');
});
test('stored article text cannot inject HTML',()=>{const h=articlePage({...rows[0],title:'<img src=x onerror=alert(1)>',beforeContent:'<script>alert(1)</script>'},rows);assert.ok(h.includes('&lt;script&gt;'));assert.ok(!h.includes('<img src=x'));});
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
test('public post API strips studio-only fields and normalizes public display values',async()=>{
 const saved=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({ok:true,posts:[{...source.previousSeeds[0],title:'공개 필드 점검',storyBible:'내부 인물 메모',sourceText:'가져온 원문',sourceImageKey:'private/path',titles:['후보'],status:'published',hashtags:['#썰판','#썰','#직장생활'],fadeHeight:230}]});
  const response=await worker.fetch(new Request('https://ssulpan.test/api/ssul_posts'),{}),result=await response.json(),post=result.posts[0];
  assert.deepEqual(Object.keys(post).sort(),['afterContent','beforeContent','caption','category','coverDetail','fadeHeight','gateLine','hashtags','hook','id','teaser','title','views'].sort());
  assert.equal(post.hashtags,'#썰판 #썰 #직장생활');
  assert.equal(post.fadeHeight,230);
  for(const key of ['storyBible','sourceText','sourceImageKey','titles','status'])assert.equal(key in post,false,key);
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
  for(const p of posts){const original=source.originals.find(x=>dbId(x.id)===dbId(p.id));assert.equal(p.beforeContent,original.beforeContent);assert.equal(p.afterContent,original.afterContent);assert.equal(p.views,37);}
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

test('all studio buttons reach the real Edge dispatcher and job runner through the worker',async()=>{
 const saved=globalThis.fetch,calls=[];
 const query=()=>{const value={then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)},maybeSingle:async()=>({data:null,error:null})};for(const method of ['select','eq','gte','limit','insert','update'])value[method]=()=>value;return value;};
 let serve;
 const context=vm.createContext({...studioCore,...generationSupport,...writingStyle,Response,Request,URL,TextEncoder,TextDecoder,crypto:crypto.webcrypto,console,Error,record:input=>calls.push(input),createClient:()=>({from:query}),Deno:{env:{get:()=>''},serve:fn=>{serve=fn;}}});
 const source=fs.readFileSync('supabase/functions/ssul_studio/index.ts','utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
 vm.runInContext(stripTypeScriptTypes(source),context);
 // Provider and storage are mocked; HTTP routing, validation and runJob are real.
 vm.runInContext(`credentials=async()=>({key:'test-key',model:'test-model'});callClaude=async(action,d,target,instruction,jobId,scope)=>{record({action,target,instruction,scope,sourceText:d.sourceText});return {result:{text:'결과'},calls:1,usage:[],model:'test-model',baseData:'base'};};`,context);
 try {
  globalThis.fetch=async(url,options)=>serve(new Request(url,options));
  for(const action of ['generate','rewrite','extract','social','review','split','prompt']){
   const response=await worker.fetch(new Request('https://ssulpan.test/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:'route-'+action,draftId:'draft-route',action,target:'before',scope:action==='rewrite'?{start:0,end:2}:undefined,instruction:'요청 반영',data:{sourceText:'원문 소재',beforeContent:'앞부분',afterContent:'뒷부분',imageIds:['image-1']}})}),{});
   const events=(await response.text()).trim().split('\n').map(JSON.parse);
   assert.ok(events.some(e=>e.type==='done'),JSON.stringify({action,events}));
   assert.equal(calls.at(-1).action,action);
   assert.equal(calls.at(-1).sourceText,'원문 소재');
   if(action==='rewrite'){assert.equal(calls.at(-1).target,'before');assert.equal(calls.at(-1).scope.end,2);}
  }
  const legacy=await serve(new Request('https://edge.test',{method:'POST',body:JSON.stringify({action:'generate',jobId:'legacy-job',data:{sourceText:'소재'}})}));
  assert.equal(legacy.status,200);
  const malformed=await serve(new Request('https://edge.test',{method:'POST',body:JSON.stringify({action:'job_run',jobAction:'unknown',data:{}})}));
  assert.equal(malformed.status,400);
 }finally{globalThis.fetch=saved;}
});

function validGenerated(){return {title:'잃어버린 인형',titles:['잃어버린 인형','다시 온 선물','뜻밖의 답장'],category:'일상',teaser:'인형을 잃어버린 뒤 답장이 왔다.',beforeContent:'여행 중 인형을 잃어버렸다.\n\n그런데 공식 계정에서 연락이 왔다.',afterContent:'며칠 뒤 새 인형과 손글씨 쪽지가 도착했다.',storyBible:'화자는 여행 중 인형을 잃어버렸다. 공식 계정이 새 인형을 보내줬다.',gateLine:'며칠 뒤 도착한 상자에는 뭐가 있었을까.',hook:'잃어버린 인형\n그런데 며칠 뒤\n답장이 왔다',coverDetail:'그런데 공식 계정에서 연락이 왔다.',caption:'여행 중 잃어버린 인형. 이런 답장을 받는다면?\n전체 글은 프로필 링크에서',hashtags:'#썰판 #썰 #인형 #여행 #선물',imageText:''};}

test('missing gateLine is precisely diagnosed and repaired once with both bodies frozen',async()=>{
 const raw=validGenerated();delete raw.gateLine;const original=structuredClone(raw);let calls=0;
 const report=generationSupport.fieldReport(studioCore.schemas.generate,raw);
 assert.deepEqual(report.missing,['gateLine']);
 assert.throws(()=>studioCore.validateResult('generate',raw,studioCore.cleanDraft({})),error=>error.code==='RESULT_SCHEMA_INVALID'&&error.details.missing[0]==='gateLine');
 const repaired=await generationSupport.completeMetadata(raw,async req=>{calls++;assert.deepEqual(req.schema.required,['gateLine']);const context=JSON.parse(req.text);assert.equal(context.frozenContent.beforeContent,raw.beforeContent);assert.equal(context.frozenContent.afterContent,raw.afterContent);return {gateLine:'상자 안에는 예상하지 못한 쪽지가 있었다.'};});
 assert.equal(calls,1);assert.deepEqual(raw,original);assert.deepEqual(repaired.repaired,['gateLine']);
 for(const key of Object.keys(original))assert.deepEqual(repaired.result[key],original[key],key);
 assert.equal(studioCore.validateResult('generate',repaired.result,studioCore.cleanDraft({})).beforeContent,raw.beforeContent);
});

test('metadata recovery rejects body replacement and never fabricates missing body',async()=>{
 const raw=validGenerated();delete raw.gateLine;
 await assert.rejects(()=>generationSupport.completeMetadata(raw,async()=>({gateLine:'이어 읽기',beforeContent:'바뀐 본문'})),e=>e.code==='RESULT_SCHEMA_INVALID'&&e.details.extra.includes('beforeContent'));
 delete raw.beforeContent;let calls=0;const out=await generationSupport.completeMetadata(raw,async()=>{calls++;return {gateLine:'x'};});
 assert.equal(calls,0);assert.ok(!out.result.beforeContent);
});

test('tool serialization leaked into storyBible is repaired without changing either body',async()=>{
 const raw=validGenerated();raw.storyBible+='</storyBible>\n<parameter name="gateLine">오염된 표식';
 const before=raw.beforeContent,after=raw.afterContent;let calls=0;
 const providerReport=generationSupport.fieldReport(studioCore.schemas.generate,raw);
 assert.deepEqual(providerReport.invalid,[{field:'storyBible',reason:'tool_serialization_artifact'}]);
 const out=await generationSupport.completeMetadata(raw,async request=>{calls++;assert.deepEqual(request.schema.required,['storyBible']);return {storyBible:'화자가 인형을 잃어버렸고 공식 계정에서 새 인형을 보내줌.'};});
 assert.equal(calls,1);assert.equal(out.result.beforeContent,before);assert.equal(out.result.afterContent,after);
 assert.equal(generationSupport.hasToolSerializationArtifact(out.result.storyBible),false);
});

test('validated generate result retains the thirteenth imageText field',()=>{
 const result=studioCore.validateResult('generate',validGenerated(),studioCore.cleanDraft({}));
 assert.equal(Object.hasOwn(result,'imageText'),true);assert.equal(result.imageText,'');
});

test('strict provider schema removes unsupported constraints without weakening local contracts',()=>{
 const schema=generationSupport.strictSchema(studioCore.schemas.generate);
 assert.equal(schema.additionalProperties,false);assert.equal(schema.required.length,13);
 assert.equal(schema.properties.titles.minItems,undefined);assert.equal(schema.properties.titles.maxItems,undefined);
 assert.match(schema.properties.titles.description,/minItems: 3/);
 assert.equal(studioCore.schemas.generate.properties.titles.minItems,3);
 const raw=validGenerated();raw.titles=['one'];assert.throws(()=>studioCore.validateResult('generate',raw,studioCore.cleanDraft({})));
 assert.equal(generationSupport.strictSchema(studioCore.schemas.split).properties.cutIndex.minimum,undefined);
 assert.equal(generationSupport.strictSchema(studioCore.schemas.review).properties.issues.items.additionalProperties,false);
});

function edgeHarness(provider){
 let serve;const updates=[];
 const query=()=>{const q={then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)},maybeSingle:async()=>({data:null,error:null})};for(const method of ['select','eq','gte','limit','insert'])q[method]=()=>q;q.update=value=>{updates.push(structuredClone(value));return q;};return q;};
 const context=vm.createContext({...studioCore,...generationSupport,...socialRepair,...preservation,...writingStyle,Response,Request,URL,TextEncoder,TextDecoder,AbortSignal,crypto:crypto.webcrypto,console,Error,fetch:provider,createClient:()=>({from:query}),Deno:{env:{get:()=>''},serve:fn=>{serve=fn;}}});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/ssul_studio/index.ts','utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'')),context);
 vm.runInContext(`credentials=async()=>({key:'test-key',model:'test-model'});getWritingPrompt=async()=>({prompt:'',revision:1});putArtifact=async()=>{};`,context);
 return {context,updates,serve};
}

test('real generation pipeline repairs the missing field and records request IDs, stop reasons and stages',async()=>{
 let calls=0;const candidate=validGenerated();delete candidate.gateLine;
 const {context,updates}=edgeHarness(async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.tools[0].strict,true);assert.equal(body.tools[0].input_schema.additionalProperties,false);
  calls++;return Response.json({id:'msg-'+calls,stop_reason:'tool_use',usage:{input_tokens:5,output_tokens:6},content:[{type:'tool_use',name:'deliver_result',input:calls===1?candidate:{gateLine:'쪽지에는 뭐라고 적혀 있었을까.'}}]},{headers:{'request-id':'req-'+calls}});
 });
 const out=await vm.runInContext(`runJob({jobId:'pipeline-job',draftId:'pipeline-draft',action:'generate',data:{sourceText:'여행 중 잃어버린 인형. 공식 계정이 새 인형과 쪽지를 보내왔다.'}})`,context);
 assert.equal(calls,2);assert.equal(out.result.beforeContent,candidate.beforeContent);assert.equal(out.result.afterContent,candidate.afterContent);
 assert.equal(out.diagnostics.stage,'completed');assert.equal(out.diagnostics.repairs[0].fields[0],'gateLine');assert.equal(out.diagnostics.providerCalls[0].fields.missing[0],'gateLine');assert.equal(out.diagnostics.providerCalls[1].requestId,'req-2');assert.equal(out.diagnostics.providerCalls[0].stopReason,'tool_use');
 assert.ok(updates.some(v=>v.status==='done'));assert.ok(!updates.some(v=>Object.hasOwn(v,'data')));
});

test('provider failure is saved with exact HTTP error and redacted diagnostics',async()=>{
 const {context,updates}=edgeHarness(async()=>Response.json({error:{type:'authentication_error',message:'Invalid key sk-ant-private-123'}},{status:401,headers:{'request-id':'req-failed'}}));
 await assert.rejects(()=>vm.runInContext(`runJob({jobId:'failed-job',draftId:'failed-draft',action:'generate',data:{sourceText:'소재 내용'}})`,context),error=>error.diagnostics.error.code==='PROVIDER_HTTP_401');
 const saved=updates.find(v=>v.status==='failed').result.diagnostics;
 assert.equal(saved.error.provider.requestId,'req-failed');assert.equal(saved.stage,'generate');assert.ok(!JSON.stringify(saved).includes('sk-ant-private'));assert.match(saved.error.provider.message,/REDACTED/);
});

test('worker passes diagnostics on failed streams and exposes history diagnostics',async()=>{
 const saved=globalThis.fetch;const diagnostics={jobId:'job-1',stage:'validate',error:{code:'RESULT_SCHEMA_INVALID',fields:{missing:['gateLine']}}};
 try{
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);if(payload.action==='job_diagnostics')return Response.json({ok:true,diagnostics});return Response.json({ok:false,error:'누락: gateLine',diagnostics},{status:502});};
  const r=await worker.fetch(new Request('https://ssulpan.test/api/jobs',{method:'POST',body:JSON.stringify({jobId:'job-1',action:'generate',data:{}})}),{});
  const failed=(await r.text()).trim().split('\n').map(JSON.parse).find(e=>e.type==='failed');assert.deepEqual(failed.diagnostics,diagnostics);
  const history=await worker.fetch(new Request('https://ssulpan.test/api/jobs/job-1/diagnostics'),{});assert.deepEqual((await history.json()).diagnostics,diagnostics);
 }finally{globalThis.fetch=saved;}
});

test('the applied master prompt makes colloquial and eumseongche defaults explicit without overriding action or quotations',()=>{
 assert.ok(studioCore.masterPrompt.indexOf('# 가장 중요한 문체 원칙')<studioCore.masterPrompt.indexOf('# 작업 모드'));
 assert.match(studioCore.masterPrompt,/options\.tone="음슴체"/);
 assert.match(studioCore.masterPrompt,/반말 구어체에 `~함`, `~했음`, `~임`/);
 assert.match(studioCore.masterPrompt,/따옴표 안 대사[\s\S]*적용하지 않는다/);
 assert.match(studioCore.masterPrompt,/도구 스키마 > `action`[\s\S]*options`에 명시된 말투 > 가장 중요한 문체 원칙의 기본값/);
 assert.equal(studioCore.normalizeWritingOptions({tone:'음슴체'}).tone,'음슴체');
 assert.equal(studioCore.normalizeWritingOptions({tone:'존댓말 구어체'}).tone,'존댓말 구어체');
 assert.equal(studioCore.normalizeWritingOptions({tone:'담담한 문어체'}).tone,'담담한 문어체');
 assert.equal(studioCore.normalizeWritingOptions({}).tone,'친구에게 말하듯');
});

test('literary ending ratio detects written narration including contracted past endings',()=>{
 const report=writingStyle.analyzeNarrativeEndings('역에 도착했다. 다음 장면은 흐릿했다. 확신이 안 섰다. 일이 끝났다. 집에 갔다. 지금도 기억남.',{tone:'친구에게 말하듯'});
 assert.equal(report.narrativeSentenceCount,6);
 assert.equal(report.literaryEndingCount,5);
 assert.equal(report.countsByEnding['ㅆ다 축약'],3);
 assert.equal(report.warning,true);
 assert.equal(report.ratio,0.833);
});

test('ending ratio excludes dialogue and quotations and honors only an explicit literary tone',()=>{
 const quoted=writingStyle.analyzeNarrativeEndings('"그건 내가 했다."\n“예전에는 학생이었다.”\n- 나는 그때 정말 놀랐다.\n기억 안 남. 하 진짜.',{tone:'음슴체'});
 assert.equal(quoted.literaryEndingCount,0);
 assert.equal(quoted.excludedQuotedSpanCount,2);
 assert.equal(quoted.excludedDialogueLineCount,1);
 assert.equal(quoted.warning,false);
 const narrative='역에 도착했다. 다음 장면은 흐릿했다. 확신이 안 섰다. 일이 끝났다.';
 assert.equal(writingStyle.analyzeNarrativeEndings(narrative,{tone:'존댓말 구어체'}).warning,true);
 const exempt=writingStyle.analyzeNarrativeEndings(narrative,{tone:'담담한 문어체'});
 assert.equal(exempt.exempt,true);assert.equal(exempt.warning,false);
});
