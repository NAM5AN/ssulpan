'use strict';
(() => {
  const WIDTH = 1080, HEIGHT = 1920;
  const FACE = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const normalizeBreaks = value => String(value ?? '')
    .replace(/\\r\\n|\\n|\\r/g, '\n');
  function wrap(ctx, text, width) {
    const result = [];
    for (const paragraph of normalizeBreaks(text).split('\n').filter(line => line.trim())) {
      let line = '';
      for (const character of Array.from(paragraph)) {
        if (line && ctx.measureText(line + character).width > width) {
          result.push(line.trim()); line = character;
        } else line += character;
      }
      if (line) result.push(line.trim());
    }
    return result;
  }
  function draw(canvas, data) {
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = '#fd582b'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#000000'; ctx.textBaseline = 'top';
    const left = 80, textWidth = WIDTH - left * 2;
    const headlineY = 640, headlineHeight = 760, lineHeight = 1.2;
    const hook = normalizeBreaks(data.hook || '');
    ctx.font = `500 40px ${FACE}`; ctx.fillText(data.category || '이야기', left, 520);
    const lines = hook.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let size = 144;
    const fitsHeadline = () => lines.length > 0
      && lines.every(line => ctx.measureText(line).width <= textWidth)
      && lines.length * size * lineHeight <= headlineHeight;
    do {
      ctx.font = `800 ${size}px ${FACE}`;
      if (fitsHeadline() || size === 52) break;
      size -= 2;
    } while (size >= 52);
    const fits = fitsHeadline();
    // Overlong drafts remain editable and cannot be exported until shortened.
    ctx.save(); ctx.beginPath(); ctx.rect(left - 6, headlineY - 10, textWidth + 12, headlineHeight + 20); ctx.clip();
    lines.forEach((line, index) => ctx.fillText(line, left, headlineY + index * size * lineHeight));
    ctx.restore();
    ctx.font = `500 48px ${FACE}`;
    const detailLines = wrap(ctx, data.detail || '', textWidth);
    detailLines.slice(0, 4).forEach((line, i) => ctx.fillText(line, left, 1460 + i * 66));
    canvas.setAttribute('aria-label', '1080×1920 썰판 표지: ' + hook.replace(/\n/g, ' '));
    return fits && detailLines.length <= 4;
  }
  function drawThumbnail(canvas, data) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    canvas.width = 960; canvas.height = 600;
    ctx.fillStyle = '#fd582b'; ctx.fillRect(0, 0, 960, 600);
    ctx.fillStyle = '#000000'; ctx.textBaseline = 'top';
    const left = 64, width = 832;
    // Keep the cover's authored line breaks; wrap only at spaces where possible.
    function linesFor(text) {
      const lines = [];
      for (const paragraph of normalizeBreaks(text).split(/\r?\n/).filter(p => p.trim())) {
        let line = '';
        for (const word of paragraph.trim().split(/\s+/)) {
          const candidate = line ? line + ' ' + word : word;
          if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
          if (line) lines.push(line);
          const parts = wrap(ctx, word, width);
          lines.push(...parts.slice(0, -1)); line = parts.at(-1) || '';
        }
        if (line) lines.push(line);
      }
      return lines;
    }
    function textBlock(text, startSize, top, height, weight, spacing) {
      for (let size = startSize; size >= 12; size -= 2) {
        ctx.font = `${weight} ${size}px ${FACE}`;
        const lines = linesFor(text);
        if (lines.length * size * spacing > height) continue;
        lines.forEach((line, i) => ctx.fillText(line, left, top + i * size * spacing));
        return true;
      }
      return false;
    }
    ctx.font = `500 28px ${FACE}`; ctx.fillText(data.category || '이야기', left, 52, width);
    const titleFits = textBlock(data.hook || data.title || '', 84, 122, 310, 800, 1.18);
    const detailFits = textBlock(data.detail || '', 32, 490, 86, 500, 1.3);
    return titleFits && detailFits;
  }
  function repairHookField() {
    const hook = document.getElementById('hook');
    if (!hook) return false;
    const normalized = normalizeBreaks(hook.value);
    if (normalized === hook.value) return false;
    hook.value = normalized;
    hook.dispatchEvent(new Event('input', {bubbles: true}));
    return true;
  }
  function watchProposalApply() {
    const button = document.getElementById('apply-proposal');
    if (!button) return;
    button.addEventListener('click', () => {
      let tries = 0;
      const timer = setInterval(() => {
        repairHookField();
        tries += 1;
        if (tries >= 60 || document.getElementById('proposal')?.hidden) clearInterval(timer);
      }, 100);
    });
  }
  repairHookField();
  watchProposalApply();
  window.SseolzipCover = Object.freeze({draw, drawThumbnail, width: WIDTH, height: HEIGHT});
})();
