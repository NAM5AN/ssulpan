const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const DRAFT_KEY='ssulpan.studio.drafts.v2';
const LEGACY_KEY='ssulpan.studio.drafts';

const safeParse=(v,f)=>{try{return JSON.parse(v)||f}catch{return f}};
function fromPost(p){return{
  id:String(p.id),status:p.status||'게시됨',title:p.title||'',titles:p.titles||[p.title||''],category:p.category||'일상',
  teaser:p.teaser||'',sourceText:p.sourceText||p.seed||'',notes:p.notes||'',tone:p.options?.tone||p.toneOption||'친구에게 말하듯',
  length:String(p.options?.length||p.lengthOption||2000),tension:p.options?.tension||p.tensionOption||'높게',
  dialogue:p.options?.dialogue||p.dialogueOption||'보통',beforeContent:p.beforeContent||p.previewText||'',
  afterContent:p.afterContent||p.afterText||'',rewriteInstruction:p.rewriteInstruction||p.rewriteGuide||'',
  storyBible:p.storyBible||p.memo||'',gateLine:p.gateLine||p.continueLine||'',hook:p.hook||p.title||'',
  coverDetail:p.coverDetail||'',caption:p.caption||'',hashtags:Array.isArray(p.hashtags)?p.hashtags.join(' '):Array.isArray(p.tags)?p.tags.map(t=>'#'+String(t).replace(/^#/,'')).join(' '):(p.hashtags||p.tags||''),
  gradient:Number(p.gradient||180),date:p.date||new Date().toISOString().slice(0,10),updatedAt:p.updatedAt||null
}};
const localDrafts=safeParse(localStorage.getItem(DRAFT_KEY),[]);
const legacyDrafts=safeParse(localStorage.getItem(LEGACY_KEY),[]).map(fromPost);
const seedDrafts=SSULPAN_DATA.getPublished().map(fromPost);
const byId=new Map(seedDrafts.map(d=>[d.id,d]));
[...legacyDrafts,...localDrafts].forEach(d=>byId.set(String(d.id),{...byId.get(String(d.id)),...fromPost(d)}));
let drafts=[...byId.values()];
let currentId=new URLSearchParams(location.search).get('id')||drafts[0]?.id||null;

function saveAll(){
  localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts));
  $('#saveStatus').textContent='로컬 저장됨';
}
function fields(){return{
  title:$('#title').value.trim(),category:$('#category').value,sourceText:$('#sourceText').value,notes:$('#notes').value,
  tone:$('#tone').value,length:$('#length').value,tension:$('#tension').value,dialogue:$('#dialogue').value,
  teaser:$('#teaser').value,beforeContent:$('#beforeContent').value,afterContent:$('#afterContent').value,
  rewriteInstruction:$('#rewriteInstruction').value,storyBible:$('#storyBible').value,gateLine:$('#gateLine').value,
  hook:$('#hook').value,coverDetail:$('#coverDetail').value,caption:$('#caption').value,hashtags:$('#hashtags').value,
  gradient:+$('#gradient').value
}}
function normalizeTags(s){return String(s||'').split(/\s+/).filter(Boolean).map(t=>t.startsWith('#')?t:'#'+t)}
function load(d){
  if(!d)return;
  currentId=String(d.id);
  const f=fromPost(d);
  $('#title').value=f.title;$('#category').value=f.category;$('#sourceText').value=f.sourceText;$('#notes').value=f.notes;
  $('#tone').value=f.tone;$('#length').value=f.length;$('#tension').value=f.tension;$('#dialogue').value=f.dialogue;
  $('#teaser').value=f.teaser;$('#beforeContent').value=f.beforeContent;$('#afterContent').value=f.afterContent;
  $('#rewriteInstruction').value=f.rewriteInstruction;$('#storyBible').value=f.storyBible;$('#gateLine').value=f.gateLine;
  $('#hook').value=f.hook;$('#coverDetail').value=f.coverDetail;$('#caption').value=f.caption;$('#hashtags').value=f.hashtags;
  $('#gradient').value=f.gradient||180;$('#gradientValue').textContent=`${$('#gradient').value}px`;
  renderTitles(f.titles||[f.title]);updateCounts();$('#saveStatus').textContent=f.status||'초안';
  $('#loadedMessage').textContent=f.status==='게시됨'?'게시된 원고를 불러왔어요.':'';
  refreshSelect();
}
function renderTitles(titles){
  const arr=(Array.isArray(titles)?titles:[]).filter(Boolean).slice(0,3);
  $('#titleCandidates').innerHTML=arr.map((t,i)=>`<button type="button" data-title-candidate="${i}">${t}</button>`).join('');
  $$('[data-title-candidate]').forEach((b,i)=>b.onclick=()=>{$('#title').value=arr[i]});
}
function refreshSelect(){
  const sel=$('#storySelect');
  sel.innerHTML=drafts.map(d=>`<option value="${d.id}">${d.status||'초안'} · ${d.title||'제목 없음'}</option>`).join('');
  if(currentId)sel.value=String(currentId);
}
function updateCounts(){
  $('#beforeCount').textContent=`${$('#beforeContent').value.length.toLocaleString()}자`;
  $('#afterCount').textContent=`${$('#afterContent').value.length.toLocaleString()}자`;
}
function upsert(status){
  const data=fields();let d=drafts.find(x=>String(x.id)===String(currentId));
  if(!d){d={id:`draft-${Date.now()}`,titles:[]};drafts.unshift(d);currentId=d.id}
  Object.assign(d,data,{
    status:status||d.status||'초안',
    titles:d.titles?.length?d.titles:[data.title].filter(Boolean),
    hashtags:normalizeTags(data.hashtags),
    options:{tone:data.tone,length:+data.length,tension:data.tension,dialogue:data.dialogue},
    updatedAt:new Date().toISOString(),date:d.date||new Date().toISOString().slice(0,10)
  });
  saveAll();refreshSelect();return d;
}
async function copyText(text,button){
  await navigator.clipboard.writeText(text);
  if(button){const old=button.textContent;button.textContent='복사됨';setTimeout(()=>button.textContent=old,900)}
}
async function callAI(payload){
  const r=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`API ${r.status}`);return data;
}
function applyGenerated(out){
  $('#title').value=out.title||$('#title').value;
  $('#category').value=out.category||$('#category').value;
  $('#teaser').value=out.teaser||'';
  $('#beforeContent').value=out.beforeContent||'';
  $('#afterContent').value=out.afterContent||'';
  $('#storyBible').value=out.storyBible||'';
  $('#gateLine').value=out.gateLine||'';
  $('#hook').value=out.hook||out.title||'';
  $('#coverDetail').value=out.coverDetail||'';
  $('#caption').value=out.caption||'';
  $('#hashtags').value=(out.hashtags||[]).map(t=>t.startsWith('#')?t:'#'+t).join(' ');
  renderTitles(out.titles||[out.title]);
  updateCounts();
  const d=upsert('초안');d.titles=out.titles||[out.title].filter(Boolean);saveAll();refreshSelect();
}
function payloadBase(){
  const f=fields();return{
    title:f.title,category:f.category,sourceText:f.sourceText,notes:f.notes,
    options:{tone:f.tone,length:+f.length,tension:f.tension,dialogue:f.dialogue},
    beforeContent:f.beforeContent,afterContent:f.afterContent,storyBible:f.storyBible,gateLine:f.gateLine,
    rewriteInstruction:f.rewriteInstruction
  }
}

$('#storySelect').onchange=e=>load(drafts.find(d=>String(d.id)===e.target.value));
$('#newDraft').onclick=()=>{
  currentId=null;
  ['title','sourceText','notes','teaser','beforeContent','afterContent','rewriteInstruction','storyBible','gateLine','hook','coverDetail','caption','hashtags'].forEach(id=>$('#'+id).value='');
  $('#category').value='직장생활';$('#tone').value='친구에게 말하듯';$('#length').value='2000';$('#tension').value='높게';$('#dialogue').value='보통';
  $('#gradient').value=180;$('#gradientValue').textContent='180px';renderTitles([]);updateCounts();$('#saveStatus').textContent='새 원고';$('#loadedMessage').textContent='';
};
['beforeContent','afterContent'].forEach(id=>$('#'+id).addEventListener('input',updateCounts));
$('#gradient').oninput=e=>$('#gradientValue').textContent=`${e.target.value}px`;
$$('[data-copy]').forEach(b=>b.onclick=()=>copyText($('#'+b.dataset.copy).value,b));

$('#generate').onclick=async()=>{
  const status=$('#generateStatus'),p=payloadBase();
  if(!p.sourceText.trim()){status.textContent='참고할 소재를 먼저 입력해 주세요.';return}
  status.textContent='생성 중…';$('#generate').disabled=true;
  try{const out=await callAI({mode:'generate',...p});applyGenerated(out);status.textContent='생성 완료'}
  catch(e){status.textContent=`생성 실패: ${e.message}`}
  finally{$('#generate').disabled=false}
};
$$('[data-rewrite]').forEach(b=>b.onclick=async()=>{
  const section=b.dataset.rewrite,original=$('#'+section).value;if(!original.trim())return;
  const old=b.textContent;b.disabled=true;b.textContent='다시 쓰는 중…';
  try{
    const out=await callAI({mode:'rewrite',section,original,...payloadBase()});
    $('#'+section).value=out.text||original;updateCounts();upsert('초안');
  }catch(e){alert(`다시 쓰기 실패: ${e.message}`)}
  finally{b.disabled=false;b.textContent=old}
});
$('#copyAll').onclick=e=>copyText([$('#beforeContent').value,$('#afterContent').value].filter(Boolean).join('\n\n'),e.currentTarget);
$('#reviewContext').onclick=async()=>{
  const box=$('#reviewResult');box.hidden=false;box.textContent='앞뒤 내용을 점검하는 중…';
  try{const out=await callAI({mode:'review',...payloadBase()});box.textContent=out.message||'앞뒤 연결에 큰 문제가 없습니다.'}
  catch(e){box.textContent=`점검 실패: ${e.message}`}
};
$('#suggestBreak').onclick=async()=>{
  const box=$('#reviewResult');box.hidden=false;box.textContent='끊을 위치를 찾는 중…';
  try{
    const out=await callAI({mode:'break',...payloadBase()});
    if(out.gateLine)$('#gateLine').value=out.gateLine;
    box.textContent=[out.message,out.gateLine&&`추천 이어 읽기 문구: ${out.gateLine}`].filter(Boolean).join('\n');
    upsert('초안');
  }catch(e){box.textContent=`추천 실패: ${e.message}`}
};
$('#saveDraft').onclick=()=>upsert('초안');
$('#publishDraft').onclick=()=>{
  const d=upsert('게시됨');
  const published=SSULPAN_DATA.savePublished({
    ...d,id:d.id,title:d.title,titles:d.titles,category:d.category,teaser:d.teaser,
    beforeContent:d.beforeContent,afterContent:d.afterContent,storyBible:d.storyBible,gateLine:d.gateLine,
    hook:d.hook,coverDetail:d.coverDetail,caption:d.caption,hashtags:normalizeTags(d.hashtags),
    gradient:d.gradient,date:d.date||new Date().toISOString().slice(0,10),status:'게시됨'
  });
  $('#saveStatus').textContent='게시글 업데이트 완료';$('#loadedMessage').textContent='게시된 원고를 불러왔어요.';
  alert(`“${published.title}”을 공개 목록에 반영했습니다.`);
};
$('#viewPublished').onclick=()=>{
  const d=drafts.find(x=>String(x.id)===String(currentId));
  location.href=d?.status==='게시됨'?`/post.html?id=${encodeURIComponent(d.id)}`:'/';
};
$('#openInstagram').onclick=()=>{const d=upsert();location.href=`/instagram.html?id=${encodeURIComponent(d.id)}`};
$('#openManuscript').onclick=()=>{const d=upsert();location.href=`/manuscript.html?id=${encodeURIComponent(d.id)}`};
$('#exportDraft').onclick=()=>{
  const d=upsert();const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ssulpan-${(d.title||'draft').replace(/[\\/:*?"<>|]/g,'_')}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
refreshSelect();
load(drafts.find(d=>String(d.id)===String(currentId))||drafts[0]);
