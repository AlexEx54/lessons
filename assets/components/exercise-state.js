(function initExerciseState(root) {
  'use strict';

  function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
  function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function answersMatch(value, answer) {
    const comparable = text => typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '';
    return Boolean(comparable(value)) && comparable(value) === comparable(answer);
  }
  function gapAnswersMatch(value, answer) {
    const apostrophes = text => typeof text === 'string' ? text.replace(/[\u2018\u2019\u02BC]/g, "'") : '';
    return answersMatch(apostrophes(value), apostrophes(answer));
  }
  function selectionState(value, answer) { return !value ? 'empty' : value === answer ? 'correct' : 'wrong'; }
  // Stable layouts keep word order and identifiers consistent across clients.
  function createLayout(component, id = () => root.crypto.randomUUID()) {
    const indexes = component.items.map((_, index) => index);
    return {
      order: shuffle(indexes),
      ...(component.type === 'matchWords' ? { wordIds: indexes.map(id), pictureIds: indexes.map(id) } : {}),
    };
  }
  function presentation(component, layout) {
    const { type, id, title, instruction } = component;
    const base = { type, id, title, instruction };
    if (type === 'matchWords') {
      return { ...base,
        answerKey: Object.fromEntries(layout.wordIds.map((wordId, index) => [wordId, layout.pictureIds[index]])),
        items: layout.order.map(index => ({ id: layout.wordIds[index], term: component.items[index].term })),
        targets: component.items.map((item, index) => ({ id: layout.pictureIds[index], ...(item.imageSrc ? { imageSrc: item.imageSrc } : {}) })),
      };
    }
    if (type === 'dropdownChoice') return { ...base, text: component.text, accentColor: component.accentColor || '#17182D', answerKey: Object.fromEntries(component.choices.map(choice => [choice.id, choice.answer])), choices: component.choices.map(({ id, options }) => ({ id, options })) };
    if (type === 'fillInBlanks') return { ...base, items: component.items.map(({ id, before, after }) => ({ id, before, after })), wordBank: layout.order.map(index => component.items[index].answer) };
    return component;
  }
  function apply(component, previous = {}, action, layout) {
    if (component.type === 'dragWordsInText') {
      const inline = root.InlineGapText || (typeof require === 'function' ? require('./inline-gap-text.js') : null);
      const gaps = inline.parseMarkedText(component.text, { maximum: 8 }).filter(part => part.type === 'gap').map(part => part.token);
      const placed = previous.placed || {};
      const available = word => component.words.includes(word) && !Object.values(placed).includes(word);
      if (action.type === 'select-word') {
        if (action.itemId !== null && !available(action.itemId)) fail('Слово недоступно.');
        return { ...previous, selectedId: action.itemId };
      }
      if (action.type !== 'place-word') fail('Неизвестное действие.');
      const index = gaps.findIndex((_, index) => action.itemId === `gap-${index + 1}`);
      if (index < 0 || placed[action.itemId] || !available(action.value)) fail('Пропуск или слово недоступны.');
      const correct = gaps[index] === action.value;
      return { ...previous, selectedId: null,
        placed: correct ? { ...placed, [action.itemId]: action.value } : placed,
        attempt: { ...(action.attemptId ? { id: action.attemptId } : {}),
          sequence: (previous.attempt?.sequence || 0) + 1, itemId: action.itemId, value: action.value, correct },
      };
    }
    if (component.type === 'matchWords') {
      const words = layout?.wordIds || component.items.map(item => item.id);
      const pictures = layout?.pictureIds || (component.targets || component.items).map(item => item.id);
      const matches = previous.matches || {};
      if (action.type === 'select-word') {
        if (action.itemId !== null && (!words.includes(action.itemId) || matches[action.itemId])) fail('Слово недоступно.');
        return { ...previous, selectedId: action.itemId };
      }
      if (action.type !== 'match-word') fail('Неизвестное действие.');
      const index = words.indexOf(action.itemId), targetIndex = pictures.indexOf(action.targetId);
      if (index < 0 || targetIndex < 0 || matches[action.itemId] || Object.values(matches).includes(action.targetId)) fail('Пара недоступна.');
      const correct = layout ? index === targetIndex : component.answerKey ? component.answerKey[action.itemId] === action.targetId : index === targetIndex;
      return { ...previous, selectedId: null,
        matches: correct ? { ...matches, [action.itemId]: action.targetId } : matches,
        attempt: { ...(action.attemptId ? { id: action.attemptId } : {}), sequence: (previous.attempt?.sequence || 0) + 1, itemId: action.itemId, targetId: action.targetId, correct },
      };
    }
    if (component.type === 'multipleChoice' || component.type === 'oddOneOut') {
      if (action.type !== 'choose-option') fail('Неизвестное действие.');
      const item = component.items.find(item => item.id === action.itemId);
      if (!item || !item.options.includes(action.value)) fail('Вариант не найден.');
      if (previous.answers?.[item.id]?.status === 'correct') fail('Ответ уже верный.');
      return { ...previous, answers: { ...previous.answers, [item.id]: {
        value: action.value, status: selectionState(action.value, item.answer),
      } } };
    }
    if (component.type === 'checkboxChoice') {
      if (action.type !== 'choose-option') fail('Неизвестное действие.');
      const item = component.items.find(item => item.id === action.itemId);
      if (!item || !item.options.includes(action.value)) fail('Вариант не найден.');
      const answer = previous.answers?.[item.id];
      const values = answer?.values || [];
      if (answer?.status === 'correct') fail('Ответ уже верный.');
      if (values.includes(action.value)) fail('Вариант уже выбран.');
      const nextValues = [...values, action.value];
      return { ...previous, answers: { ...previous.answers, [item.id]: {
        values: nextValues,
        status: item.answers.every(value => nextValues.includes(value)) ? 'correct' : 'wrong',
      } } };
    }
    if (component.type === 'dropdownChoice') {
      if (action.type !== 'choose-word') fail('Неизвестное действие.');
      const choice = component.choices.find(item => item.id === action.itemId);
      if (!choice || (action.value !== '' && !choice.options.includes(action.value))) fail('Вариант не найден.');
      if (previous.answers?.[choice.id]?.status === 'correct') fail('Ответ уже верный.');
      return { ...previous, answers: { ...previous.answers, [choice.id]: { value: action.value, status: selectionState(action.value, choice.answer ?? component.answerKey?.[choice.id]) } } };
    }
    if (component.type === 'gapFill' || component.type === 'miniSituation') {
      if (action.type !== 'type-answer' || typeof action.value !== 'string' || action.value.length > 1000) fail('Некорректный ответ.');
      const gap = component.type === 'gapFill' && component.gaps.find(item => item.id === action.itemId);
      const valid = component.type === 'gapFill' ? gap
        : Array.from({ length: component.sentenceCount }, (_, index) => `sentence-${index + 1}`).includes(action.itemId);
      if (!valid) fail('Поле не найдено.');
      return { ...previous, answers: { ...previous.answers, [action.itemId]: {
        value: action.value,
        ...(gap ? { status: gapAnswersMatch(action.value, gap.answer) ? 'correct' : 'pending' } : {}),
      } } };
    }
    if (component.type === 'fillInBlanks') {
      if (action.type !== 'type-answer') fail('Неизвестное действие.');
      const item = component.items.find(item => item.id === action.itemId);
      if (!item || typeof action.value !== 'string' || action.value.length > 1000) fail('Некорректный ответ.');
      return { ...previous, answers: { ...previous.answers, [item.id]: { value: action.value, status: answersMatch(action.value, item.answer) ? 'correct' : 'pending' } } };
    }
    if (component.type === 'describeAndGuess') {
      if (action.type !== 'set-crossed' || !component.items.some(item => item.id === action.itemId) || typeof action.crossed !== 'boolean') fail('Некорректная отметка слова.');
      return { ...previous, crossed: { ...previous.crossed, [action.itemId]: action.crossed } };
    }
    fail('Неизвестное упражнение.');
  }
  const api = { apply, presentation, createLayout, shuffle, answersMatch, gapAnswersMatch, selectionState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ExerciseState = api;
})(typeof window !== 'undefined' ? window : globalThis);
