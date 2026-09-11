import assets from '../.sites-runtime/assets.json';
import initial from '../content.json';
import config from '../config.json';
import {HttpError,id,cleanDraft,legacy,publicPost,assertPublish,DEFAULT_MODEL,promptFor,parseToolOutput,validateResult,string} from './core.mjs';
import {shell,listPage,articlePage} from './render.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const html=(s,status=200)=>new Response(s,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
function owner(request,env){const uid=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');if(!uid||!email||!env.STUDIO_OWNER_EMAIL||email.toLowerCase()!==env.STUDIO_OWNER_EMAIL.toLowerCase())throw new HttpError(403,'제작실은 사이트 소유자만 사용할 수 있어요. 소유자 계정으로 열어 주세요.');return uid;}
function originCheck(r){if(r.headers.get('Origin')!==new URL(r.url).origin)throw new HttpError(403,'이 사이트에서 다시 요청해 주세요.');}
async function bytes(r,max){const declared=Number(r.headers.get('content-length'));if(declared>max)throw new HttpError(413,'파일이나 내용이 너무 커요. 분량을 줄여 주세요.');if(!r.body)return new Uint8Array();let total=0;const chunks=[],reader=r.body.getReader();for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new HttpError(413,'파일이나 내용이 너무 커요.');}chunks.push(value);}const out=new Uint8Array(total);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;}
async function body(r){if(!r.headers.get('Content-Type')?.startsWith('application/json'))throw new HttpError(415,'요청 형식을 확인해 주세요.');try{return JSON.parse(new TextDecoder().decode(await bytes(r,350000)));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'입력 내용을 읽지 못했어요.');}}
async function allPosts(env){const rows=(await query(env,'SELECT id,data,published_at FROM posts ORDER BY published_at DESC').all()).results;const overridden=new Set(rows.map(r=>r.id));return [...rows.map(r=>({id:r.id,...JSON.parse(r.data)})),...initial.filter(s=>!overridden.has(s.id)).map(s=>({id:s.id,...publicPost(legacy(s))}))];}
async function getDraft(env,uid,did){const r=await query(env,'SELECT data,revision,updated_at FROM drafts WHERE id=? AND owner=?',did,uid).first();if(r)return {id:did,data:JSON.parse(r.data),revision:r.revision,updatedAt:r.updated_at};const s=initial.find(s=>s.id===did);if(s)return {id:did,data:legacy(s),revision:0,updatedAt:0};throw new HttpError(404,'원고를 찾지 못했어요.');}
function base64(a){let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);}
const unbase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function cryptoKey(env){if(!env.STUDIO_KEY_ENCRYPTION_SECRET)throw new HttpError(503,'클로드 연결 저장소를 준비 중이에요.');return crypto.subtle.importKey('raw',unbase64(env.STUDIO_KEY_ENCRYPTION_SECRET),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(value,env,uid){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await cryptoKey(env);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(uid)},key,new TextEncoder().encode(value));return base64(iv)+'.'+base64(new Uint8Array(cipher));}
async function decrypt(value,env,uid){try{const [iv,data]=value.split('.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:new TextEncoder().encode(uid)},await cryptoKey(env),unbase64(data));return new TextDecoder().decode(plain);}catch{throw new HttpError(503,'클로드 키를 다시 연결해 주세요.');}}
async function credentials(env,uid){const s=await query(env,'SELECT encrypted_key,model FROM settings WHERE owner=?',uid).first();return {key:s?.encrypted_key?await decrypt(s.encrypted_key,env,uid):env.ANTHROPIC_API_KEY,model:s?.model||env.CLAUDE_MODEL||DEFAULT_MODEL};}
function upstreamError(status){if(status===401||status===403)return new HttpError(400,'클로드 API 키와 사용 권한을 확인해 주세요.');if(status===429)return new HttpError(429,'클로드 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');if(status===400)return new HttpError(400,'클로드 모델, API 잔액 또는 입력 분량을 확인해 주세요.');if(status===404)return new HttpError(400,'선택한 클로드 모델을 사용할 수 없어요. 연결 설정에서 모델 ID를 확인해 주세요.');return new HttpError(502,'클로드가 응답하지 못했어요. 원고는 보관되어 있습니다.');}
async function anthropicModels(key){let r;try{r=await fetch('https://api.anthropic.com/v1/models?limit=100',{headers:{'x-api-key':key,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(20000)});}catch{throw new HttpError(502,'클로드 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');}if(!r.ok)throw upstreamError(r.status);return (await r.json()).data||[];}
async function imageBlocks(env,uid,ids){
  const rows=[];let total=0;
  for(const imageId of ids){const row=await query(env,'SELECT id,mime,size FROM images WHERE id=? AND owner=?',imageId,uid).first();if(!row)throw new HttpError(400,'첨부 이미지를 찾지 못했어요. 다시 올려 주세요.');total+=row.size;rows.push(row);}
  if(total>12*1024*1024)throw new HttpError(413,'첨부 이미지 합계가 12MB를 넘어요. 크기를 줄이거나 일부 이미지를 제외해 주세요.');
  const blocks=[];for(const row of rows){const file=await env.BUCKET.get('sources/'+row.id);if(!file)throw new HttpError(400,'첨부 이미지를 다시 올려 주세요.');blocks.push({type:'image',source:{type:'base64',media_type:row.mime,data:base64(new Uint8Array(await file.arrayBuffer()))}});}return blocks;
}
async function writingPrompt(env,uid){const row=await query(env,'SELECT writing_prompt,prompt_revision FROM settings WHERE owner=?',uid).first();return {prompt:row?.writing_prompt||'',revision:row?.prompt_revision||0};}
async function saveWritingPrompt(env,uid,prompt,revision){
  if(typeof prompt!=='string'||prompt.length>16000||!Number.isInteger(revision)||revision<0)throw new HttpError(400,'작성 지침과 저장 상태를 확인해 주세요.');
  const existing=await query(env,'SELECT prompt_revision FROM settings WHERE owner=?',uid).first();
  const result=existing?await query(env,'UPDATE settings SET writing_prompt=?,prompt_revision=prompt_revision+1 WHERE owner=? AND prompt_revision=?',prompt.trim(),uid,revision).run():revision===0?await query(env,'INSERT OR IGNORE INTO settings(owner,model,writing_prompt,prompt_revision) VALUES(?,?,?,1)',uid,env.CLAUDE_MODEL||DEFAULT_MODEL,prompt.trim()).run():null;
  if(!result?.meta.changes)throw new HttpError(409,'다른 창에서 작성 지침이 바뀌었어요. 작성 지침을 다시 불러온 뒤 저장해 주세요.');
  return {prompt:prompt.trim(),revision:revision+1};
}
async function claudeRequest(env,uid,cred,action,d,target,instruction,prompt='',images=[]){
  const p=promptFor(action,d,target,instruction,prompt);
  const content=[...images,{type:'text',text:p.text}];let response;
  try{response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':cred.key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:cred.model,max_tokens:action==='generate'?16000:action==='extract'?10000:action==='prompt'?6000:8000,system:p.system,messages:[{role:'user',content}],tools:[{name:'deliver_result',description:'편집 결과를 정해진 형식으로 반환합니다.',input_schema:p.schema}],tool_choice:{type:'tool',name:'deliver_result'}}),signal:AbortSignal.timeout(150000)});}catch{throw new HttpError(504,'클로드 응답을 기다리다 시간이 지났어요. 입력 원고는 보존했습니다. 다시 시도하면 새 요청으로 처리됩니다.');}
  if(!response.ok)throw upstreamError(response.status);
  const output=await response.json();return {result:validateResult(action,parseToolOutput(output),d),usage:output.usage,model:cred.model};
}
async function callClaude(env,uid,action,d,target,instruction,progress=()=>{}){
  const cred=await credentials(env,uid);if(!cred.key)throw new HttpError(428,'제작실 상단의 클로드 연결에서 API 키를 등록해 주세요.');
  const images=['extract','generate'].includes(action)?await imageBlocks(env,uid,d.imageIds):[];
  let saved=await writingPrompt(env,uid),calls=0,promptUsage=null;
  if(action==='generate'&&!saved.prompt){
    progress('클로드가 재사용할 작성 프롬프트를 만들고 있어요. (1/2)');
    const authored=await claudeRequest(env,uid,cred,'prompt',d);calls++;promptUsage=authored.usage;
    try{saved=await saveWritingPrompt(env,uid,authored.result.prompt,saved.revision);}catch(e){if(e.status!==409)throw e;saved=await writingPrompt(env,uid);if(!saved.prompt)throw e;}
  }
  progress(action==='generate'?'클로드가 본문·표지·캡션을 함께 만들고 있어요. ('+(calls+1)+'/'+(calls+1)+')':action==='prompt'?'클로드가 작성 프롬프트를 만들고 있어요.':'클로드가 요청한 내용을 작성하고 있어요.');
  const output=await claudeRequest(env,uid,cred,action,d,target,instruction,['generate','rewrite','social'].includes(action)?saved.prompt:'',images);
  return {...output,calls:calls+1,promptUsage,promptRevision:saved.revision};
}
async function jobResponse(env,uid,input,ctx){
  const jobId=id(input.jobId),did=id(input.draftId),action=input.action,d=cleanDraft(input.data),target=input.target==='after'?'after':'before';
  if(!['generate','rewrite','extract','social','review','split','prompt'].includes(action))throw new HttpError(400,'작업을 확인해 주세요.');
  if(action==='extract'&&!d.imageIds.length)throw new HttpError(400,'글을 읽을 이미지를 먼저 올려 주세요.');
  if(action==='generate'&&!d.sourceText.trim()&&!d.notes.trim()&&!d.imageIds.length&&!d.beforeContent.trim()&&!d.afterContent.trim())throw new HttpError(400,'소재 내용이나 작성 요청을 입력해 주세요.');
  if(['rewrite','social','review','split'].includes(action)&&!d.beforeContent.trim()&&!d.afterContent.trim())throw new HttpError(400,'원고를 먼저 작성해 주세요.');
  if(input.instruction)d.rewriteInstruction=string(input.instruction,2000);
  const cred=await credentials(env,uid);if(!cred.key)throw new HttpError(428,'클로드 연결에서 API 키를 등록해 주세요.');
  const existing=await query(env,'SELECT id,status,result,error FROM jobs WHERE id=? AND owner=?',jobId,uid).first();if(existing)return json({...existing,result:existing.result?JSON.parse(existing.result):null});
  const now=Date.now();const snapshot=JSON.stringify({data:d,target,instruction:string(input.instruction,2000)});
  const inserted=await query(env,"INSERT INTO jobs(id,owner,draft_id,action,status,input,created_at) SELECT ?,?,?,?,'running',?,? WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE owner=? AND status='running' AND created_at>?)",jobId,uid,did,action,snapshot,now,uid,now-360000).run();
  if(!inserted.meta.changes)throw new HttpError(409,'진행 중인 클로드 작업이 있어요. 작업 기록에서 확인해 주세요.');
  const enc=new TextEncoder();
  const stream=new ReadableStream({start(controller){let connected=true;const send=v=>{if(connected)try{controller.enqueue(enc.encode(JSON.stringify(v)+'\n'));}catch{connected=false;}};send({type:'started',jobId});let progressMessage='클로드에 요청을 보내고 있어요.';const progress=message=>{progressMessage=message;send({type:'progress',message});};const timer=setInterval(()=>send({type:'progress',message:progressMessage}),15000);
    const task=(async()=>{try{const output=await callClaude(env,uid,action,d,target,input.instruction,progress);await query(env,"UPDATE jobs SET status='done',result=?,finished_at=? WHERE id=? AND owner=?",JSON.stringify({...output,target}),Date.now(),jobId,uid).run();send({type:'done',jobId,...output,target});}catch(e){const message=e instanceof HttpError?e.message:'결과를 저장하지 못했어요. 작업 기록을 확인해 주세요.';await query(env,"UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=? AND owner=?",message,Date.now(),jobId,uid).run().catch(()=>{});send({type:'failed',jobId,message});}finally{clearInterval(timer);if(connected)try{controller.close();}catch{}}})();ctx.waitUntil(task);
  }});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
const sourceHosts=new Set(['bboom.naver.com','m.bboom.naver.com','pann.nate.com','m.pann.nate.com','www.reddit.com','old.reddit.com','theqoo.net','www.teamblind.com','www.bobaedream.co.kr','m.bobaedream.co.kr','gall.dcinside.com','m.dcinside.com','www.fmkorea.com','www.instiz.net']);
export function sourceURL(value){let u;try{u=new URL(value);}catch{throw new HttpError(400,'올바른 글 주소를 입력해 주세요.');}if(u.protocol!=='https:'||u.username||u.password||u.port||!sourceHosts.has(u.hostname))throw new HttpError(400,'이 주소는 자동으로 읽을 수 없어요. 글을 복사하거나 이미지를 올려 주세요.');return u;}
async function readSource(value){let u=sourceURL(value),response;for(let i=0;i<4;i++){try{response=await fetch(u.href,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(502,'원문 사이트에 연결하지 못했어요. 텍스트나 이미지를 넣어 주세요.');}if(response.status>=300&&response.status<400){u=sourceURL(new URL(response.headers.get('location')||'',u).href);continue;}break;}if(!response?.ok)throw new HttpError(422,'원문 사이트에서 읽기를 허용하지 않았어요. 텍스트나 이미지를 넣어 주세요.');if(!response.headers.get('content-type')?.includes('text/html'))throw new HttpError(422,'본문 페이지가 아니에요. 텍스트나 이미지를 넣어 주세요.');const raw=await bytes(response,1800000);const charset=response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1]||'utf-8';let source;try{source=new TextDecoder(charset).decode(raw);}catch{source=new TextDecoder().decode(raw);}source=source.replace(/<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,'');const main=source.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i);if(main)source=main[1];const text=source.replace(/<!--[^]*?-->/g,'').replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g,x=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[x])).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=1114111?String.fromCodePoint(c):'';}).split('\n').map(s=>s.trim()).filter(Boolean).join('\n\n').slice(0,50000);if(text.length<100)throw new HttpError(422,'읽을 수 있는 본문이 부족해요. 텍스트나 이미지를 넣어 주세요.');return {text,url:u.href};}
async function api(request,env,ctx,uid,path){
  const method=request.method,u=new URL(request.url);
  if(method!=='GET')originCheck(request);
  if(path==='/api/writing-prompt'){if(method==='GET')return json(await writingPrompt(env,uid));if(method==='PUT'){const b=await body(request);return json(await saveWritingPrompt(env,uid,b.prompt,b.revision));}}
  if(path==='/api/settings'){
    if(method==='GET'){const c=await credentials(env,uid);return json({configured:!!c.key,model:c.model});}
    if(method==='POST'){const b=await body(request),model=string(b.model,120).trim();if(!/^claude-[a-z0-9.-]+$/.test(model))throw new HttpError(400,'클로드 모델 ID를 확인해 주세요.');const provided=string(b.key,300).trim();const key=provided||(await credentials(env,uid)).key;if(!key)throw new HttpError(400,'클로드 API 키를 입력해 주세요.');const models=await anthropicModels(key);if(!models.some(m=>m.id===model))throw new HttpError(400,'사용할 수 없는 모델 ID예요. 클로드 콘솔에서 모델 ID를 확인해 주세요.');const encrypted=await encrypt(key,env,uid);await query(env,'INSERT INTO settings(owner,encrypted_key,model) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET encrypted_key=excluded.encrypted_key,model=excluded.model',uid,encrypted,model).run();return json({configured:true,model});}
  }
  if(path==='/api/drafts'&&method==='GET'){const rows=(await query(env,'SELECT id,data,revision,updated_at FROM drafts WHERE owner=? ORDER BY updated_at DESC',uid).all()).results;const seen=new Set(rows.map(r=>r.id)),published=new Set((await allPosts(env)).map(p=>p.id));return json({drafts:[...rows.map(r=>({id:r.id,title:JSON.parse(r.data).title||'제목 없는 원고',revision:r.revision,updatedAt:r.updated_at,published:published.has(r.id)})),...initial.filter(s=>!seen.has(s.id)).map(s=>({id:s.id,title:s.title,revision:0,updatedAt:0,published:true}))]});}
  const draftMatch=path.match(/^\/api\/drafts\/([\w-]+)$/);
  if(draftMatch){const did=id(draftMatch[1]);if(method==='GET')return json(await getDraft(env,uid,did));if(method==='PUT'){
    const b=await body(request),data=cleanDraft(b.data),revision=Number(b.revision);if(!Number.isInteger(revision)||revision<0)throw new HttpError(400,'저장 상태를 확인해 주세요.');
    const previous=await query(env,'SELECT data,revision FROM drafts WHERE id=? AND owner=?',did,uid).first();if((previous?.revision||0)!==revision)throw new HttpError(409,'다른 창에서 원고가 변경됐어요. 현재 내용을 내보낸 뒤 원고를 다시 열어 주세요.');
    if(!previous){const result=await query(env,'INSERT OR IGNORE INTO drafts(id,owner,data,revision,updated_at) VALUES(?,?,?,1,?)',did,uid,JSON.stringify(data),Date.now()).run();if(!result.meta.changes)throw new HttpError(409,'원고가 이미 저장돼 있어요. 다시 열어 주세요.');}
    else {const result=await env.DB.batch([query(env,'INSERT INTO versions(id,draft_id,owner,data,reason,created_at) SELECT ?,id,owner,data,?,? FROM drafts WHERE id=? AND owner=? AND revision=?',crypto.randomUUID(),string(b.reason,100)||'수정 전 원고',Date.now(),did,uid,revision),query(env,'UPDATE drafts SET data=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=?',JSON.stringify(data),Date.now(),did,uid,revision)]);if(!result[1].meta.changes)throw new HttpError(409,'다른 창에서 원고가 변경됐어요. 현재 원고를 내보내 보관해 주세요.');}
    return json({id:did,data,revision:revision+1,updatedAt:Date.now()});
  }}
  const versionMatch=path.match(/^\/api\/drafts\/([\w-]+)\/versions$/);
  if(versionMatch&&method==='GET')return json({versions:(await query(env,'SELECT id,data,reason,created_at FROM versions WHERE draft_id=? AND owner=? ORDER BY created_at DESC LIMIT 30',id(versionMatch[1]),uid).all()).results.map(r=>({...r,data:JSON.parse(r.data)}))});
  const pubMatch=path.match(/^\/api\/drafts\/([\w-]+)\/publish$/);
  if(pubMatch&&method==='POST'){const b=await body(request),d=await getDraft(env,uid,id(pubMatch[1]));if(d.revision!==b.revision)throw new HttpError(409,'최신 원고를 저장한 뒤 게시해 주세요.');assertPublish(d.data);const payload=JSON.stringify(publicPost(d.data));const result=await query(env,'INSERT INTO posts(id,data,published_at) SELECT id,?,? FROM drafts WHERE id=? AND owner=? AND revision=? ON CONFLICT(id) DO UPDATE SET data=excluded.data,published_at=excluded.published_at',payload,Date.now(),d.id,uid,d.revision).run();if(!result.meta.changes)throw new HttpError(409,'원고가 바뀌었어요. 다시 저장한 뒤 게시해 주세요.');return json({url:'/stories/'+d.id+'/'});}
  if(path==='/api/images'&&method==='POST'){const mime=request.headers.get('Content-Type');if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new HttpError(415,'JPG, PNG, WebP 이미지를 올려 주세요.');const data=await bytes(request,4*1024*1024);const valid=mime==='image/png'?data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71:mime==='image/jpeg'?data[0]===255&&data[1]===216&&data[2]===255:new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP';if(!valid)throw new HttpError(415,'정상적인 이미지 파일인지 확인해 주세요.');const iid=crypto.randomUUID(),name=string(u.searchParams.get('name'),180)||'이미지';await env.BUCKET.put('sources/'+iid,data,{httpMetadata:{contentType:mime}});try{await query(env,'INSERT INTO images(id,owner,name,mime,size,created_at) VALUES(?,?,?,?,?,?)',iid,uid,name,mime,data.length,Date.now()).run();}catch(e){await env.BUCKET.delete('sources/'+iid);throw e;}return json({id:iid,name,url:'/api/images/'+iid});}
  const imageMatch=path.match(/^\/api\/images\/([\w-]+)$/);if(imageMatch&&method==='GET'){const row=await query(env,'SELECT id,mime FROM images WHERE id=? AND owner=?',id(imageMatch[1]),uid).first();if(!row)throw new HttpError(404,'이미지를 찾을 수 없어요.');const file=await env.BUCKET.get('sources/'+row.id);if(!file)throw new HttpError(404,'이미지를 찾을 수 없어요.');return new Response(file.body,{headers:{'Content-Type':row.mime,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}});}
  if(path==='/api/source'&&method==='POST')return json(await readSource((await body(request)).url));
  if(path==='/api/jobs'&&method==='POST')return jobResponse(env,uid,await body(request),ctx);
  if(path==='/api/jobs'&&method==='GET'){return json({jobs:(await query(env,'SELECT id,draft_id,action,status,result,error,created_at FROM jobs WHERE owner=? ORDER BY created_at DESC LIMIT 20',uid).all()).results.map(j=>({...j,status:j.status==='running'&&Date.now()-j.created_at>360000?'interrupted':j.status,result:j.result?JSON.parse(j.result):null}))});}
  throw new HttpError(404,'요청한 기능을 찾을 수 없어요.');
}
export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;try{
  if(path.startsWith('/api/')){if(!env.DB)throw new HttpError(503,'원고 저장소를 준비 중이에요. 잠시 후 다시 열어 주세요.');return await api(request,env,ctx,owner(request,env),path);}
  if(path.startsWith('/studio'))owner(request,env);
  if(path==='/studio/preview/'){const u=new URL(request.url),did=id(u.searchParams.get('id')||'new');return html(articlePage({id:did,...cleanDraft({title:'본문 미리보기'})},[],true));}
  if(path==='/'||/^\/page\/\d+\/$/.test(path)){const posts=await allPosts(env),page=path==='/'?1:Number(path.split('/')[2]),out=listPage(posts,page);return html(out||shell('글을 찾을 수 없어요','<main id="main" class="wrap empty-page"><h1>페이지를 찾을 수 없어요.</h1><a href="/">전체 글</a></main>'),out?200:404);}
  const article=path.match(/^\/stories\/([\w-]+)\/$/);if(article){const posts=await allPosts(env),s=posts.find(s=>s.id===article[1]);if(!s)return html(assets['/404.html'],404);return html(articlePage(s,posts,false,config.ads?.[s.id]));}
  const assetPath=path.endsWith('/')?path+'index.html':path;const asset=assets[assetPath];if(asset!==undefined){if(path==='/stories.json')return json((await allPosts(env)).map(s=>({id:s.id,...s})));const ext=assetPath.split('.').pop(),type={html:'text/html',css:'text/css',js:'application/javascript',json:'application/json'}[ext]||'text/plain';return new Response(asset,{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}
  return html(assets['/404.html'],404);
}catch(e){const status=e instanceof HttpError?e.status:503,message=e instanceof HttpError?e.message:'저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';if(!(e instanceof HttpError))console.error('request_failed',path,e.name);return path.startsWith('/api/')?json({error:message},status):html(shell('잠시 후 다시 시도해 주세요',`<main id="main" class="wrap empty-page"><h1>${message}</h1><a class="btn" href="/">다시 열기</a></main>`),status);}}};
