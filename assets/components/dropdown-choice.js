(function initDropdownChoiceComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;

  function plainText(value, field, preserveWhitespace = false) {
    const source = typeof value === 'string' ? value : '';
    const normalized = preserveWhitespace ? source : source.trim().replace(/\s+/g, ' ');
    if (!normalized.trim()) throw new Error(`DropdownChoice requires ${field}.`);
    if (MARKUP.test(normalized)) throw new Error(`DropdownChoice does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function normalizeDropdownChoice(data) {
    if (!data || data.type !== 'dropdownChoice' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('DropdownChoice requires type "dropdownChoice" and a kebab-case id.');
    }
    if (!Array.isArray(data.segments) || data.segments.length === 0) {
      throw new Error('DropdownChoice requires a non-empty segments array.');
    }

    const ids = new Set([data.id]);
    let choiceCount = 0;
    const segments = data.segments.map((segment) => {
      if (!segment || segment.type === 'text') {
        if (!segment || Object.keys(segment).some(key => !['type', 'text'].includes(key))) {
          throw new Error('DropdownChoice text segments only support type and text.');
        }
        return { type: 'text', text: plainText(segment.text, 'segment text', true) };
      }
      if (segment.type !== 'choice') {
        throw new Error(`DropdownChoice has unsupported segment type "${segment.type}".`);
      }
      if (Object.keys(segment).some(key => !['type', 'id', 'options', 'answer'].includes(key))) {
        throw new Error('DropdownChoice choice segments contain unsupported fields.');
      }
      if (!KEBAB_CASE.test(String(segment.id || '')) || ids.has(segment.id)) {
        throw new Error('DropdownChoice choice ids must be unique kebab-case values.');
      }
      ids.add(segment.id);
      choiceCount += 1;
      if (!Array.isArray(segment.options) || segment.options.length < 2) {
        throw new Error('DropdownChoice choices require at least two options.');
      }
      const options = segment.options.map(option => plainText(option, 'an option'));
      if (new Set(options).size !== options.length) {
        throw new Error('DropdownChoice options must be unique within each choice.');
      }
      const answer = plainText(segment.answer, 'an answer');
      if (!options.includes(answer)) {
        throw new Error('DropdownChoice answer must match one of its options.');
      }
      return { type: 'choice', id: segment.id, options, answer };
    });

    if (choiceCount < 1 || choiceCount > 12) {
      throw new Error('DropdownChoice requires between 1 and 12 choices.');
    }

    return {
      type: 'dropdownChoice',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      segments,
    };
  }

  function getSelectionState(value, answer) {
    if (!value) return 'empty';
    return value === answer ? 'correct' : 'wrong';
  }

  function renderDropdownChoice(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('DropdownChoice requires a document.');

    const current = normalizeDropdownChoice(data);
    const choices = current.segments.filter(segment => segment.type === 'choice');
    let correctCount = 0;

    const section = doc.createElement('section');
    section.className = 'dropdown-choice';
    section.dataset.componentId = current.id;
    section.setAttribute('aria-label', current.title);

    const title = doc.createElement('h2');
    title.className = 'dropdown-choice__title';
    title.textContent = current.title;
    const instruction = doc.createElement('p');
    instruction.className = 'dropdown-choice__instruction';
    instruction.textContent = current.instruction;
    const passage = doc.createElement('div');
    passage.className = 'dropdown-choice__passage';
    const status = doc.createElement('p');
    status.className = 'dropdown-choice__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = `0 из ${choices.length} ответов верны.`;

    let choiceNumber = 0;
    current.segments.forEach((segment) => {
      if (segment.type === 'text') {
        passage.append(doc.createTextNode(segment.text));
        return;
      }

      choiceNumber += 1;
      const number = choiceNumber;
      const field = doc.createElement('span');
      field.className = 'dropdown-choice__field';
      const marker = doc.createElement('span');
      marker.className = 'dropdown-choice__number';
      marker.textContent = `(${number})`;
      marker.setAttribute('aria-hidden', 'true');
      const select = doc.createElement('select');
      select.className = 'dropdown-choice__select';
      select.dataset.choiceId = segment.id;
      select.dataset.state = 'empty';
      select.setAttribute('aria-label', `Пропуск ${number}: выберите правильный вариант`);
      const placeholder = doc.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose…';
      select.append(placeholder);
      segment.options.forEach((option) => {
        const element = doc.createElement('option');
        element.value = option;
        element.textContent = option;
        select.append(element);
      });

      select.addEventListener('change', () => {
        const previousState = select.dataset.state;
        const state = getSelectionState(select.value, segment.answer);
        select.dataset.state = state;
        select.classList.toggle('dropdown-choice__select--correct', state === 'correct');
        select.classList.toggle('dropdown-choice__select--wrong', state === 'wrong');
        select.setAttribute('aria-invalid', String(state === 'wrong'));
        if (state === 'correct') {
          if (previousState !== 'correct') correctCount += 1;
          select.disabled = true;
          status.textContent = correctCount === choices.length
            ? 'Все ответы верны.'
            : `Верно. ${correctCount} из ${choices.length}.`;
        } else if (state === 'wrong') {
          status.textContent = `Неверный вариант в пропуске ${number}. Попробуйте ещё раз.`;
        } else {
          status.textContent = `${correctCount} из ${choices.length} ответов верны.`;
        }
        if (typeof settings.onActivity === 'function') settings.onActivity(current.id, segment.id, state);
      });

      field.append(marker, select);
      passage.append(field);
    });

    section.append(title, instruction, passage, status);
    return section;
  }

  const api = { getSelectionState, normalizeDropdownChoice, renderDropdownChoice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DropdownChoiceComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
