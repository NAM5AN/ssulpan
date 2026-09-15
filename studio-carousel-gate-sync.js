'use strict';
(() => {
  let mounted = false;

  function setup() {
    if (mounted) return true;
    const gate = document.getElementById('gate-line');
    const title = document.getElementById('ig-end-title');
    const workspace = document.getElementById('ig-workspace');
    const message = document.getElementById('ig-message');
    if (!gate || !title || !workspace || !message) return false;
    mounted = true;

    const label = title.closest('label');
    if (label) {
      const first = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (first) first.textContent = '제작소 이어 읽기 문구 ';
      const note = document.createElement('span');
      note.className = 'ig-gate-note';
      note.textContent = '본문 작성에서 만든 이어 읽기 문구를 자동으로 사용합니다.';
      label.insertBefore(note, title);
    }
    title.readOnly = true;
    title.setAttribute('aria-readonly', 'true');
    title.placeholder = '제작소의 이어 읽기 문구가 자동으로 들어갑니다.';

    const apply = () => {
      if (workspace.hidden) return;
      const cue = gate.value.trim();
      if (title.value === cue) return;
      title.value = cue;
      title.dispatchEvent(new Event('input', {bubbles: true}));
    };

    const arm = () => {
      for (const delay of [100, 350, 800, 1500, 3000, 6000, 12000]) setTimeout(apply, delay);
    };

    gate.addEventListener('input', () => queueMicrotask(apply));
    for (const id of ['ig-build', 'ig-reapply', 'ig-cloud-load']) {
      document.getElementById(id)?.addEventListener('click', arm, true);
    }
    new MutationObserver(apply).observe(workspace, {attributes: true, attributeFilter: ['hidden']});
    new MutationObserver(apply).observe(message, {childList: true, subtree: true, characterData: true});
    apply();
    return true;
  }

  if (!setup()) {
    const timer = setInterval(() => {
      if (setup()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 20000);
  }
})();
