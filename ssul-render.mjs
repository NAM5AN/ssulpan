// Data binding only. All UI templates are extracted from the captured original HTML.
import T from './ssul-templates.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fill = (template, data) => template.replace(/\{\{([\w-]+)\}\}/g, (_, key) => String(data[key] ?? ''));
const cats = ['직장생활', '인간관계', '일상'];
export function dbId(value) { const id=String(value??''); return /^0*[1-6]$/.test(id) ? String(Number(id)) : id; }
export function storyUrl(id) { const value=dbId(id); return `/stories/${encodeURIComponent(/^[1-6]$/.test(value)?value.padStart(3,'0'):value)}/`; }
const views = n => Math.max(0, Number(n)||0).toLocaleString('ko-KR');
const parts = s => String(s||'').replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
const paragraphs = s => parts(s).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('');
function imageFor(post) {
  try { if(post.thumbnailUrl && new URL(post.thumbnailUrl).protocol==='https:') return post.thumbnailUrl; } catch {}
  return '/community/'+({'직장생활':'office','인간관계':'friends','일상':'night'}[post.category]||'office')+'.png';
}
function fields(p) { return {url:escape(storyUrl(p.id)),title:escape(p.title),teaser:escape(p.teaser),category:escape(p.category),views:views(p.views??p.view_count),hook:escape(p.hook||p.title),hookLabel:escape((p.hook||p.title||'').replace(/\s+/g,' ')),detail:escape(p.coverDetail||''),image:escape(imageFor(p))}; }
function queryLink(options={}, hash=true) {
  const p=new URLSearchParams(); for(const k of ['q','category','tag','order','view','page'])if(options[k] && options[k]!=='newest' && !(k==='page'&&Number(options[k])===1))p.set(k,String(options[k]));
  return '/'+(p.size?'?'+p.toString():'')+(hash?'#story-feed':'');
}
function normalize(p) { return {...p,id:dbId(p.id),views:Number(p.views??p.view_count??0),date:p.publishedAt||p.published_at||p.date||'',tags:Array.isArray(p.tags)?p.tags:[]}; }
export function renderHome(raw, url) {
  const all=raw.map(normalize).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const category=url.searchParams.get('category')||'', tag=url.searchParams.get('tag')||'', q=(url.searchParams.get('q')||'').slice(0,100);
  const order=url.searchParams.get('order')||'newest', view=url.searchParams.get('view')==='cards'?'cards':'list';
  let posts=all.filter(p=>(!category||p.category===category)&&(!tag||p.tags.includes(tag))&&(!q||[p.title,p.teaser,...p.tags,...(p.hashtags||[])].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase())));
  if(order==='oldest')posts.reverse();
  if(order==='popular')posts.sort((a,b)=>b.views-a.views||b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(posts.length/6)), page=Math.min(pages,Math.max(1,parseInt(url.searchParams.get('page')||url.pathname.match(/^\/page\/(\d+)/)?.[1]||'1',10)||1));
  const chosen=posts.slice((page-1)*6,page*6), popular=[...all].sort((a,b)=>b.views-a.views||b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const current={q,category,tag,order,view};
  const name=q?`검색 결과: ${q}`:category|| (tag?'#'+tag:order==='popular'?'인기글':'전체 글');
  const featured=all.slice(0,3), isHome=!category&&!tag&&!q&&order!=='popular'&&page===1;
  const data={feedTitle:escape(name),pageTitle:escape(name),count:posts.length,page,pages,query:escape(q),listClass:view==='list'?'is-list':'',
    rows:chosen.map(p=>fill(T[view==='cards'?'card':'row'],fields(p))).join(''),
    picks:popular.slice(0,5).map(p=>fill(T.pick,fields(p))).join(''),
    boards:cats.map(c=>fill(T.board,{url:escape(queryLink({category:c},false)),category:escape(c),count:all.filter(p=>p.category===c).length})).join(''),
    tags:[...new Set(all.flatMap(p=>p.tags))].slice(0,24).map(t=>fill(T.tag,{tag:escape(t),url:escape(queryLink({tag:t},false))})).join(''),
    hero:isHome&&featured.length?fill(T.hero,{slides:featured.map((p,i)=>fill(T.slide,{...fields(p),slideIndex:i})).join(''),slideCount:featured.length}):'',
    thumbnailScripts:view==='cards'?'<script src="/cover.js" defer></script><script src="/thumbnails.js" defer></script>':'',
    roundup:isHome?fill(T.roundup,Object.fromEntries(cats.map((c,i)=>['roundup'+i,all.filter(p=>p.category===c).slice(0,2).map(p=>`<li><a href="${escape(storyUrl(p.id))}">${escape(p.title)}</a></li>`).join('')]))):''};
  data.pagination=(page>1?`<a href="${escape(queryLink({...current,page:page-1}))}">‹ 이전</a>`:'<span aria-disabled="true">‹ 이전</span>')+`<span aria-current="page">${page}</span>`+(page<pages?`<a href="${escape(queryLink({...current,page:page+1}))}">다음 ›</a>`:'<span aria-disabled="true">다음 ›</span>');
  ['newest','oldest','popular'].forEach((o,i)=>{data['feed-sort'+i+'Url']=escape(queryLink({...current,order:o}));data['feed-sort'+i+'Current']=order===o?'aria-current="true"':'';});
  ['cards','list'].forEach((v,i)=>{data['view-options'+i+'Url']=escape(queryLink({...current,view:v}));data['view-options'+i+'Current']=view===v?'aria-current="true"':'';});
  ['',...cats].forEach((c,i)=>{data['feed-tabs'+i+'Url']=escape(queryLink({...current,category:c}));data['feed-tabs'+i+'Current']=category===c?'aria-current="page"':'';});
  [!category&&!q&&!tag&&order!=='popular',...cats.map(c=>category===c),order==='popular',false].forEach((active,i)=>data['community-nav'+i+'Current']=active?'aria-current="page"':'');
  const out=fill(T.home,data); if(/\{\{[\w-]+\}\}/.test(out))throw new Error('unbound homepage data slot'); return out;
}
export function renderStory(post, raw) {
  const p=normalize(post), all=raw.map(normalize).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)), i=all.findIndex(x=>x.id===p.id);
  const prev=all[(i-1+all.length)%all.length],next=all[(i+1)%all.length];
  const after=parts(p.afterContent), fade=Math.max(80,Math.min(300,Number(p.fadeHeight)||180));
  const data={...fields(p),beforeHtml:paragraphs(p.beforeContent),afterHtml:paragraphs(p.afterContent)+(after.length?'<div class="story-end">이야기 끝</div>':''),sampleHtml:paragraphs(after.slice(0,2).join('\n\n')),gateLine:escape(p.gateLine||'그다음 이야기가 궁금하다면?'),fade,gateHidden:after.length?'':'hidden',readerData:JSON.stringify({id:p.id,fadeHeight:fade,trackViews:true}).replace(/</g,'\\u003c'),related:all.length>1?fill(T.related,{prevUrl:escape(storyUrl(prev.id)),prevTitle:escape(prev.title),nextUrl:escape(storyUrl(next.id)),nextTitle:escape(next.title)}):''};
  return fill(T.reader,data);
}
