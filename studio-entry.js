'use strict';
(() => {
  const search = document.querySelector('.community-search');
  if (!search) return;
  const field = search.querySelector('[name="q"]');
  const isEntry = value => String(value || '').trim().replace(/\s+/g, ' ') === '썰판 스튜디오';
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-entry';
  dialog.setAttribute('aria-labelledby', 'studio-entry-title');
  dialog.innerHTML = `<form class="studio-entry-form">
    <h2 id="studio-entry-title">스튜디오 입장</h2>
    <label for="studio-entry-password">비밀번호</label>
    <input id="studio-entry-password" type="password" inputmode="numeric" autocomplete="off" maxlength="4" required autofocus>
    <p class="studio-entry-error" role="alert"></p>
    <div class="studio-entry-actions"><button type="button" data-cancel>취소</button><button type="submit">입장</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const password = dialog.querySelector('input');
  const error = dialog.querySelector('[role="alert"]');
  const submit = dialog.querySelector('[type="submit"]');
  let pending;
  const open = () => {
    password.value = '';
    error.textContent = '';
    if (!dialog.open) dialog.showModal();
    password.focus();
  };
  search.addEventListener('submit', event => {
    if (!isEntry(field.value)) return;
    event.preventDefault();
    open();
  });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    pending?.abort();
    pending = undefined;
    password.value = '';
    submit.disabled = false;
    field.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    error.textContent = '';
    submit.disabled = true;
    try {
      const response = await fetch('/api/studio-entry', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: password.value}),
        signal: controller.signal
      });
      const result = await response.json();
      if (pending !== controller || !dialog.open) return;
      if (response.ok && result.ok) {
        password.value = '';
        window.location.assign('/studio/');
      } else {
        error.textContent = result.error || '입장하지 못했어요. 다시 시도해 주세요.';
        password.select();
      }
    } catch {
      if (pending === controller && dialog.open) error.textContent = '연결하지 못했어요. 다시 시도해 주세요.';
    } finally {
      clearTimeout(timeout);
      if (pending === controller) {
        pending = undefined;
        submit.disabled = false;
      }
    }
  });
  if (isEntry(new URLSearchParams(window.location.search).get('q'))) open();
})();
