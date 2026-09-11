const $=s=>document.querySelector(s);
const id=new URLSearchParams(location.search).get('id')||SSULPAN_DATA.getPublished()[0]?.id;
function safeParse(v,f){try{return JSON.parse(v)||f}catch{return f}}
const draft=safeParse(localStorage.getItem('ssulpan.studio.drafts.v2'),[]).find(d=>String(d.id)===String(id));
const raw=draft||SSULPAN_DATA.getPost(id);
const post=raw?SSULPAN_DATA.normalize(raw):null;
if(!post){$('#manuscriptPages').innerHTML='<p>원고를 찾을 수 없어요.</p>'}
else{
  $('#backStudio').href=`/studio.html?id=${encodeURIComponent(post.id)}`;
  document.title=`장별 원고 · ${post.title}`;
  const paras=SSULPAN_DATA.paragraphs([post.beforeContent,post.afterContent].filter(Boolean).join('\n\n'));
  const chunks=[[],[],[],[]],sizes=[0,0,0,0];let page=0;
  const target=Math.max(1,paras.join('').length/4);
  paras.forEach(p=>{if(page<3&&sizes[page]>=target)page++;chunks[page].push(p);sizes[page]+=p.length});
  const pages=[`<div class="manuscript-title">${post.hook?post.hook.replace(/\n/g,'<br>'):post.title}</div>`,...chunks.map(c=>c.map(p=>`<p>${p}</p>`).join(''))];
  $('#manuscriptPages').innerHTML=pages.map((body,i)=>`<section class="manuscript-page"><div class="page-no">${String(i+1).padStart(2,'0')} / 05</div><div class="page-body">${body}</div></section>`).join('');
}
