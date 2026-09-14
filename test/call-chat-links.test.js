'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendLinkedText } = require('../assets/call-chat-links.js');

function render(source) {
  const children = [];
  const documentRef = {
    createTextNode: textContent => ({ type: 'text', textContent }),
    createElement: type => ({ type }),
  };
  appendLinkedText({ append: node => children.push(node) }, source, documentRef);
  assert.equal(children.map(node => node.textContent).join(''), source, 'preserves all original text');
  return children.filter(node => node.type === 'a');
}

test('chat links HTTP, HTTPS and www addresses and opens them safely in another tab', () => {
  const links = render('Материалы: https://example.com/a?x=1&y=2\nhttp://example.org www.example.net');
  assert.deepEqual(links.map(link => link.href), [
    'https://example.com/a?x=1&y=2', 'http://example.org/', 'https://www.example.net/',
  ]);
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
});

test('chat links exclude sentence punctuation and unmatched brackets but preserve URL brackets', () => {
  const links = render('(https://example.com/wiki/Test_(one)). [www.example.org/a], «https://пример.рф/урок»!');
  assert.deepEqual(links.map(link => link.textContent), [
    'https://example.com/wiki/Test_(one)', 'www.example.org/a', 'https://пример.рф/урок',
  ]);
});

test('chat leaves HTML, unsupported schemes, incomplete URLs and plain text inert', () => {
  assert.deepEqual(render('<img src=x onerror=alert(1)>\n<script>alert(1)</script> javascript:alert(1) data:text/html,test ftp://www.example.com user@www.example.com https://'), []);
  const links = render('<b>https://example.com</b> & обычный текст');
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'https://example.com');
});

test('chat handles uppercase schemes, long addresses and messages without links', () => {
  assert.equal(render('HTTPS://EXAMPLE.COM/path')[0].href, 'https://example.com/path');
  const long = `https://example.com/${'a'.repeat(9000)}`;
  assert.equal(render(long)[0].textContent, long);
  assert.deepEqual(render('Обычное сообщение\nсо второй строкой'), []);
  assert.deepEqual(render(''), []);
});
