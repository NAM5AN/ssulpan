const $=s=>document.querySelector(s);
const id=new URLSearchParams(location.search).get('id')||SSULPAN_DATA.getPublished()[0]?.id;
const post=SSULPAN_DATA.getPost(id);
function paragraphs(text){return SSULPAN_DATA.paragraphs(text).map(p=>`<p>${p.replace(/\n/g,'<br>')}</p>`).join('')}
if(!post){
  document.title='이야기를 찾을 수 없습니다 — 썰판';
  $('#readerArticle').innerHTML='<div class="not-found"><h1>이야기를 찾을 수 없어요.</h1><a href="/">전체 글로 돌아가기</a></div>';
}else{
  SSULPAN_DATA.addView(post.id);
  document.title=`${post.title} — 썰판`;
  $('#postCategory').textContent=post.category;
  $('#postDate').textContent=post.date;
  $('#postViews').textContent=`조회 ${SSULPAN_DATA.viewCount(post).toLocaleString()}`;
  $('#postTitle').textContent=post.title;
  $('#postTeaser').textContent=post.teaser;
  $('#beforeContent').innerHTML=paragraphs(post.beforeContent);
  $('#afterContent').innerHTML=paragraphs(post.afterContent);
  $('#gateLine').textContent=post.gateLine||'계속 읽기';
  $('#fadeGate').style.setProperty('--fade-length',`${post.gradient||180}px`);
  $('#postTags').innerHTML=(post.hashtags||[]).map(t=>`<span>${t}</span>`).join('');
  const next=SSULPAN_DATA.nextPost(post.id);
  if(next){
    $('#nextTitle').textContent=next.title;
    $('#nextPost').href=`/post.html?id=${encodeURIComponent(next.id)}`;
  }else{
    $('.next-story').hidden=true;
  }
  $('#instagramLink').href=`/instagram.html?id=${encodeURIComponent(post.id)}`;
  $('#studioLink').href=`/studio.html?id=${encodeURIComponent(post.id)}`;
  $('#continueBtn').onclick=()=>{
    $('#afterContent').hidden=false;
    $('#continueBtn').hidden=true;
    $('.ad-note').textContent='이어 읽기가 열렸어요.';
    $('#fadeGate').classList.add('opened');
    requestAnimationFrame(()=>$('#afterContent').scrollIntoView({behavior:'smooth',block:'start'}));
  };
}
