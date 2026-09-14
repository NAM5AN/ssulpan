import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import worker from '../dist/_worker.js';
import * as core from '../supabase/functions/ssul_studio/core.mjs';
import * as support from '../supabase/functions/ssul_studio/generation-support.mjs';

function entry() {
  const elements=new Map(),timers=new Map(),requests=[],navigations=[];let timer=0,allow=false;
  const el=key=>{if(!elements.has(key))elements.set(key,{value:'',textContent:'',events:{},attributes:{},open:false,querySelector:el,setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.events[k]=fn;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();},focus(){},select(){}});return elements.get(key);};
  el('reader-data').textContent=JSON.stringify({id:'001',trackViews:true});
  const context=vm.createContext({document:{querySelector:el,getElementById:el,createElement:()=>el('dialog'),body:{append(){}}},window:{location:{search:'',assign:u=>navigations.push(u)}},URLSearchParams,AbortController,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),fetch:async(path,options)=>{requests.push(JSON.parse(options.body));return Response.json(allow?{ok:true,url:'/studio/?story=1'}:{error:'비밀번호가 맞지 않아요.'},{status:allow?200:401});}});
  vm.runInContext(fs.readFileSync('studio-entry.js','utf8'),context);
  return {el,requests,navigations,timers,allow(){allow=true;},click(){el('story-view-count').events.click();},submit(){return el('form').events.submit({preventDefault(){}});}};
}
test('three rapid view-text clicks prompt; one, two or separated clicks do not',async()=>{
  const e=entry();e.click();e.click();assert.equal(e.el('dialog').open,false);
  [...e.timers.values()].forEach(fn=>fn());e.click();assert.equal(e.el('dialog').open,false);
  e.click();e.click();assert.equal(e.el('dialog').open,true);assert.equal(e.el('h2').textContent,'게시글 수정');
  assert.deepEqual(e.el('story-view-count').attributes,{});
  e.el('input').value='0000';await e.submit();assert.equal(e.navigations.length,0);assert.match(e.el('[role="alert"]').textContent,/비밀번호/);
  e.allow();e.el('input').value='1234';await e.submit();assert.equal(e.requests.at(-1).storyId,'001');assert.equal(e.navigations[0],'/studio/?story=1');
});
test('cancelled article entry does not leak its target into search entry',async()=>{
  const e=entry();e.click();e.click();e.click();e.el('[data-cancel]').events.click();
  e.el('[name="q"]').value='썰판 스튜디오';e.el('.community-search').events.submit({preventDefault(){}});
  assert.equal(e.el('h2').textContent,'스튜디오 입장');await e.submit();assert.equal(e.requests[0].storyId,undefined);
});
test('article login canonicalizes ID after authentication and checks the exact draft',async()=>{
  const previous=globalThis.fetch,calls=[];
  const call=body=>worker.fetch(new Request('https://ssulpan.test/api/studio-entry',{method:'POST',headers:{Origin:'https://ssulpan.test'},body:JSON.stringify(body)}),{});
  try{
    globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='studio_access_login')return Response.json({ok:true,token:'session',expiresAt:Date.now()+60000});assert.equal(body.studioSession,'session');return body.id==='1'?Response.json({ok:true,id:'1'}):Response.json({ok:false,error:'원고 없음'},{status:404});};
    const response=await call({password:'1234',storyId:'001'});assert.deepEqual(await response.json(),{ok:true,url:'/studio/?story=1'});assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.equal(calls[1].id,'1');
    assert.equal((await call({password:'1234',storyId:'missing'})).status,404);
    assert.equal((await call({password:'1234',storyId:'//other.test'})).status,400);
  }finally{globalThis.fetch=previous;}
});
test('delete adapter requires session and same origin and forwards exact ID/revision',async()=>{
  const previous=globalThis.fetch,calls=[];
  try{
    globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json(body.action==='studio_access_verify'?{ok:true,authenticated:body.token==='session'}:{ok:true,id:body.id,deleted:true});};
    const call=(cookie='',origin='https://ssulpan.test')=>worker.fetch(new Request('https://ssulpan.test/api/drafts/story-test',{method:'DELETE',headers:{Cookie:cookie,Origin:origin},body:JSON.stringify({revision:7})}),{});
    assert.equal((await call()).status,401);assert.equal((await call('__Host-ssulpan_studio=session','https://other.test')).status,403);
    const response=await call('__Host-ssulpan_studio=session');assert.equal(response.status,200);assert.deepEqual(calls.at(-1),{action:'draft_delete',id:'story-test',revision:7,studioSession:'session'});
  }finally{globalThis.fetch=previous;}
});
test('deletion Edge Function custom-authenticates and only calls revision-checked archive RPC',async()=>{
  let serve;const calls=[];
  const context=vm.createContext({...core,...support,Response,Request,TextEncoder,crypto:webcrypto,console,Error,createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:args.story_id,deleted:true}};}}),Deno:{env:{get:()=>''},serve:fn=>{serve=fn;}}});
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/ssul_studio/index.ts','utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'')),context);
  vm.runInContext('checkStudioSession=async token=>({authenticated:token==="session"})',context);
  const call=(revision,session)=>serve(new Request('https://backend.test',{method:'POST',body:JSON.stringify({action:'draft_delete',id:'story-test',revision,studioSession:session})}));
  assert.equal((await call(7,'bad')).status,401);assert.equal(calls.length,0);
  for(const value of [-1,1.5,null,'7'])assert.equal((await call(value,'session')).status,400);
  assert.equal((await call(7,'session')).status,200);assert.equal(calls[0].name,'ssul_archive_story');assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)),{story_id:'story-test',expected_revision:7});
});
