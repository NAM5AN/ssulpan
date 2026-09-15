import {VERSION,WIDTH,FONT,DEFAULT_STYLE,MAX_BYTES,paginate,sourceKey,validateProject,cards,drawCard,fileName,makeZip,normalizeText,graphemes} from './studio-carousel-core.mjs';

const anchor=document.querySelector('.cut-studio');
if(anchor&&!document.getElementById('instagram-maker'))mount(anchor);
function mount(anchor){
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./studio-carousel.css',import.meta.url).href;document.head.append(css);
  const root=document.createElement('section');root.id='instagram-maker';root.className='ig-studio';root.setAttribute('aria-labelledby','ig-heading');
  root.innerHTML=`
  <header class="ig-head"><div><p class="ig-eyebrow">썰판 스튜디오 · 인스타그램</p><h2 id="ig-heading">미리읽기 이미지</h2><p>위에서 만든 썰판 표지를 그대로 쓰고, 지정한 광고 전 범위만 여러 장으로 나눠요.</p></div><span class="ig-badge">썰판 기본 스타일 · 1080×1920</span></header>
  <div class="ig-source"><div><strong id="ig-source-count">광고 전 0자</strong><span id="ig-source-note">원고를 작성한 뒤 시작하세요</span></div><button type="button" class="ig-primary" id="ig-build">미리읽기로 이미지 만들기</button></div>
  <p id="ig-message" class="ig-message" role="status" aria-live="polite"></p>
  <div id="ig-workspace" hidden>
    <div id="ig-stale" class="ig-warning" hidden>원고 제목 또는 광고 전 범위가 바뀌었어요. 이전 범위의 이미지는 내보내지 않도록 잠갔어요. <button type="button" id="ig-reapply">현재 미리읽기 다시 반영</button></div>
    <div class="ig-layout">
      <div class="ig-controls">
        <fieldset><legend>본문 카드</legend>
        <label>본문 형식<select id="ig-layout"><option value="text">글 중심</option><option value="photo">상단 이미지 + 본문</option></select></label>
        <label>본문 글자 크기 <output id="ig-font-value">52px</output><input id="ig-font" type="range" min="42" max="68" step="2" value="52"></label>
        <div class="ig-two"><label>줄 간격<select id="ig-spacing"><option value="1.45">조금 촘촘하게</option><option value="1.55" selected>기본</option><option value="1.7">넓게</option></select></label><label>본문 장 수<select id="ig-count"><option value="0">자동</option>${[2,3,4,5,7,10,15,20].map(n=>`<option value="${n}">${n}장</option>`).join('')}</select></label></div>
        <button type="button" id="ig-reflow">현재 카드 내용 다시 나누기</button><p class="ig-help">한 장을 빽빽하게 채우지 않고 여백을 남긴 채 문단·문장 경계에서 먼저 끊어요. 내용이 넘치면 자르지 않고 다시 나누도록 알려줘요.</p>
        <div class="ig-two"><button type="button" id="ig-common-image">본문 공통 이미지 넣기</button><button type="button" id="ig-common-remove">공통 이미지 해제</button></div>
        </fieldset>
        <details open><summary>마지막 안내</summary><label class="ig-check"><input type="checkbox" id="ig-end" checked> 마지막 안내 카드 추가</label><label>버튼 위 유도 문구<textarea id="ig-end-title" rows="2" maxlength="160"></textarea></label><label>버튼 문구<input id="ig-end-button" maxlength="70"></label></details>
      </div>
      <div class="ig-preview">
        <div class="ig-preview-head"><div><strong id="ig-page-label">기존 표지</strong><span id="ig-total">1080 × 1920 · 썰판 기본 스타일</span></div><div><button type="button" id="ig-prev" aria-label="이전 카드">←</button><button type="button" id="ig-next" aria-label="다음 카드">→</button></div></div>
        <div class="ig-canvas-wrap"><canvas id="ig-canvas" width="1080" height="1920" tabindex="0" aria-label="인스타 카드 미리보기"></canvas></div>
        <div id="ig-thumbs" class="ig-thumbs" aria-label="카드 선택"></div>
        <div id="ig-page-editor" class="ig-page-editor" hidden><label for="ig-page-text"><strong id="ig-edit-label">본문 편집</strong><span>이 칸에서 고친 내용이 이미지에 그대로 반영돼요.</span></label><textarea id="ig-page-text" maxlength="60000" rows="7" spellcheck="false"></textarea><div class="ig-actions"><button type="button" id="ig-split">커서에서 다음 장으로 나누기</button><button type="button" id="ig-merge">다음 장과 합치기</button><button type="button" id="ig-page-image">이 장 이미지 넣기</button><button type="button" id="ig-page-remove">이 장 이미지 해제</button></div></div>
        <div id="ig-issues" class="ig-warning" role="status" hidden></div>
      </div>
    </div>
    <footer class="ig-export"><div><strong id="ig-save-status">기기 저장 준비 중</strong><p>표지는 위의 기존 썰판 표지를 그대로 사용하고, 본문과 마지막 안내만 같은 1080×1920 규격으로 만들어요.</p></div><div class="ig-actions"><button type="button" id="ig-cloud-save">서버 저장 재시도</button><button type="button" id="ig-cloud-load">서버 저장본 불러오기</button><button type="button" id="ig-json">작업파일 내보내기</button><button type="button" id="ig-import">작업파일 불러오기</button><button type="button" id="ig-png">현재 장 PNG</button><button type="button" class="ig-primary" id="ig-zip">전체 이미지 ZIP</button></div></footer>
  </div>
  <input type="file" id="ig-image-file" accept="image/png,image/jpeg,image/webp" hidden>
  <input type="file" id="ig-json-file" accept="application/json,.json" hidden>`;
  anchor.insertAdjacentElement('afterend',root);
  const $=id=>root.querySelector('#'+id), field=id=>document.getElementById(id)?.value||'';
  const source=()=>({title:field('story-title'),before:normalizeText(field('before-content'))});
  let project=null,key='',selected=0,serial=0,revision=null,conflict=false,stale=false,exporting=false,building=false;
  let fontPromise=null,fontReady=false,paintTimer=0,paintId=0,localTimer=0,remoteTimer=0,remoteBusy=false,remoteAgain=false;
  let imageTarget='',imageTargetKey='',cloudEnabled=false,localOK=false,cloudDirty=false;
  let renderErrors=[];const imageCache=new Map();
  const message=t=>{$('ig-message').textContent=t;};
  const saveStatus=t=>{$('ig-save-status').textContent=t;};
  function sameSource(a,b){return a.title===b.title&&a.before===b.before;}
  function normalizeProject(value){
    const next=validateProject(value);next.style.height=1920;next.style.theme='site';next.style.brandLine='';next.style.footer='';next.coverImage='';next.cta.subtitle='';
    if(!next.cta.title.trim())next.cta.title='이야기는 여기서 계속됩니다';if(!next.cta.button.trim())next.cta.button='전체 이야기 보기';return next;
  }
  function checkSource(){
    const live=source();stale=!!project&&!sameSource(live,project.source);
    $('ig-source-count').textContent=`광고 전 ${live.before.length.toLocaleString()}자`;
    $('ig-source-note').textContent=stale?'범위 변경 · 다시 반영 필요':project?'현재 미리읽기 기준으로 제작 중':'여백을 넉넉히 두고 자동 분할';
    $('ig-stale').hidden=!stale;updateButtons();
  }
  function currentCard(){return project?cards(project)[selected]:null;}
  function updateButtons(){
    $('ig-build').disabled=building||exporting||!source().before.trim();
    for(const id of ['ig-png','ig-zip'])$(id).disabled=!project||stale||exporting||!fontReady||renderErrors.length>0;
    $('ig-prev').disabled=!project||selected===0;$('ig-next').disabled=!project||selected>=cards(project).length-1;
    if(project){const c=currentCard();$('ig-merge').disabled=c?.type!=='body'||!project.pages[c.index+1];}
  }
  async function ensureFont(){
    if(fontReady)return;
    if(!fontPromise)fontPromise=(async()=>{
      let last;
      for(const url of ['https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2','https://unpkg.com/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2']){
        try{const face=new FontFace(FONT,`url("${url}")`,{weight:'100 900',style:'normal'});await Promise.race([face.load(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('폰트 연결 시간 초과')),12000))]);document.fonts.add(face);await document.fonts.load(`500 52px "${FONT}"`);fontReady=true;return;}catch(e){last=e;}
      }
      throw new Error('공통 글꼴을 불러오지 못했어요. 기기마다 다른 글꼴로 출력되지 않도록 생성을 멈췄어요. 다시 시도해 주세요.',{cause:last});
    })().catch(e=>{fontPromise=null;throw e;});
    return fontPromise;
  }
  const meter=document.createElement('canvas').getContext('2d');
  function measure(style){meter.font=`500 ${style.fontSize}px "${FONT}"`;return t=>meter.measureText(t).width;}
  function fresh(s){const style={...DEFAULT_STYLE};return {version:VERSION,source:s,style,
    cover:{title:field('hook')||s.title,subtitle:field('cover-detail')||field('teaser')},
    cta:{enabled:true,title:'이야기는 여기서 계속됩니다',subtitle:'',button:'전체 이야기 보기'},
    pages:paginate(s.before,style,measure(style)).map(text=>({text,image:''})),assets:{},coverImage:'',commonImage:'',manual:false};}
  function syncControls(){if(!project)return;const s=project.style;
    $('ig-layout').value=s.layout;$('ig-font').value=s.fontSize;$('ig-spacing').value=s.lineHeight;$('ig-font-value').value=s.fontSize+'px';
    $('ig-end').checked=project.cta.enabled;$('ig-end-title').value=project.cta.title;$('ig-end-button').value=project.cta.button;
  }
  function copyExistingCover(target,scale=1){
    const original=document.getElementById('cover-canvas');if(!original||original.width!==1080||original.height!==1920)return false;
    target.width=Math.round(1080*scale);target.height=Math.round(1920*scale);const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(original,0,0,target.width,target.height);target.setAttribute?.('aria-label','제작소에서 만든 기존 썰판 표지');return true;
  }
  async function loadImages(data){const map=new Map();await Promise.all(Object.entries(data.assets).map(async([id,url])=>{if(!imageCache.has(url))imageCache.set(url,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('첨부 이미지를 읽지 못했어요. 다시 넣어 주세요.'));img.src=url;}));map.set(id,await imageCache.get(url));}));return map;}
  function renderOne(canvas,data,card,index,total,images,scale=1){if(card.type==='cover'&&copyExistingCover(canvas,scale))return [];return drawCard(canvas,data,card,index+1,total,images,scale);}
  async function paint(edit=false){
    if(!project)return;const token=++paintId,data=project;
    try{
      await ensureFont();const images=await loadImages(data);if(token!==paintId||data!==project)return;
      const list=cards(data);selected=Math.min(selected,list.length-1);const card=list[selected];renderErrors=[];$('ig-thumbs').replaceChildren();
      list.forEach((c,i)=>{const button=document.createElement('button'),small=document.createElement('canvas'),label=document.createElement('span');button.type='button';button.className='ig-thumb';button.setAttribute('aria-current',String(i===selected));label.textContent=c.type==='cover'?'표지':c.type==='end'?'안내':String(c.index+1);button.setAttribute('aria-label',`${label.textContent} 카드`);renderErrors.push(...renderOne(small,data,c,i,list.length,images,.13));button.append(small,label);button.onclick=()=>select(i);$('ig-thumbs').append(button);});
      renderOne($('ig-canvas'),data,card,selected,list.length,images);
      $('ig-page-label').textContent=card.type==='cover'?'기존 표지':card.type==='end'?'마지막 안내':`본문 ${card.index+1}장`;
      $('ig-page-editor').hidden=card.type!=='body';
      if(card.type==='body'){$('ig-edit-label').textContent=`본문 ${card.index+1}장 · ${data.pages[card.index].text.length}자`;if(edit)$('ig-page-text').value=data.pages[card.index].text;}
      $('ig-issues').hidden=!renderErrors.length;$('ig-issues').textContent=[...new Set(renderErrors)].join(' ');updateButtons();
    }catch(e){renderErrors=[e.message];message(e.message);updateButtons();}
  }
  function schedulePaint(edit=false){clearTimeout(paintTimer);paintTimer=setTimeout(()=>paint(edit),120);}
  function select(index){if(!project)return;selected=Math.max(0,Math.min(cards(project).length-1,index));paint(true);}
  const dbPromise=new Promise((resolve,reject)=>{try{const request=indexedDB.open('ssulpan-instagram-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('decks',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('기기 저장소가 다른 탭에서 잠겨 있어요.'));}catch(e){reject(e);}});dbPromise.catch(()=>{});
  async function localGet(k){const db=await dbPromise;return new Promise((resolve,reject)=>{const r=db.transaction('decks').objectStore('decks').get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function localPut(record){const db=await dbPromise;await new Promise((resolve,reject)=>{const tx=db.transaction('decks','readwrite');tx.objectStore('decks').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  async function persistLocal(){if(!project)return;const data=structuredClone(project),savedKey=key,atSerial=serial,baseRevision=revision;try{await localPut({key:savedKey,project:data,baseRevision,dirty:cloudDirty,at:Date.now()});if(savedKey===key&&atSerial===serial)localOK=true;}catch{localOK=false;saveStatus('기기 저장소를 이용할 수 없어요. 서버 저장 상태를 확인하거나 작업파일을 내보내 주세요.');}}
  async function requestCloud(method,k,data,expected){
    if(location.protocol==='file:')throw new Error('파일 미리보기에서는 서버 저장이 연결되지 않아요.');
    const response=await fetch('/api/instagram-decks/'+k,{method,credentials:'same-origin',headers:method==='PUT'?{'Content-Type':'application/json'}:{},...(method==='PUT'?{body:JSON.stringify({data,revision:expected})}:{}),signal:AbortSignal.timeout(25000)});
    const value=await response.json().catch(()=>({error:'서버 저장 연결을 확인해 주세요.'}));if(method==='GET'&&response.status===404&&value.notFound===true)return null;if(!response.ok)throw Object.assign(new Error(value.error||'서버 저장에 실패했어요.'),{status:response.status});return value;
  }
  async function remoteSave(){
    if(!project||stale||conflict||!cloudDirty)return;if(remoteBusy){remoteAgain=true;return;}remoteBusy=true;const savedKey=key,atSerial=serial;
    try{const data=validateProject(structuredClone(project));if(!cloudEnabled||revision===null){const existing=await requestCloud('GET',savedKey);if(savedKey!==key)return;if(existing){conflict=true;saveStatus('서버 저장본이 있어요. 서버 저장본을 불러오거나 작업파일을 먼저 내보내 주세요.');return;}revision=0;cloudEnabled=true;}
      saveStatus((localOK?'기기 백업 · ':'')+'서버 저장 중…');const result=await requestCloud('PUT',savedKey,data,revision);if(savedKey===key){revision=result.revision;if(atSerial===serial)cloudDirty=false;await persistLocal();saveStatus(cloudDirty?'추가 수정 저장 대기':localOK?'기기·서버 저장됨':'서버 저장됨 · 기기 백업 실패');}}
    catch(e){if(savedKey===key){if(e.status===409){conflict=true;saveStatus('다른 기기에서 수정됐어요. 자동 덮어쓰기를 막았어요.');}else saveStatus((localOK?'기기에 저장됨 · ':'')+e.message);}}finally{remoteBusy=false;if(remoteAgain){remoteAgain=false;clearTimeout(remoteTimer);remoteTimer=setTimeout(remoteSave,400);}}
  }
  function changed(edit=false){serial++;localOK=false;cloudDirty=true;saveStatus('수정 내용 저장 대기…');clearTimeout(localTimer);localTimer=setTimeout(persistLocal,250);clearTimeout(remoteTimer);remoteTimer=setTimeout(remoteSave,1600);schedulePaint(edit);checkSource();}
  async function openSource(force=false){
    if(building||exporting)return;if(force&&project&&!confirm('현재 미리읽기로 새로 나눌까요? 기존 카드 편집본은 이전 범위의 저장본으로 남겨 둡니다.'))return;
    building=true;updateButtons();message('기존 표지와 미리읽기 범위를 확인하고 있어요…');
    try{await ensureFont();const s=source();if(!s.before.trim())throw new Error('광고 전 공개 내용을 먼저 작성해 주세요.');const k=await sourceKey(s);if(force&&project)await persistLocal();
      let local;try{local=await localGet(k);}catch{}let remote=null,known=false;try{remote=await requestCloud('GET',k);known=true;}catch{}
      if(!sameSource(s,source()))throw new Error('확인 중 원고가 바뀌었어요. 다시 눌러 주세요.');let next=remote?.data||local?.project||fresh(s),nextConflict=false;
      if(local?.dirty){next=local.project;if(remote&&local.baseRevision!==remote.revision&&JSON.stringify(local.project)!==JSON.stringify(remote.data))nextConflict=true;}
      if(force){const previous=project;next=fresh(s);if(previous){next.style={...previous.style,height:1920,theme:'site',brandLine:'',footer:''};next.cta={...previous.cta,subtitle:''};next.commonImage=previous.commonImage;for(const id of [next.commonImage])if(id&&previous.assets[id])next.assets[id]=previous.assets[id];next.pages=paginate(s.before,next.style,measure(next.style)).map(text=>({text,image:''}));}nextConflict=false;}
      const validated=normalizeProject(next);if(!sameSource(validated.source,s))throw new Error('저장본의 원고 범위가 달라요.');project=validated;key=k;selected=0;serial++;revision=remote?.revision??(known?0:local?.baseRevision??null);cloudEnabled=known;conflict=nextConflict;cloudDirty=!remote||!!local?.dirty||force||JSON.stringify(next.style)!==JSON.stringify(validated.style);localOK=false;
      $('ig-workspace').hidden=false;syncControls();checkSource();await paint(true);await persistLocal();saveStatus(conflict?'다른 기기의 저장본과 달라요. 작업파일로 보관 후 서버 저장본을 확인해 주세요.':remote&&!cloudDirty?'서버 저장본 불러옴':known?(localOK?'기기에 저장됨 · 서버 저장 대기':'서버 저장 대기 · 기기 백업 불가'):(localOK?'기기에 저장됨 · 서버 연결은 확인 필요':'저장소 연결 확인 필요 · 작업파일로 보관해 주세요'));
      message(`기존 표지 + 본문 ${project.pages.length}장${project.cta.enabled?' + 마지막 안내':''}로 만들었어요.`);if(cloudDirty&&known&&!conflict){clearTimeout(remoteTimer);remoteTimer=setTimeout(remoteSave,1200);}
    }catch(e){message(e.message);}finally{building=false;updateButtons();}
  }
  $('ig-build').onclick=()=>openSource(false);$('ig-reapply').onclick=()=>openSource(true);$('ig-prev').onclick=()=>select(selected-1);$('ig-next').onclick=()=>select(selected+1);
  $('ig-canvas').onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select(selected+(e.key==='ArrowLeft'?-1:1));}};
  for(const [id,prop,number] of [['ig-layout','layout'],['ig-font','fontSize',true],['ig-spacing','lineHeight',true]])$(id).addEventListener('input',()=>{if(!project)return;project.style[prop]=number?Number($(id).value):$(id).value;$('ig-font-value').value=project.style.fontSize+'px';changed(false);});
  for(const [id,prop] of [['ig-end-title','title'],['ig-end-button','button']])$(id).oninput=()=>{if(project){project.cta[prop]=$(id).value;changed(false);}};
  $('ig-end').onchange=()=>{if(project){project.cta.enabled=$('ig-end').checked;selected=Math.min(selected,cards(project).length-1);changed(true);}};
  $('ig-page-text').oninput=()=>{const card=currentCard();if(card?.type==='body'){project.pages[card.index].text=$('ig-page-text').value;project.manual=true;changed(false);}};
  $('ig-reflow').onclick=()=>{if(!project||stale){message('현재 미리읽기 범위를 먼저 반영해 주세요.');return;}try{const text=project.pages.map(p=>p.text).join(''),parts=paginate(text,project.style,measure(project.style),Number($('ig-count').value));const old=project.pages;project.pages=parts.map((text,i)=>({text,image:old[i]?.image||''}));selected=Math.min(selected,cards(project).length-1);changed(true);message(`본문을 ${parts.length}장으로 다시 나눴어요.`);}catch(e){message(e.message);}};
  $('ig-split').onclick=()=>{const card=currentCard();if(card?.type!=='body')return;const p=project.pages[card.index],wanted=$('ig-page-text').selectionStart;let cut=0;for(const c of graphemes(p.text)){if(cut+c.length>wanted)break;cut+=c.length;}if(!p.text.slice(0,cut).trim()||!p.text.slice(cut).trim()){message('본문 중간에 커서를 놓고 나누기를 눌러 주세요.');return;}if(project.pages.length>=60){message('본문은 최대 60장까지 만들 수 있어요.');return;}project.pages.splice(card.index,1,{text:p.text.slice(0,cut),image:p.image},{text:p.text.slice(cut),image:p.image});project.manual=true;changed(true);};
  $('ig-merge').onclick=()=>{const card=currentCard();if(card?.type!=='body'||!project.pages[card.index+1])return;const text=project.pages[card.index].text+project.pages[card.index+1].text;project.pages.splice(card.index,2,{text,image:project.pages[card.index].image});project.manual=true;changed(true);message('두 장을 합쳤어요. 내용이 넘치면 다시 나눠 주세요.');};
  function chooseImage(target){if(!project)return;imageTarget=target;imageTargetKey=key;$('ig-image-file').value='';$('ig-image-file').click();}
  $('ig-common-image').onclick=()=>chooseImage('common');$('ig-page-image').onclick=()=>{const card=currentCard();if(card?.type==='body')chooseImage(String(card.index));};$('ig-common-remove').onclick=()=>{project.commonImage='';changed(false);};$('ig-page-remove').onclick=()=>{const card=currentCard();if(card?.type==='body'){project.pages[card.index].image='';changed(false);}};
  $('ig-image-file').onchange=async()=>{const file=$('ig-image-file').files[0],target=imageTarget,targetKey=imageTargetKey;if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('PNG·JPG·WebP 이미지를 10MB 이하로 넣어 주세요.');message('이미지를 출력용 크기로 준비하고 있어요…');const url=URL.createObjectURL(file);let img;try{img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('이미지 파일을 읽지 못했어요.'));image.src=url;});}finally{URL.revokeObjectURL(url);}if(key!==targetKey)throw new Error('원고가 바뀌었어요. 이미지를 다시 넣어 주세요.');const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const id='img_'+crypto.randomUUID().replaceAll('-',''),data=canvas.toDataURL('image/jpeg',.86),candidate=structuredClone(project);candidate.assets[id]=data;if(target==='common')candidate.commonImage=id;else if(candidate.pages[Number(target)])candidate.pages[Number(target)].image=id;else throw new Error('페이지가 바뀌었어요. 다시 선택해 주세요.');const used=new Set([candidate.commonImage,...candidate.pages.map(p=>p.image)]);for(const k of Object.keys(candidate.assets))if(!used.has(k))delete candidate.assets[k];project=normalizeProject(candidate);changed(false);message('이미지를 넣었어요. 본문에 보이게 하려면 상단 이미지 + 본문 형식을 선택하세요.');}catch(e){message(e.message);}};
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  const safeName=()=>((project?.source.title||'썰판').replace(/[\\/:*?"<>|]/g,'_').slice(0,45)||'썰판');const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG를 만들지 못했어요.')),'image/png'));
  async function exportImages(all){checkSource();if(!project||stale||exporting)return;exporting=true;updateButtons();const atSerial=serial,currentSource=source();try{await ensureFont();const data=normalizeProject(structuredClone(project)),list=cards(data),images=await loadImages(data),canvas=document.createElement('canvas');const issues=list.flatMap((card,i)=>renderOne(canvas,data,card,i,list.length,images,.1));if(issues.length)throw new Error([...new Set(issues)].join(' '));const entries=[],selection=all?list.map((_,i)=>i):[selected];for(const i of selection){message(`이미지 ${entries.length+1}/${selection.length} 만드는 중…`);renderOne(canvas,data,list[i],i,list.length,images);const image=await png(canvas);entries.push({name:fileName(list[i],i),data:new Uint8Array(await image.arrayBuffer())});await new Promise(resolve=>setTimeout(resolve,0));}if(atSerial!==serial||!sameSource(currentSource,source()))throw new Error('출력 중 원고 또는 카드가 바뀌었어요. 최신 내용으로 다시 눌러 주세요.');if(all){entries.push({name:'caption.txt',data:new TextEncoder().encode([field('caption'),field('hashtags'),field('article-url')].filter(Boolean).join('\n\n'))});entries.push({name:'manifest.json',data:new TextEncoder().encode(JSON.stringify({version:VERSION,width:WIDTH,height:1920,imageCount:list.length,sourceKey:key,files:list.map((c,i)=>fileName(c,i))},null,2))});download(makeZip(entries),safeName()+'_인스타.zip');}else download(new Blob([entries[0].data],{type:'image/png'}),entries[0].name);message(all?`${list.length}장의 개별 PNG를 ZIP으로 저장했어요.`:'현재 카드의 PNG를 저장했어요.');}catch(e){message(e.message);}finally{exporting=false;updateButtons();}}
  $('ig-png').onclick=()=>exportImages(false);$('ig-zip').onclick=()=>exportImages(true);
  $('ig-json').onclick=()=>{try{const data=normalizeProject(structuredClone(project));download(new Blob([JSON.stringify(data)],{type:'application/json'}),safeName()+'_인스타작업.json');message('편집 내용과 이미지를 담은 작업파일을 저장했어요.');}catch(e){message(e.message);}};$('ig-import').onclick=()=>{$('ig-json-file').value='';$('ig-json-file').click();};
  $('ig-json-file').onchange=async()=>{const file=$('ig-json-file').files[0];if(!file)return;try{if(file.size>MAX_BYTES)throw new Error('작업파일은 12MB 이하여야 해요.');const next=normalizeProject(JSON.parse(await file.text()));if(project&&!confirm('현재 카드 편집본을 이 작업파일로 바꿀까요? 원고 본문 자체는 바꾸지 않습니다.'))return;await ensureFont();const k=await sourceKey(next.source);let remote=null,known=false;try{remote=await requestCloud('GET',k);known=true;}catch{}project=next;key=k;revision=remote?.revision??(known?0:null);cloudEnabled=known;conflict=false;selected=0;$('ig-workspace').hidden=false;syncControls();changed(true);checkSource();message(stale?'작업파일은 불러왔지만 현재 원고와 범위가 달라요. 해당 원고를 연 뒤 내보내 주세요.':'작업파일을 불러왔어요.');}catch(e){message(e.message);}};
  $('ig-cloud-save').onclick=()=>{if(!project)return;cloudDirty=true;remoteSave();};$('ig-cloud-load').onclick=async()=>{if(!project)return;if(!confirm('서버 저장본을 불러올까요? 이 기기의 미저장 편집은 작업파일로 먼저 보관해 주세요.'))return;try{const loadKey=key,remote=await requestCloud('GET',key);if(loadKey!==key)return;if(!remote)throw new Error('서버 저장본이 아직 없어요.');project=normalizeProject(remote.data);revision=remote.revision;cloudEnabled=true;conflict=false;cloudDirty=false;serial++;syncControls();await persistLocal();checkSource();await paint(true);saveStatus('서버 저장본 불러옴');}catch(e){message(e.message);}};
  document.addEventListener('input',e=>{if(['before-content','before-editor','story-title'].includes(e.target.id))queueMicrotask(checkSource);if(['hook','cover-detail','category'].includes(e.target.id)&&project)setTimeout(()=>schedulePaint(false),0);});
  const observer=new MutationObserver(()=>queueMicrotask(checkSource));for(const id of ['before-editor','workspace-title']){const node=document.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true,characterData:true});}
  window.addEventListener('beforeunload',e=>{if(project&&!localOK&&cloudDirty){e.preventDefault();e.returnValue='';}});window.addEventListener('online',()=>{if(project&&cloudDirty&&!conflict)remoteSave();});checkSource();
}
