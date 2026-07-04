/* Lesson sync core: realtime teacher/student mirroring, generalized for any
   lesson-spec-v1 page. Exposes window.__initLessonSync({ lesson, meta, pageEl }). */
(() => {
  function initLessonSync(options) {
    const { lesson, meta, pageEl } = options || {};

    const roleSelect = document.getElementById('role-select');
    const roomInput = document.getElementById('room-input');
    const syncShell = document.getElementById('sync-shell');
    const syncShellToggle = document.getElementById('sync-shell-toggle');
    const connectBtn = document.getElementById('connect-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const syncStatus = document.getElementById('sync-status');
    const studentLinkMeta = document.getElementById('student-link-meta');
    const teacherBox = document.getElementById('teacher-box');
    const studentTracker = document.getElementById('student-tracker');
    const bringToMeBtn = document.getElementById('bring-to-me-btn');
    const selectorInput = document.getElementById('highlight-selector-input');
    const selectorBtn = document.getElementById('highlight-selector-btn');
    const gotoGrid = document.getElementById('teacher-goto-grid');
    const wordSpotlightGrid = document.getElementById('word-spotlight-grid');
    const remoteCursor = document.getElementById('remote-cursor');

    const sections = Array.from(document.querySelectorAll('main .section'));

    const query = new URLSearchParams(window.location.search);
    const initialRole = query.get('role') === 'teacher' ? 'teacher' : 'student';
    const initialRoom = (query.get('room') || '').trim();
    const autoConnect = query.get('autoconnect') === '1';

    roleSelect.value = initialRole;
    roomInput.value = initialRoom;

    const clientId = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `client-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    let role = roleSelect.value;
    let connected = false;
    let eventSource = null;
    let focusLabel = 'none';
    let presenceTicker = null;
    let cursorLastSentAt = 0;
    let lastClientX = -1;
    let lastClientY = -1;
    let lastRemoteCursorPayload = null;
    let lastRemoteCursorLabel = '';
    let lastRemoteCursorRole = '';
    let presenceTimer = null;
    let lastStudentPresenceAt = 0;
    let syncShellCollapsed = false;
    let lastStudentDomActionId = 0;
    const studentDomActionLog = [];
    const STUDENT_DOM_ACTION_LOG_LIMIT = 1000;
    const pendingStudentInputActions = new Map();
    let pendingStudentInputTimer = null;
    const STUDENT_INPUT_THROTTLE_MS = 90;
    const teacherAppliedActionIds = new Set();
    const TEACHER_APPLIED_ACTION_LIMIT = 3000;
    let activeStudentSenderId = '';
    const REMOTE_CURSOR_CENTER_OFFSET = 8;

    function setSyncStatus(text) { syncStatus.textContent = text; }

    function hideRemoteCursor() {
      remoteCursor.classList.remove('visible', 'role-student', 'role-teacher');
      remoteCursor.style.transform = 'translate(-9999px, -9999px)';
    }

    function getStudentLink() {
      const roomId = roomInput.value.trim();
      if (!roomId) return '';
      const params = new URLSearchParams(window.location.search);
      params.set('room', roomId);
      params.set('role', 'student');
      params.set('autoconnect', '1');
      return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }

    function updateUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const roomId = roomInput.value.trim();
      params.set('role', roleSelect.value);
      if (roomId) { params.set('room', roomId); } else { params.delete('room'); }
      if (params.get('role') === 'student') { params.set('autoconnect', '1'); } else { params.delete('autoconnect'); }
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    }

    function refreshStudentLinkMeta() {
      const link = getStudentLink();
      studentLinkMeta.textContent = link ? `Student link: ${link}` : 'Student link will appear here.';
    }

    function applyRoleUi() {
      role = roleSelect.value;
      teacherBox.classList.toggle('active', role === 'teacher');
      hideRemoteCursor();
      updateTeacherReadonlyState();
    }

    function setSyncShellCollapsed(nextValue) {
      syncShellCollapsed = Boolean(nextValue);
      syncShell.classList.toggle('collapsed', syncShellCollapsed);
      syncShellToggle.setAttribute('aria-expanded', String(!syncShellCollapsed));
    }

    function updateTeacherReadonlyState() {
      if (!(pageEl instanceof HTMLElement)) return;
      pageEl.classList.toggle('readonly-mirror', connected && role === 'teacher');
    }

    function isLessonSyncTarget(element) {
      return element instanceof HTMLElement && pageEl instanceof HTMLElement && pageEl.contains(element);
    }

    function cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
      return String(value).replace(/[\\"]/g, '\\$&');
    }

    const LOCATOR_KEYS = ['syncKey', 'col', 'answer', 'itemId', 'defId', 'type', 'id', 'word'];

    function attrNameFor(key) {
      if (key === 'syncKey') return 'sync-key';
      if (key === 'itemId') return 'item-id';
      if (key === 'defId') return 'def-id';
      return key;
    }

    function pickLocatorDataset(element) {
      if (!(element instanceof HTMLElement)) return {};
      const data = {};
      LOCATOR_KEYS.forEach(key => {
        const value = element.dataset ? element.dataset[key] : '';
        if (typeof value === 'string' && value) data[key] = value;
      });
      return data;
    }

    function buildDomLocator(element) {
      if (!(element instanceof HTMLElement)) return null;
      if (!isLessonSyncTarget(element)) return null;
      const locator = { tag: element.tagName };
      if (element.id) locator.id = element.id;
      if (element.dataset && element.dataset.syncKey) locator.syncKey = element.dataset.syncKey;
      const dataset = pickLocatorDataset(element);
      if (Object.keys(dataset).length > 0) locator.dataset = dataset;
      const anchor = element.closest('.exercise[id], .section[id], [id]');
      if (anchor instanceof HTMLElement && anchor.id) {
        locator.anchorId = anchor.id;
        locator.targetPath = buildCursorTargetPath(anchor, element);
      }
      return locator;
    }

    function findBySyncKey(syncKey, root = document) {
      if (!syncKey) return null;
      try { return root.querySelector(`[data-sync-key="${cssEscape(syncKey)}"]`); } catch (e) { return null; }
    }

    function findByDataset(dataset, tagName, root = document) {
      if (!dataset || typeof dataset !== 'object') return null;
      const fragments = [];
      LOCATOR_KEYS.forEach(key => {
        const value = dataset[key];
        if (typeof value === 'string' && value) {
          fragments.push(`[data-${attrNameFor(key)}="${cssEscape(value)}"]`);
        }
      });
      if (fragments.length === 0) return null;
      const prefix = typeof tagName === 'string' && tagName ? tagName.toLowerCase() : '';
      try { return root.querySelector(`${prefix}${fragments.join('')}`); } catch (e) { return null; }
    }

    function resolveDomLocator(locator) {
      if (!locator || typeof locator !== 'object') return null;
      const tagName = typeof locator.tag === 'string' ? locator.tag : '';
      if (typeof locator.id === 'string' && locator.id) {
        const byId = document.getElementById(locator.id);
        if (byId instanceof HTMLElement) return byId;
      }
      if (typeof locator.syncKey === 'string' && locator.syncKey) {
        const bySync = findBySyncKey(locator.syncKey);
        if (bySync instanceof HTMLElement) return bySync;
      }
      if (locator.dataset) {
        const byDataset = findByDataset(locator.dataset, tagName);
        if (byDataset instanceof HTMLElement) return byDataset;
      }
      if (typeof locator.anchorId === 'string' && locator.anchorId) {
        const anchor = document.getElementById(locator.anchorId);
        if (anchor instanceof HTMLElement) {
          if (typeof locator.syncKey === 'string' && locator.syncKey) {
            const bySyncInAnchor = findBySyncKey(locator.syncKey, anchor);
            if (bySyncInAnchor instanceof HTMLElement) return bySyncInAnchor;
          }
          if (locator.dataset) {
            const byDatasetInAnchor = findByDataset(locator.dataset, tagName, anchor);
            if (byDatasetInAnchor instanceof HTMLElement) return byDatasetInAnchor;
          }
          if (Array.isArray(locator.targetPath)) {
            const byPath = resolveCursorTargetPath(anchor, locator.targetPath);
            if (byPath instanceof HTMLElement) return byPath;
          }
        }
      }
      return null;
    }

    function locatorKey(locator) {
      if (!locator || typeof locator !== 'object') return '';
      if (typeof locator.id === 'string' && locator.id) return `id:${locator.id}`;
      if (typeof locator.syncKey === 'string' && locator.syncKey) return `sync:${locator.syncKey}`;
      if (locator.dataset && typeof locator.dataset.type === 'string' && typeof locator.dataset.id === 'string') return `data:${locator.dataset.type}:${locator.dataset.id}`;
      if (typeof locator.anchorId === 'string' && Array.isArray(locator.targetPath)) return `path:${locator.anchorId}:${locator.targetPath.join('.')}`;
      return '';
    }

    function trimAppliedActions() {
      while (teacherAppliedActionIds.size > TEACHER_APPLIED_ACTION_LIMIT) {
        const oldest = teacherAppliedActionIds.values().next().value;
        teacherAppliedActionIds.delete(oldest);
      }
    }

    function updateTeacherSenderContext(senderId) {
      if (role !== 'teacher') return;
      if (typeof senderId !== 'string' || !senderId) return;
      if (activeStudentSenderId && activeStudentSenderId !== senderId) {
        teacherAppliedActionIds.clear();
        studentTracker.textContent = 'Student session changed. Sync reset.';
      }
      activeStudentSenderId = senderId;
    }

    function pushStudentDomAction(rawPayload) {
      if (!connected || role !== 'student') return;
      if (!rawPayload || !rawPayload.locator) return;
      const payload = { ...rawPayload, actionId: ++lastStudentDomActionId };
      sendEvent('student_dom_action', payload);
      studentDomActionLog.push(payload);
      if (studentDomActionLog.length > STUDENT_DOM_ACTION_LOG_LIMIT) studentDomActionLog.shift();
    }

    function flushPendingStudentInputActions() {
      if (pendingStudentInputTimer) { window.clearTimeout(pendingStudentInputTimer); pendingStudentInputTimer = null; }
      if (pendingStudentInputActions.size === 0) return;
      const actions = Array.from(pendingStudentInputActions.values());
      pendingStudentInputActions.clear();
      actions.forEach(action => pushStudentDomAction(action));
    }

    function queueStudentDomAction(rawPayload, throttled = false) {
      if (!rawPayload || !rawPayload.locator) return;
      if (!throttled) { pushStudentDomAction(rawPayload); return; }
      const key = `${rawPayload.kind}:${locatorKey(rawPayload.locator)}`;
      pendingStudentInputActions.set(key, rawPayload);
      if (pendingStudentInputTimer) return;
      pendingStudentInputTimer = window.setTimeout(() => {
        pendingStudentInputTimer = null;
        if (pendingStudentInputActions.size === 0) return;
        const actions = Array.from(pendingStudentInputActions.values());
        pendingStudentInputActions.clear();
        actions.forEach(action => pushStudentDomAction(action));
      }, STUDENT_INPUT_THROTTLE_MS);
    }

    function buildFormActionPayload(kind, element) {
      if (!(element instanceof HTMLElement)) return null;
      const locator = buildDomLocator(element);
      if (!locator) return null;
      const payload = { kind, locator };
      if (element instanceof HTMLInputElement) {
        payload.value = element.value;
        if (element.type === 'checkbox' || element.type === 'radio') payload.checked = element.checked;
      } else if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        payload.value = element.value;
      }
      return payload;
    }

    function sendStudentSnapshot(reason = 'request') {
      if (!connected || role !== 'student') return;
      flushPendingStudentInputActions();
      sendEvent('student_state_snapshot', { reason, upToActionId: lastStudentDomActionId, actions: studentDomActionLog.slice() });
    }

    function applyStudentDomAction(payload) {
      if (role !== 'teacher') return false;
      if (!payload || typeof payload !== 'object') return false;
      const actionId = Number(payload.actionId);
      if (!Number.isInteger(actionId) || actionId <= 0) return false;
      if (teacherAppliedActionIds.has(actionId)) return false;
      teacherAppliedActionIds.add(actionId);
      trimAppliedActions();
      lastStudentPresenceAt = Date.now();
      const target = resolveDomLocator(payload.locator);
      if (!(target instanceof HTMLElement)) {
        studentTracker.textContent = `Student action #${actionId}: target not found.`;
        return false;
      }
      if (payload.kind === 'click') {
        if (typeof target.click === 'function') target.click();
      } else if (payload.kind === 'input' || payload.kind === 'change') {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
          if (typeof payload.value === 'string') target.value = payload.value;
          else if (typeof payload.value === 'number') target.value = String(payload.value);
          if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') && typeof payload.checked === 'boolean') target.checked = payload.checked;
          target.dispatchEvent(new Event(payload.kind === 'input' ? 'input' : 'change', { bubbles: true }));
        }
      } else { return false; }
      if (payload.kind !== 'input') flashElement(target);
      studentTracker.textContent = `Student action: ${payload.kind} on ${describeElement(target)}.`;
      return true;
    }

    function applyStudentSnapshot(payload) {
      const actions = Array.isArray(payload && payload.actions) ? payload.actions : [];
      if (actions.length === 0) { studentTracker.textContent = 'Student snapshot received: no actions yet.'; return; }
      const sorted = [...actions].sort((a, b) => (Number(a && a.actionId) || 0) - (Number(b && b.actionId) || 0));
      let applied = 0;
      sorted.forEach(action => { if (applyStudentDomAction(action)) applied += 1; });
      studentTracker.textContent = `Student snapshot applied: ${applied}/${sorted.length} actions.`;
    }

    function blockTeacherLessonInteraction(event) {
      if (!(connected && role === 'teacher')) return;
      if (!event.isTrusted) return;
      if (!(event.target instanceof HTMLElement)) return;
      if (!isLessonSyncTarget(event.target)) return;
      const interactive = event.target.closest('button, input, textarea, select, [contenteditable="true"]');
      if (!interactive) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      studentTracker.textContent = 'Read-only mirror: student controls this lesson area.';
    }

    function getMostVisibleSectionId() {
      let best = ''; let bestVisible = -1;
      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        if (visible > bestVisible) { bestVisible = visible; best = section.id; }
      });
      return best || (sections[0] && sections[0].id) || 'warmup';
    }

    function flashElement(element) {
      if (!(element instanceof HTMLElement)) return;
      element.classList.add('teacher-highlight');
      window.setTimeout(() => { element.classList.remove('teacher-highlight'); }, 2400);
    }

    function sendEvent(type, payload) {
      if (!connected) return;
      const roomId = roomInput.value.trim();
      if (!roomId) return;
      fetch('/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, senderId: clientId, role, type, payload }),
      }).catch(() => {});
    }

    function clamp01(value) { return Math.max(0, Math.min(1, value)); }

    function buildCursorTargetPath(anchor, target) {
      if (!(anchor instanceof HTMLElement) || !(target instanceof HTMLElement)) return [];
      if (anchor === target) return [];
      if (!anchor.contains(target)) return [];
      const path = []; let node = target;
      while (node && node !== anchor) {
        const parent = node.parentElement;
        if (!parent) return [];
        const index = Array.prototype.indexOf.call(parent.children, node);
        if (index < 0) return [];
        path.push(index); node = parent;
      }
      if (node !== anchor) return [];
      return path.reverse();
    }

    function resolveCursorTargetPath(anchor, path) {
      if (!(anchor instanceof HTMLElement)) return null;
      if (!Array.isArray(path) || path.length === 0) return anchor;
      let node = anchor;
      for (const rawIndex of path) {
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || index < 0 || index >= node.children.length) return anchor;
        const nextNode = node.children[index];
        if (!(nextNode instanceof HTMLElement)) return anchor;
        node = nextNode;
      }
      return node;
    }

    function pickCursorTarget(anchor, initialElement) {
      if (!(anchor instanceof HTMLElement)) return null;
      let node = initialElement instanceof HTMLElement ? initialElement : null;
      while (node && node !== anchor) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return node;
        node = node.parentElement;
      }
      const anchorRect = anchor.getBoundingClientRect();
      if (anchorRect.width > 0 && anchorRect.height > 0) return anchor;
      return null;
    }

    function sendCursor(clientX, clientY) {
      if (!connected) return;
      if (role !== 'student' && role !== 'teacher') return;
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;
      const now = Date.now();
      if (now - cursorLastSentAt < 90) return;
      cursorLastSentAt = now;
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return;
      const anchor = el.closest('.section, .exercise, .control-block');
      if (!(anchor instanceof HTMLElement) || !anchor.id) return;
      const target = pickCursorTarget(anchor, el);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratioX = clamp01((clientX - rect.left) / rect.width);
      const ratioY = clamp01((clientY - rect.top) / rect.height);
      const isTeacher = role === 'teacher';
      sendEvent(isTeacher ? 'teacher_cursor' : 'student_cursor', {
        anchorId: anchor.id,
        targetPath: buildCursorTargetPath(anchor, target),
        targetRatioX: Math.round(ratioX * 10000) / 10000,
        targetRatioY: Math.round(ratioY * 10000) / 10000,
        label: isTeacher ? 'Teacher cursor' : 'Student cursor',
      });
    }

    function sendPresence(reason = 'activity') {
      if (!connected || role !== 'student') return;
      const activeSection = getMostVisibleSectionId();
      const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const scrollProgress = Number((window.scrollY / maxScroll).toFixed(3));
      sendEvent('student_presence', { reason, activeSection, focusLabel, scrollProgress });
    }

    function queuePresence(reason = 'activity') {
      if (presenceTimer) return;
      presenceTimer = window.setTimeout(() => { presenceTimer = null; sendPresence(reason); }, 220);
    }

    function describeElement(element) {
      if (!(element instanceof HTMLElement)) return 'none';
      if (element.id) return `#${element.id}`;
      if (element.dataset && element.dataset.syncKey) return `${element.tagName.toLowerCase()}[${element.dataset.syncKey}]`;
      if (element.placeholder) return `${element.tagName.toLowerCase()} (${element.placeholder.slice(0, 24)})`;
      const text = (element.textContent || '').trim().slice(0, 28);
      if (text) return `${element.tagName.toLowerCase()} "${text}"`;
      return element.tagName.toLowerCase();
    }

    function renderRemoteCursor(payload, fallbackLabel, remoteRole) {
      lastRemoteCursorPayload = payload;
      lastRemoteCursorLabel = fallbackLabel;
      lastRemoteCursorRole = remoteRole;
      const label = payload.label || fallbackLabel;
      let vx, vy;
      if (payload.anchorId) {
        const anchor = document.getElementById(payload.anchorId);
        if (!(anchor instanceof HTMLElement)) { hideRemoteCursor(); return; }
        const target = resolveCursorTargetPath(anchor, payload.targetPath);
        if (!(target instanceof HTMLElement)) { hideRemoteCursor(); return; }
        let rect = target.getBoundingClientRect();
        if ((rect.width === 0 || rect.height === 0) && target !== anchor) rect = anchor.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) { hideRemoteCursor(); return; }
        const ratioX = typeof payload.targetRatioX === 'number' ? clamp01(payload.targetRatioX) : 0.5;
        const ratioY = typeof payload.targetRatioY === 'number' ? clamp01(payload.targetRatioY) : 0.5;
        vx = rect.left + ratioX * rect.width;
        vy = rect.top + ratioY * rect.height;
      } else { hideRemoteCursor(); return; }
      const inView = vx >= -20 && vx <= window.innerWidth + 20 && vy >= -20 && vy <= window.innerHeight + 20;
      remoteCursor.classList.remove('role-student', 'role-teacher');
      if (remoteRole === 'student' || remoteRole === 'teacher') remoteCursor.classList.add(`role-${remoteRole}`);
      if (inView) {
        remoteCursor.classList.add('visible');
        remoteCursor.style.transform = `translate(${Math.round(vx) - REMOTE_CURSOR_CENTER_OFFSET}px, ${Math.round(vy) - REMOTE_CURSOR_CENTER_OFFSET}px)`;
      } else { remoteCursor.classList.remove('visible'); }
      const labelNode = remoteCursor.querySelector('.remote-cursor-label');
      if (labelNode) labelNode.textContent = label;
    }

    function rerenderRemoteCursor() {
      if (!lastRemoteCursorPayload) return;
      renderRemoteCursor(lastRemoteCursorPayload, lastRemoteCursorLabel, lastRemoteCursorRole);
    }

    function handleTeacherCommand(message) {
      if (role !== 'student') return;
      if (message.type === 'teacher_state_request') { sendStudentSnapshot('teacher-request'); return; }
      if (message.type === 'teacher_cursor') { renderRemoteCursor(message.payload || {}, 'Teacher', 'teacher'); return; }
      if (message.type === 'teacher_goto') {
        const targetId = message.payload && message.payload.targetId;
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        flashElement(target);
        return;
      }
      if (message.type === 'teacher_highlight_selector') {
        const selector = message.payload && message.payload.selector;
        if (!selector) return;
        let nodes = [];
        try { nodes = Array.from(document.querySelectorAll(selector)); } catch (e) { return; }
        if (nodes.length === 0) return;
        nodes.slice(0, 6).forEach(node => flashElement(node));
        const first = nodes[0];
        if (first instanceof HTMLElement) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (message.type === 'teacher_spotlight_word') {
        const word = message.payload && message.payload.word;
        if (!word) return;
        const nodes = Array.from(document.querySelectorAll(`[data-word="${cssEscape(word)}"]`));
        if (nodes.length === 0) return;
        nodes.forEach(node => flashElement(node));
        const first = nodes[0];
        if (first instanceof HTMLElement) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function handleTeacherView(message) {
      if (role !== 'teacher') return;
      updateTeacherSenderContext(message.senderId);
      if (message.type === 'student_dom_action') { applyStudentDomAction(message.payload || {}); return; }
      if (message.type === 'student_state_snapshot') { applyStudentSnapshot(message.payload || {}); return; }
      if (message.type === 'student_presence') {
        const payload = message.payload || {};
        const active = payload.activeSection || 'unknown';
        const focus = payload.focusLabel || 'none';
        const scroll = typeof payload.scrollProgress === 'number' ? `${Math.round(payload.scrollProgress * 100)}%` : '?';
        const reason = payload.reason || 'activity';
        lastStudentPresenceAt = Date.now();
        studentTracker.textContent = `Student: section "${active}", focus "${focus}", scroll ${scroll}, event "${reason}".`;
        return;
      }
      if (message.type === 'student_cursor') { renderRemoteCursor(message.payload || {}, 'Student', 'student'); return; }
    }

    function connectSync() {
      const roomId = roomInput.value.trim();
      if (!roomId) { setSyncStatus('Status: enter room code first.'); return; }
      if (connected) return;
      if (role === 'teacher') { teacherAppliedActionIds.clear(); activeStudentSenderId = ''; }
      const params = new URLSearchParams({ room: roomId, role, clientId });
      eventSource = new EventSource(`/events?${params.toString()}`);
      setSyncStatus(`Status: connecting to room "${roomId}" as ${role}...`);
      eventSource.onopen = () => {
        connected = true;
        updateUrlParams();
        setSyncStatus(`Status: online in room "${roomId}" as ${role}.`);
        updateTeacherReadonlyState();
        sendPresence('connected');
        if (role === 'student') {
          presenceTicker = window.setInterval(() => sendPresence('heartbeat'), 3500);
          sendStudentSnapshot('student-connected');
        }
        if (role === 'teacher') sendEvent('teacher_state_request', { reason: 'connected' });
      };
      eventSource.addEventListener('lesson', event => {
        let data;
        try { data = JSON.parse(event.data); } catch (e) { return; }
        if (!data || data.senderId === clientId) return;
        handleTeacherCommand(data);
        handleTeacherView(data);
      });
      eventSource.onerror = () => {
        setSyncStatus('Status: connection issue, trying to reconnect...');
        connected = false;
        updateTeacherReadonlyState();
      };
    }

    function disconnectSync() {
      connected = false;
      if (eventSource) { eventSource.close(); eventSource = null; }
      if (presenceTicker) { window.clearInterval(presenceTicker); presenceTicker = null; }
      if (pendingStudentInputTimer) { window.clearTimeout(pendingStudentInputTimer); pendingStudentInputTimer = null; }
      pendingStudentInputActions.clear();
      if (role === 'teacher') activeStudentSenderId = '';
      hideRemoteCursor();
      updateTeacherReadonlyState();
      setSyncStatus('Status: offline.');
    }

    /* ===== Build teacher dashboard dynamically from lesson meta ===== */
    (meta.sectionIds || []).forEach(id => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const title = (meta.sectionTitles && meta.sectionTitles[id]) || id;
      btn.textContent = title.replace(/^\d+\)\s*/, '');
      btn.dataset.target = id;
      btn.addEventListener('click', () => {
        if (role !== 'teacher') return;
        sendEvent('teacher_goto', { targetId: id });
      });
      gotoGrid.appendChild(btn);
    });

    (meta.vocabTerms || []).forEach(word => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'alt';
      btn.textContent = `Spotlight: ${word}`;
      btn.addEventListener('click', () => {
        if (role !== 'teacher') return;
        sendEvent('teacher_spotlight_word', { word });
      });
      wordSpotlightGrid.appendChild(btn);
    });

    /* ===== Sync shell event listeners ===== */
    connectBtn.addEventListener('click', () => {
      if (connected) { disconnectSync(); connectBtn.textContent = 'Connect'; }
      else { connectSync(); connectBtn.textContent = 'Disconnect'; }
    });

    roleSelect.addEventListener('change', () => {
      if (connected) disconnectSync();
      connectBtn.textContent = 'Connect';
      applyRoleUi();
      updateUrlParams();
      refreshStudentLinkMeta();
    });

    roomInput.addEventListener('input', () => { updateUrlParams(); refreshStudentLinkMeta(); });

    copyLinkBtn.addEventListener('click', async () => {
      const link = getStudentLink();
      if (!link) { setSyncStatus('Status: enter room code first.'); return; }
      try { await navigator.clipboard.writeText(link); setSyncStatus('Status: student link copied.'); }
      catch (e) { setSyncStatus(`Copy failed. Link: ${link}`); }
    });

    syncShellToggle.addEventListener('click', () => { setSyncShellCollapsed(!syncShellCollapsed); });

    bringToMeBtn.addEventListener('click', () => {
      if (role !== 'teacher') return;
      sendEvent('teacher_goto', { targetId: getMostVisibleSectionId() });
    });

    selectorBtn.addEventListener('click', () => {
      if (role !== 'teacher') return;
      const selector = selectorInput.value.trim();
      if (!selector) return;
      sendEvent('teacher_highlight_selector', { selector });
    });

    ['pointerdown', 'click', 'input', 'change', 'keydown', 'submit'].forEach(eventName => {
      document.addEventListener(eventName, blockTeacherLessonInteraction, true);
    });

    document.addEventListener('focusin', event => { focusLabel = describeElement(event.target); queuePresence('focus'); });

    document.addEventListener('click', event => {
      if (connected && role === 'student' && event.target instanceof HTMLElement) {
        const clickTarget = event.target.closest('button, input[type="checkbox"], input[type="radio"]');
        if (clickTarget instanceof HTMLElement && isLessonSyncTarget(clickTarget)) {
          const payload = buildFormActionPayload('click', clickTarget);
          if (payload) queueStudentDomAction(payload);
        }
      }
      queuePresence('click');
    });

    document.addEventListener('input', event => {
      if (!(connected && role === 'student')) return;
      if (!(event.target instanceof HTMLElement)) return;
      if (!isLessonSyncTarget(event.target)) return;
      if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
      const payload = buildFormActionPayload('input', event.target);
      if (!payload) return;
      queueStudentDomAction(payload, true);
    }, true);

    document.addEventListener('change', event => {
      if (!(connected && role === 'student')) return;
      if (!(event.target instanceof HTMLElement)) return;
      if (!isLessonSyncTarget(event.target)) return;
      if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLSelectElement)) return;
      const payload = buildFormActionPayload('change', event.target);
      if (!payload) return;
      queueStudentDomAction(payload);
    }, true);

    window.addEventListener('scroll', () => {
      queuePresence('scroll');
      if (lastClientX >= 0) { cursorLastSentAt = 0; sendCursor(lastClientX, lastClientY); }
      rerenderRemoteCursor();
    }, { passive: true });

    window.addEventListener('resize', () => { rerenderRemoteCursor(); }, { passive: true });

    if (window.visualViewport) {
      const handleVisualViewportChange = () => {
        if (lastClientX >= 0) { cursorLastSentAt = 0; sendCursor(lastClientX, lastClientY); }
        rerenderRemoteCursor();
      };
      window.visualViewport.addEventListener('resize', handleVisualViewportChange, { passive: true });
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange, { passive: true });
    }

    const hasPointerEvents = typeof window.PointerEvent === 'function';
    if (hasPointerEvents) {
      document.addEventListener('pointerdown', event => {
        if (event.isPrimary === false) return;
        lastClientX = event.clientX; lastClientY = event.clientY;
        sendCursor(event.clientX, event.clientY);
      }, { passive: true });
      document.addEventListener('pointermove', event => {
        if (event.isPrimary === false) return;
        lastClientX = event.clientX; lastClientY = event.clientY;
        sendCursor(event.clientX, event.clientY);
      }, { passive: true });
    } else {
      document.addEventListener('mousemove', event => {
        lastClientX = event.clientX; lastClientY = event.clientY;
        sendCursor(event.clientX, event.clientY);
      });
      document.addEventListener('touchstart', event => {
        const touch = event.touches[0] || event.changedTouches[0];
        if (!touch) return;
        lastClientX = touch.clientX; lastClientY = touch.clientY;
        sendCursor(touch.clientX, touch.clientY);
      }, { passive: true });
      document.addEventListener('touchmove', event => {
        const touch = event.touches[0] || event.changedTouches[0];
        if (!touch) return;
        lastClientX = touch.clientX; lastClientY = touch.clientY;
        sendCursor(touch.clientX, touch.clientY);
      }, { passive: true });
    }

    window.setInterval(() => {
      if (role !== 'teacher') return;
      if (!lastStudentPresenceAt) return;
      const diffSec = Math.floor((Date.now() - lastStudentPresenceAt) / 1000);
      if (diffSec > 7) studentTracker.textContent = `Student activity: last update ${diffSec}s ago.`;
    }, 2500);

    applyRoleUi();
    updateUrlParams();
    refreshStudentLinkMeta();
    if (autoConnect && roomInput.value.trim()) { connectSync(); connectBtn.textContent = 'Disconnect'; }

    return { connectSync, disconnectSync };
  }

  window.__initLessonSync = initLessonSync;
})();
