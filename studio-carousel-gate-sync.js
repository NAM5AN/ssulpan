'use strict';
(() => {
  let mounted = false;
  const LINK_NOTE = '이어지는 이야기는 게시글 링크에서';
  const LEGACY_NOTES = new Set(['', '전체 이야기 보기', '전체 이야기는 프로필 링크에서']);

  function labelText(label, text) {
    if (!label) return;
    const first = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (first) first.textContent = text + ' ';
  }

  function setup() {
    if (mounted) return true;
    const gate = document.getElementById('gate-line');
    const title = document.getElementById('ig-end-title');
    const noteInput = document.getElementById('ig-end-button');
    const workspace = document.getElementById('ig-workspace');
    const message = document.getElementById('ig-message');
    if (!gate || !title || !noteInput || !workspace || !message) return false;
    mounted = true;

    const titleLabel = title.closest('label');
    labelText(titleLabel, '제작소 이어 읽기 문구');
    if (titleLabel) {
      const note = document.createElement('span');
      note.className = 'ig-gate-note';
      note.textContent = '본문 작성에서 만든 이어 읽기 문구를 자동으로 사용합니다.';
      titleLabel.insertBefore(note, title);
    }
    title.readOnly = true;
    title.setAttribute('aria-readonly', 'true');
    title.placeholder = '제작소의 이어 읽기 문구가 자동으로 들어갑니다.';

    labelText(noteInput.closest('label'), '링크 안내 문구');
    noteInput.placeholder = LINK_NOTE;

    const apply = () => {
      if (workspace.hidden) return;
      const cue = gate.value.trim();
      if (title.value !== cue) {
        title.value = cue;
        title.dispatchEvent(new Event('input', {bubbles: true}));
      }
      if (LEGACY_NOTES.has(noteInput.value.trim())) {
        noteInput.value = LINK_NOTE;
        noteInput.dispatchEvent(new Event('input', {bubbles: true}));
      }
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
