const $=s=>document.querySelector(s);
const id=new URLSearchParams(location.search).get('id')||SSULPAN_DATA.getPublished()[0]?.id;
function safeParse(v,f){try{return JSON.parse(v)||f}catch{return f}}
function findDraft(id){
  const drafts=safeParse(localStorage.getItem('ssulpan.studio.drafts.v2'),[]);
  return drafts.find(d=>String(d.id)===String(id))||null;
}
function normalizeAny(raw){
  if(!raw)return null;
  const n=SSULPAN_DATA.normalize(raw);
  return {...n,hook:raw.hook||n.hook,coverDetail:raw.coverDetail||n.coverDetail,caption:raw.caption||n.caption,hashtags:Array.isArray(raw.hashtags)?raw.hashtags:String(raw.hashtags||'').split(/\s+/).filter(Boolean)};
}
const post=normalizeAny(findDraft(id)||SSULPAN_DATA.getPost(id));
if(!post){document.querySelector('.tool-shell').innerHTML='<h1>원고를 찾을 수 없어요.</h1><a href="/">홈으로</a>'}
else{
  $('#backStudio').href=`/studio.html?id=${encodeURIComponent(post.id)}`;
  $('#coverCategory').textContent=post.category;
  $('#coverHook').innerHTML=String(post.hook||post.title).split('\n').map(x=>`<span>${x}</span>`).join('');
  $('#coverDetail').textContent=post.coverDetail||'';
  $('#captionText').textContent=post.caption||'';
  $('#hashtagText').textContent=(post.hashtags||[]).join(' ');
  $('#copyCaption').onclick=async()=>{
    await navigator.clipboard.writeText([post.caption,(post.hashtags||[]).join(' ')].filter(Boolean).join('\n\n'));
    const old=$('#copyCaption').textContent;$('#copyCaption').textContent='복사됨';setTimeout(()=>$('#copyCaption').textContent=old,900);
  };
  $('#downloadCover').onclick=()=>drawAndDownload(post);
}
function wrap(ctx,text,maxWidth){
  const out=[];String(text||'').split('\n').forEach(part=>{
    if(!part){out.push('');return}
    let line='';
    for(const ch of part){
      const test=line+ch;
      if(ctx.measureText(test).width>maxWidth&&line){out.push(line);line=ch}else line=test;
    }
    if(line)out.push(line);
  });return out;
}
function drawAndDownload(p){
  const c=$('#coverCanvas'),ctx=c.getContext('2d');
  ctx.fillStyle='#ff5b27';ctx.fillRect(0,0,1080,1920);
  ctx.fillStyle='#171717';ctx.font='900 58px sans-serif';ctx.fillText('썰판',90,240);
  ctx.font='700 40px sans-serif';ctx.fillText(p.category,118,520);
  ctx.strokeStyle='#1de6d4';ctx.lineWidth=20;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(88,445);ctx.quadraticCurveTo(560,425,958,454);ctx.quadraticCurveTo(995,910,954,1440);ctx.quadraticCurveTo(530,1460,90,1438);ctx.quadraticCurveTo(54,910,88,445);ctx.stroke();
  ctx.fillStyle='#171717';ctx.font='900 82px sans-serif';
  const lines=wrap(ctx,p.hook||p.title,780).slice(0,4);let y=670;
  lines.forEach(line=>{ctx.fillText(line,120,y);y+=118});
  ctx.font='500 36px sans-serif';const detail=String(p.coverDetail||'').slice(0,60);let dy=1330;wrap(ctx,detail,780).slice(0,2).forEach(line=>{ctx.fillText(line,120,dy);dy+=48});
  ctx.font='500 32px sans-serif';ctx.fillText('창작·각색 이야기',120,1575);
  ctx.font='800 38px sans-serif';ctx.fillText('전체 글은 프로필 링크',120,1645);
  const a=document.createElement('a');a.download=`ssulpan-instagram-${p.id}.png`;a.href=c.toDataURL('image/png');a.click();
}
