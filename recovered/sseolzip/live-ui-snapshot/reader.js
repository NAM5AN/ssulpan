'use strict';
(() => {
  const data = JSON.parse(document.getElementById('reader-data').textContent);
  const opening = document.getElementById('opening');
  const continuation = document.getElementById('continuation');
  const gate = document.getElementById('read-gate');
  const sample = document.getElementById('fade-sample');
  const button = document.getElementById('continue-reading');
  const status = document.getElementById('reader-status');
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  if (isPreview) document.body.classList.add('embedded-reader');
  if (data.trackViews === true && !isPreview && window.top === window) {
    let recorded = false;
    function recordView() {
      if (recorded || document.hidden) return;
      recorded = true;
      document.removeEventListener('visibilitychange', recordView);
      fetch(`/api/stories/${encodeURIComponent(data.id)}/view`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(result => {
          const count = document.getElementById('story-view-count');
          if (count && Number.isSafeInteger(result?.views)) count.textContent = result.views.toLocaleString('ko-KR');
        }).catch(() => {});
    }
    document.addEventListener('visibilitychange', recordView);
    recordView();
  }
  function paragraphs(lines) {
    return lines.map(text => { const p = document.createElement('p'); p.textContent = text; return p; });
  }
  function splitBody(text) {
    return text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  function configure(beforeContent, afterContent, fadeHeight, view) {
    const fade = Number.isFinite(Number(fadeHeight)) ? Math.max(80, Math.min(300, Math.round(Number(fadeHeight)))) : data.fadeHeight;
    const before = splitBody(beforeContent), after = splitBody(afterContent);
    opening.replaceChildren(...paragraphs(before));
    sample.replaceChildren(...paragraphs(after.slice(0, 2)));
    const end = document.createElement('div'); end.className = 'story-end'; end.textContent = '이야기 끝';
    continuation.replaceChildren(...paragraphs(after), ...(after.length ? [end] : []));
    const expanded = view === 'after' && after.length > 0;
    continuation.hidden = !expanded; gate.hidden = expanded || after.length === 0;
    gate.style.setProperty('--fade-height', fade + 'px');
    button.setAttribute('aria-expanded', String(expanded)); status.textContent = '';
  }
  button.addEventListener('click', () => {
    continuation.hidden = false; gate.hidden = true;
    button.setAttribute('aria-expanded', 'true'); status.textContent = '나머지 본문을 열었어요.';
    continuation.focus({ preventScroll: true }); continuation.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
  if (isPreview) {
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.type !== 'sseolzip:body-preview' || message.id !== data.id) return;
      if (typeof message.beforeContent !== 'string' || typeof message.afterContent !== 'string'
        || message.beforeContent.length > 60000 || message.afterContent.length > 60000) return;
      configure(message.beforeContent, message.afterContent, message.fadeHeight, message.view);
      if (typeof message.title === 'string') document.querySelector('.article-heading h1').textContent = message.title;
      if (typeof message.category === 'string') document.querySelector('.article-category').textContent = message.category;
      if (typeof message.gateLine === 'string') document.querySelector('.gate-copy h2').textContent = message.gateLine || '그다음 이야기가 궁금하다면?';
      if (message.scrollToView === true) requestAnimationFrame(() => {
        const target = message.view === 'after' && !continuation.hidden ? continuation : opening;
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    });
    window.parent.postMessage({ type: 'sseolzip:reader-ready', id: data.id }, location.origin);
  }
})();
