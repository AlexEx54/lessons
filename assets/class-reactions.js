(() => {
  'use strict';
  const labels = { heart: 'Сердце', like: 'Нравится', clap: 'Аплодисменты', laugh: 'Смешно', fire: 'Огонь', confused: 'Непонятно' };
  const kinds = Object.keys(labels);
  if (typeof module !== 'undefined' && module.exports) { module.exports = { kinds }; return; }
  const SEND_INTERVAL_MS = 120, MAX_FLYING = 30;
  window.ClassReactions = { kinds, create({ send } = {}) {
    const root = document.getElementById('lesson-reactions');
    const toggle = document.getElementById('lesson-reactions-toggle');
    const picker = document.getElementById('lesson-reaction-picker');
    const layer = document.getElementById('lesson-reaction-layer');
    const src = kind => `/assets/images/reactions/${kind}.svg`;
    let sentAt = 0;
    root.hidden = false;
    function open(value) {
      picker.hidden = !value;
      toggle.setAttribute('aria-expanded', String(value));
    }
    function fly(kind) {
      if (layer.children.length >= MAX_FLYING) layer.firstElementChild.remove();
      const node = document.createElement('img');
      node.className = 'lesson-reaction';
      node.src = src(kind);
      node.alt = '';
      node.style.left = `${15 + Math.random() * 50}%`;
      layer.append(node);
      const height = layer.clientHeight, sway = (Math.random() - .5) * 56, scale = .85 + Math.random() * .4;
      const frames = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }]
        : [
          { opacity: 0, transform: 'translate(0, 0) scale(.3)' },
          { opacity: 1, transform: `translate(${sway * .4}px, ${-height * .12}px) scale(${scale})`, offset: .12 },
          { opacity: 1, transform: `translate(${-sway * .5}px, ${-height * .45}px) scale(${scale}) rotate(${sway / 5}deg)`, offset: .45 },
          { opacity: 1, transform: `translate(${sway}px, ${-height * .75}px) scale(${scale}) rotate(${-sway / 6}deg)`, offset: .75 },
          { opacity: 0, transform: `translate(${sway * .4}px, ${-height}px) scale(${scale * .9})` },
        ];
      node.animate(frames, { duration: 2200 + Math.random() * 600, easing: 'cubic-bezier(.3, .6, .45, 1)' })
        .finished.then(() => node.remove(), () => node.remove());
    }
    for (const kind of kinds) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = labels[kind];
      button.setAttribute('aria-label', labels[kind]);
      const image = document.createElement('img');
      image.src = src(kind);
      image.alt = '';
      button.append(image);
      button.addEventListener('click', () => {
        fly(kind);
        if (!send || Date.now() - sentAt < SEND_INTERVAL_MS) return;
        sentAt = Date.now();
        send({ type: 'reaction', kind });
      });
      picker.append(button);
    }
    toggle.addEventListener('click', () => open(picker.hidden));
    document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) open(false); });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || picker.hidden) return;
      open(false);
      toggle.focus();
    });
    return {
      receive(message) { if (kinds.includes(message.kind)) fly(message.kind); },
    };
  } };
})();
