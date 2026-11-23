'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createDocument } = require('./helpers/lesson-dom.js');

// The chat's markup comes from a template; each selector it looks up gets its own element.
function setup() {
  const document = createDocument();
  const create = document.createElement;
  document.createElement = tag => {
    if (tag !== 'template') return create(tag);
    const parts = new Map();
    const content = create('fragment');
    content.querySelector = selector => {
      if (!parts.has(selector)) { const part = create('div'); parts.set(selector, part); content.append(part); }
      return parts.get(selector);
    };
    return { content };
  };
  const requests = [];
  global.document = document;
  global.window = { CallChatLinks: { appendLinkedText(node, text) { node.textContent = text; } } };
  global.fetch = (url, options) => new Promise(resolve => requests.push({ url, options,
    reply: value => resolve({ ok: true, status: 200, json: async () => value }) }));
  delete require.cache[require.resolve('../assets/call-chat.js')];
  require('../assets/call-chat.js');
  const unread = [];
  const container = create('section');
  const chat = global.window.CallChat.create({ container, endpoint: '/api/sessions/s/chat', params: { role: 'student' }, onUnread: count => unread.push(count) });
  const parts = container.children[0];
  const log = parts.querySelector('.chat-messages');
  const own = () => log.children.map(item => `${item.dataset.id}${item.classList.contains('chat-message--own') ? ' own' : ''}`);
  return { chat, parts, requests, unread, own };
}
const message = (id, fields) => ({ id, role: 'student', name: 'Маша', text: 'Hi', createdAt: '2099-01-01T10:00:00Z', attachments: [], ...fields });

test("a group student's chat tells their own messages by the server's mark, not by the role", async () => {
  const { chat, parts, requests, unread, own } = setup();
  chat.receive(message(1, { mine: true }), true);
  chat.receive(message(2, { name: 'Петя' }));
  assert.deepEqual(own(), ['1 own', '2']);
  assert.deepEqual(unread, [1], "another student's message is unread");

  // The lesson socket delivers the copy of a message being sent before the server answers the sending.
  parts.querySelector('textarea').value = 'On my way';
  parts.querySelector('.chat-form').listeners.submit[0]({ preventDefault() {} });
  const sending = requests.at(-1);
  const { clientId } = JSON.parse(sending.options.body);
  chat.receive(message(3, { clientId }));
  assert.deepEqual(own(), ['1 own', '2', '3 own']);
  assert.deepEqual(unread, [1], 'the own copy is not unread');
  sending.reply({ message: message(3, { clientId, mine: true }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(own(), ['1 own', '2', '3 own']);
});
