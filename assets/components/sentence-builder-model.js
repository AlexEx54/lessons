(function initSentenceBuilderModel(root) {
  'use strict';
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
  function keys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) fail('Некорректные поля Sentence Builder.');
  }
  function plain(value, maximum = 200) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[<>\[\]\r\n]/.test(value)) {
      fail(`Нужен обычный текст длиной до ${maximum} символов.`);
    }
    return value.trim().replace(/\s+/g, ' ');
  }
  function normalizeSentenceBuilder(data) {
    keys(data, ['type', 'id', 'title', 'instruction', 'hintsEnabled', 'completionText', 'items']);
    if (data.type !== 'sentenceBuilder' || (typeof data.id !== 'string' || !ID.test(data.id))) fail('Некорректный id игры.');
    if (typeof data.hintsEnabled !== 'boolean') fail('Укажите, разрешены ли подсказки.');
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) fail('Добавьте от 1 до 12 предложений.');
    const ids = new Set();
    const items = data.items.map(item => {
      keys(item, ['id', 'tokens', 'acceptedOrders']);
      if ((typeof item.id !== 'string' || !ID.test(item.id)) || ids.has(item.id)) fail('Id предложений должны быть уникальными.');
      ids.add(item.id);
      if (!Array.isArray(item.tokens) || item.tokens.length < 2 || item.tokens.length > 18) fail('В предложении должно быть от 2 до 18 карточек.');
      const tokenIds = new Set();
      const tokens = item.tokens.map(token => {
        keys(token, ['id', 'text']);
        if ((typeof token.id !== 'string' || !ID.test(token.id)) || tokenIds.has(token.id)) fail('Id карточек должны быть уникальными.');
        tokenIds.add(token.id);
        return { id: token.id, text: plain(token.text, 80) };
      });
      if (!Array.isArray(item.acceptedOrders) || !item.acceptedOrders.length || item.acceptedOrders.length > 8) fail('Нужно от 1 до 8 вариантов ответа.');
      const acceptedOrders = item.acceptedOrders.map(order => {
        if (!Array.isArray(order) || order.length !== tokens.length || new Set(order).size !== tokens.length
          || order.some(id => !tokenIds.has(id))) fail('Каждый ответ должен содержать все карточки ровно один раз.');
        return [...order];
      });
      return { id: item.id, tokens, acceptedOrders };
    });
    return { type: data.type, id: data.id, title: plain(data.title), instruction: plain(data.instruction, 500),
      hintsEnabled: data.hintsEnabled, completionText: plain(data.completionText), items };
  }
  // Brackets keep a phrase together on one card. Ordinary whitespace separates words.
  function splitSentence(line) {
    const pieces = String(line).match(/\[[^\[\]]+\][.,!?;:…]*|[^\s\[\]]+/g) || [];
    if (pieces.join('').replace(/\s/g, '') !== String(line).replace(/\s/g, '')) fail('Проверьте квадратные скобки вокруг фраз.');
    return pieces.map(piece => plain(piece.startsWith('[') ? piece.slice(1).replace(']', '') : piece, 80));
  }
  function itemFromText(text, id) {
    const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) fail('Введите предложение.');
    const tokens = splitSentence(lines[0]).map((text, i) => ({ id: `token-${i + 1}`, text }));
    const acceptedOrders = lines.map(line => {
      const remaining = [...tokens];
      const order = splitSentence(line).map(text => {
        const index = remaining.findIndex(token => token.text === text);
        if (index < 0) fail('Вариант ответа должен использовать те же карточки, включая регистр и знаки препинания.');
        return remaining.splice(index, 1)[0].id;
      });
      if (remaining.length) fail('В варианте ответа пропущены карточки.');
      return order;
    });
    return { id, tokens, acceptedOrders };
  }
  function itemToText(item) {
    return item.acceptedOrders.map(order => order.map(id => {
      const text = item.tokens.find(token => token.id === id).text;
      return /\s/.test(text) ? `[${text}]` : text;
    }).join(' ')).join('\n');
  }
  function createLayout(component, id, shuffle) {
    return { items: Object.fromEntries(component.items.map(item => [item.id, {
      tokenIds: item.tokens.map(id), order: shuffle(item.tokens.map((_, i) => i)),
    }])) };
  }
  function taskWithLayout(component, layout) {
    if (!layout) return component;
    return { ...component, items: component.items.map(item => {
      const row = layout.items[item.id];
      const ids = Object.fromEntries(item.tokens.map((token, i) => [token.id, row.tokenIds[i]]));
      return { ...item, tokens: row.order.map(i => ({ id: row.tokenIds[i], text: item.tokens[i].text })),
        acceptedOrders: item.acceptedOrders.map(order => order.map(id => ids[id])) };
    }) };
  }
  function presentation(component, layout) {
    const task = taskWithLayout(component, layout);
    return { ...task, items: task.items.map(({ id, tokens }) => ({ id, tokens })) };
  }
  function apply(component, previous = {}, action, layout) {
    const task = taskWithLayout(component, layout);
    const itemId = previous.currentItemId || task.items[0].id;
    const item = task.items.find(item => item.id === itemId);
    if (action.itemId !== itemId || previous.completed || !item) fail('Предложение уже изменилось.');
    const row = { placedIds: [], attempts: 0, hintsUsed: 0, solved: false, ...previous.items?.[itemId] };
    const placed = [...row.placedIds];
    const save = patch => ({ ...previous, currentItemId: itemId, items: { ...previous.items, [itemId]: { ...row, ...patch } } });
    if (action.type === 'next-sentence') {
      if (!row.solved) fail('Сначала соберите и проверьте предложение.');
      const next = task.items[task.items.indexOf(item) + 1];
      return { ...previous, currentItemId: next?.id || itemId, completed: !next };
    }
    if (row.solved) fail('Предложение уже собрано.');
    const token = item.tokens.find(token => token.id === action.tokenId);
    const motion = tokenId => ({ tokenId, sequence: (previous.motion?.sequence || 0) + 1,
      ...(action.actionId ? { id: action.actionId } : {}) });
    if (action.type === 'move-token' || action.type === 'return-token') {
      if (!token) fail('Карточка не найдена.');
      const index = placed.indexOf(token.id);
      if (action.type === 'return-token' && index < 0) fail('Карточка уже в наборе.');
      if (index >= 0) placed.splice(index, 1);
      if (action.type === 'move-token') {
        if (!Number.isInteger(action.toIndex) || action.toIndex < 0 || action.toIndex > placed.length) fail('Некорректная позиция карточки.');
        placed.splice(action.toIndex, 0, token.id);
      }
      return { ...save({ placedIds: placed, feedback: null }), motion: motion(token.id) };
    }
    if (!item.acceptedOrders) fail('Действие требует проверки сервером.');
    const text = id => item.tokens.find(token => token.id === id)?.text;
    const matches = (a, b) => text(a) === text(b);
    if (action.type === 'check-sentence') {
      if (placed.length !== item.tokens.length) fail('Используйте все карточки.');
      const correct = item.acceptedOrders.some(order => order.every((id, i) => matches(id, placed[i])));
      return save({ attempts: row.attempts + 1, solved: correct, feedback: correct ? 'correct' : 'wrong' });
    }
    if (action.type === 'request-hint') {
      if (!task.hintsEnabled) fail('Подсказки отключены.');
      const prefix = order => { let i = 0; while (i < order.length && matches(order[i], placed[i])) i++; return i; };
      const order = [...item.acceptedOrders].sort((a, b) => prefix(b) - prefix(a))[0];
      const index = prefix(order);
      if (index === order.length) return save({ feedback: 'ready' });
      // Equal-looking duplicate words are interchangeable; never disturb the correct prefix.
      const next = item.tokens.find(token => text(token.id) === text(order[index]) && !placed.slice(0, index).includes(token.id));
      const old = placed.indexOf(next.id);
      if (old >= 0) placed.splice(old, 1);
      placed.splice(index, 0, next.id);
      return { ...save({ placedIds: placed, hintsUsed: row.hintsUsed + 1, feedback: null }), motion: motion(next.id) };
    }
    fail('Неизвестное действие Sentence Builder.');
  }
  const api = { normalizeSentenceBuilder, splitSentence, itemFromText, itemToText, createLayout, presentation, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SentenceBuilderModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
