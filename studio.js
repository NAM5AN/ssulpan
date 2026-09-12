'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const fields={title:'story-title',category:'category',teaser:'teaser',beforeContent:'before-content',afterContent:'after-content',hook:'hook',coverDetail:'cover-detail',caption:'caption',hashtags:'hashtags',sourceText:'source-text',sourceUrl:'source-url',storyBible:'story-bible',notes:'writing-notes',gateLine:'gate-line',rewriteInstruction:'rewrite-instruction'};
  const labels={prompt:'작성 지침 생성',generate:'전체 생성',rewrite:'부분 수정',extract:'이미지 글 읽기',social:'인스타 문구',review:'내용 점검',split:'끊을 위치 추천'};
  let current=null,items=[],dirty=false,timer,saveChain=Promise.resolve(),busy=false,loading=false,uploading=false,connected=false,previewView='before',proposal=null,selectedTitle=null;
  let promptState={prompt:'',revision:0},promptDirty=false,promptSaving=false;
  const message=text=>{$('status').textContent=text;};
  const work=text=>{$('work-status').textContent=text;};
  const empty=()=>({title:'',category:'일상',teaser:'',beforeContent:'',afterContent:'',hook:'',coverDetail:'',caption:'',hashtags:'#썰판 #썰',sourceText:'',sourceUrl:'',storyBible:'',notes:'',gateLine:'',rewriteInstruction:'',titles:[],fadeHeight:180,imageIds:[],options:{tone:'친구에게 말하듯',tension:'높게',dialogue:'보통',lengthMode:'source'}});
  async function api(path,options={}){const response=await fetch(path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});const data=await response.json().catch(()=>({error:'응답을 읽지 못했어요. 입력한 원고를 내보내 보관해 주세요.'}));if(!response.ok){const e=new Error(data.error||'요청을 처리하지 못했어요.');e.status=response.status;throw e;}return data;}
  function collect(){const data={...current?.data};for(const [key,element] of Object.entries(fields))data[key]=$(element).value;data.fadeHeight=Number($('fade-height').value);data.imageIds=[...(current?.data.imageIds||[])];const previousOptions=current?.data?.options||{};
    const lengthRequest=typeof previousOptions.lengthRequest==='string'?previousOptions.lengthRequest.replace(/\r\n?/g,'\n').trim():'';
    data.options={tone:$('tone').value,tension:$('tension').value,dialogue:$('dialogue').value,lengthMode:'source'};
    if(previousOptions.lengthMode==='custom' && lengthRequest){data.options.lengthMode='custom';data.options.lengthRequest=lengthRequest;}
    return data;}
  async function fingerprint(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
  function temporaryBackup(){if(!current)return;try{localStorage.setItem('sseolzip:pending:'+current.id,JSON.stringify({data:collect(),at:Date.now()}));}catch{}}
  function changed(){if(!current||loading)return;dirty=true;temporaryBackup();$('draft-status').textContent='수정 내용을 저장하고 있어요…';clearTimeout(timer);timer=setTimeout(()=>save().catch(e=>message(e.message)),1000);renderCover();updatePreview();counts();}
  function counts(){for(const side of ['before','after'])$(side+'-count').textContent=$(side+'-content').value.length.toLocaleString()+'자';}
  function updateItem(){
    if(!current)return;
    let item=items.find(i=>i.id===current.id);
    if(!item){item={id:current.id,published:false};items.unshift(item);}
    item.title=$('story-title').value||'제목 없는 원고';item.revision=current.revision;item.updatedAt=current.updatedAt||0;
    $('workspace-title').textContent=$('story-title').value||'새 원고';
  }
  function promptStatus(){
    $('prompt-status').textContent=promptDirty?'수정한 지침을 저장해 주세요. 전체 생성 전에도 자동 저장합니다.':promptState.prompt?'저장된 작성 지침을 사용합니다.':'첫 전체 생성 때 클로드가 작성 지침을 만들어 저장합니다.';
    $('generation-calls').textContent='전체 생성은 기본 1회입니다. 이미지 판독과 필요한 부가 문구 보정은 별도로 호출합니다.';
  }
  function setPrompt(state){promptState=state;$('writing-prompt').value=state.prompt;promptDirty=false;promptStatus();}
  async function refreshPrompt(){if(promptDirty||promptSaving)return;const state=await api('/api/writing-prompt');if(!promptDirty&&!promptSaving)setPrompt(state);}
  async function savePrompt(){
    if(promptSaving)throw new Error('작성 지침을 저장 중이에요. 잠시 후 다시 눌러 주세요.');
    const text=$('writing-prompt').value;promptSaving=true;
    try{const state=await api('/api/writing-prompt',{method:'PUT',body:JSON.stringify({prompt:text,revision:promptState.revision})});promptState=state;if($('writing-prompt').value===text){$('writing-prompt').value=state.prompt;promptDirty=false;}promptStatus();return state;}
    finally{promptSaving=false;}
  }
  async function save(reason='수정 전 원고',force=false){clearTimeout(timer);if(!current||(!dirty&&!force&&current.revision>0)){await saveChain;return current;}const did=current.id,snapshot=collect();dirty=false;const operation=saveChain.catch(()=>{}).then(async()=>{if(current?.id!==did)throw new Error('저장 중 원고가 바뀌었어요. 다시 열어 주세요.');const saved=await api('/api/drafts/'+did,{method:'PUT',body:JSON.stringify({data:snapshot,revision:current.revision,reason})});if(current?.id===did){current.revision=saved.revision;current.updatedAt=saved.updatedAt;current.data={...saved.data,...collect()};updateItem();if(!dirty){$('draft-status').textContent='서버에 저장했어요. '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});try{localStorage.removeItem('sseolzip:pending:'+did);}catch{}}}return saved;});saveChain=operation;try{return await operation;}catch(e){if(current?.id===did){dirty=true;temporaryBackup();$('draft-status').textContent='저장하지 못했어요. '+e.message;}throw e;}}
  function renderCover(){if(!current||!window.SseolzipCover)return;const fits=window.SseolzipCover.draw($('cover-canvas'),{hook:$('hook').value,detail:$('cover-detail').value,category:$('category').value});$('download-cover').disabled=!fits;$('cover-status').textContent=fits?'9:16 세로형 · PNG 1080×1920':'표지 제목을 적거나 줄바꿈·문장 길이를 조정해 주세요.';}
  function updatePreview(scroll=false){if(!current)return;$('fade-value').value=$('fade-height').value+'px';$('preview-before').setAttribute('aria-pressed',String(previewView==='before'));$('preview-after').setAttribute('aria-pressed',String(previewView==='after'));$('reader-preview').contentWindow?.postMessage({type:'sseolzip:body-preview',id:current.id,...collect(),view:previewView,scrollToView:scroll},location.origin);}
  function renderImages(){const list=$('image-list');list.replaceChildren();(current?.data.imageIds||[]).forEach((iid,i)=>{const item=document.createElement('div');item.className='image-item';const img=document.createElement('img');img.src='/api/images/'+iid;img.alt=(i+1)+'번째 소재 이미지';const button=document.createElement('button');button.type='button';button.textContent=(i+1)+'번 제외';button.onclick=()=>{current.data.imageIds=current.data.imageIds.filter(id=>id!==iid);renderImages();changed();};item.append(img,button);list.append(item);});}
  function fill(data){loading=true;current.data={...empty(),...data};for(const [key,element] of Object.entries(fields))$(element).value=current.data[key]||'';$('fade-height').value=current.data.fadeHeight||180;for(const key of ['tone','tension','dialogue'])$(key).value=current.data.options?.[key]??empty().options[key];loading=false;counts();renderCover();renderImages();updatePreview();updateItem();}
  function publication(){const published=items.find(i=>i.id===current?.id)?.published;$('article-url').value=published?new URL('/stories/'+current.id+'/',location.origin).href:'';$('open-reader').hidden=!published;$('open-reader').href=published?'/stories/'+current.id+'/':'/';$('publication-note').textContent=published?'게시된 글은 공개 사이트에서 바로 확인할 수 있습니다.':'사이트에 게시하면 이어 읽기 주소가 표시됩니다.';$('publish-story').textContent=published?'게시글 업데이트':'사이트에 게시';}
  function showProposal(action,result,target,sourceId=current?.id,metadata={}){
    proposal={action,result,target,draftId:sourceId,promptRevision:metadata.promptRevision,baseData:metadata.baseData};selectedTitle=null;
    $('proposal').hidden=false;$('proposal-title').textContent=action==='version'?'이전 원고':action==='backup'?'저장 전 임시 원고':labels[action]+' 결과';
    $('proposal-note').textContent='결과를 확인한 뒤 원고에 반영하세요.';$('apply-proposal').hidden=action==='review';
    $('apply-proposal').textContent=action==='prompt'?'작성 지침으로 저장':'원고에 반영';$('proposal-titles').replaceChildren();
    if(['generate','version','backup'].includes(action)){
      $('proposal-text').value=[result.title,'[카테고리]',result.category,'[짧은 소개]',result.teaser,'[미리 보여줄 내용]',result.beforeContent,'[광고 후 보여줄 내용]',result.afterContent,'[이어 읽기 문구]',result.gateLine,'[표지 제목]',result.hook,'[하단 짧은 문장]',result.coverDetail,'[캡션]',result.caption,'[해시태그]',result.hashtags,'[인물·사건 메모]',result.storyBible].join('\n\n');
    }else if(action==='prompt'){
      $('proposal-text').value=result.prompt;$('proposal-note').textContent='클로드가 작성한 공통 프롬프트입니다. 저장하면 이후 원고에 사용합니다.';
    }else if(action==='rewrite'){
      $('proposal-text').value=result.text;$('proposal-note').textContent=(target==='before'?'미리 보여줄 내용':'광고 후 보여줄 내용')+'에 반영합니다.';
    }else if(action==='extract'){
      $('proposal-text').value=result.text;$('proposal-note').textContent=(result.uncertain||'이미지에서 읽은 내용을 확인해 주세요.')+' 기존 소재 내용 아래에 추가됩니다.';
    }else if(action==='social'){
      $('proposal-text').value=['[표지 제목]',result.hook,'[하단 문장]',result.coverDetail,'[캡션]',result.caption,result.hashtags].join('\n\n');
    }else if(action==='review')$('proposal-text').value=[result.summary,...result.issues.map(x=>`${x.section}\n${x.problem}\n제안: ${x.suggestion}`)].join('\n\n');
    else if(action==='split')$('proposal-text').value=['[미리 보여줄 내용]',result.beforeContent,'[광고 후 보여줄 내용]',result.afterContent].join('\n\n');
    if(action==='generate'||action==='social'){
      selectedTitle=action==='generate'?result.title:null;
      (result.titles||[]).forEach(title=>{const b=document.createElement('button');b.className='btn light';b.textContent=title;b.setAttribute('aria-pressed',String(title===selectedTitle));
        b.onclick=()=>{selectedTitle=selectedTitle===title?null:title;for(const button of $('proposal-titles').children)button.setAttribute('aria-pressed',String(button.textContent===selectedTitle));$('proposal-note').textContent=selectedTitle?'선택한 제목을 게시글 제목에 반영합니다.':action==='generate'?'클로드가 고른 제목과 전체 결과를 반영합니다.':'표지와 캡션을 반영합니다.';};$('proposal-titles').append(b);
      });
    }
    $('proposal').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function openWorkspace(result){
    current=result;dirty=false;previewView='before';fill(result.data);
    $('reader-preview').src='/studio/preview/?id='+encodeURIComponent(result.id)+'&preview=1';publication();
    $('draft-status').textContent=result.revision?'저장한 원고를 불러왔어요.':items.find(i=>i.id===result.id)?.published?'게시된 원고를 불러왔어요.':'소재나 작성 요청을 넣어 시작하세요.';
    $('proposal').hidden=true;proposal=null;
    const url=new URL(location.href);url.searchParams.set('story',result.id);window.history.replaceState(null,'',url);
  }
  async function choose(did,skipSave=false){
    if(loading||busy||uploading)return;loading=true;$('new-story').disabled=true;
    try{
      if(!skipSave)await save();const result=await api('/api/drafts/'+did);openWorkspace(result);
      try{const pending=JSON.parse(localStorage.getItem('sseolzip:pending:'+did)||'null');const old=JSON.parse(localStorage.getItem('sseolzip:body-draft:v1:'+did)||'null');
        if(pending?.data&&pending.at>result.updatedAt)showProposal('backup',{...result.data,...pending.data});
        else if(old?.version===1&&result.revision===0)showProposal('backup',{...result.data,beforeContent:old.beforeContent,afterContent:old.afterContent,fadeHeight:old.fadeHeight});
      }catch{}
    }catch(e){message(e.message);}finally{loading=false;$('new-story').disabled=false;}
  }
  function needClaude(){if(connected)return true;$('connection-panel').open=true;$('connection-panel').scrollIntoView({block:'start',behavior:'smooth'});$('claude-key').focus();work('클로드 API 키를 연결한 뒤 사용할 수 있어요.');return false;}
  async function run(action,target){
    if(!current||busy||loading||uploading||!needClaude())return;
    const selected=action==='rewrite'?$(target+'-content'):null;const scope=selected&&selected.selectionEnd>selected.selectionStart?{start:selected.selectionStart,end:selected.selectionEnd}:undefined;
    busy=true;
    const aiButtons=[$('generate-story'),$('generate-prompt'),$('save-prompt'),$('reload-prompt'),$('generate-social'),$('extract-images'),$('review-story'),$('split-story'),$('new-story'),$('source-images'),...document.querySelectorAll('[data-rewrite]')];
    aiButtons.forEach(b=>b.disabled=true);
    try{
      if(promptDirty&&['generate','rewrite','social','prompt'].includes(action))await savePrompt();
      await save();const did=current.id;
      work(labels[action]+' 중… 결과는 작업 기록에도 남습니다.');
      const response=await fetch('/api/jobs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:crypto.randomUUID(),draftId:did,action,target,scope,data:collect(),instruction:$('rewrite-instruction').value})});
      if(!response.ok){const e=await response.json();throw new Error(e.error||'클로드 작업을 시작하지 못했어요.');}
      const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',done=false;
      function consume(line){
        if(!line.trim())return;const event=JSON.parse(line);
        if(event.type==='failed')throw new Error(event.message);
        if(event.type==='done'){done=true;if(current?.id===did)showProposal(action,event.result,target,did,event);work(labels[action]+' 완료 · 클로드 '+event.calls+'회 호출. 결과를 확인해 주세요.');}
        else if(event.type==='progress')work(event.message);
      }
      for(;;){const part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});let n;while((n=pending.indexOf('\n'))>=0){const line=pending.slice(0,n);pending=pending.slice(n+1);consume(line);}}
      pending+=decoder.decode();if(pending.trim())consume(pending);if(!done)throw new Error('연결이 끊겼어요. 작업 기록에서 결과를 확인해 주세요.');
    }catch(e){work(e.message);}finally{busy=false;aiButtons.forEach(b=>b.disabled=false);await refreshPrompt().catch(e=>{$('prompt-status').textContent=e.message;});}
  }
  async function history(){const historyId=current.id;const [v,j]=await Promise.all([api('/api/drafts/'+historyId+'/versions'),api('/api/jobs')]);if(current?.id!==historyId)return;for(const [element,rows,kind] of [[$('version-list'),v.versions,'version'],[$('job-list'),j.jobs,'job']]){element.replaceChildren();if(!rows.length){const p=document.createElement('p');p.className='micro';p.textContent='아직 기록이 없어요.';element.append(p);}rows.forEach(r=>{const row=document.createElement('div');row.className='history-row';const p=document.createElement('p');p.textContent=new Date(r.created_at).toLocaleString('ko-KR')+' · '+(kind==='version'?r.reason:labels[r.action]+' · '+({running:'진행 중',done:'완료',failed:'실패',interrupted:'연결 종료 — 재실행 가능'}[r.status]||r.status))+(r.error?' · '+r.error:'');row.append(p);if(kind==='job'&&r.status==='failed'){const recover=document.createElement('button');recover.className='btn light';recover.textContent='보관된 원본 결과';recover.onclick=guard(async()=>{const raw=await api('/api/jobs/'+r.id+'/candidate');await copy(JSON.stringify(raw,null,2));});row.append(recover);}if(kind==='version'||r.status==='done'){const b=document.createElement('button');b.className='btn light';b.textContent='결과 보기';b.onclick=async()=>{if(kind==='version'&&current.id!==historyId)await choose(historyId);if(kind==='version'&&current.id!==historyId)return;if(kind==='job'&&current.id!==r.draft_id)await choose(r.draft_id);if(kind==='job'&&current.id!==r.draft_id)return;showProposal(kind==='version'?'version':r.action,kind==='version'?r.data:r.result.result,r.result?.target,kind==='version'?historyId:r.draft_id,r.result||{});};row.append(b);}element.append(row);});}}
  async function copy(text){try{await navigator.clipboard.writeText(text);message('복사했어요.');}catch{let el=$('copy-fallback');if(!el){el=document.createElement('textarea');el.id='copy-fallback';el.setAttribute('aria-label','직접 복사할 원고');$('status').after(el);}el.value=text;el.focus();el.select();message('아래 원고를 길게 눌러 복사해 주세요.');}}
  const guard=fn=>async(...args)=>{try{await fn(...args);}catch(e){message(e.message);}};
  for(const element of [...Object.values(fields),'tone','tension','dialogue','fade-height'])$(element).addEventListener('input',changed);
  $('new-story').disabled=true;
  $('new-story').onclick=guard(async()=>{
    if(busy||loading||uploading)throw new Error('진행 중인 작업이 끝난 뒤 새 원고를 열어 주세요.');
    $('new-story').disabled=true;loading=true;
    try{if(current&&(dirty||current.revision>0))await save();openWorkspace({id:crypto.randomUUID(),data:empty(),revision:0,updatedAt:0});}
    finally{loading=false;$('new-story').disabled=false;}
  });
  $('writing-prompt').oninput=()=>{promptDirty=true;promptStatus();};
  $('reload-prompt').onclick=guard(async()=>{if(busy||promptSaving)throw new Error('진행 중인 작업이 끝난 뒤 불러와 주세요.');setPrompt(await api('/api/writing-prompt'));});
  $('save-prompt').onclick=guard(async()=>{await savePrompt();message('작성 지침을 저장했어요.');});
  $('connect-claude').onclick=guard(async()=>{const b=$('connect-claude');b.disabled=true;$('connection-result').textContent='클로드 연결을 확인하고 있어요…';const key=$('claude-key').value;$('claude-key').value='';try{const settings=await api('/api/settings',{method:'POST',body:JSON.stringify({key,model:$('claude-model').value.trim()})});connected=settings.configured;$('connection-status').textContent='클로드 연결됨 · '+settings.model;$('connection-result').textContent='연결했어요. 원고를 만들 수 있습니다.';}catch(e){$('connection-result').textContent=e.message;}finally{b.disabled=false;}});
  $('save-draft').onclick=guard(()=>save('직접 저장',true));
  $('publish-story').onclick=guard(async()=>{if(!current)return;const button=$('publish-story');button.disabled=true;try{const saved=await save('게시 전 저장',true);await api('/api/drafts/'+current.id+'/publish',{method:'POST',body:JSON.stringify({revision:saved.revision})});updateItem();items.find(x=>x.id===current.id).published=true;publication();message('사이트에 게시했어요. 게시된 글 보기에서 확인하세요.');}finally{button.disabled=false;}});
  $('read-source').onclick=guard(async()=>{if(!current)return;const b=$('read-source'),did=current.id;b.disabled=true;work('원문을 읽고 있어요…');try{const result=await api('/api/source',{method:'POST',body:JSON.stringify({url:$('source-url').value})});if(current.id!==did){work('원고가 바뀌어 가져온 내용을 반영하지 않았어요. 다시 시도해 주세요.');return;}$('source-text').value=[$('source-text').value.trim(),result.text].filter(Boolean).join('\n\n');changed();work('가져온 글에 메뉴나 댓글이 섞였는지 확인해 주세요.');}catch(e){work(e.message);}finally{b.disabled=false;}});
  $('source-images').onchange=guard(async event=>{
    if(!current||busy||loading||uploading)return;
    const files=[...event.target.files],did=current.id;
    if(files.length+current.data.imageIds.length>8){event.target.value='';throw new Error('이미지는 최대 8장까지 넣을 수 있어요.');}
    uploading=true;event.target.disabled=true;$('new-story').disabled=true;
    try{
      for(const file of files){
        if(file.size>4*1024*1024)throw new Error(file.name+' — 4MB 이하로 올려 주세요.');work(file.name+' 업로드 중…');
        const response=await fetch('/api/images?name='+encodeURIComponent(file.name),{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});const result=await response.json();
        if(!response.ok)throw new Error(result.error);if(current.id!==did)throw new Error('원고가 바뀌었어요. 다시 첨부해 주세요.');
        current.data.imageIds.push(result.id);renderImages();changed();
      }
      await save();work('이미지를 저장했어요. 전체 생성에 함께 사용합니다.');
    }catch(e){work(e.message);}finally{uploading=false;event.target.disabled=false;event.target.value='';$('new-story').disabled=false;}
  });
  for(const [element,action] of [['generate-story','generate'],['generate-prompt','prompt'],['extract-images','extract'],['generate-social','social'],['review-story','review'],['split-story','split']])$(element).onclick=guard(()=>run(action));
  document.querySelectorAll('[data-rewrite]').forEach(b=>b.onclick=guard(()=>run('rewrite',b.dataset.rewrite)));
  $('apply-proposal').onclick=guard(async()=>{
    if(!proposal||proposal.draftId!==current.id)throw new Error('결과에 해당하는 원고를 먼저 열어 주세요.');
    if(busy||loading||uploading)throw new Error('진행 중인 작업이 끝난 뒤 반영해 주세요.');
    const candidate=proposal,r=candidate.result,chosenTitle=selectedTitle,button=$('apply-proposal');button.disabled=true;busy=true;$('new-story').disabled=true;
    try{
      if(candidate.action==='prompt'){
        if(promptDirty)throw new Error('직접 수정한 지침을 먼저 저장해 주세요. 그다음 새 지침을 생성할 수 있어요.');
        if(promptSaving)throw new Error('작성 지침을 저장 중이에요. 잠시 후 다시 눌러 주세요.');
        promptSaving=true;const previous=$('writing-prompt').value;
        try{const state=await api('/api/writing-prompt',{method:'PUT',body:JSON.stringify({prompt:r.prompt,revision:candidate.promptRevision})});
          if($('writing-prompt').value===previous)setPrompt(state);else{promptState=state;promptDirty=true;promptStatus();}
        }finally{promptSaving=false;}
        message('클로드가 작성한 지침을 저장했어요. 다음 원고부터 사용합니다.');
      }else{
        await save('클로드 결과 반영 전');const d=collect();if(candidate.baseData){for(const [k,v] of Object.entries(JSON.parse(candidate.baseData)))if(await fingerprint(d[k]??(k==='sourceImageKey'?'':undefined))!==v)throw new Error('생성 이후 원고가 바뀌었어요. 결과를 복사해 필요한 부분에 반영해 주세요.');}
        if(candidate.action==='generate'){
          const generated={};for(const key of ['title','titles','category','teaser','beforeContent','afterContent','storyBible','gateLine','hook','coverDetail','caption','hashtags'])generated[key]=r[key];
          if(chosenTitle)generated.title=chosenTitle;if(r.sourceText)generated.sourceText=r.sourceText;generated.sourceImageKey=r.sourceImageKey||'';
          fill({...d,...generated});
        }else if(['version','backup'].includes(candidate.action))fill(r);
        else if(candidate.action==='rewrite')fill({...d,[candidate.target==='after'?'afterContent':'beforeContent']:r.text});
        else if(candidate.action==='extract')fill({...d,sourceText:r.sourceText||[d.sourceText,r.text].filter(Boolean).join('\n\n'),sourceImageKey:r.sourceImageKey||''});
        else if(candidate.action==='social')fill({...d,...r,title:chosenTitle||d.title});
        else if(candidate.action==='split')fill({...d,...r});
        dirty=true;temporaryBackup();await save('결과 반영 전 원고');
        message('원고에 반영하고 저장했어요. 사이트 게시글은 게시 버튼을 눌러야 바뀝니다.');
      }
      if(proposal===candidate){$('proposal').hidden=true;proposal=null;}
    }finally{button.disabled=false;busy=false;$('new-story').disabled=false;}
  });
  $('close-proposal').onclick=()=>{$('proposal').hidden=true;proposal=null;};
  $('refresh-history').onclick=guard(history);$('history-panel').ontoggle=()=>{if($('history-panel').open&&current)history().catch(e=>message(e.message));};
  $('preview-before').onclick=()=>{previewView='before';updatePreview(true);};$('preview-after').onclick=()=>{previewView='after';updatePreview(true);};
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===$('reader-preview').contentWindow&&e.data?.type==='sseolzip:reader-ready'&&e.data.id===current?.id)updatePreview(true);});
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy($(b.dataset.copy).value));$('copy-body').onclick=()=>copy([$('before-content').value,$('after-content').value].filter(Boolean).join('\n\n'));$('copy-caption').onclick=()=>copy([$('caption').value,$('hashtags').value].filter(Boolean).join('\n\n'));
  function downloadBlob(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1000);}
  $('export-draft').onclick=()=>{if(!current)return;const d=collect(),text=[d.title,'[미리 보여줄 내용]',d.beforeContent,'[광고 후 보여줄 내용]',d.afterContent,'[표지 제목]',d.hook,d.coverDetail,'[인스타 캡션]',d.caption,d.hashtags,'[소재 주소]',d.sourceUrl,'[소재 내용]',d.sourceText,'[인물·사건 메모]',d.storyBible].join('\n\n');downloadBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),'ssulpan-'+current.id+'.txt');};
  $('download-cover').onclick=()=>{if($('download-cover').disabled||!current)return;$('cover-canvas').toBlob(blob=>{if(blob){downloadBlob(blob,'ssulpan-'+current.id+'-1080x1920.png');message('1080×1920 PNG를 저장했어요.');}else message('표지를 저장하지 못했어요. 다시 시도해 주세요.');},'image/png');};
  window.addEventListener('beforeunload',e=>{if(dirty||promptDirty){temporaryBackup();e.preventDefault();e.returnValue='';}});
  Promise.all([api('/api/settings'),api('/api/drafts'),api('/api/writing-prompt')]).then(async([settings,data,prompt])=>{
    connected=settings.configured;$('claude-model').value=settings.model;
    $('connection-status').textContent=connected?'클로드 연결됨 · '+settings.model:'클로드 API 키를 연결하면 소재 읽기와 원고 생성을 사용할 수 있어요.';
    items=data.drafts;setPrompt(prompt);
    const requested=new URLSearchParams(location.search).get('story'),last=items.find(x=>x.revision>0);
    if(items.some(x=>x.id===requested))await choose(requested,true);
    else if(last)await choose(last.id,true);
    else openWorkspace({id:crypto.randomUUID(),data:empty(),revision:0,updatedAt:0});
    $('new-story').disabled=false;
  }).catch(e=>{message(e.message);$('connection-status').textContent='제작실에 연결하지 못했어요. 잠시 후 새로고침해 주세요.';});
  if(document.fonts)document.fonts.ready.then(renderCover);
})();
