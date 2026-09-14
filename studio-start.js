'use strict';
(() => {
  const button = document.getElementById('new-story');
  if (!button) return;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const scrollTo = (left, top) => window.scrollTo({left, top, behavior: 'auto'});
  const scrollTop = () => scrollTo(0, 0);
  const removeStoryParam = () => {
    const url = new URL(location.href);
    if (!url.searchParams.has('story')) return;
    url.searchParams.delete('story');
    history.replaceState(null, '', url);
  };

  // Only a click from a public page counts as an intentional "edit this story" entry.
  // Reloading or reopening an old /studio/?story=... URL should start clean.
  let explicitEditEntry = false;
  if (new URLSearchParams(location.search).has('story') && document.referrer) {
    try {
      const ref = new URL(document.referrer);
      explicitEditEntry = ref.origin === location.origin && !ref.pathname.startsWith('/studio');
    } catch {}
  }
  if (!explicitEditEntry) removeStoryParam();

  let startupClick = false;
  let manualPosition = null;

  const restoreManualPosition = () => {
    if (!manualPosition) return;
    const {left, top} = manualPosition;
    const restore = () => scrollTo(left, top);
    restore();
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    setTimeout(restore, 80);
    setTimeout(restore, 220);
    setTimeout(() => { restore(); manualPosition = null; }, 500);
  };

  // Capture the user's scroll position before the existing async new-draft handler runs.
  button.addEventListener('click', () => {
    if (startupClick) return;
    manualPosition = {left: window.scrollX, top: window.scrollY};
    const observer = new MutationObserver(() => {
      if (!button.disabled) {
        observer.disconnect();
        removeStoryParam();
        restoreManualPosition();
      }
    });
    observer.observe(button, {attributes: true, attributeFilter: ['disabled']});
    setTimeout(() => {
      observer.disconnect();
      removeStoryParam();
      restoreManualPosition();
    }, 1500);
  }, true);

  const forceTopDuringStartup = () => {
    scrollTop();
    requestAnimationFrame(scrollTop);
    setTimeout(scrollTop, 60);
    setTimeout(scrollTop, 180);
  };
  forceTopDuringStartup();
  window.addEventListener('pageshow', forceTopDuringStartup, {once: true});

  if (explicitEditEntry) return;

  // studio.js finishes loading saved drafts asynchronously. As soon as it is ready,
  // use its own "새 원고" action so every field is cleared through the normal code path.
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (typeof button.onclick === 'function' && !button.disabled) {
      clearInterval(timer);
      startupClick = true;
      button.click();
      startupClick = false;
      removeStoryParam();
      forceTopDuringStartup();
      setTimeout(() => { removeStoryParam(); forceTopDuringStartup(); }, 250);
      return;
    }
    if (tries >= 400) clearInterval(timer);
  }, 25);
})();
