/* Lesson renderer: maps a lesson-spec-v1 JSON payload to interactive DOM.
   Exposes window.__renderLesson(data, pageEl) and returns meta used by sync. */
(() => {
  const SYNC = (...parts) => parts.filter(Boolean).join('/');

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const key in props) {
        const value = props[key];
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key === 'dataset') { for (const k in value) el.dataset[k] = value[k]; }
        else if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'style' && typeof value === 'object') {
          for (const k in value) el.style[k] = value[k];
        } else {
          el.setAttribute(key, value);
        }
      }
    }
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) child.forEach(c => c && el.appendChild(c.nodeType ? c : document.createTextNode(String(c))));
      else el.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function clearPick(cls, root) { root.querySelectorAll(cls).forEach(n => n.classList.remove('selected', 'highlight')); }

  function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function statusEl(text) { return h('div', { class: 'status', text }); }

  function instruction(text) { return text ? h('p', { class: 'instruction', text }) : null; }

  function normalizeAnswer(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }

  function renderHero(hero, pageEl) {
    const section = h('section', { class: 'hero' },
      hero.title ? h('h1', { text: hero.title }) : null,
      hero.subtitle ? h('p', { text: hero.subtitle }) : null,
      Array.isArray(hero.pills) && hero.pills.length
        ? h('div', { class: 'pill-row' }, hero.pills.map(p => h('span', { class: 'pill', text: p })))
        : null
    );
    pageEl.appendChild(section);
  }

  function renderSection(section, pageEl, ctx) {
    const el = h('section', { class: 'section', id: section.id },
      h('h2', { text: section.title })
    );
    section.controls.forEach(control => {
      const node = renderControl(control, section, ctx);
      if (node) el.appendChild(h('div', { class: 'control-slot' }, node));
    });
    if (section.alternativeControls && section.alternativeControls.length) {
      renderAlternativeControls(section, el, ctx);
    }
    pageEl.appendChild(el);
  }

  function renderControl(control, section, ctx) {
    switch (control.type) {
      case 'wordAssociationStrikeList': return renderWordAssociation(control, ctx);
      case 'opinionSort': return renderOpinionSort(control, ctx);
      case 'discussionQuestions': return renderDiscussionQuestions(control, ctx);
      case 'definitionMatch': return renderDefinitionMatch(control, ctx);
      case 'gapFillBank': return renderGapFillBank(control, ctx);
      case 'phrasalVerbPractice': return renderPhrasalVerbPractice(control, ctx);
      case 'taskList': return renderTaskList(control, ctx);
      case 'readingText': return renderReadingText(control, ctx);
      case 'readingQuizRadio': return renderReadingQuiz(control, ctx);
      case 'grammarRuleCards': return renderGrammarRuleCards(control, ctx);
      case 'completeRule': return renderCompleteRule(control, ctx);
      case 'chooseCorrect': return renderChooseCorrect(control, ctx);
      case 'controlledInputPractice': return renderControlledInput(control, ctx);
      case 'dropdownChoicePractice': return renderDropdownChoice(control, ctx);
      case 'speakingQuestions': return renderSpeakingQuestions(control, ctx);
      case 'translationSelfCheck': return renderTranslationSelfCheck(control, ctx);
      case 'resourceNotes': return renderResourceNotes(control, ctx);
      default: return h('p', { class: 'small-note', text: `[Unsupported control: ${control.type}]` });
    }
  }

  function renderWordAssociation(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const grid = h('div', { class: 'strike-grid' });
    const status = statusEl(`Discussed: 0 / ${control.items.length}`);
    let done = 0;
    control.items.forEach((word, i) => {
      const card = h('button', {
        type: 'button', class: 'strike-card', text: word,
        dataset: { syncKey: SYNC(control.id, 'word', i), word },
        onclick: () => {
          if (card.classList.contains('done')) { card.classList.remove('done'); done--; }
          else { card.classList.add('done'); done++; }
          status.textContent = `Discussed: ${done} / ${control.items.length}`;
          if (ctx.onActivity) ctx.onActivity('warmup');
        }
      });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    wrap.appendChild(status);
    return wrap;
  }

  function renderOpinionSort(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const pool = h('div', { class: 'sort-pool' });
    const columnsWrap = h('div', { class: 'sort-columns' });
    let selectedId = null;
    const placements = new Map();

    control.columns.forEach((colName, colIdx) => {
      const col = h('button', {
        type: 'button', class: 'sort-col',
        dataset: { syncKey: SYNC(control.id, 'col', colIdx), col: String(colIdx) },
        onclick: () => {
          if (!selectedId) return;
          const placedId = selectedId;
          const prevCol = placements.get(placedId);
          if (prevCol !== undefined) {
            const prevColEl = columnsWrap.children[prevCol];
            const prevTag = prevColEl && prevColEl.querySelector(`[data-item-id="${cssEscape(placedId)}"]`);
            if (prevTag) prevTag.remove();
          }
          placements.set(placedId, colIdx);
          const placedArea = col.querySelector('.placed-words');
          const tag = h('span', { class: 'sort-placed', dataset: { itemId: placedId, syncKey: SYNC(control.id, 'placed', placedId) } });
          const item = control.items.find(it => it.id === placedId);
          tag.appendChild(document.createTextNode(item ? item.text : placedId));
          const removeBtn = h('button', {
            type: 'button', class: 'remove-placed', text: '\u00D7',
            dataset: { syncKey: SYNC(control.id, 'remove', placedId) },
            onclick: (e) => {
              e.stopPropagation();
              placements.delete(placedId);
              tag.remove();
              const chip = pool.querySelector(`[data-item-id="${cssEscape(placedId)}"]`);
              if (chip) { chip.classList.remove('placed'); chip.classList.remove('selected'); }
            }
          });
          tag.appendChild(removeBtn);
          placedArea.appendChild(tag);
          const chip = pool.querySelector(`[data-item-id="${cssEscape(placedId)}"]`);
          if (chip) { chip.classList.remove('selected'); chip.classList.add('placed'); }
          selectedId = null;
          if (ctx.onActivity) ctx.onActivity('lead-in');
        }
      });
      col.appendChild(h('h3', { text: colName }));
      col.appendChild(h('div', { class: 'placed-words' }));
      columnsWrap.appendChild(col);
    });

    shuffle(control.items).forEach(item => {
      const chip = h('button', {
        type: 'button', class: 'sort-word', text: item.text,
        dataset: { syncKey: SYNC(control.id, 'chip', item.id), itemId: item.id },
        onclick: () => {
          if (chip.classList.contains('placed')) return;
          clearPick('.sort-word.selected', pool);
          selectedId = item.id;
          chip.classList.add('selected');
        }
      });
      pool.appendChild(chip);
    });

    wrap.appendChild(pool);
    wrap.appendChild(columnsWrap);
    return wrap;
  }

  function renderDiscussionQuestions(control, ctx) {
    const list = h('ol', { class: 'qa-list' });
    control.items.forEach((q, i) => {
      list.appendChild(h('li', { text: q }));
    });
    return h('div', { class: 'control-block' }, instruction(control.instruction), list);
  }

  function renderDefinitionMatch(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const pool = h('div', { class: 'def-pool' });
    const rows = h('div', { class: 'match-wrap' });
    const status = statusEl(`Matched: 0 / ${control.items.length}`);
    let selectedId = null;
    let done = 0;

    control.items.forEach(item => {
      const row = h('div', { class: 'match-row', dataset: { id: item.id } });
      row.appendChild(h('div', { class: 'match-word', text: item.term, dataset: { word: item.term } }));
      const drop = h('button', {
        type: 'button', class: 'match-drop', text: 'drop definition here',
        dataset: { id: item.id, syncKey: SYNC(control.id, 'drop', item.id) },
        onclick: () => {
          if (drop.classList.contains('done')) return;
          if (!selectedId) { status.textContent = `Pick a definition first. Matched: ${done} / ${control.items.length}`; return; }
          if (selectedId === item.id) {
            const chip = pool.querySelector(`[data-def-id="${cssEscape(selectedId)}"]`);
            drop.textContent = (chip ? chip.textContent : '') + ' \u2713';
            drop.classList.remove('highlight'); drop.classList.add('done');
            row.querySelector('.match-word').classList.add('done');
            if (chip) { chip.classList.remove('selected'); chip.classList.add('placed'); }
            done++; selectedId = null;
            clearPick('.match-drop.highlight', rows);
            status.classList.remove('bad');
            status.textContent = done === control.items.length ? `Matched: ${done} / ${control.items.length}. Perfect!` : `Correct! Matched: ${done} / ${control.items.length}`;
            if (done === control.items.length) status.classList.add('ok');
            if (ctx.onActivity) ctx.onActivity('vocab');
          } else {
            const chip = pool.querySelector(`[data-def-id="${cssEscape(selectedId)}"]`);
            if (chip) { chip.classList.add('wrong'); setTimeout(() => chip.classList.remove('wrong', 'selected'), 340); }
            status.classList.remove('ok'); status.classList.add('bad');
            status.textContent = `Not a match. Try again. Matched: ${done} / ${control.items.length}`;
            clearPick('.match-drop.highlight', rows);
            selectedId = null;
          }
        }
      });
      row.appendChild(drop);
      rows.appendChild(row);
    });

    shuffle(control.items).forEach(item => {
      const chip = h('button', {
        type: 'button', class: 'def-chip', text: item.definition,
        dataset: { defId: item.id, syncKey: SYNC(control.id, 'chip', item.id) },
        onclick: () => {
          if (chip.classList.contains('placed')) return;
          clearPick('.def-chip.selected', pool);
          clearPick('.match-drop.highlight', rows);
          selectedId = item.id;
          chip.classList.add('selected');
          rows.querySelectorAll('.match-drop:not(.done)').forEach(d => d.classList.add('highlight'));
        }
      });
      pool.appendChild(chip);
    });

    wrap.appendChild(pool);
    wrap.appendChild(rows);
    wrap.appendChild(status);
    return wrap;
  }

  function renderGapFillBank(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    if (Array.isArray(control.wordBank) && control.wordBank.length) {
      wrap.appendChild(h('p', { class: 'small-note', text: 'Word bank: ' + control.wordBank.join('  •  ') }));
    }
    const text = h('div', { class: 'gapfill-text' });
    const status = statusEl(`Done: 0 / ${control.items.length}`);
    const options = shuffle([...(control.wordBank || [])]);
    let done = 0;
    control.items.forEach((item, i) => {
      text.appendChild(document.createTextNode(item.before || ''));
      const slot = h('span', { class: 'gap-slot' });
      const sel = h('select', { dataset: { syncKey: SYNC(control.id, item.id), answer: item.answer } });
      sel.appendChild(h('option', { value: '', text: '-- choose --' }));
      options.forEach(w => sel.appendChild(h('option', { value: w, text: w })));
      sel.addEventListener('change', () => {
        sel.classList.remove('correct', 'wrong');
        if (!sel.value) return;
        if (sel.value === item.answer) {
          sel.classList.add('correct'); sel.disabled = true; done++;
          status.classList.remove('bad');
          status.textContent = done === control.items.length ? `Done: ${done} / ${control.items.length}. Perfect!` : `Done: ${done} / ${control.items.length}`;
          if (done === control.items.length) status.classList.add('ok');
        } else {
          sel.classList.add('wrong'); setTimeout(() => sel.classList.remove('wrong'), 600);
        }
        if (ctx.onActivity) ctx.onActivity('gapfill');
      });
      slot.appendChild(sel);
      text.appendChild(slot);
      text.appendChild(document.createTextNode(item.after || ''));
      if (i < control.items.length - 1) text.appendChild(h('br'));
    });
    wrap.appendChild(text);
    wrap.appendChild(status);
    return wrap;
  }

  function renderPhrasalVerbPractice(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));

    if (Array.isArray(control.matchItems) && control.matchItems.length) {
      const matchTitle = h('h4', { text: 'Match the phrasal verbs with the definitions', style: { color: '#165877', margin: '6px 0' } });
      const pool = h('div', { class: 'def-pool' });
      const rows = h('div', { class: 'match-wrap' });
      const status = statusEl(`Matched: 0 / ${control.matchItems.length}`);
      let selectedId = null; let done = 0;
      control.matchItems.forEach(item => {
        const row = h('div', { class: 'match-row', dataset: { id: item.id } });
        row.appendChild(h('div', { class: 'match-word', text: `${item.letter}. ${item.term}`, dataset: { word: item.term } }));
        const drop = h('button', {
          type: 'button', class: 'match-drop', text: 'drop definition here',
          dataset: { id: item.id, syncKey: SYNC(control.id, 'match-drop', item.id) },
          onclick: () => {
            if (drop.classList.contains('done')) return;
            if (!selectedId) { status.textContent = `Pick a definition first. Matched: ${done} / ${control.matchItems.length}`; return; }
            if (selectedId === item.id) {
              const chip = pool.querySelector(`[data-def-id="${cssEscape(selectedId)}"]`);
              drop.textContent = (chip ? chip.textContent : '') + ' \u2713';
              drop.classList.remove('highlight'); drop.classList.add('done');
              row.querySelector('.match-word').classList.add('done');
              if (chip) { chip.classList.remove('selected'); chip.classList.add('placed'); }
              done++; selectedId = null;
              clearPick('.match-drop.highlight', rows);
              status.classList.remove('bad');
              status.textContent = done === control.matchItems.length ? `Matched: ${done} / ${control.matchItems.length}. Perfect!` : `Matched: ${done} / ${control.matchItems.length}`;
              if (done === control.matchItems.length) status.classList.add('ok');
            } else {
              const chip = pool.querySelector(`[data-def-id="${cssEscape(selectedId)}"]`);
              if (chip) { chip.classList.add('wrong'); setTimeout(() => chip.classList.remove('wrong', 'selected'), 340); }
              status.classList.add('bad');
              status.textContent = `Not a match. Matched: ${done} / ${control.matchItems.length}`;
              clearPick('.match-drop.highlight', rows);
              selectedId = null;
            }
          }
        });
        row.appendChild(drop);
        rows.appendChild(row);
      });
      shuffle(control.matchItems).forEach(item => {
        const chip = h('button', {
          type: 'button', class: 'def-chip', text: item.definition,
          dataset: { defId: item.id, syncKey: SYNC(control.id, 'match-chip', item.id) },
          onclick: () => {
            if (chip.classList.contains('placed')) return;
            clearPick('.def-chip.selected', pool);
            clearPick('.match-drop.highlight', rows);
            selectedId = item.id; chip.classList.add('selected');
            rows.querySelectorAll('.match-drop:not(.done)').forEach(d => d.classList.add('highlight'));
          }
        });
        pool.appendChild(chip);
      });
      wrap.appendChild(matchTitle); wrap.appendChild(pool); wrap.appendChild(rows); wrap.appendChild(status);
    }

    if (Array.isArray(control.gapFillItems) && control.gapFillItems.length) {
      const gapTitle = h('h4', { text: 'Complete the sentences', style: { color: '#165877', margin: '14px 0 6px' } });
      const text = h('div', { class: 'gapfill-text' });
      const status = statusEl(`Done: 0 / ${control.gapFillItems.length}`);
      const options = shuffle([...(control.wordBank || [])]);
      let done = 0;
      control.gapFillItems.forEach((item, i) => {
        text.appendChild(document.createTextNode(item.before || ''));
        const slot = h('span', { class: 'gap-slot' });
        const sel = h('select', { dataset: { syncKey: SYNC(control.id, 'gap', item.id), answer: item.answer } });
        sel.appendChild(h('option', { value: '', text: '-- choose --' }));
        options.forEach(w => sel.appendChild(h('option', { value: w, text: w })));
        sel.addEventListener('change', () => {
          sel.classList.remove('correct', 'wrong');
          if (!sel.value) return;
          if (sel.value === item.answer) {
            sel.classList.add('correct'); sel.disabled = true; done++;
            status.classList.remove('bad');
            status.textContent = done === control.gapFillItems.length ? `Done: ${done} / ${control.gapFillItems.length}. Perfect!` : `Done: ${done} / ${control.gapFillItems.length}`;
            if (done === control.gapFillItems.length) status.classList.add('ok');
          } else { sel.classList.add('wrong'); setTimeout(() => sel.classList.remove('wrong'), 600); }
        });
        slot.appendChild(sel); text.appendChild(slot);
        text.appendChild(document.createTextNode(item.after || ''));
        if (i < control.gapFillItems.length - 1) text.appendChild(h('br'));
      });
      wrap.appendChild(gapTitle); wrap.appendChild(text); wrap.appendChild(status);
    }

    return wrap;
  }

  function renderTaskList(control, ctx) {
    const list = h('ul', { class: 'task-list' });
    control.items.forEach((task, i) => {
      const li = h('li', {});
      const cb = h('input', { type: 'checkbox', dataset: { syncKey: SYNC(control.id, 'task', i) } });
      const label = h('span', { text: task });
      cb.addEventListener('change', () => {
        li.classList.toggle('done', cb.checked);
        if (ctx.onActivity) ctx.onActivity('task');
      });
      li.appendChild(cb); li.appendChild(label);
      list.appendChild(li);
    });
    return h('div', { class: 'control-block' }, list);
  }

  function renderReadingText(control, ctx) {
    const box = h('div', { class: 'reading-box' });
    if (control.title) box.appendChild(h('h3', { text: control.title }));
    (control.paragraphs || []).forEach(p => box.appendChild(h('p', { text: p })));
    return box;
  }

  function renderReadingQuiz(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const list = h('ol', { class: 'quiz-list' });
    const status = statusEl('Score: 0 / 0');
    control.items.forEach(item => {
      const li = h('li', { class: 'quiz-item' });
      li.appendChild(h('div', { class: 'quiz-q', text: item.question }));
      const opts = h('div', { class: 'quiz-options' });
      item.options.forEach(opt => {
        const id = `q-${item.id}-${opt.replace(/[^a-z0-9]/gi, '')}`;
        const label = h('label', { class: 'quiz-option', dataset: { syncKey: SYNC(control.id, item.id, opt) } });
        const radio = h('input', { type: 'radio', name: `quiz-${item.id}`, value: opt, id });
        label.appendChild(radio);
        label.appendChild(h('span', { text: opt }));
        radio.addEventListener('change', () => {
          opts.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('picked-correct', 'picked-wrong'));
          if (radio.value === item.answer) label.classList.add('picked-correct');
          else label.classList.add('picked-wrong');
          if (ctx.onActivity) ctx.onActivity('quiz');
        });
        opts.appendChild(label);
      });
      li.appendChild(opts);
      list.appendChild(li);
    });
    const btn = h('button', { class: 'btn', type: 'button', text: 'Check answers', dataset: { syncKey: SYNC(control.id, 'check') } });
    btn.addEventListener('click', () => {
      let score = 0;
      control.items.forEach(item => {
        const radios = list.querySelectorAll(`input[name="quiz-${item.id}"]`);
        radios.forEach(r => {
          const lab = r.closest('.quiz-option');
          lab.classList.remove('picked-correct', 'picked-wrong', 'reveal-correct');
          if (r.value === item.answer) lab.classList.add('reveal-correct');
          if (r.checked && r.value === item.answer) score++;
        });
      });
      status.classList.remove('ok', 'bad');
      status.textContent = `Score: ${score} / ${control.items.length}`;
      status.classList.add(score === control.items.length ? 'ok' : 'bad');
    });
    wrap.appendChild(list);
    wrap.appendChild(btn);
    wrap.appendChild(status);
    return wrap;
  }

  function renderGrammarRuleCards(control, ctx) {
    const grid = h('div', { class: 'grammar-grid' });
    (control.cards || []).forEach(card => {
      const c = h('div', { class: 'rule-card' });
      c.appendChild(h('h4', { text: card.title }));
      if (card.body) c.appendChild(h('p', { text: card.body }));
      if (Array.isArray(card.examples) && card.examples.length) {
        c.appendChild(h('ul', { class: 'examples' }, card.examples.map(ex => h('li', { text: ex }))));
      }
      grid.appendChild(c);
    });
    return h('div', { class: 'control-block' }, grid);
  }

  function renderInlineSelect(control, item, kind, ctx) {
    const slot = h('span', { class: 'gap-slot' });
    const sel = h('select', { dataset: { syncKey: SYNC(control.id, kind, item.id), answer: item.answer } });
    sel.appendChild(h('option', { value: '', text: '-- choose --' }));
    item.options.forEach(opt => sel.appendChild(h('option', { value: opt, text: opt })));
    sel.addEventListener('change', () => {
      sel.classList.remove('correct', 'wrong');
      if (!sel.value) return;
      if (sel.value === item.answer) { sel.classList.add('correct'); sel.disabled = true; }
      else { sel.classList.add('wrong'); setTimeout(() => sel.classList.remove('wrong'), 600); }
      if (ctx.onActivity) ctx.onActivity('grammar');
    });
    slot.appendChild(sel);
    return slot;
  }

  function renderCompleteRule(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const text = h('div', { class: 'story' });
    control.items.forEach((item, i) => {
      if (item.before) text.appendChild(document.createTextNode(item.before));
      text.appendChild(renderInlineSelect(control, item, 'rule', ctx));
      if (item.after) text.appendChild(document.createTextNode(item.after));
      if (i < control.items.length - 1) text.appendChild(h('br'));
    });
    wrap.appendChild(text);
    return wrap;
  }

  function renderChooseCorrect(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const text = h('div', { class: 'story' });
    control.items.forEach((item, i) => {
      if (item.before) text.appendChild(document.createTextNode(item.before));
      text.appendChild(renderInlineSelect(control, item, 'choice', ctx));
      if (item.after) text.appendChild(document.createTextNode(item.after));
      if (i < control.items.length - 1) text.appendChild(h('br'));
    });
    wrap.appendChild(text);
    return wrap;
  }

  function renderControlledInput(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    if (Array.isArray(control.examples) && control.examples.length) {
      const ex = h('div', { class: 'exercise' });
      ex.appendChild(h('h4', { text: 'Examples' }));
      const ol = h('ol', { class: 'qa-list' });
      control.examples.forEach(e => ol.appendChild(h('li', { text: `${e.prompt} \u2192 ${e.answer}` })));
      ex.appendChild(ol);
      wrap.appendChild(ex);
    }
    const text = h('div', { class: 'story' });
    const status = statusEl(`Done: 0 / ${control.items.length}`);
    let done = 0;
    control.items.forEach((item, i) => {
      if (i > 0) text.appendChild(h('br'));
      text.appendChild(document.createTextNode(item.prompt || ''));
      const slot = h('span', { class: 'verb-slot' });
      const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: item.baseVerb || '', dataset: { syncKey: SYNC(control.id, item.id) } });
      const check = h('span', { class: 'check', text: '\u2713' });
      const cross = h('span', { class: 'cross', text: '\u2717' });
      const accepted = [item.answer].concat(item.acceptedAnswers || []).map(normalizeAnswer);
      const lockCorrect = () => {
        if (input.disabled) return;
        input.classList.remove('wrong'); cross.classList.remove('visible');
        input.classList.add('correct'); check.classList.add('visible'); input.disabled = true; done++;
        status.classList.remove('bad');
        status.textContent = done === control.items.length ? `Done: ${done} / ${control.items.length}. Excellent!` : `Done: ${done} / ${control.items.length}`;
        if (done === control.items.length) status.classList.add('ok');
      };
      input.addEventListener('input', () => {
        if (input.disabled) return;
        input.classList.remove('wrong');
        cross.classList.remove('visible');
        if (accepted.includes(normalizeAnswer(input.value))) lockCorrect();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (input.disabled) return;
        if (accepted.includes(normalizeAnswer(input.value))) lockCorrect();
        else { input.classList.add('wrong'); cross.classList.add('visible'); }
      });
      slot.appendChild(input); slot.appendChild(check); slot.appendChild(cross);
      text.appendChild(slot);
      if (item.after) text.appendChild(document.createTextNode(' ' + item.after));
    });
    wrap.appendChild(text);
    wrap.appendChild(status);
    return wrap;
  }

  function renderDropdownChoice(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const text = h('div', { class: 'story' });
    const status = statusEl(`Done: 0 / ${control.items.length}`);
    let done = 0;
    control.items.forEach((item, i) => {
      if (i > 0) text.appendChild(h('br'));
      if (item.before) text.appendChild(document.createTextNode(item.before));
      text.appendChild(renderInlineSelect(control, item, 'dropdown', ctx));
      if (item.after) text.appendChild(document.createTextNode(item.after));
    });
    wrap.appendChild(text);
    return wrap;
  }

  function renderSpeakingQuestions(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const list = h('ol', { class: 'qa-list' });
    control.items.forEach(q => list.appendChild(h('li', { text: q })));
    wrap.appendChild(list);
    const notes = h('div', { class: 'speak-notes' });
    notes.appendChild(h('p', { class: 'small-note', text: 'Your notes (keywords only):' }));
    notes.appendChild(h('textarea', { dataset: { syncKey: SYNC(control.id, 'notes') }, placeholder: 'Key points, vocabulary to use, sentence ideas...' }));
    wrap.appendChild(notes);
    return wrap;
  }

  function renderTranslationSelfCheck(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    const list = h('div', { class: 'translation-list' });
    control.items.forEach(item => {
      const card = h('div', { class: 'translation-card' });
      card.appendChild(h('div', { class: 'ru', text: item.sourceRu }));
      const answer = h('div', { class: 'answer-en', text: item.answerEn });
      const btn = h('button', { class: 'btn ghost', type: 'button', text: 'Show answer', dataset: { syncKey: SYNC(control.id, item.id) } });
      btn.addEventListener('click', () => {
        const visible = answer.classList.toggle('visible');
        btn.textContent = visible ? 'Hide answer' : 'Show answer';
      });
      card.appendChild(h('div', { class: 'reveal' }, btn, answer));
      list.appendChild(card);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderResourceNotes(control, ctx) {
    const wrap = h('div', { class: 'control-block' }, instruction(control.instruction));
    wrap.appendChild(h('textarea', { dataset: { syncKey: SYNC(control.id, 'notes') }, placeholder: control.placeholder || 'Write links or notes here...' }, control.initialValue || ''));
    return wrap;
  }

  function renderAlternativeControls(section, sectionEl, ctx) {
    const toggle = h('button', { class: 'btn ghost alt-toggle', type: 'button', text: 'Show Translation Time', dataset: { syncKey: SYNC(section.id, 'alt-toggle') } });
    const altWrap = h('div', { style: { display: 'none' } });
    section.alternativeControls.forEach(control => {
      altWrap.appendChild(h('div', { class: 'control-slot' }, renderControl(control, section, ctx)));
    });
    toggle.addEventListener('click', () => {
      const shown = altWrap.style.display !== 'none';
      altWrap.style.display = shown ? 'none' : 'block';
      toggle.textContent = shown ? 'Show Translation Time' : 'Hide Translation Time';
    });
    sectionEl.appendChild(toggle);
    sectionEl.appendChild(altWrap);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[\\"]/g, '\\$&');
  }

  function collectVocabTerms(data) {
    const terms = new Set();
    (data.sections || []).forEach(section => {
      (section.controls || []).forEach(control => {
        if (control.type === 'definitionMatch') (control.items || []).forEach(it => it.term && terms.add(it.term));
        if (control.type === 'gapFillBank' && Array.isArray(control.wordBank)) control.wordBank.forEach(w => terms.add(w));
        if (control.type === 'phrasalVerbPractice') {
          (control.matchItems || []).forEach(it => it.term && terms.add(it.term));
          if (Array.isArray(control.wordBank)) control.wordBank.forEach(w => terms.add(w));
        }
      });
    });
    return [...terms];
  }

  function renderLesson(data, pageEl) {
    pageEl.innerHTML = '';
    if (data.hero) renderHero(data.hero, pageEl);
    const ctx = { onActivity: null };
    (data.sections || []).forEach(section => renderSection(section, pageEl, ctx));
    const sectionIds = (data.sections || []).map(s => s.id);
    const sectionTitles = {};
    (data.sections || []).forEach(s => { sectionTitles[s.id] = s.title; });
    const vocabTerms = collectVocabTerms(data);
    return { sectionIds, sectionTitles, vocabTerms, ctx };
  }

  window.__renderLesson = renderLesson;
})();
