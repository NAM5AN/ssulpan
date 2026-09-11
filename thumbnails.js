'use strict';
(() => {
  const cards = [...document.querySelectorAll('[data-story-thumbnail]')];
  if (!cards.length || !window.SseolzipCover) return;
  function render() {
    for (const card of cards) {
      const canvas = card.querySelector('canvas');
      const fits = window.SseolzipCover.drawThumbnail(canvas, {
        hook: card.dataset.hook, category: card.dataset.category, detail: card.dataset.detail,
      });
      canvas.hidden = !fits;
      card.querySelector('.thumbnail-fallback').hidden = fits;
    }
  }
  render();
  document.fonts?.ready.then(render);
})();
