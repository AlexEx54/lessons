(() => {
  'use strict';
  window.ClassPointer = { create({ role, send, notify }) {
    const root = document.getElementById('stage-components');
    const button = document.getElementById('lesson-pointer');
    let armed = false, connected = false, stageId, allowed = new Set(), current = null, hover;
    let outlined, expiryTimer, revision = -1;
    button.hidden = role !== 'teacher';
    function arm(value) {
      armed = value && connected;
      button.setAttribute('aria-pressed', String(armed));
      root.classList.toggle('lesson-pointer-armed', armed);
      hover?.classList.remove('lesson-pointer-hover');
      hover = null;
    }
    function resolve(node) {
      const component = node?.closest?.('[data-component-id]');
      if (!component || !root.contains(component) || !allowed.has(component.dataset.componentId)) return null;
      if (node.closest('[hidden], [data-pointer-exclude]')) return null;
      const part = node.closest('[data-pointer-part]');
      return { componentId: component.dataset.componentId,
        part: part && part.closest('[data-component-id]') === component ? part.dataset.pointerPart : null };
    }
    function find(target) {
      if (!target) return null;
      const component = [...root.querySelectorAll('[data-component-id]')]
        .find(node => node.dataset.componentId === target.componentId);
      if (!component) return null;
      const node = target.part === null ? component : [...component.querySelectorAll('[data-pointer-part]')]
        .find(node => node.dataset.pointerPart === target.part && node.closest('[data-component-id]') === component);
      return node && !node.closest('[hidden]') ? node : null;
    }
    function paint(scroll = false) {
      const next = current?.stageId === stageId ? find(current.target) : null;
      if (!scroll && next === outlined) return;
      outlined?.classList.remove('lesson-pointer-target');
      outlined = next;
      if (!outlined) return;
      // Restart the pulse even when the teacher points to the same element again.
      if (scroll) void outlined.offsetWidth;
      outlined.classList.add('lesson-pointer-target');
      if (scroll && role === 'student') {
        const rect = outlined.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewportTop = viewport?.offsetTop || 0;
        const top = Math.max(viewportTop, document.querySelector('.lesson-header')?.getBoundingClientRect().bottom || 0) + 20;
        const bottom = viewportTop + (viewport?.height || window.innerHeight) - 32;
        if (rect.top < top || rect.bottom > bottom) {
          outlined.style.scrollMarginTop = `${top}px`;
          outlined.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
            block: 'start', inline: 'nearest' });
        }
      }
    }
    button.addEventListener('click', () => arm(!armed));
    root.addEventListener('pointermove', event => {
      if (!armed) return;
      hover?.classList.remove('lesson-pointer-hover');
      hover = find(resolve(event.target));
      hover?.classList.add('lesson-pointer-hover');
    });
    root.addEventListener('pointerleave', () => { hover?.classList.remove('lesson-pointer-hover'); hover = null; });
    root.addEventListener('pointerdown', event => {
      if (!armed) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    root.addEventListener('click', event => {
      if (!armed) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const target = resolve(event.target);
      if (!target) { notify('Этот элемент недоступен ученику.'); return; }
      send({ type: 'pointer-set', stageId, target });
      arm(false);
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || role !== 'teacher') return;
      arm(false);
      if (connected && current?.target) send({ type: 'pointer-clear' });
    });
    return {
      update(payload) {
        if (stageId !== payload.stageId || !payload.connected) { arm(false); current = null; }
        stageId = payload.stageId; connected = payload.connected;
        allowed = new Set(payload.componentIds || []);
        button.disabled = !connected;
        paint();
      },
      receive(message) {
        if (message.revision <= revision) return;
        window.clearTimeout(expiryTimer);
        revision = message.revision; current = message;
        paint(true);
        if (current.target) expiryTimer = window.setTimeout(() => {
          current = null;
          paint();
        }, 2200);
      },
      disconnect() { window.clearTimeout(expiryTimer); revision = -1; current = null; connected = false; arm(false); button.disabled = true; paint(); },
    };
  } };
})();
