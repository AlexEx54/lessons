(function initCommunicationTask(root) {
  'use strict';
  const markdown = root.SafeMarkdown || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  const HELP = [['vocabulary', 'Useful vocab'], ['phrases', 'Useful phrases'], ['sentenceStarters', 'Sentence starters']];
  function renderCommunicationTask(task, doc = root.document) {
    const make = (tag, className, text) => {
      const node = doc.createElement(tag); node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const rich = (tag, text) => {
      const node = make(tag, 'safe-markdown');
      markdown.renderMarkdownInto(node, text, doc); return node;
    };
    const section = make('section', 'communication-task');
    section.append(make('h3', 'communication-task__title', task.title));
    const body = make('div', 'communication-task__body');
    const tasks = make('div', 'communication-task__tasks');
    const questions = make('section', 'communication-task__panel');
    questions.append(make('h4', '', '💬 Questions'));
    const list = make('ol', 'communication-task__questions');
    task.questions.forEach(text => list.append(rich('li', text)));
    questions.append(list);
    const mini = make('section', 'communication-task__panel');
    mini.append(make('h4', '', '🎯 Mini-task'), rich('div', task.miniTask.text));
    if (task.miniTask.example) {
      const example = rich('div', task.miniTask.example);
      example.classList.add('communication-task__example'); mini.append(example);
    }
    tasks.append(questions, mini);
    const help = make('section', 'communication-task__support');
    help.append(make('h4', '', '✅ Student Help'));
    const columns = make('div', 'communication-task__help');
    HELP.forEach(([key, title]) => {
      const column = make('section', 'communication-task__help-column');
      column.append(make('h5', '', title));
      const items = make('ul', '');
      task.help[key].forEach(text => items.append(rich('li', text)));
      column.append(items); columns.append(column);
    });
    help.append(columns); body.append(tasks, help); section.append(body); return section;
  }
  const api = { HELP, renderCommunicationTask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CommunicationTaskComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
