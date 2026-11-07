(function initHomeworkWritingComponent(root) {
  'use strict';

  // Homework writing: the student writes a text of a set length and hands it in, the
  // teacher grades it with 1–5 stars and a comment or returns it for changes. The task is
  // Markdown (in a template it may hold {{fields}} for the AI); the student's work lives
  // in the session state, see normalizeWriting.

  const markdown = root.SafeMarkdown || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('HomeworkWriting requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'task', 'minWords', 'maxWords'];
  const WORD_LIMITS = Object.freeze({ min: 10, max: 400 });
  const MAX_TEXT_LENGTH = 6000;
  const MAX_COMMENT_LENGTH = 1000;
  const SCORES = Object.freeze([1, 2, 3, 4, 5]);
  const STATUSES = Object.freeze(['draft', 'submitted', 'returned', 'checked']);
  const ART_SRC = '/assets/images/homework-writing.webp';
  const AUTOSAVE_DELAY_MS = 700;
  const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

  const STATUS_LABELS = {
    student: { draft: 'Draft', submitted: 'Handed in', returned: 'Needs changes', checked: 'Checked' },
    teacher: { draft: 'Черновик', submitted: 'Сдано', returned: 'На доработке', checked: 'Проверено' },
  };

  function fail(message) { throw new Error(`HomeworkWriting ${message}`); }

  function plainText(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function wordLimit(value, name) {
    if (!Number.isInteger(value) || value < WORD_LIMITS.min || value > WORD_LIMITS.max) {
      fail(`requires ${name} between ${WORD_LIMITS.min} and ${WORD_LIMITS.max}.`);
    }
    return value;
  }

  function normalizeHomeworkWriting(data) {
    if (!data || data.type !== 'homeworkWriting' || !KEBAB_CASE.test(String(data.id || ''))) {
      fail('requires type "homeworkWriting" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) fail('contains unsupported fields.');
    const title = plainText(data.title);
    const instruction = plainText(data.instruction);
    const task = typeof data.task === 'string' ? data.task.trim() : '';
    if (!title || !instruction || !task) fail('requires a title, an instruction and a task.');
    const minWords = wordLimit(data.minWords, 'minWords');
    const maxWords = wordLimit(data.maxWords, 'maxWords');
    if (minWords > maxWords) fail('requires minWords not above maxWords.');
    return { type: 'homeworkWriting', id: data.id, title, instruction, task, minWords, maxWords };
  }

  function countWords(text) {
    return (String(text || '').match(WORD) || []).length;
  }

  // The student's work as the session keeps it: the text, where it stands, when it was
  // handed in, and the teacher's grade (or note, when the text was returned).
  function normalizeWriting(value) {
    const writing = value && typeof value === 'object' ? value : {};
    const status = STATUSES.includes(writing.status) ? writing.status : 'draft';
    const result = { text: typeof writing.text === 'string' ? writing.text : '', status };
    if (Number.isFinite(writing.submittedAt)) result.submittedAt = writing.submittedAt;
    const review = writing.review;
    if (review && typeof review === 'object') {
      const comment = typeof review.comment === 'string' ? review.comment.trim() : '';
      if (status === 'checked' && SCORES.includes(review.score)) result.review = { score: review.score, comment };
      else if (status === 'returned' && comment) result.review = { comment };
    }
    return result;
  }

  function svg(doc, paths, className) {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('aria-hidden', 'true');
    if (className) node.setAttribute('class', className);
    for (const d of paths) {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      node.append(path);
    }
    return node;
  }
  const ICONS = {
    send: ['M4 12 20 4l-4 16-4.5-6.5Z', 'm11.5 13.5 4-4'],
    check: ['m5 12.5 4.2 4.2L19 7'],
    clock: ['M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z', 'M12 7.5V12l3 2'],
    star: ['m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z'],
    note: ['M5 4.5h14v11l-4 4H5Z', 'M15 19.5v-4h4', 'M8.5 9h7', 'M8.5 12.5h4'],
  };

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(timestamp, role) {
    const date = new Date(timestamp);
    if (role === 'teacher') {
      return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function renderHomeworkWriting(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('HomeworkWriting requires a document.');

    let current = normalizeHomeworkWriting(data);
    const role = settings.viewerRole === 'student' ? 'student' : 'teacher';
    let writing = normalizeWriting(settings.writing);
    let interactive = settings.interactive === true;
    let localText = writing.text;
    let autosaveTimer = null;
    let reviewScore = writing.review?.score || 0;
    let reviewComment = writing.review?.comment || '';
    let editing = false;
    let saving = false;
    let initialSnapshot = '';

    const section = element(doc, 'section', 'homework-writing');
    section.dataset.componentId = current.id;
    section.dataset.role = role;

    // Header: art, eyebrow, title, instruction, status, and the template/draft editor.
    const head = element(doc, 'div', 'homework-writing__head');
    const art = element(doc, 'div', 'homework-writing__art');
    const image = element(doc, 'img');
    image.src = ART_SRC;
    image.alt = '';
    art.append(image);
    const heading = element(doc, 'div', 'homework-writing__heading');
    const eyebrow = element(doc, 'p', 'homework-writing__eyebrow', 'Homework');
    const title = element(doc, 'h2', 'homework-writing__title');
    title.dataset.placeholder = 'Введите заголовок';
    const instruction = element(doc, 'p', 'homework-writing__instruction');
    instruction.dataset.placeholder = 'Введите инструкцию';
    heading.append(eyebrow, title, instruction);
    // Outside a session (draft and template editors) there is no work to show a status of.
    const status = element(doc, 'span', 'homework-writing__status');
    status.hidden = !Object.hasOwn(settings, 'writing');
    const actions = element(doc, 'div', 'homework-writing__actions');
    const cancelButton = element(doc, 'button', 'homework-writing__cancel', 'Отмена');
    cancelButton.type = 'button';
    cancelButton.hidden = true;
    const editButton = element(doc, 'button', 'homework-writing__edit', '✎');
    editButton.type = 'button';
    editButton.setAttribute('aria-label', 'Редактировать домашнее задание');
    actions.append(status);
    if (role === 'teacher' && typeof settings.onSave === 'function') actions.append(cancelButton, editButton);
    head.append(art, heading, actions);

    const toolbar = element(doc, 'div', 'homework-writing__toolbar');
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование задания');
    const formatButtons = [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList']]
      .map(([label, ariaLabel, command]) => {
        const button = element(doc, 'button', 'homework-writing__format', label);
        button.type = 'button';
        button.setAttribute('aria-label', ariaLabel);
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => {
          if (!editing || saving) return;
          task.focus();
          if (typeof doc.execCommand === 'function') doc.execCommand(command, false);
          updateDirty();
        });
        return button;
      });
    toolbar.append(...formatButtons);

    const task = element(doc, 'div', 'homework-writing__task');
    task.dataset.placeholder = 'Введите задание';

    const limits = element(doc, 'div', 'homework-writing__limits');
    limits.hidden = true;
    function limitInput(label) {
      const input = element(doc, 'input', 'homework-writing__limit');
      input.type = 'number';
      input.min = String(WORD_LIMITS.min);
      input.max = String(WORD_LIMITS.max);
      input.setAttribute('aria-label', label);
      input.addEventListener('input', updateDirty);
      return input;
    }
    const minInput = limitInput('Слов от');
    const maxInput = limitInput('Слов до');
    limits.append(element(doc, 'span', '', 'Объём: от'), minInput, element(doc, 'span', '', 'до'), maxInput, element(doc, 'span', '', 'слов'));

    // The student's text: one textarea kept across repaints so typing keeps its focus.
    const textarea = element(doc, 'textarea', 'homework-writing__text');
    textarea.maxLength = MAX_TEXT_LENGTH;
    textarea.spellcheck = true;
    textarea.placeholder = 'Start writing here…';
    textarea.setAttribute('aria-label', 'Your text');
    textarea.addEventListener('input', () => {
      if (!canWrite()) return;
      localText = textarea.value;
      paintMeter();
      paintSaved();
      paintHandIn();
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(flushText, AUTOSAVE_DELAY_MS);
    });
    textarea.addEventListener('blur', flushText);

    const body = element(doc, 'div', 'homework-writing__body');
    section.append(head, toolbar, task, limits, body);

    const meter = element(doc, 'div', 'homework-writing__meter');
    const meterBar = element(doc, 'div', 'homework-writing__meter-bar');
    const meterFill = element(doc, 'div', 'homework-writing__meter-fill');
    meterBar.append(meterFill);
    const meterLabel = element(doc, 'span', 'homework-writing__meter-label');
    const saved = element(doc, 'span', 'homework-writing__saved');
    meter.append(meterBar, meterLabel, saved);

    const handIn = element(doc, 'button', 'homework-writing__button homework-writing__button--primary');
    handIn.type = 'button';
    handIn.append(svg(doc, ICONS.send), doc.createTextNode('Hand in'));
    handIn.addEventListener('click', () => {
      if (handIn.disabled) return;
      clearTimeout(autosaveTimer);
      settings.onSubmit(localText);
    });

    function canWrite() {
      return role === 'student' && interactive && !editing
        && ['draft', 'returned'].includes(writing.status) && typeof settings.onWrite === 'function';
    }

    function flushText() {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      if (canWrite() && localText !== writing.text) settings.onWrite(localText);
    }

    function paintMeter() {
      const count = countWords(role === 'student' ? localText : writing.text);
      const state = count > current.maxWords ? 'over' : count >= current.minWords ? 'ok' : 'short';
      meter.dataset.state = state;
      meterFill.style.width = `${Math.min(100, Math.round((count / current.minWords) * 100))}%`;
      const number = element(doc, 'b', '', String(count));
      meterLabel.replaceChildren(number, doc.createTextNode(` / ${current.minWords}–${current.maxWords} words`));
    }

    function paintSaved() {
      const pending = localText !== writing.text;
      saved.hidden = !canWrite() || (!pending && !writing.text);
      saved.replaceChildren(...(pending ? [] : [svg(doc, ICONS.check)]), doc.createTextNode(pending ? 'Saving…' : 'Saved'));
    }

    function paintHandIn() {
      handIn.disabled = !canWrite() || typeof settings.onSubmit !== 'function'
        || countWords(localText) < current.minWords;
    }

    function paper(readonly) {
      const node = element(doc, 'div', `homework-writing__paper${readonly ? ' homework-writing__paper--readonly' : ''}`);
      const footer = element(doc, 'div', 'homework-writing__footer');
      footer.append(meter);
      if (readonly) {
        const text = writing.text.trim();
        const sheet = element(doc, 'div', 'homework-writing__sheet', text || (role === 'teacher'
          ? 'Ученик ещё ничего не написал.'
          : 'Nothing written yet.'));
        if (!text) sheet.classList.add('homework-writing__sheet--empty');
        node.append(sheet);
      } else {
        textarea.readOnly = !canWrite();
        node.append(textarea);
        footer.append(handIn);
      }
      node.append(footer);
      paintMeter();
      paintSaved();
      paintHandIn();
      return node;
    }

    function note(kind, icon, text, button) {
      const node = element(doc, 'div', `homework-writing__note homework-writing__note--${kind}`);
      const label = element(doc, 'span', 'homework-writing__note-text');
      label.append(svg(doc, icon), element(doc, 'span', '', text));
      node.append(label);
      if (button) node.append(button);
      return node;
    }

    function stars(score, onPick) {
      const group = element(doc, 'div', `homework-writing__stars${onPick ? '' : ' homework-writing__stars--small'}`);
      if (onPick) {
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', 'Оценка');
      } else {
        group.setAttribute('aria-label', `${score} out of 5`);
      }
      for (const value of SCORES) {
        const star = element(doc, onPick ? 'button' : 'span', `homework-writing__star${value <= score ? ' homework-writing__star--on' : ''}`);
        star.append(svg(doc, ICONS.star));
        if (onPick) {
          star.type = 'button';
          star.setAttribute('role', 'radio');
          star.setAttribute('aria-checked', String(value === score));
          star.setAttribute('aria-label', String(value));
          star.addEventListener('click', () => onPick(value));
        }
        group.append(star);
      }
      return group;
    }

    function feedback() {
      const node = element(doc, 'div', 'homework-writing__feedback');
      const badge = element(doc, 'div', 'homework-writing__badge');
      badge.append(doc.createTextNode(String(writing.review.score)), element(doc, 'small', '', '/ 5'));
      const content = element(doc, 'div', 'homework-writing__feedback-body');
      const top = element(doc, 'div', 'homework-writing__feedback-head');
      top.append(element(doc, 'p', 'homework-writing__feedback-title', 'Teacher’s feedback'), stars(writing.review.score));
      content.append(top);
      if (writing.review.comment) content.append(element(doc, 'p', 'homework-writing__feedback-text', writing.review.comment));
      node.append(badge, content);
      return node;
    }

    function reviewPanel() {
      const panel = element(doc, 'div', 'homework-writing__review');
      const heading = element(doc, 'p', 'homework-writing__review-title', 'Оценка учителя');
      heading.append(element(doc, 'small', '', 'Ученик увидит оценку и комментарий сразу'));
      const row = element(doc, 'div', 'homework-writing__review-row');
      const scoreLabel = element(doc, 'span', 'homework-writing__score-label');
      const comment = element(doc, 'textarea', 'homework-writing__comment');
      comment.placeholder = 'Комментарий для ученика';
      comment.maxLength = MAX_COMMENT_LENGTH;
      comment.value = reviewComment;
      comment.setAttribute('aria-label', 'Комментарий для ученика');
      const buttons = element(doc, 'div', 'homework-writing__review-actions');
      const returnButton = element(doc, 'button', 'homework-writing__button homework-writing__button--ghost', 'Вернуть на доработку');
      returnButton.type = 'button';
      const gradeButton = element(doc, 'button', 'homework-writing__button homework-writing__button--primary');
      gradeButton.type = 'button';
      gradeButton.append(svg(doc, ICONS.check), doc.createTextNode(writing.status === 'checked' ? 'Обновить оценку' : 'Поставить оценку'));

      function paintScore() {
        row.replaceChildren(stars(reviewScore, pick), scoreLabel);
        scoreLabel.replaceChildren(doc.createTextNode(reviewScore ? String(reviewScore) : '—'), element(doc, 'span', '', ' из 5'));
        gradeButton.disabled = !reviewScore;
      }
      function pick(value) {
        reviewScore = value;
        paintScore();
      }
      comment.addEventListener('input', () => { reviewComment = comment.value; });
      returnButton.addEventListener('click', () => settings.onReturn({ comment: reviewComment.trim() }));
      gradeButton.addEventListener('click', () => {
        if (reviewScore) settings.onReview({ score: reviewScore, comment: reviewComment.trim() });
      });
      paintScore();
      if (typeof settings.onReturn === 'function') buttons.append(returnButton);
      buttons.append(gradeButton);
      panel.append(heading, row, comment, buttons);
      return panel;
    }

    function studentBody() {
      const parts = [];
      if (writing.status === 'checked' && writing.review) parts.push(feedback());
      if (writing.status === 'returned') {
        parts.push(note('returned', ICONS.note, writing.review?.comment
          ? `Your teacher asks you to improve your text: ${writing.review.comment}`
          : 'Your teacher asks you to improve your text and hand it in again.'));
      }
      parts.push(paper(!['draft', 'returned'].includes(writing.status)));
      if (writing.status === 'submitted') {
        const edit = element(doc, 'button', 'homework-writing__button homework-writing__button--quiet', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', () => settings.onReopen());
        const when = writing.submittedAt ? `Handed in on ${formatDate(writing.submittedAt, 'student')}. ` : '';
        parts.push(note('submitted', ICONS.clock, `${when}Waiting for your teacher’s feedback.`,
          interactive && typeof settings.onReopen === 'function' ? edit : null));
      }
      return parts;
    }

    function teacherBody() {
      const parts = [paper(true)];
      if (writing.submittedAt && ['submitted', 'checked'].includes(writing.status)) {
        parts.push(element(doc, 'p', 'homework-writing__meta', `Сдано ${formatDate(writing.submittedAt, 'teacher')}`));
      }
      if (writing.status === 'returned' && writing.review?.comment) {
        parts.push(note('returned', ICONS.note, `Вы вернули текст на доработку: ${writing.review.comment}`));
      }
      if (interactive && ['submitted', 'checked'].includes(writing.status) && typeof settings.onReview === 'function') {
        parts.push(reviewPanel());
      } else if (writing.status === 'checked' && writing.review) {
        parts.push(feedback());
      }
      return parts;
    }

    function paint() {
      section.dataset.status = writing.status;
      status.className = `homework-writing__status homework-writing__status--${writing.status}`;
      status.textContent = STATUS_LABELS[role][writing.status];
      if (editing) return;
      title.textContent = current.title;
      instruction.textContent = current.instruction;
      markdown.renderMarkdownInto(task, current.task, doc, 'homework-writing__spacer');
      body.replaceChildren(...(role === 'student' ? studentBody() : teacherBody()));
    }

    // Session updates. The student's unsent typing wins over an older saved text.
    section.updateState = (next) => {
      const previous = writing;
      writing = normalizeWriting(next);
      const typing = canWrite() && localText !== previous.text && autosaveTimer !== null;
      if (!typing) localText = writing.text;
      if (textarea.value !== localText) textarea.value = localText;
      if (writing.status !== previous.status || JSON.stringify(writing.review) !== JSON.stringify(previous.review)) {
        reviewScore = writing.review?.score || 0;
        reviewComment = writing.review?.comment || '';
      }
      paint();
    };
    section.setInteractive = (value) => {
      interactive = Boolean(value);
      paint();
    };

    // The draft and template editors change the task, never the student's work.
    function setDirty(dirty) {
      section.classList.toggle('homework-writing--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function candidate() {
      return {
        title: plainText(title.textContent),
        instruction: plainText(instruction.textContent),
        task: markdown.editorToMarkdown(task),
        minWords: Number(minInput.value),
        maxWords: Number(maxInput.value),
      };
    }

    function updateDirty() {
      if (editing) setDirty(JSON.stringify(candidate()) !== initialSnapshot);
    }

    function setEditable(node, label, multiline) {
      node.contentEditable = editing ? 'true' : 'false';
      if (editing) {
        node.setAttribute('role', 'textbox');
        node.setAttribute('aria-label', label);
        if (multiline) node.setAttribute('aria-multiline', 'true');
      } else {
        node.removeAttribute('role');
        node.removeAttribute('aria-label');
        node.removeAttribute('aria-multiline');
      }
    }

    function setEditing(value) {
      editing = value;
      section.classList.toggle('homework-writing--editing', editing);
      setEditable(title, 'Заголовок домашнего задания', false);
      setEditable(instruction, 'Инструкция домашнего задания', true);
      setEditable(task, 'Текст задания', true);
      toolbar.hidden = !editing;
      limits.hidden = !editing;
      cancelButton.hidden = !editing;
      editButton.textContent = editing ? '✓' : '✎';
      editButton.setAttribute('aria-label', editing ? 'Сохранить домашнее задание' : 'Редактировать домашнее задание');
    }

    function lock(locked) {
      saving = locked;
      section.classList.toggle('homework-writing--saving', locked);
      [editButton, cancelButton, minInput, maxInput, ...formatButtons].forEach((control) => { control.disabled = locked; });
    }

    function enterEditMode() {
      if (editing) return;
      minInput.value = String(current.minWords);
      maxInput.value = String(current.maxWords);
      setEditing(true);
      initialSnapshot = JSON.stringify(candidate());
      title.focus();
    }

    function leaveEditMode() {
      setEditing(false);
      setDirty(false);
      paint();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const changes = candidate();
      try {
        normalizeHomeworkWriting({ type: 'homeworkWriting', id: current.id, ...changes });
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      lock(true);
      try {
        const result = await settings.onSave(changes, current.id);
        current = normalizeHomeworkWriting(result || { ...current, ...changes });
        lock(false);
        leaveEditMode();
      } catch (_error) {
        lock(false);
      }
    }

    editButton.addEventListener('click', () => (editing ? saveEditing() : enterEditMode()));
    cancelButton.addEventListener('click', () => { if (!saving) leaveEditMode(); });
    [title, instruction, task].forEach((node) => {
      node.addEventListener('input', updateDirty);
      node.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plain = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plain);
        updateDirty();
      });
    });
    title.addEventListener('keydown', (event) => {
      if (editing && event.key === 'Enter') event.preventDefault();
    });
    section.addEventListener('keydown', (event) => {
      if (!editing || saving) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        leaveEditMode();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        saveEditing();
      }
    });

    textarea.value = localText;
    paint();
    return section;
  }

  const api = {
    ART_SRC,
    MAX_COMMENT_LENGTH,
    MAX_TEXT_LENGTH,
    SCORES,
    STATUSES,
    WORD_LIMITS,
    countWords,
    normalizeHomeworkWriting,
    normalizeWriting,
    renderHomeworkWriting,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HomeworkWritingComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
