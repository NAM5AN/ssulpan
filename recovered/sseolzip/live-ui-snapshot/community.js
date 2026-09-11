'use strict';
(() => {
  const carousel=document.querySelector('.spotlight');if(!carousel)return;
  const track=carousel.querySelector('.spotlight-slides');
  const slides=[...track.querySelectorAll('[data-slide]')];
  const controls=carousel.querySelector('.spotlight-controls');
  if(slides.length<2)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle=controls.querySelector('[data-slide-toggle]');
  let current=0,timer=null,moving=false,finishTimer=null,paused=false,hover=false,focusPaused=false;
  const interval=5000,duration=450;
  slides.forEach((slide,i)=>{
    slide.hidden=false;
    slide.setAttribute('role','group');
    slide.setAttribute('aria-roledescription','슬라이드');
    slide.setAttribute('aria-label',`${i+1} / ${slides.length}`);
  });
  carousel.classList.add('is-sliding');controls.hidden=false;
  function position(){
    slides.forEach((slide,i)=>{
      const offset=(i-current+slides.length)%slides.length;
      slide.style.transform=`translateX(${offset*100}%)`;
      slide.inert=i!==current;
      slide.setAttribute('aria-hidden',String(i!==current));
      slide.style.visibility=(i===current||offset===1)?'visible':'hidden';
    });
    controls.querySelector('.slide-count').textContent=`${current+1} / ${slides.length}`;
  }
  function clear(){clearTimeout(timer);timer=null;}
  function schedule(){
    clear();
    if(!paused&&!hover&&!focusPaused&&!document.hidden&&!reduced.matches)timer=setTimeout(()=>show(1),interval);
  }
  function finish(){
    if(!moving)return;
    clearTimeout(finishTimer);moving=false;
    slides.forEach(slide=>slide.style.transition='none');
    position();
  }
  function show(step){
    if(moving)return;
    clear();
    const previous=slides[current],nextIndex=(current+step+slides.length)%slides.length,next=slides[nextIndex];
    if(reduced.matches){current=nextIndex;position();schedule();return;}
    moving=true;
    next.style.transition='none';next.style.visibility='visible';next.style.transform=`translateX(${step*100}%)`;
    previous.style.transition='none';previous.style.visibility='visible';previous.style.transform='translateX(0)';
    void track.offsetWidth;
    previous.style.transition=next.style.transition=`transform ${duration}ms cubic-bezier(.22,.61,.36,1)`;
    previous.style.transform=`translateX(${-step*100}%)`;next.style.transform='translateX(0)';
    previous.inert=true;previous.setAttribute('aria-hidden','true');next.inert=false;next.setAttribute('aria-hidden','false');
    current=nextIndex;controls.querySelector('.slide-count').textContent=`${current+1} / ${slides.length}`;
    finishTimer=setTimeout(finish,duration+50);
    schedule();
  }
  function toggleLabel(){
    toggle.hidden=reduced.matches;
    toggle.textContent=paused?'자동재생':'일시정지';
    toggle.setAttribute('aria-label',paused?'배너 자동재생 시작':'배너 자동재생 일시정지');
  }
  controls.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-slide-step'))show(Number(button.dataset.slideStep));
    else if(button.hasAttribute('data-slide-toggle')){paused=!paused;if(!paused)focusPaused=false;toggleLabel();schedule();}
  });
  track.addEventListener('transitionend',event=>{if(event.propertyName==='transform'&&event.target===slides[current])finish();});
  carousel.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hover=true;clear();}});
  carousel.addEventListener('pointerleave',()=>{hover=false;schedule();});
  carousel.addEventListener('focusin',()=>{focusPaused=true;clear();});
  carousel.addEventListener('focusout',()=>setTimeout(()=>{if(!carousel.contains(document.activeElement)){focusPaused=false;schedule();}},0));
  document.addEventListener('visibilitychange',schedule);
  reduced.addEventListener('change',()=>{if(reduced.matches)finish();toggleLabel();schedule();});
  position();toggleLabel();schedule();
})();
