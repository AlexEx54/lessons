/* The session's right panel: the call and the chat as two tabs, a column on wide screens and a mini window on narrow ones.
   It opens on the call; the chat tab only hides the call section, so the peer's sound keeps playing.
   Collapsing is remembered between visits, the tab is not. */
(() => {
  'use strict';

  const COLLAPSED_KEY = 'easyclass.sessionCallCollapsed';
  const TABS = ['call', 'chat'];

  function readCollapsed() {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch (_error) {
      return false;
    }
  }

  function writeCollapsed(collapsed) {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_error) {
      // The panel still opens and closes; only the next visit forgets the choice.
    }
  }

  // role is 'teacher' or 'student'; notify(text) shows the lesson page's toast.
  // A group session has only the chat until group calls arrive.
  // Returns what the lesson socket feeds in: call presence and chat messages, and a chat sync after each snapshot.
  function create({ sessionId, role, notify, group = false }) {
    const byId = id => document.getElementById(id);
    const panel = byId('call-panel');
    const toggle = byId('call-toggle');
    const toggleLabel = byId('call-toggle-label');
    const toggleBadge = byId('call-toggle-badge');
    const tabBadge = byId('chat-tab-badge');
    const tabs = { call: byId('call-tab'), chat: byId('chat-tab') };
    const sections = { call: byId('call-section'), chat: byId('chat-section') };
    const shown = group ? ['chat'] : TABS;
    let tab = shown[0];
    tabs.call.hidden = group;
    // The header button opens the chat, so it shows a speech bubble instead of the camera.
    if (group) toggle.querySelector('path').setAttribute('d', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12Z');
    let unread = 0;
    let callState = { joined: false, peerIn: false, peerName: '' };

    function render() {
      const open = !panel.hidden;
      document.body.classList.toggle('lesson-call-open', open);
      document.body.classList.toggle('lesson-chat-open', open && tab === 'chat');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.dataset.call = callState.joined ? 'joined' : (callState.peerIn ? 'peer' : '');
      toggleLabel.textContent = group ? 'Чат' : callState.joined ? 'В звонке' : 'Звонок';
      toggle.title = !callState.joined && callState.peerIn ? `${callState.peerName} уже в звонке` : toggleLabel.textContent;
      TABS.forEach(name => {
        tabs[name].setAttribute('aria-selected', String(tab === name));
        tabs[name].tabIndex = tab === name ? 0 : -1;
        sections[name].hidden = tab !== name;
      });
      const count = unread > 99 ? '99+' : (unread ? String(unread) : '');
      tabBadge.hidden = !unread;
      tabBadge.textContent = count;
      // The tab shows the count while the panel is open; the header button only while it is collapsed.
      toggleBadge.hidden = !unread || open;
      toggleBadge.textContent = count;
      toggle.setAttribute('aria-label', unread && !open ? `${toggleLabel.textContent}, новых сообщений: ${count}` : toggleLabel.textContent);
    }

    const chat = window.CallChat.create({
      container: sections.chat, params: { role },
      endpoint: `/api/sessions/${sessionId}/chat`,
      onUnread: count => { unread = count; render(); },
    });
    const call = group ? null : window.SessionCall.create({
      sessionId, role, notify,
      onState: state => { callState = state; render(); },
    });

    // Each section learns whether it is on screen: the chat counts unread messages, the call closes its menus.
    function show() {
      const open = !panel.hidden;
      call?.setVisible(open && tab === 'call');
      chat.setVisible(open && tab === 'chat');
      render();
    }

    function setCollapsed(collapsed) {
      const hadFocus = panel.contains(document.activeElement);
      panel.hidden = collapsed;
      writeCollapsed(collapsed);
      show();
      if (collapsed && hadFocus) toggle.focus();
    }

    function select(name, focus = false) {
      tab = name;
      show();
      if (focus) tabs[name].focus();
    }

    toggle.hidden = false;
    toggle.addEventListener('click', () => setCollapsed(!panel.hidden));
    byId('call-panel-collapse').addEventListener('click', () => setCollapsed(true));
    shown.forEach(name => tabs[name].addEventListener('click', () => select(name)));
    byId('call-panel-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      select(event.key === 'Home' ? shown[0] : event.key === 'End' ? shown.at(-1) : shown[(shown.indexOf(tab) + 1) % shown.length], true);
    });

    panel.hidden = readCollapsed();
    show();

    return { presence: presence => call?.presence(presence), receiveChat: message => chat.receive(message), syncChat: chat.sync };
  }

  window.SessionPanel = { create };
})();
