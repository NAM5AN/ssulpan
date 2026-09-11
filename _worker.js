// Compatibility backend for the original, unchanged UI scripts and routes.
// No service-role key or AI secret is used or exposed here.
import { renderHome, renderStory, dbId, storyUrl } from './ssul-render.mjs';
import source from './ssul-source-data.mjs';
const API='https://wvwoqqfizgbhvdzlqscc.supabase.co/functions/v1/ssul_public';
const PUBLIC_KEY='sb_publishable_iLtSrF52sRfzalwcR4Nt-w_dJiU2q16';
const security={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-SSUL-UI':'original-live-source','X-SSUL-Backend':'supabase'};
function html(text,status=200) { return new Response(text,{status,headers:security}); }
async function data(url, options={}) {
  const response=await fetch(url,{...options,headers:{apikey:PUBLIC_KEY,...options.headers},signal:AbortSignal.timeout(15000)});
  let body;try{body=await response.json();}catch{throw new Error('Public API returned invalid JSON');}
  if(!response.ok||!body.ok)throw new Error('Public API unavailable: '+response.status);
  return body;
}
// The six initial DB rows were reconstructed samples, not the original text.
// Apply recovered text only while a record still exactly matches that old sample.
// Do not write the DB here; the existing authenticated editor saves real edits.
function originalContent(p) {
  let old=source.previousSeeds.find(x=>x.id===dbId(p.id));
  // Confirmed by a read-only DB query: seed 2 predates the wording in data.js.
  // An exact match is required; any later user edit remains untouched.
  if(old&&dbId(p.id)==='2')old={...old,
    beforeContent:'12년을 친구로 지낸 사람이었다. 내 결혼식에는 가족 일이 생겨 정말 미안하다며 오지 못한다고 했다.\n\n서운했지만 이해하려 했다. 그런데 우연히 본 사진 한 장에서 그 친구가 다른 결혼식장에 있었다.',
    afterContent:'처음에는 날짜를 잘못 본 줄 알았다. 사진을 확대해 보고, 올라온 시간을 다시 확인했다.\n\n내 결혼식이 끝난 다음 날도 아니었다. 같은 날, 다른 시간대 식장이었다.\n\n사진 속 표정이 너무 밝아서 오히려 무슨 말을 해야 할지 모르겠더라.'
  };
  const actual=source.originals.find(x=>x.id===dbId(p.id));
  if(!old||!actual||p.title!==old.title||p.beforeContent!==old.beforeContent||p.afterContent!==old.afterContent||p.gateLine!==old.gateLine)return p;
  return {...p,beforeContent:actual.beforeContent,afterContent:actual.afterContent,gateLine:actual.gateLine,hook:actual.hook,coverDetail:actual.coverDetail,fadeHeight:actual.fadeHeight};
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url), path=url.pathname;
    if(path==='/api/ssul_posts') {
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':url.origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'apikey,content-type'}});
      try {
        if(request.method==='POST') {
          if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return new Response('Forbidden',{status:403});
          const body=await request.json(); if(body.action!=='view'||!body.id)return new Response('Invalid request',{status:400});
          const out=await data(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',id:dbId(body.id)})});
          return Response.json(out,{headers:{'Cache-Control':'no-store'}});
        }
        if(request.method!=='GET')return new Response('Method not allowed',{status:405});
        const query=new URLSearchParams(url.search);if(query.has('id'))query.set('id',dbId(query.get('id')));
        const out=await data(API+'?'+query.toString());
        if(out.posts)out.posts=out.posts.map(originalContent);if(out.post)out.post=originalContent(out.post);
        return Response.json(out,{headers:{'Cache-Control':'no-store'}});
      } catch {return Response.json({ok:false,error:'게시글 서버 연결 실패'},{status:502});}
    }
    const view=path.match(/^\/api\/stories\/([^/]+)\/view\/?$/);
    if(view){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
      const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return new Response('Forbidden',{status:403});
      const id=dbId(decodeURIComponent(view[1])); if(!/^[\w-]{1,100}$/.test(id))return new Response('Invalid story ID',{status:400});
      try{const out=await data(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',id})});return Response.json(out,{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ok:false,error:'조회수를 갱신하지 못했습니다.'},{status:502});}
    }
    if(path==='/post'||path==='/post.html'){
      const id=url.searchParams.get('id');if(!id)return Response.redirect(url.origin+'/',302);
      return Response.redirect(new URL(storyUrl(id),url.origin).href,302);
    }
    const article=path.match(/^\/stories\/([^/]+)\/?$/), home=path==='/'||/^\/page\/\d+\/?$/.test(path);
    if(!home&&!article)return env.ASSETS.fetch(request);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    try{
      const result=await data(API+'?limit=100'), posts=(result.posts||[]).map(originalContent);
      if(home)return html(request.method==='HEAD'?'':renderHome(posts,url));
      const id=dbId(decodeURIComponent(article[1]));
      let post=posts.find(p=>dbId(p.id)===id);
      if(!post){try{post=originalContent((await data(API+'?id='+encodeURIComponent(id))).post);}catch{return html('<!doctype html><html lang="ko"><meta charset="utf-8"><title>글을 찾을 수 없어요 · 썰판</title><p>글을 찾을 수 없어요.</p><a href="/">전체 글</a></html>',404);}}
      return html(request.method==='HEAD'?'':renderStory(post,posts));
    }catch(error){
      console.error('ssul public backend:',error.message);
      // Fail visibly rather than silently displaying invented fallback stories.
      return html('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연결 확인 · 썰판</title><p>게시글 서버에 연결하지 못했어요. 잠시 후 새로고침해 주세요.</p><a href="/">다시 시도</a></html>',503);
    }
  }
};
