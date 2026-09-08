(() => {
  'use strict';
  const selector = '[data-cursor-text], [data-cursor-target]';
  const textNodes = element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  };
  // Coordinates in the original image also handle the cropped circular header image.
  function imageRect(image) {
    const box = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || !box.width || !box.height) return null;
    const fit = getComputedStyle(image).objectFit;
    const scale = (fit === 'cover' ? Math.max : Math.min)(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height, box };
  }
  function locate(element, offset) {
    for (const node of textNodes(element)) {
      if (offset < node.length) return { node, offset };
      offset -= node.length;
    }
    return null;
  }
  function capture(x, y) {
    const element = document.elementFromPoint(x, y)?.closest(selector);
    const component = element?.closest('.text-reading[data-component-id]');
    if (!component || element.closest('[contenteditable="true"]')) return null;
    const target = { componentId: component.dataset.componentId };
    if (element.dataset.cursorTarget) {
      const rect = imageRect(element);
      if (!rect) return null;
      return { ...target, field: element.dataset.cursorTarget,
        x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)) };
    }
    let node, offset;
    if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(x, y);
      node = caret?.offsetNode; offset = caret?.offset;
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      node = range?.startContainer; offset = range?.startOffset;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE || !element.contains(node) || !node.length) return null;
    offset = Math.min(offset, node.length - 1);
    const range = document.createRange();
    range.setStart(node, offset); range.setEnd(node, offset + 1);
    const rect = range.getBoundingClientRect();
    // Hit testing may return the nearest line even when the pointer is in whitespace.
    if (x < rect.left - 8 || x > rect.right + 8 || y < rect.top - 3 || y > rect.bottom + 3) return null;
    let absolute = offset;
    for (const text of textNodes(element)) { if (text === node) break; absolute += text.length; }
    return { ...target, field: element.dataset.cursorText, offset: absolute };
  }
  function resolve(target) {
    const component = [...document.querySelectorAll('.text-reading[data-component-id]')]
      .find(node => node.dataset.componentId === target.componentId);
    const element = component && [...component.querySelectorAll(selector)]
      .find(node => (node.dataset.cursorText || node.dataset.cursorTarget) === target.field);
    if (!element || !element.getClientRects().length) return null;
    if (element.dataset.cursorTarget) {
      const rect = imageRect(element);
      if (!rect) return null;
      const x = rect.left + target.x * rect.width, y = rect.top + target.y * rect.height;
      if (x < rect.box.left || x > rect.box.right || y < rect.box.top || y > rect.box.bottom) return null;
      return { x, y, element };
    }
    const position = locate(element, target.offset);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.node, position.offset); range.setEnd(position.node, position.offset + 1);
    const rect = range.getClientRects()[0];
    return rect ? { x: rect.left, y: rect.top + rect.height / 2, element } : null;
  }
  function create({ classId, role }) {
    let enabled = false, disposed = false, socket, reconnectTimer, reconnectDelay = 500;
    let pointer = null, touchStart = null, localTouch = false, touchUntil = 0, dirty = true;
    let remote = null, remoteUntil = 0, lastSent = '', lastSentAt = 0, frame;
    const listeners = [];
    const listen = (element, event, fn, options) => {
      element.addEventListener(event, fn, options);
      listeners.push(() => element.removeEventListener(event, fn, options));
    };
    const marker = document.createElement('div');
    marker.className = `class-cursor class-cursor--${role === 'teacher' ? 'student' : 'teacher'}`;
    marker.hidden = true; marker.setAttribute('aria-hidden', 'true');
    const arrow = document.createElement('span'); arrow.className = 'class-cursor__arrow'; arrow.textContent = '➤';
    const label = document.createElement('span'); label.className = 'class-cursor__label';
    label.textContent = role === 'teacher' ? 'Ученик' : 'Учитель';
    marker.append(arrow, label);
    const jump = document.createElement('button');
    jump.className = 'class-cursor-jump'; jump.type = 'button'; jump.hidden = true;
    document.body.append(marker, jump);
    function hideRemote() { remote = null; marker.hidden = true; jump.hidden = true; }
    function draw() {
      frame = null;
      if (!enabled || document.hidden || !remote || Date.now() >= remoteUntil) { hideRemote(); return; }
      const point = resolve(remote.target);
      if (!point) { marker.hidden = true; jump.hidden = true; return; }
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const offscreen = point.y < top + 90 || point.y > top + height - 25 || point.x < left || point.x > left + width;
      marker.hidden = offscreen; jump.hidden = !offscreen;
      if (offscreen) {
        const direction = point.y < top + 90 ? '↑' : point.y > top + height - 25 ? '↓' : point.x < left ? '←' : '→';
        jump.textContent = `${direction} ${label.textContent} указывает — перейти`;
      } else {
        const hit = document.elementFromPoint(point.x + 1, point.y);
        if (!hit || !point.element.contains(hit)) { marker.hidden = true; return; }
        marker.classList.toggle('class-cursor--touch', remote.touch);
        marker.classList.toggle('class-cursor--label-left', point.x > left + width - 110);
        marker.style.transform = `translate(${point.x}px, ${point.y}px)`;
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    listen(jump, 'click', () => {
      const point = remote && resolve(remote.target);
      if (point) window.scrollBy({ top: point.y - window.innerHeight / 2, left: point.x - window.innerWidth / 2, behavior: 'smooth' });
    });
    function connect() {
      if (!enabled || disposed || socket) return;
      const current = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/classes/${classId}/cursors?role=${role}`);
      socket = current;
      current.addEventListener('open', () => { reconnectDelay = 500; lastSent = ''; lastSentAt = 0; dirty = true; });
      current.addEventListener('message', event => {
        if (socket !== current || !enabled) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type !== 'cursor') return;
          if (!message.target || message.stageId !== 'reading') { hideRemote(); return; }
          marker.classList.toggle('class-cursor--smooth', !marker.hidden && !message.touch && remote?.target.componentId === message.target.componentId && remote?.target.field === message.target.field);
          remote = message; remoteUntil = Date.now() + (message.touch ? 1200 : 3500); schedule();
        } catch { /* Ignore malformed transient events. */ }
      });
      current.addEventListener('close', () => {
        if (socket !== current) return;
        socket = null; hideRemote();
        if (enabled && !disposed) {
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        }
      });
    }
    function stop() {
      clearTimeout(reconnectTimer);
      const previous = socket; socket = null; previous?.close();
      pointer = null; touchStart = null; lastSent = ''; hideRemote();
    }
    function clearPointer() { pointer = null; dirty = true; localTouch = false; }
    listen(document, 'pointermove', event => {
      if (event.pointerType === 'touch') {
        if (touchStart && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 10) touchStart = null;
        return;
      }
      pointer = { x: event.clientX, y: event.clientY }; localTouch = false; dirty = true;
    }, { passive: true });
    listen(document, 'pointerdown', event => {
      if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId, at: Date.now() };
    }, { passive: true });
    listen(document, 'pointerup', event => {
      if (event.pointerType !== 'touch') return;
      if (touchStart?.id === event.pointerId && Date.now() - touchStart.at < 700 && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) <= 10) {
        pointer = { x: event.clientX, y: event.clientY }; localTouch = true; touchUntil = Date.now() + 1200; dirty = true;
      }
      touchStart = null;
    }, { passive: true });
    listen(document, 'pointercancel', () => { touchStart = null; clearPointer(); });
    listen(document, 'pointerout', event => { if (event.pointerType !== 'touch' && !event.relatedTarget) clearPointer(); });
    listen(window, 'blur', clearPointer);
    listen(document, 'visibilitychange', () => { clearPointer(); hideRemote(); });
    listen(window, 'scroll', () => { marker.classList.remove('class-cursor--smooth'); touchStart = null; if (localTouch) clearPointer(); dirty = true; schedule(); }, { capture: true, passive: true });
    listen(window, 'resize', () => { dirty = true; schedule(); });
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', schedule); listen(window.visualViewport, 'scroll', schedule);
    }
    const container = document.getElementById('stage-components');
    const observer = new MutationObserver(() => { dirty = true; schedule(); });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const resize = new ResizeObserver(() => { dirty = true; schedule(); }); resize.observe(container);
    listen(container, 'load', () => { dirty = true; schedule(); }, true);
    const tick = setInterval(() => {
      if (remote && Date.now() >= remoteUntil) hideRemote();
      if (!enabled || socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 4096) return;
      if (localTouch && Date.now() >= touchUntil) clearPointer();
      if (!dirty && Date.now() - lastSentAt < 1000) return;
      dirty = false;
      const target = pointer && !document.hidden ? capture(pointer.x, pointer.y) : null;
      const payload = JSON.stringify({ type: 'cursor', stageId: 'reading', target, touch: localTouch });
      if (payload === lastSent && (localTouch || Date.now() - lastSentAt < 1000)) return;
      socket.send(payload); lastSent = payload; lastSentAt = Date.now();
    }, 50);
    return {
      setContext({ connected, stageId }) {
        const next = connected && stageId === 'reading';
        if (next !== enabled) { enabled = next; if (enabled) connect(); else stop(); }
        dirty = true; schedule();
      },
      dispose() {
        disposed = true; enabled = false; stop(); clearInterval(tick); cancelAnimationFrame(frame);
        observer.disconnect(); resize.disconnect(); listeners.forEach(remove => remove()); marker.remove(); jump.remove();
      },
    };
  }
  window.ClassCursors = { create };
})();
