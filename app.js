const state={category:'전체',query:'',sort:'new',view:'card',hero:0,auto:true};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const posts=SSULPAN_DATA.getPublished();

function categories(){return ['전체',...new Set(posts.map(p=>p.category))]}
function filtered(){
  let list=[...posts];
  if(state.category!=='전체')list=list.filter(p=>p.category===state.category);
  if(state.query){
    const q=state.query.toLowerCase();
    list=list.filter(p=>[p.title,p.teaser,p.category,...p.tags].join(' ').toLowerCase().includes(q));
  }
  if(state.sort==='views') list.sort((a,b)=>SSULPAN_DATA.viewCount(b)-SSULPAN_DATA.viewCount(a));
  else list.sort((a,b)=>state.sort==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
  return list;
}
function thumbMarkup(p){
  if(p.image) return `<div class="thumb thumb-image" style="background-image:url('${p.image}')"><span>${p.category}</span></div>`;
  return `<div class="thumb cover-thumb" style="background:${p.tone}"><div><span>${p.category}</span><strong>${p.title}</strong></div></div>`;
}
function renderChips(){
  const host=$('#categoryChips'); host.innerHTML='';
  categories().forEach(c=>{
    const b=document.createElement('button'); b.textContent=c; b.classList.toggle('is-active',state.category===c);
    b.onclick=()=>{state.category=c;syncNav();renderFeed()}; host.append(b);
  });
}
function renderFeed(){
  renderChips(); const list=filtered();
  $('#feedTitle').textContent=state.category==='전체'?(state.query?`검색 결과 · ${state.query}`:'전체 글'):state.category;
  const grid=$('#postGrid'); grid.className='post-grid'+(state.view==='list'?' list':''); grid.innerHTML='';
  $('#emptyState').hidden=!!list.length;
  list.forEach(p=>{
    const el=document.createElement('article'); el.className='post-card';
    el.innerHTML=`${thumbMarkup(p)}<div class="post-inner"><span class="eyebrow">${p.category}</span><h3>${p.title}</h3><p>${p.teaser}</p><div class="post-foot"><span>${p.date}</span><span>조회 ${SSULPAN_DATA.viewCount(p).toLocaleString()}</span></div></div>`;
    el.onclick=()=>openPost(p); grid.append(el);
  });
  const pager=$('#feedPager');
  if(pager)pager.innerHTML=`<button disabled>‹ 이전</button><b>1</b><button disabled>다음 ›</button><span>전체 ${list.length}편 · 1 / 1 페이지</span>`;
}
function renderSidebar(){
  const counts={}; posts.forEach(p=>counts[p.category]=(counts[p.category]||0)+1);
  $('#boardCounts').innerHTML=Object.entries(counts).map(([k,v])=>`<div class="board-row"><button class="nav-btn" data-side-category="${k}">${k}</button><b>${v}</b></div>`).join('');
  $$('[data-side-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.sideCategory;renderFeed();syncNav();scrollTo({top:$('#main').offsetTop,behavior:'smooth'})});
  const popular=[...posts].sort((a,b)=>SSULPAN_DATA.viewCount(b)-SSULPAN_DATA.viewCount(a)).slice(0,5);
  $('#popularList').innerHTML=popular.map(p=>`<div class="popular-item" data-post="${p.id}"><b>${p.title}</b><small>${p.category} · 조회 ${SSULPAN_DATA.viewCount(p).toLocaleString()}</small></div>`).join('');
  $$('[data-post]').forEach(x=>x.onclick=()=>openPost(posts.find(p=>p.id===x.dataset.post)));
  const tags=[...new Set(posts.flatMap(p=>p.tags))];
  $('#tagCloud').innerHTML=tags.map(t=>`<button data-tag="${t}">#${t}</button>`).join('');
  $$('[data-tag]').forEach(b=>b.onclick=()=>{state.query=b.dataset.tag;$('#searchInput').value=state.query;renderFeed()});
  const catSections=$('#categorySections');
  if(catSections){
    catSections.innerHTML=categories().filter(c=>c!=='전체').map(c=>{
      const items=posts.filter(p=>p.category===c).slice(0,2);
      return `<section class="category-block"><div class="category-block-head"><h3>${c}</h3><button data-category-jump="${c}">${c} 전체 글</button></div>${items.map(p=>`<button class="category-story" data-post-id="${p.id}">${p.title}</button>`).join('')}</section>`;
    }).join('');
    $$('[data-category-jump]').forEach(b=>b.onclick=()=>{state.category=b.dataset.categoryJump;renderFeed();syncNav();scrollTo({top:$('#main').offsetTop+300,behavior:'smooth'})});
    $$('[data-post-id]').forEach(b=>b.onclick=()=>openPost(posts.find(p=>p.id===b.dataset.postId)));
  }
}
function renderHero(){
  const hero=[...posts].sort((a,b)=>SSULPAN_DATA.viewCount(b)-SSULPAN_DATA.viewCount(a)).slice(0,3);
  if(!hero.length)return;
  state.hero=((state.hero%hero.length)+hero.length)%hero.length;
  const p=hero[state.hero];
  const track=$('#heroTrack');
  if(p.image){track.style.backgroundImage=`url('${p.image}')`;track.style.backgroundSize='cover';track.style.backgroundPosition='center'}
  else{track.style.background=p.tone}
  $('#heroCategory').textContent=p.category; $('#heroTitle').textContent=p.title; $('#heroExcerpt').textContent=p.teaser;
  $('#heroCount').textContent=`${state.hero+1} / ${hero.length}`; $('#heroTitle').onclick=()=>openPost(p);
}
function syncNav(){$$('.nav-btn[data-category]').forEach(b=>b.classList.toggle('is-active',b.dataset.category===state.category))}
function openPost(p){location.href=`/post.html?id=${encodeURIComponent(p.id)}`}

$('#searchForm').onsubmit=e=>{e.preventDefault();state.query=$('#searchInput').value.trim();renderFeed()};
$('#sortSelect').onchange=e=>{state.sort=e.target.value;renderFeed()};
$('#cardView').onclick=()=>{state.view='card';$('#cardView').classList.add('is-active');$('#listView').classList.remove('is-active');renderFeed()};
$('#listView').onclick=()=>{state.view='list';$('#listView').classList.add('is-active');$('#cardView').classList.remove('is-active');renderFeed()};
$$('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;state.query='';$('#searchInput').value='';syncNav();renderFeed()});
$$('[data-popular]').forEach(b=>b.onclick=()=>{state.sort='views';$('#sortSelect').value='views';state.category='전체';syncNav();renderFeed();scrollTo({top:$('#main').offsetTop+350,behavior:'smooth'})});
$('#showPopular').onclick=()=>{$('[data-popular]').click()};
$('#prevHero').onclick=()=>{state.hero--;renderHero()};
$('#nextHero').onclick=()=>{state.hero++;renderHero()};
$('#toggleAuto').onclick=()=>{state.auto=!state.auto;$('#toggleAuto').textContent=state.auto?'일시정지':'자동재생';$('#toggleAuto').setAttribute('aria-pressed',String(!state.auto))};
setInterval(()=>{if(state.auto){state.hero++;renderHero()}},5000);
renderFeed();renderSidebar();renderHero();
