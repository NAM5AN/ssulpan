'use strict';
(() => {
  function labelFor(id){const el=document.getElementById(id);return el?.closest('label')||null;}
  function tidy(){
    const root=document.getElementById('instagram-maker');if(!root)return false;
    root.querySelector('.ig-head p:not(.ig-eyebrow)')?.replaceChildren('광고 전 미리읽기만 썰판 스타일로 나눠서 이미지로 만듭니다');
    const total=document.getElementById('ig-total');if(total)total.hidden=true;
    for(const id of ['ig-theme','ig-brandline','ig-footer','ig-end-subtitle'])labelFor(id)?.remove();
    document.getElementById('ig-title')?.closest('fieldset')?.remove();
    const endTitle=document.getElementById('ig-end-title');
    if(endTitle){const label=endTitle.closest('label');if(label){for(const node of [...label.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();label.prepend(document.createTextNode('버튼 위 유도 문구'));}}
    const note=document.getElementById('ig-source-note');if(note&&note.textContent==='광고 뒤 내용은 포함되지 않아요')note.textContent='지정한 미리읽기 범위만 사용 중';
    const status=document.getElementById('ig-message');
    if(status&&!status.dataset.ssulPatched){
      status.dataset.ssulPatched='1';
      const rewrite=()=>{status.textContent=status.textContent.replace(/^표지 1장 \+ 본문 (\d+)장/,'본문 $1장').replace(/\. 광고 뒤 내용은 포함하지 않았어요\.?$/,'');};
      new MutationObserver(rewrite).observe(status,{childList:true,characterData:true,subtree:true});rewrite();
    }
    return true;
  }
  if(!tidy()){
    const observer=new MutationObserver(()=>{if(tidy())observer.disconnect();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    addEventListener('DOMContentLoaded',tidy,{once:true});
  }
})();
