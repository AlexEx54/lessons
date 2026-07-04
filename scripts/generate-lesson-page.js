#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = [
  'warmup',
  'lead-in',
  'target-vocabulary',
  'reading',
  'grammar',
  'grammar-practice',
  'speaking',
  'resources',
];

const SUPPORTED_CONTROLS = new Set([
  'wordAssociationStrikeList',
  'opinionSort',
  'discussionQuestions',
  'definitionMatch',
  'gapFillBank',
  'phrasalVerbPractice',
  'taskList',
  'readingText',
  'readingQuizRadio',
  'grammarRuleCards',
  'completeRule',
  'chooseCorrect',
  'controlledInputPractice',
  'dropdownChoicePractice',
  'speakingQuestions',
  'translationSelfCheck',
  'resourceNotes',
]);

function fail(message) {
  console.error(`Lesson page generation failed: ${message}`);
  process.exit(1);
}

function readLessonSpec(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`cannot read ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`invalid JSON in ${filePath}: ${error.message}`);
  }
}

function validateLessonSpec(spec) {
  if (!spec || typeof spec !== 'object') fail('lesson spec must be an object');
  if (spec.schemaVersion !== 'lesson-spec-v1') {
    fail('schemaVersion must be "lesson-spec-v1"');
  }
  if (!Array.isArray(spec.sections)) fail('sections must be an array');
  if (spec.sections.length !== REQUIRED_SECTIONS.length) {
    fail(`sections must contain exactly ${REQUIRED_SECTIONS.length} sections`);
  }

  REQUIRED_SECTIONS.forEach((sectionId, index) => {
    const section = spec.sections[index];
    if (!section || typeof section !== 'object') {
      fail(`section at index ${index} must be an object`);
    }
    if (section.id !== sectionId) {
      fail(`section ${index + 1} must be "${sectionId}", got "${section.id || 'missing'}"`);
    }
    if (!Array.isArray(section.controls)) {
      fail(`section "${sectionId}" must have a controls array`);
    }
    [...section.controls, ...(Array.isArray(section.alternativeControls) ? section.alternativeControls : [])].forEach(control => {
      if (!control || typeof control !== 'object') fail(`section "${sectionId}" has an invalid control`);
      if (!SUPPORTED_CONTROLS.has(control.type)) {
        fail(`unsupported control type "${control.type}" in section "${sectionId}"`);
      }
      if (!control.id || typeof control.id !== 'string') {
        fail(`control "${control.type}" in section "${sectionId}" must have an id`);
      }
    });
  });
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function generateHtml(spec) {
  const title = spec.hero && spec.hero.title ? spec.hero.title : spec.meta && spec.meta.topic ? spec.meta.topic : 'English Lesson';
  const lessonJson = escapeScriptJson(spec);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #f4fbf7;
      --bg-soft: #eaf6ff;
      --panel: rgba(255, 255, 255, 0.92);
      --line: rgba(26, 89, 119, 0.18);
      --ink: #15384b;
      --soft-ink: #4f6f81;
      --brand: #f08a38;
      --brand-2: #0d9fa5;
      --ok: #1f9a62;
      --bad: #d54646;
      --warn: #a76312;
      --shadow: 0 12px 28px rgba(21, 72, 94, 0.14);
    }

    * { box-sizing: border-box; }
    html { max-width: 100%; overflow-x: hidden; }
    body {
      margin: 0;
      min-height: 100vh;
      max-width: 100%;
      overflow-x: hidden;
      color: var(--ink);
      font-family: "Nunito", "Trebuchet MS", sans-serif;
      background:
        radial-gradient(circle at 8% 0%, rgba(240, 138, 56, 0.22), transparent 30%),
        radial-gradient(circle at 94% 16%, rgba(13, 159, 165, 0.2), transparent 28%),
        linear-gradient(145deg, var(--bg), var(--bg-soft) 54%, #fff4e7);
    }

    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }

    .page {
      width: min(1040px, calc(100% - 24px));
      margin: 28px auto 44px;
      display: grid;
      gap: 18px;
    }

    .hero, .section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(8px);
    }

    .hero {
      min-height: 220px;
      display: grid;
      align-content: end;
      padding: 28px;
      background:
        linear-gradient(115deg, rgba(255,255,255,0.92), rgba(255,255,255,0.74)),
        radial-gradient(circle at 82% 20%, rgba(240, 138, 56, 0.22), transparent 32%),
        radial-gradient(circle at 18% 12%, rgba(13, 159, 165, 0.18), transparent 30%),
        var(--panel);
    }

    .hero h1 {
      margin: 0;
      max-width: 780px;
      font-family: "Baloo 2", cursive;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.02;
      color: #104867;
      letter-spacing: 0;
    }

    .hero p {
      margin: 8px 0 0;
      max-width: 760px;
      color: var(--soft-ink);
      font-size: 1.05rem;
    }

    .pill-row { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #c5deea;
      background: #edf8ff;
      color: #1f5b77;
      font-size: 0.9rem;
      font-weight: 800;
    }

    .section { padding: 20px; scroll-margin-top: 18px; }
    .section h2 {
      margin: 0 0 10px;
      font-family: "Baloo 2", cursive;
      color: #14597b;
      font-size: clamp(1.35rem, 2.5vw, 1.9rem);
      line-height: 1.08;
      letter-spacing: 0;
    }

    .instruction, .small-note { color: var(--soft-ink); margin: 6px 0 10px; }
    .control { margin-top: 14px; }
    .control + .control { padding-top: 14px; border-top: 1px dashed rgba(21, 86, 116, 0.22); }

    .card-grid, .question-grid, .translation-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 10px;
    }

    .word-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
    }

    .word-card, .chip, .def-chip, .choice-card {
      border: 2px solid #bad8e3;
      border-radius: 10px;
      background: #fff;
      color: #1d4963;
      padding: 9px 12px;
      font-weight: 800;
      transition: transform 0.15s ease, border-color 0.2s ease, background-color 0.2s ease, opacity 0.2s ease;
      text-align: left;
    }

    .word-card:hover, .chip:hover, .def-chip:hover { transform: translateY(-1px); border-color: var(--brand); }
    .word-card.used { text-decoration: line-through; opacity: 0.55; background: #eef7f5; }
    .chip.selected, .def-chip.selected { border-color: var(--brand-2); background: #e8fbfb; }
    .chip.placed, .def-chip.placed { opacity: 0.35; pointer-events: none; }

    .sort-pool, .bank-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
    .sort-columns {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
    }

    .sort-col, .drop-row, .exercise, .rule-card, .question-card, .translation-card, .reading-box {
      border: 1px solid rgba(20, 89, 123, 0.22);
      border-radius: 12px;
      background: rgba(250, 255, 255, 0.9);
      padding: 12px;
    }

    .sort-col {
      min-height: 140px;
      border: 2px dashed rgba(21, 84, 119, 0.28);
    }

    .sort-col h3 {
      margin: 0 0 8px;
      text-align: center;
      text-transform: uppercase;
      font-size: 0.88rem;
      color: #1b5d7f;
      letter-spacing: 0;
    }

    .placed-items { display: flex; flex-wrap: wrap; gap: 6px; }
    .placed-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 9px;
      border-radius: 8px;
      border: 1px solid #bbdbe8;
      background: #eaf8ff;
      color: #1f5b77;
      font-size: 0.88rem;
      font-weight: 800;
    }

    .placed-chip button {
      border: none;
      background: transparent;
      color: #6c7b85;
      padding: 0 2px;
      font-weight: 900;
    }

    .match-wrap { display: grid; gap: 8px; }
    .drop-row {
      display: grid;
      grid-template-columns: minmax(120px, 190px) 1fr;
      align-items: center;
      gap: 10px;
    }

    .term {
      color: #0f5d7b;
      font-weight: 900;
    }

    .drop-zone {
      min-height: 42px;
      display: flex;
      align-items: center;
      border: 2px dashed #c4deea;
      border-radius: 10px;
      padding: 7px 9px;
      color: #7d97a6;
      font-style: italic;
    }

    .drop-zone.done {
      border-style: solid;
      border-color: var(--ok);
      background: #eafef2;
      color: #1e4863;
      font-style: normal;
      font-weight: 800;
    }

    .status {
      min-height: 22px;
      margin-top: 8px;
      color: #145574;
      font-weight: 900;
    }

    .status.ok, .ok-text { color: var(--ok); }
    .status.bad, .bad-text { color: var(--bad); }
    .muted { color: var(--soft-ink); }

    .inline-line { line-height: 2.15; color: #1d4a64; }
    .inline-control {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin: 0 3px;
      vertical-align: middle;
    }

    input, select, textarea {
      border: 2px solid #9cc7d8;
      border-radius: 9px;
      padding: 6px 8px;
      color: #114862;
      background: #fff;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--brand);
    }

    select.correct, input.correct { border-color: var(--ok); background: #eafff2; }
    select.wrong, input.wrong { border-color: var(--bad); background: #fff0f0; }

    .mark {
      min-width: 20px;
      font-weight: 900;
      opacity: 0;
      transform: scale(0.75);
      transition: opacity 0.16s ease, transform 0.16s ease;
    }

    .mark.visible { opacity: 1; transform: scale(1); }
    .mark.good { color: var(--ok); }
    .mark.bad { color: var(--bad); }

    .btn {
      border: none;
      border-radius: 10px;
      padding: 9px 12px;
      background: linear-gradient(120deg, #f39a50, #ef7f1f);
      color: #fff;
      font-weight: 900;
    }

    .btn.secondary { background: linear-gradient(120deg, #18a3a5, #0f888a); }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .reading-box { line-height: 1.8; color: #244f66; }
    .reading-box h3 { margin: 0 0 8px; color: #125777; }
    .reading-box p { margin: 8px 0; }

    .qa-list { display: grid; gap: 9px; margin: 8px 0 0; padding-left: 20px; }
    .quiz-options { display: grid; gap: 6px; margin-top: 8px; }
    .quiz-options label {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 7px 8px;
      border-radius: 8px;
      border: 1px solid rgba(20, 89, 123, 0.16);
      background: #fff;
    }

    .quiz-options label.correct { border-color: var(--ok); background: #eafff2; }
    .quiz-options label.wrong { border-color: var(--bad); background: #fff0f0; }

    .rule-card h3, .question-card h3, .translation-card h3 {
      margin: 0 0 6px;
      color: #125777;
      font-size: 1.02rem;
    }

    .rule-card p, .question-card p, .translation-card p { margin: 6px 0; color: #204d67; }
    .examples { margin: 8px 0 0; padding-left: 18px; color: #315d73; }

    textarea {
      width: 100%;
      min-height: 120px;
      resize: vertical;
    }

    details.translation-card summary {
      cursor: pointer;
      color: #125777;
      font-weight: 900;
    }

    .sync-shell {
      position: fixed;
      right: 14px;
      top: 12px;
      z-index: 30;
      width: min(370px, calc(100% - 20px));
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(17, 87, 118, 0.2);
      border-radius: 14px;
      box-shadow: 0 10px 24px rgba(0, 60, 95, 0.18);
      backdrop-filter: blur(8px);
      padding: 10px;
      color: #164961;
    }

    .sync-title.toggle {
      display: block;
      width: 100%;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      text-align: left;
      color: #125575;
      font-weight: 900;
    }

    .sync-title.toggle::after {
      content: "v";
      float: right;
      color: #4f7488;
      font-size: 0.82rem;
    }

    .sync-shell.collapsed .sync-title.toggle::after { content: ">"; }
    .sync-shell.collapsed .sync-shell-body { display: none; }
    .sync-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 7px; }
    .sync-row.single { grid-template-columns: 1fr; }
    .sync-shell input, .sync-shell select, .sync-shell button { width: 100%; font-size: 0.9rem; }
    .sync-meta { margin-top: 7px; color: #5c7989; font-size: 0.83rem; line-height: 1.4; }
    .teacher-box { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(21, 86, 116, 0.28); }
    .teacher-box.active { display: block; }
    .teacher-box h4 { margin: 0 0 7px; color: #145c7d; }
    .teacher-grid { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 7px; }
    .teacher-grid button { font-size: 0.84rem; padding: 7px; }

    .remote-cursor {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 25;
      display: none;
      pointer-events: none;
      transform: translate(-9999px, -9999px);
    }

    .remote-cursor.visible { display: block; }
    .remote-cursor-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #d84545;
      border: 2px solid #fff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    .remote-cursor-label {
      margin-top: 4px;
      width: max-content;
      padding: 2px 6px;
      border-radius: 8px;
      background: rgba(216, 69, 69, 0.95);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 900;
    }

    .remote-cursor.role-teacher .remote-cursor-dot { background: #2f72d8; }
    .remote-cursor.role-teacher .remote-cursor-label { background: rgba(47, 114, 216, 0.95); }
    .teacher-highlight {
      outline: 3px solid #f08a38 !important;
      box-shadow: 0 0 0 4px rgba(240, 138, 56, 0.28);
      transition: box-shadow 0.2s ease;
    }

    .page.readonly-mirror {
      outline: 2px dashed rgba(25, 99, 133, 0.45);
      outline-offset: 6px;
    }

    .page.readonly-mirror button,
    .page.readonly-mirror input,
    .page.readonly-mirror textarea,
    .page.readonly-mirror select { cursor: not-allowed; }

    @media (max-width: 760px) {
      .page { width: min(1040px, calc(100% - 12px)); margin-top: 12px; }
      .hero, .section { padding: 15px; }
      .sync-shell { position: sticky; top: 8px; right: auto; width: calc(100% - 12px); margin: 8px auto; max-height: 55vh; overflow: auto; }
      .sync-row, .teacher-grid, .sort-columns, .drop-row { grid-template-columns: 1fr; }
      .hero { min-height: 190px; }
    }

    @media (max-width: 520px) {
      .page { width: calc(100% - 8px); gap: 12px; margin-bottom: 16px; }
      .hero, .section { padding: 12px; border-radius: 12px; }
      .card-grid, .question-grid, .translation-grid, .word-grid { grid-template-columns: 1fr; }
      .pill { font-size: 0.82rem; }
      select { min-width: 0; max-width: 100%; }
      .inline-control { display: inline-grid; grid-template-columns: minmax(120px, 1fr) auto; margin: 4px 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <aside class="sync-shell" id="sync-shell">
    <button class="sync-title toggle" id="sync-shell-toggle" type="button" aria-expanded="true">Live Lesson Control</button>
    <div class="sync-shell-body" id="sync-shell-body">
      <div class="sync-row">
        <select id="role-select">
          <option value="student">Student mode</option>
          <option value="teacher">Teacher mode</option>
        </select>
        <input id="room-input" type="text" placeholder="Room code" />
      </div>
      <div class="sync-row">
        <button class="btn secondary" id="connect-btn" type="button">Connect</button>
        <button class="btn" id="copy-link-btn" type="button">Copy student link</button>
      </div>
      <div class="sync-meta" id="sync-status">Status: offline. Choose role + room, then Connect.</div>
      <div class="sync-meta" id="student-link-meta">Student link will appear here.</div>

      <div class="teacher-box" id="teacher-box">
        <h4>Teacher Dashboard</h4>
        <p class="sync-meta" id="student-tracker">Student activity: waiting...</p>
        <div class="sync-row single">
          <button class="btn secondary" id="bring-to-me-btn" type="button">Bring student to my current section</button>
        </div>
        <div class="teacher-grid" id="section-goto-grid"></div>
        <div class="sync-row">
          <input id="highlight-selector-input" type="text" placeholder="Selector, e.g. #reading" />
          <button class="btn" id="highlight-selector-btn" type="button">Highlight selector</button>
        </div>
        <div class="teacher-grid" id="word-spotlight-grid"></div>
      </div>
    </div>
  </aside>

  <div class="remote-cursor" id="remote-cursor">
    <div class="remote-cursor-dot"></div>
    <div class="remote-cursor-label">Student</div>
  </div>

  <main class="page" id="lesson-page"></main>

  <script>
    window.LESSON_SPEC = ${lessonJson};
  </script>
  <script>
    (() => {
      const lesson = window.LESSON_SPEC;
      const page = document.getElementById('lesson-page');
      const state = {
        selectedOpinionId: '',
        selectedDefinitionId: '',
      };

      function text(value) {
        return value === null || value === undefined ? '' : String(value);
      }

      function normalized(value) {
        return text(value).trim().toLowerCase().replace(/\\s+/g, ' ');
      }

      function slug(value) {
        return text(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
      }

      function controlKey(control, itemId, suffix) {
        return [control.id, itemId, suffix].filter(Boolean).map(slug).join('--');
      }

      function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
          if (value === false || value === null || value === undefined) return;
          if (key === 'class') node.className = value;
          else if (key === 'text') node.textContent = value;
          else if (key === 'html') node.innerHTML = value;
          else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
              if (dataValue !== null && dataValue !== undefined) node.dataset[dataKey] = String(dataValue);
            });
          } else if (key in node) {
            node[key] = value;
          } else {
            node.setAttribute(key, value);
          }
        });
        [].concat(children).filter(Boolean).forEach(child => {
          node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
      }

      function addInstruction(parent, control) {
        if (control.instruction) parent.appendChild(el('p', { class: 'instruction', text: control.instruction }));
      }

      function makeOption(value, label) {
        return el('option', { value: text(value), text: text(label === undefined ? value : label) });
      }

      function shuffle(items) {
        return [...items].sort((a, b) => slug(a.id || a.term || a.text).localeCompare(slug(b.id || b.term || b.text)));
      }

      function setStatus(node, message, tone) {
        if (!node) return;
        node.textContent = message;
        node.classList.remove('ok', 'bad');
        if (tone) node.classList.add(tone);
      }

      function flashWrong(node) {
        node.classList.add('wrong');
        window.setTimeout(() => node.classList.remove('wrong'), 650);
      }

      function markSelect(select, answer, statusNode) {
        select.classList.remove('correct', 'wrong');
        if (!select.value) return false;
        if (select.value === answer) {
          select.classList.add('correct');
          if (statusNode) setStatus(statusNode, 'Correct.', 'ok');
          return true;
        }
        select.classList.add('wrong');
        if (statusNode) setStatus(statusNode, 'Try again.', 'bad');
        return false;
      }

      function renderHero() {
        const hero = lesson.hero || {};
        const meta = lesson.meta || {};
        const node = el('section', { class: 'hero', id: 'lesson-hero' });
        node.appendChild(el('h1', { text: hero.title || meta.topic || 'English Lesson' }));
        if (hero.subtitle) node.appendChild(el('p', { text: hero.subtitle }));
        const pills = Array.isArray(hero.pills) ? hero.pills : [];
        if (pills.length > 0) {
          const row = el('div', { class: 'pill-row' });
          pills.forEach(pill => row.appendChild(el('span', { class: 'pill', text: pill })));
          node.appendChild(row);
        }
        page.appendChild(node);
      }

      function renderWordAssociation(control, host) {
        addInstruction(host, control);
        const grid = el('div', { class: 'word-grid' });
        (control.items || []).forEach((item, index) => {
          const key = controlKey(control, index + 1, 'word');
          const button = el('button', { type: 'button', class: 'word-card', text: item, dataset: { syncKey: key } });
          button.addEventListener('click', () => button.classList.toggle('used'));
          grid.appendChild(button);
        });
        host.appendChild(grid);
      }

      function renderOpinionSort(control, host) {
        addInstruction(host, control);
        const pool = el('div', { class: 'sort-pool' });
        const columns = el('div', { class: 'sort-columns' });
        const status = el('div', { class: 'status', text: 'Placed: 0 / ' + (control.items || []).length });
        const placements = new Map();

        function updateStatus() {
          status.textContent = 'Placed: ' + placements.size + ' / ' + (control.items || []).length;
        }

        function placeItem(item, columnName) {
          const itemId = item.id || slug(item.text);
          const previous = host.querySelector('[data-placed-id="' + cssEscape(itemId) + '"]');
          if (previous) previous.remove();
          placements.set(itemId, columnName);

          const chip = el('span', { class: 'placed-chip', dataset: { placedId: itemId, syncKey: controlKey(control, itemId, 'placed') } }, [
            text(item.text),
            el('button', { type: 'button', text: 'x', dataset: { syncKey: controlKey(control, itemId, 'remove') } }),
          ]);
          chip.querySelector('button').addEventListener('click', event => {
            event.stopPropagation();
            chip.remove();
            placements.delete(itemId);
            const source = pool.querySelector('[data-item-id="' + cssEscape(itemId) + '"]');
            if (source) source.classList.remove('placed', 'selected');
            updateStatus();
          });
          const target = columns.querySelector('[data-column-name="' + cssEscape(columnName) + '"] .placed-items');
          if (target) target.appendChild(chip);
          const source = pool.querySelector('[data-item-id="' + cssEscape(itemId) + '"]');
          if (source) source.classList.add('placed');
          state.selectedOpinionId = '';
          pool.querySelectorAll('.chip.selected').forEach(node => node.classList.remove('selected'));
          updateStatus();
        }

        (control.items || []).forEach(item => {
          const itemId = item.id || slug(item.text);
          const button = el('button', {
            type: 'button',
            class: 'chip',
            text: item.text,
            dataset: { itemId, syncKey: controlKey(control, itemId, 'source') },
          });
          button.addEventListener('click', () => {
            if (button.classList.contains('placed')) return;
            pool.querySelectorAll('.chip.selected').forEach(node => node.classList.remove('selected'));
            state.selectedOpinionId = itemId;
            button.classList.add('selected');
          });
          pool.appendChild(button);
        });

        (control.columns || ['Agree', 'Not sure / It depends', 'Disagree']).forEach(columnName => {
          const column = el('div', { class: 'sort-col', dataset: { columnName, syncKey: controlKey(control, slug(columnName), 'column') } }, [
            el('h3', { text: columnName }),
            el('div', { class: 'placed-items' }),
          ]);
          column.addEventListener('click', () => {
            if (!state.selectedOpinionId) return;
            const item = (control.items || []).find(candidate => (candidate.id || slug(candidate.text)) === state.selectedOpinionId);
            if (item) placeItem(item, columnName);
          });
          columns.appendChild(column);
        });

        host.append(pool, columns, status);
      }

      function renderDiscussionQuestions(control, host) {
        addInstruction(host, control);
        const list = el('ol', { class: 'qa-list' });
        (control.items || []).forEach(item => list.appendChild(el('li', { text: item })));
        host.appendChild(list);
      }

      function renderDefinitionMatch(control, host) {
        addInstruction(host, control);
        const items = control.items || [];
        const pool = el('div', { class: 'sort-pool' });
        const rows = el('div', { class: 'match-wrap' });
        const status = el('div', { class: 'status', text: 'Matched: 0 / ' + items.length });
        const done = new Set();

        shuffle(items).forEach(item => {
          const itemId = item.id || slug(item.term);
          const chip = el('button', {
            type: 'button',
            class: 'def-chip',
            text: item.definition,
            dataset: { defId: itemId, syncKey: controlKey(control, itemId, 'definition') },
          });
          chip.addEventListener('click', () => {
            if (chip.classList.contains('placed')) return;
            pool.querySelectorAll('.def-chip.selected').forEach(node => node.classList.remove('selected'));
            state.selectedDefinitionId = itemId;
            chip.classList.add('selected');
            setStatus(status, 'Now click the matching word.', '');
          });
          pool.appendChild(chip);
        });

        items.forEach(item => {
          const itemId = item.id || slug(item.term);
          const drop = el('div', { class: 'drop-zone', text: 'drop definition here', dataset: { defId: itemId, syncKey: controlKey(control, itemId, 'drop') } });
          drop.addEventListener('click', () => {
            if (drop.classList.contains('done')) return;
            if (!state.selectedDefinitionId) {
              setStatus(status, 'Pick a definition first. Matched: ' + done.size + ' / ' + items.length, '');
              return;
            }
            const chip = pool.querySelector('[data-def-id="' + cssEscape(state.selectedDefinitionId) + '"]');
            if (state.selectedDefinitionId === itemId) {
              drop.textContent = (chip ? chip.textContent : item.definition) + ' OK';
              drop.classList.add('done');
              if (chip) chip.classList.remove('selected');
              if (chip) chip.classList.add('placed');
              done.add(itemId);
              state.selectedDefinitionId = '';
              setStatus(status, done.size === items.length ? 'Matched: ' + done.size + ' / ' + items.length + '. Perfect!' : 'Matched: ' + done.size + ' / ' + items.length, 'ok');
            } else {
              if (chip) flashWrong(chip);
              if (chip) chip.classList.remove('selected');
              state.selectedDefinitionId = '';
              setStatus(status, 'Not a match. Try again. Matched: ' + done.size + ' / ' + items.length, 'bad');
            }
          });
          rows.appendChild(el('div', { class: 'drop-row' }, [
            el('div', { class: 'term', text: item.term, dataset: { word: item.term } }),
            drop,
          ]));
        });

        host.append(pool, rows, status);
      }

      function renderGapFillBank(control, host) {
        addInstruction(host, control);
        const wordBank = control.wordBank || [];
        if (wordBank.length > 0) {
          const bank = el('div', { class: 'bank-row' });
          wordBank.forEach(word => bank.appendChild(el('span', { class: 'pill', text: word })));
          host.appendChild(bank);
        }
        const line = el('div', { class: 'inline-line' });
        const status = el('div', { class: 'status', text: 'Done: 0 / ' + (control.items || []).length });
        const done = new Set();
        (control.items || []).forEach((item, index) => {
          line.appendChild(document.createTextNode(text(item.before)));
          const select = el('select', { dataset: { syncKey: controlKey(control, item.id || index + 1, 'select') } }, [makeOption('', '-- choose --')]);
          wordBank.forEach(word => select.appendChild(makeOption(word)));
          select.addEventListener('change', () => {
            const itemId = item.id || String(index + 1);
            if (markSelect(select, item.answer)) {
              done.add(itemId);
              select.disabled = true;
              setStatus(status, done.size === (control.items || []).length ? 'Done: ' + done.size + ' / ' + (control.items || []).length + '. Perfect!' : 'Done: ' + done.size + ' / ' + (control.items || []).length, 'ok');
            } else if (select.value) {
              setStatus(status, 'Try again. Done: ' + done.size + ' / ' + (control.items || []).length, 'bad');
            }
          });
          line.appendChild(el('span', { class: 'inline-control' }, [select]));
          line.appendChild(document.createTextNode(text(item.after) + ' '));
          if (index < (control.items || []).length - 1) line.appendChild(el('br'));
        });
        host.append(line, status);
      }

      function renderPhrasalVerbPractice(control, host) {
        addInstruction(host, control);
        const matchItems = control.matchItems || [];
        if (matchItems.length > 0) {
          host.appendChild(el('p', { class: 'small-note', text: 'Part A: Choose the matching definition letter.' }));
          const rows = el('div', { class: 'match-wrap' });
          const letters = matchItems.map(item => item.letter || slug(item.term).slice(0, 1));
          const definitions = el('ol', { class: 'qa-list', type: 'a' });
          matchItems.forEach(item => definitions.appendChild(el('li', { text: item.definition })));
          host.appendChild(definitions);
          matchItems.forEach(item => {
            const select = el('select', { dataset: { syncKey: controlKey(control, item.id, 'letter') } }, [makeOption('', '-- choose --')]);
            letters.forEach(letter => select.appendChild(makeOption(letter)));
            const rowStatus = el('span', { class: 'mark' });
            select.addEventListener('change', () => {
              const correct = select.value === item.letter;
              select.classList.toggle('correct', correct);
              select.classList.toggle('wrong', Boolean(select.value && !correct));
              rowStatus.textContent = correct ? 'OK' : 'X';
              rowStatus.className = 'mark visible ' + (correct ? 'good' : 'bad');
            });
            rows.appendChild(el('div', { class: 'drop-row' }, [
              el('div', { class: 'term', text: item.term }),
              el('div', {}, [select, rowStatus]),
            ]));
          });
          host.appendChild(rows);
        }
        if ((control.gapFillItems || []).length > 0) {
          const gapControl = {
            id: control.id + '-gaps',
            instruction: 'Part B: Complete the sentences.',
            wordBank: control.wordBank || matchItems.map(item => item.term),
            items: control.gapFillItems,
          };
          const box = el('div', { class: 'exercise' });
          renderGapFillBank(gapControl, box);
          host.appendChild(box);
        }
      }

      function renderTaskList(control, host) {
        const list = el('ol', { class: 'qa-list' });
        (control.items || []).forEach(item => list.appendChild(el('li', { text: item })));
        host.appendChild(list);
      }

      function renderReadingText(control, host) {
        const box = el('div', { class: 'reading-box' });
        if (control.title) box.appendChild(el('h3', { text: control.title }));
        (control.paragraphs || []).forEach(paragraph => box.appendChild(el('p', { text: paragraph })));
        host.appendChild(box);
      }

      function renderReadingQuiz(control, host) {
        addInstruction(host, control);
        const list = el('div', { class: 'question-grid' });
        const status = el('div', { class: 'status', text: 'Score: 0 / ' + (control.items || []).length });
        (control.items || []).forEach((item, index) => {
          const card = el('div', { class: 'question-card' });
          card.appendChild(el('h3', { text: (index + 1) + '. ' + item.question }));
          const options = el('div', { class: 'quiz-options' });
          (item.options || []).forEach(option => {
            const input = el('input', {
              type: 'radio',
              name: controlKey(control, item.id || index + 1, 'radio'),
              value: option,
              dataset: { syncKey: controlKey(control, item.id || index + 1, slug(option)) },
            });
            options.appendChild(el('label', {}, [input, el('span', { text: option })]));
          });
          card.appendChild(options);
          list.appendChild(card);
        });
        const button = el('button', { type: 'button', class: 'btn', text: 'Check quiz', dataset: { syncKey: controlKey(control, 'check', 'button') } });
        button.addEventListener('click', () => {
          let score = 0;
          (control.items || []).forEach((item, index) => {
            const name = controlKey(control, item.id || index + 1, 'radio');
            const checked = host.querySelector('input[name="' + cssEscape(name) + '"]:checked');
            const labels = host.querySelectorAll('input[name="' + cssEscape(name) + '"]');
            labels.forEach(input => input.closest('label').classList.remove('correct', 'wrong'));
            if (checked && checked.value === item.answer) {
              score += 1;
              checked.closest('label').classList.add('correct');
            } else if (checked) {
              checked.closest('label').classList.add('wrong');
            }
          });
          setStatus(status, 'Score: ' + score + ' / ' + (control.items || []).length, score === (control.items || []).length ? 'ok' : 'bad');
        });
        host.append(list, button, status);
      }

      function renderGrammarRuleCards(control, host) {
        const grid = el('div', { class: 'card-grid' });
        (control.cards || []).forEach(card => {
          const node = el('div', { class: 'rule-card' }, [
            el('h3', { text: card.title || 'Rule' }),
            el('p', { text: card.body || '' }),
          ]);
          if (Array.isArray(card.examples) && card.examples.length > 0) {
            const examples = el('ul', { class: 'examples' });
            card.examples.forEach(example => examples.appendChild(el('li', { text: example })));
            node.appendChild(examples);
          }
          grid.appendChild(node);
        });
        host.appendChild(grid);
      }

      function renderSelectSentences(control, host) {
        addInstruction(host, control);
        const line = el('div', { class: 'inline-line' });
        (control.items || []).forEach((item, index) => {
          line.appendChild(document.createTextNode(text(item.before)));
          const select = el('select', { dataset: { syncKey: controlKey(control, item.id || index + 1, 'select') } }, [makeOption('', '-- choose --')]);
          (item.options || []).forEach(option => select.appendChild(makeOption(option)));
          const mark = el('span', { class: 'mark' });
          select.addEventListener('change', () => {
            const correct = select.value === item.answer;
            select.classList.toggle('correct', correct);
            select.classList.toggle('wrong', Boolean(select.value && !correct));
            mark.textContent = correct ? 'OK' : 'X';
            mark.className = 'mark visible ' + (correct ? 'good' : 'bad');
          });
          line.appendChild(el('span', { class: 'inline-control' }, [select, mark]));
          line.appendChild(document.createTextNode(text(item.after) + ' '));
          if (index < (control.items || []).length - 1) line.appendChild(el('br'));
        });
        host.appendChild(line);
      }

      function renderControlledInput(control, host) {
        addInstruction(host, control);
        if (Array.isArray(control.examples) && control.examples.length > 0) {
          const examples = el('ul', { class: 'examples' });
          control.examples.forEach(example => examples.appendChild(el('li', { text: example.prompt + ' -> ' + example.answer })));
          host.appendChild(examples);
        }
        const line = el('div', { class: 'inline-line' });
        const status = el('div', { class: 'status', text: 'Done: 0 / ' + (control.items || []).length });
        const done = new Set();
        (control.items || []).forEach((item, index) => {
          line.appendChild(document.createTextNode(text(item.prompt) + ' '));
          const input = el('input', {
            type: 'text',
            autocomplete: 'off',
            spellcheck: false,
            placeholder: item.baseVerb || '',
            dataset: { syncKey: controlKey(control, item.id || index + 1, 'input') },
          });
          const mark = el('span', { class: 'mark' });
          const accepted = [item.answer, ...(Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers : [])].map(normalized).filter(Boolean);
          function checkInput(live) {
            if (done.has(item.id || String(index + 1))) return;
            const correct = accepted.includes(normalized(input.value));
            input.classList.toggle('correct', correct);
            if (correct) {
              mark.textContent = 'OK';
              mark.className = 'mark visible good';
              done.add(item.id || String(index + 1));
              input.disabled = true;
              setStatus(status, done.size === (control.items || []).length ? 'Done: ' + done.size + ' / ' + (control.items || []).length + '. Great!' : 'Done: ' + done.size + ' / ' + (control.items || []).length, 'ok');
            } else if (!live) {
              input.classList.add('wrong');
              mark.textContent = 'X';
              mark.className = 'mark visible bad';
              window.setTimeout(() => {
                input.classList.remove('wrong');
                mark.className = 'mark';
              }, 800);
            }
          }
          input.addEventListener('input', () => checkInput(true));
          input.addEventListener('keydown', event => {
            if (event.key === 'Enter') checkInput(false);
          });
          line.appendChild(el('span', { class: 'inline-control' }, [input, mark]));
          if (item.after) line.appendChild(document.createTextNode(' ' + item.after + ' '));
          if (index < (control.items || []).length - 1) line.appendChild(el('br'));
        });
        host.append(line, status);
      }

      function renderSpeakingQuestions(control, host) {
        addInstruction(host, control);
        const grid = el('div', { class: 'question-grid' });
        (control.items || []).forEach((item, index) => grid.appendChild(el('div', { class: 'question-card' }, [
          el('h3', { text: 'Question ' + (index + 1) }),
          el('p', { text: item }),
        ])));
        host.appendChild(grid);
      }

      function renderTranslationSelfCheck(control, host) {
        addInstruction(host, control);
        const grid = el('div', { class: 'translation-grid' });
        (control.items || []).forEach((item, index) => {
          grid.appendChild(el('details', { class: 'translation-card', dataset: { syncKey: controlKey(control, item.id || index + 1, 'details') } }, [
            el('summary', { text: item.sourceRu || 'Translate sentence ' + (index + 1) }),
            el('p', { text: item.answerEn || '' }),
          ]));
        });
        host.appendChild(grid);
      }

      function renderResourceNotes(control, host) {
        addInstruction(host, control);
        host.appendChild(el('textarea', {
          placeholder: control.placeholder || 'Write links or notes here...',
          value: control.initialValue || '',
          dataset: { syncKey: controlKey(control, 'notes', 'textarea') },
        }));
      }

      const renderers = {
        wordAssociationStrikeList: renderWordAssociation,
        opinionSort: renderOpinionSort,
        discussionQuestions: renderDiscussionQuestions,
        definitionMatch: renderDefinitionMatch,
        gapFillBank: renderGapFillBank,
        phrasalVerbPractice: renderPhrasalVerbPractice,
        taskList: renderTaskList,
        readingText: renderReadingText,
        readingQuizRadio: renderReadingQuiz,
        grammarRuleCards: renderGrammarRuleCards,
        completeRule: renderSelectSentences,
        chooseCorrect: renderSelectSentences,
        controlledInputPractice: renderControlledInput,
        dropdownChoicePractice: renderSelectSentences,
        speakingQuestions: renderSpeakingQuestions,
        translationSelfCheck: renderTranslationSelfCheck,
        resourceNotes: renderResourceNotes,
      };

      function renderControl(control, sectionHost) {
        const host = el('div', { class: 'control', id: control.id });
        const renderer = renderers[control.type];
        if (renderer) renderer(control, host);
        else host.appendChild(el('p', { class: 'bad-text', text: 'Unsupported control: ' + control.type }));
        sectionHost.appendChild(host);
      }

      function renderSections() {
        (lesson.sections || []).forEach(section => {
          const sectionNode = el('section', { class: 'section', id: section.id });
          sectionNode.appendChild(el('h2', { text: section.title || section.id }));
          (section.controls || []).forEach(control => renderControl(control, sectionNode));
          if (Array.isArray(section.alternativeControls) && section.alternativeControls.length > 0) {
            const alt = el('div', { class: 'control' });
            alt.appendChild(el('p', { class: 'small-note', text: 'Alternative practice' }));
            section.alternativeControls.forEach(control => renderControl(control, alt));
            sectionNode.appendChild(alt);
          }
          page.appendChild(sectionNode);
        });
      }

      function collectVocabularyTerms() {
        const terms = [];
        (lesson.sections || []).forEach(section => {
          (section.controls || []).forEach(control => {
            if (control.type === 'definitionMatch') {
              (control.items || []).forEach(item => {
                if (item.term && !terms.includes(item.term)) terms.push(item.term);
              });
            }
          });
        });
        return terms;
      }

      function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
        return String(value).replace(/[\\\\"]/g, '\\\\$&');
      }

      renderHero();
      renderSections();

      /* Sync shell */
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
      const sectionGotoGrid = document.getElementById('section-goto-grid');
      const wordSpotlightGrid = document.getElementById('word-spotlight-grid');
      const remoteCursor = document.getElementById('remote-cursor');
      const lessonPage = document.getElementById('lesson-page');
      const sections = Array.from(document.querySelectorAll('main .section'));

      const query = new URLSearchParams(window.location.search);
      const initialRole = query.get('role') === 'teacher' ? 'teacher' : 'student';
      const initialRoom = (query.get('room') || '').trim();
      const autoConnect = query.get('autoconnect') === '1';
      roleSelect.value = initialRole;
      roomInput.value = initialRoom;

      const clientId = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : 'client-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

      let role = roleSelect.value;
      let connected = false;
      let eventSource = null;
      let presenceTicker = null;
      let presenceTimer = null;
      let focusLabel = 'none';
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
      let cursorLastSentAt = 0;
      let lastClientX = -1;
      let lastClientY = -1;
      let lastRemoteCursorPayload = null;
      let lastRemoteCursorLabel = '';
      let lastRemoteCursorRole = '';
      const REMOTE_CURSOR_CENTER_OFFSET = 8;

      function setSyncStatus(textValue) { syncStatus.textContent = textValue; }

      function getStudentLink() {
        const roomId = roomInput.value.trim();
        if (!roomId) return '';
        const params = new URLSearchParams(window.location.search);
        params.set('room', roomId);
        params.set('role', 'student');
        params.set('autoconnect', '1');
        return window.location.origin + window.location.pathname + '?' + params.toString();
      }

      function updateUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const roomId = roomInput.value.trim();
        params.set('role', roleSelect.value);
        if (roomId) params.set('room', roomId);
        else params.delete('room');
        if (params.get('role') === 'student') params.set('autoconnect', '1');
        else params.delete('autoconnect');
        window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
      }

      function refreshStudentLinkMeta() {
        const link = getStudentLink();
        studentLinkMeta.textContent = link ? 'Student link: ' + link : 'Student link will appear here.';
      }

      function hideRemoteCursor() {
        remoteCursor.classList.remove('visible', 'role-student', 'role-teacher');
        remoteCursor.style.transform = 'translate(-9999px, -9999px)';
      }

      function updateTeacherReadonlyState() {
        lessonPage.classList.toggle('readonly-mirror', connected && role === 'teacher');
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

      function isLessonSyncTarget(element) {
        return element instanceof HTMLElement && lessonPage.contains(element);
      }

      function pickLocatorDataset(element) {
        if (!(element instanceof HTMLElement)) return {};
        const data = {};
        ['syncKey', 'itemId', 'defId', 'columnName', 'placedId'].forEach(key => {
          const value = element.dataset ? element.dataset[key] : '';
          if (typeof value === 'string' && value) data[key] = value;
        });
        return data;
      }

      function buildCursorTargetPath(anchor, target) {
        if (!(anchor instanceof HTMLElement) || !(target instanceof HTMLElement)) return [];
        if (anchor === target) return [];
        if (!anchor.contains(target)) return [];
        const path = [];
        let node = target;
        while (node && node !== anchor) {
          const parent = node.parentElement;
          if (!parent) return [];
          const index = Array.prototype.indexOf.call(parent.children, node);
          if (index < 0) return [];
          path.push(index);
          node = parent;
        }
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

      function buildDomLocator(element) {
        if (!(element instanceof HTMLElement) || !isLessonSyncTarget(element)) return null;
        const locator = { tag: element.tagName };
        if (element.id) locator.id = element.id;
        if (element.dataset && element.dataset.syncKey) locator.syncKey = element.dataset.syncKey;
        const dataset = pickLocatorDataset(element);
        if (Object.keys(dataset).length > 0) locator.dataset = dataset;
        const anchor = element.closest('.control[id], .section[id], [id]');
        if (anchor instanceof HTMLElement && anchor.id) {
          locator.anchorId = anchor.id;
          locator.targetPath = buildCursorTargetPath(anchor, element);
        }
        return locator;
      }

      function findBySyncKey(syncKey, root = document) {
        if (!syncKey) return null;
        try { return root.querySelector('[data-sync-key="' + cssEscape(syncKey) + '"]'); } catch (error) { return null; }
      }

      function findByDataset(dataset, tagName, root = document) {
        if (!dataset || typeof dataset !== 'object') return null;
        const fragments = [];
        Object.entries(dataset).forEach(([key, value]) => {
          if (!value) return;
          const attr = key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
          fragments.push('[data-' + attr + '="' + cssEscape(value) + '"]');
        });
        if (fragments.length === 0) return null;
        const prefix = tagName ? tagName.toLowerCase() : '';
        try { return root.querySelector(prefix + fragments.join('')); } catch (error) { return null; }
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
        if (typeof locator.id === 'string' && locator.id) return 'id:' + locator.id;
        if (typeof locator.syncKey === 'string' && locator.syncKey) return 'sync:' + locator.syncKey;
        if (locator.dataset) return 'data:' + JSON.stringify(locator.dataset);
        if (typeof locator.anchorId === 'string' && Array.isArray(locator.targetPath)) return 'path:' + locator.anchorId + ':' + locator.targetPath.join('.');
        return '';
      }

      function trimAppliedActions() {
        while (teacherAppliedActionIds.size > TEACHER_APPLIED_ACTION_LIMIT) {
          const oldest = teacherAppliedActionIds.values().next().value;
          teacherAppliedActionIds.delete(oldest);
        }
      }

      function describeElement(element) {
        if (!(element instanceof HTMLElement)) return 'none';
        if (element.id) return '#' + element.id;
        if (element.placeholder) return element.tagName.toLowerCase() + ' (' + element.placeholder.slice(0, 24) + ')';
        const value = (element.textContent || '').trim().slice(0, 28);
        return value ? element.tagName.toLowerCase() + ' "' + value + '"' : element.tagName.toLowerCase();
      }

      function flashElement(element) {
        if (!(element instanceof HTMLElement)) return;
        element.classList.add('teacher-highlight');
        window.setTimeout(() => element.classList.remove('teacher-highlight'), 2400);
      }

      function updateTeacherSenderContext(senderId) {
        if (role !== 'teacher' || !senderId) return;
        if (activeStudentSenderId && activeStudentSenderId !== senderId) {
          teacherAppliedActionIds.clear();
          studentTracker.textContent = 'Student session changed. Sync reset.';
        }
        activeStudentSenderId = senderId;
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

      function pushStudentDomAction(rawPayload) {
        if (!connected || role !== 'student' || !rawPayload || !rawPayload.locator) return;
        const payload = { ...rawPayload, actionId: ++lastStudentDomActionId };
        sendEvent('student_dom_action', payload);
        studentDomActionLog.push(payload);
        if (studentDomActionLog.length > STUDENT_DOM_ACTION_LOG_LIMIT) studentDomActionLog.shift();
      }

      function flushPendingStudentInputActions() {
        if (pendingStudentInputTimer) {
          window.clearTimeout(pendingStudentInputTimer);
          pendingStudentInputTimer = null;
        }
        if (pendingStudentInputActions.size === 0) return;
        const actions = Array.from(pendingStudentInputActions.values());
        pendingStudentInputActions.clear();
        actions.forEach(action => pushStudentDomAction(action));
      }

      function queueStudentDomAction(rawPayload, throttled = false) {
        if (!rawPayload || !rawPayload.locator) return;
        if (!throttled) {
          pushStudentDomAction(rawPayload);
          return;
        }
        const key = rawPayload.kind + ':' + locatorKey(rawPayload.locator);
        pendingStudentInputActions.set(key, rawPayload);
        if (pendingStudentInputTimer) return;
        pendingStudentInputTimer = window.setTimeout(() => {
          pendingStudentInputTimer = null;
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
        } else if (element instanceof HTMLDetailsElement) {
          payload.open = element.open;
        }
        return payload;
      }

      function sendStudentSnapshot(reason = 'request') {
        if (!connected || role !== 'student') return;
        flushPendingStudentInputActions();
        sendEvent('student_state_snapshot', { reason, upToActionId: lastStudentDomActionId, actions: studentDomActionLog.slice() });
      }

      function applyStudentDomAction(payload) {
        if (role !== 'teacher' || !payload || typeof payload !== 'object') return false;
        const actionId = Number(payload.actionId);
        if (!Number.isInteger(actionId) || actionId <= 0) return false;
        if (teacherAppliedActionIds.has(actionId)) return false;
        teacherAppliedActionIds.add(actionId);
        trimAppliedActions();
        lastStudentPresenceAt = Date.now();
        const target = resolveDomLocator(payload.locator);
        if (!(target instanceof HTMLElement)) {
          studentTracker.textContent = 'Student action #' + actionId + ': target not found.';
          return false;
        }
        if (payload.kind === 'click') {
          if (target instanceof HTMLDetailsElement && typeof payload.open === 'boolean') {
            target.open = payload.open;
          } else if (typeof target.click === 'function') {
            target.click();
          }
        } else if (payload.kind === 'input' || payload.kind === 'change') {
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
            if (typeof payload.value === 'string' || typeof payload.value === 'number') target.value = String(payload.value);
            if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') && typeof payload.checked === 'boolean') target.checked = payload.checked;
            target.dispatchEvent(new Event(payload.kind === 'input' ? 'input' : 'change', { bubbles: true }));
          }
        } else {
          return false;
        }
        if (payload.kind !== 'input') flashElement(target);
        studentTracker.textContent = 'Student action: ' + payload.kind + ' on ' + describeElement(target) + '.';
        return true;
      }

      function applyStudentSnapshot(payload) {
        const actions = Array.isArray(payload && payload.actions) ? payload.actions : [];
        if (actions.length === 0) {
          studentTracker.textContent = 'Student snapshot received: no actions yet.';
          return;
        }
        let applied = 0;
        [...actions].sort((a, b) => (Number(a.actionId) || 0) - (Number(b.actionId) || 0)).forEach(action => {
          if (applyStudentDomAction(action)) applied += 1;
        });
        studentTracker.textContent = 'Student snapshot applied: ' + applied + '/' + actions.length + ' actions.';
      }

      function blockTeacherLessonInteraction(event) {
        if (!(connected && role === 'teacher')) return;
        if (!event.isTrusted) return;
        if (!(event.target instanceof HTMLElement)) return;
        if (!isLessonSyncTarget(event.target)) return;
        const interactive = event.target.closest('button, input, textarea, select, details, summary, [contenteditable="true"]');
        if (!interactive) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        studentTracker.textContent = 'Read-only mirror: student controls this lesson area.';
      }

      function getMostVisibleSectionId() {
        let best = '';
        let bestVisible = -1;
        sections.forEach(section => {
          const rect = section.getBoundingClientRect();
          const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
          if (visible > bestVisible) {
            bestVisible = visible;
            best = section.id;
          }
        });
        return best || 'warmup';
      }

      function clamp01(value) { return Math.max(0, Math.min(1, value)); }

      function pickCursorTarget(anchor, initialElement) {
        if (!(anchor instanceof HTMLElement)) return null;
        let node = initialElement instanceof HTMLElement ? initialElement : null;
        while (node && node !== anchor) {
          const rect = node.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return node;
          node = node.parentElement;
        }
        const anchorRect = anchor.getBoundingClientRect();
        return anchorRect.width > 0 && anchorRect.height > 0 ? anchor : null;
      }

      function sendCursor(clientX, clientY) {
        if (!connected || (role !== 'student' && role !== 'teacher')) return;
        const now = Date.now();
        if (now - cursorLastSentAt < 90) return;
        cursorLastSentAt = now;
        const found = document.elementFromPoint(clientX, clientY);
        if (!found) return;
        const anchor = found.closest('.section, .control');
        if (!(anchor instanceof HTMLElement) || !anchor.id) return;
        const target = pickCursorTarget(anchor, found);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        sendEvent(role === 'teacher' ? 'teacher_cursor' : 'student_cursor', {
          anchorId: anchor.id,
          targetPath: buildCursorTargetPath(anchor, target),
          targetRatioX: Math.round(clamp01((clientX - rect.left) / rect.width) * 10000) / 10000,
          targetRatioY: Math.round(clamp01((clientY - rect.top) / rect.height) * 10000) / 10000,
          label: role === 'teacher' ? 'Teacher cursor' : 'Student cursor',
        });
      }

      function renderRemoteCursor(payload, fallbackLabel, remoteRole) {
        lastRemoteCursorPayload = payload;
        lastRemoteCursorLabel = fallbackLabel;
        lastRemoteCursorRole = remoteRole;
        if (!payload || !payload.anchorId) {
          hideRemoteCursor();
          return;
        }
        const anchor = document.getElementById(payload.anchorId);
        if (!(anchor instanceof HTMLElement)) {
          hideRemoteCursor();
          return;
        }
        const target = resolveCursorTargetPath(anchor, payload.targetPath);
        if (!(target instanceof HTMLElement)) {
          hideRemoteCursor();
          return;
        }
        let rect = target.getBoundingClientRect();
        if ((rect.width === 0 || rect.height === 0) && target !== anchor) rect = anchor.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          hideRemoteCursor();
          return;
        }
        const vx = rect.left + clamp01(typeof payload.targetRatioX === 'number' ? payload.targetRatioX : 0.5) * rect.width;
        const vy = rect.top + clamp01(typeof payload.targetRatioY === 'number' ? payload.targetRatioY : 0.5) * rect.height;
        remoteCursor.classList.remove('role-student', 'role-teacher');
        if (remoteRole === 'student' || remoteRole === 'teacher') remoteCursor.classList.add('role-' + remoteRole);
        const inView = vx >= -20 && vx <= window.innerWidth + 20 && vy >= -20 && vy <= window.innerHeight + 20;
        if (inView) {
          remoteCursor.classList.add('visible');
          remoteCursor.style.transform = 'translate(' + (Math.round(vx) - REMOTE_CURSOR_CENTER_OFFSET) + 'px, ' + (Math.round(vy) - REMOTE_CURSOR_CENTER_OFFSET) + 'px)';
        } else {
          remoteCursor.classList.remove('visible');
        }
        const labelNode = remoteCursor.querySelector('.remote-cursor-label');
        if (labelNode) labelNode.textContent = payload.label || fallbackLabel;
      }

      function rerenderRemoteCursor() {
        if (lastRemoteCursorPayload) renderRemoteCursor(lastRemoteCursorPayload, lastRemoteCursorLabel, lastRemoteCursorRole);
      }

      function sendPresence(reason = 'activity') {
        if (!connected || role !== 'student') return;
        const maxScroll = Math.max(1, document.body.scrollHeight - window.innerHeight);
        sendEvent('student_presence', {
          reason,
          activeSection: getMostVisibleSectionId(),
          focusLabel,
          scrollProgress: Number((window.scrollY / maxScroll).toFixed(3)),
        });
      }

      function queuePresence(reason = 'activity') {
        if (presenceTimer) return;
        presenceTimer = window.setTimeout(() => {
          presenceTimer = null;
          sendPresence(reason);
        }, 220);
      }

      function handleTeacherCommand(message) {
        if (role !== 'student') return;
        if (message.type === 'teacher_state_request') {
          sendStudentSnapshot('teacher-request');
          return;
        }
        if (message.type === 'teacher_cursor') {
          renderRemoteCursor(message.payload || {}, 'Teacher', 'teacher');
          return;
        }
        if (message.type === 'teacher_goto') {
          const targetId = message.payload && message.payload.targetId;
          const target = targetId ? document.getElementById(targetId) : null;
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            flashElement(target);
          }
          return;
        }
        if (message.type === 'teacher_highlight_selector') {
          const selector = message.payload && message.payload.selector;
          if (!selector) return;
          let nodes = [];
          try { nodes = Array.from(document.querySelectorAll(selector)); } catch (error) { return; }
          nodes.slice(0, 6).forEach(node => flashElement(node));
          if (nodes[0] instanceof HTMLElement) nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (message.type === 'teacher_spotlight_word') {
          const word = message.payload && message.payload.word;
          if (!word) return;
          const nodes = Array.from(document.querySelectorAll('[data-word="' + cssEscape(word) + '"], .term')).filter(node => (node.textContent || '').trim() === word);
          nodes.forEach(node => flashElement(node));
          if (nodes[0] instanceof HTMLElement) nodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      function handleTeacherView(message) {
        if (role !== 'teacher') return;
        updateTeacherSenderContext(message.senderId);
        if (message.type === 'student_dom_action') {
          applyStudentDomAction(message.payload || {});
          return;
        }
        if (message.type === 'student_state_snapshot') {
          applyStudentSnapshot(message.payload || {});
          return;
        }
        if (message.type === 'student_presence') {
          const payload = message.payload || {};
          const scroll = typeof payload.scrollProgress === 'number' ? Math.round(payload.scrollProgress * 100) + '%' : '?';
          lastStudentPresenceAt = Date.now();
          studentTracker.textContent = 'Student: section "' + (payload.activeSection || 'unknown') + '", focus "' + (payload.focusLabel || 'none') + '", scroll ' + scroll + ', event "' + (payload.reason || 'activity') + '".';
          return;
        }
        if (message.type === 'student_cursor') renderRemoteCursor(message.payload || {}, 'Student', 'student');
      }

      function connectSync() {
        const roomId = roomInput.value.trim();
        if (!roomId) {
          setSyncStatus('Status: enter room code first.');
          return;
        }
        if (connected) return;
        if (role === 'teacher') {
          teacherAppliedActionIds.clear();
          activeStudentSenderId = '';
        }
        const params = new URLSearchParams({ room: roomId, role, clientId });
        eventSource = new EventSource('/events?' + params.toString());
        setSyncStatus('Status: connecting to room "' + roomId + '" as ' + role + '...');
        eventSource.onopen = () => {
          connected = true;
          updateUrlParams();
          updateTeacherReadonlyState();
          setSyncStatus('Status: online in room "' + roomId + '" as ' + role + '.');
          sendPresence('connected');
          if (role === 'student') {
            presenceTicker = window.setInterval(() => sendPresence('heartbeat'), 3500);
            sendStudentSnapshot('student-connected');
          }
          if (role === 'teacher') sendEvent('teacher_state_request', { reason: 'connected' });
        };
        eventSource.addEventListener('lesson', event => {
          let data;
          try { data = JSON.parse(event.data); } catch (error) { return; }
          if (!data || data.senderId === clientId) return;
          handleTeacherCommand(data);
          handleTeacherView(data);
        });
        eventSource.onerror = () => {
          connected = false;
          updateTeacherReadonlyState();
          setSyncStatus('Status: connection issue, trying to reconnect...');
        };
      }

      function disconnectSync() {
        connected = false;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (presenceTicker) {
          window.clearInterval(presenceTicker);
          presenceTicker = null;
        }
        if (pendingStudentInputTimer) {
          window.clearTimeout(pendingStudentInputTimer);
          pendingStudentInputTimer = null;
        }
        pendingStudentInputActions.clear();
        hideRemoteCursor();
        updateTeacherReadonlyState();
        setSyncStatus('Status: offline.');
      }

      function buildTeacherDashboard() {
        (lesson.sections || []).forEach(section => {
          const button = el('button', { type: 'button', class: 'btn secondary', text: section.title || section.id, dataset: { target: section.id } });
          button.addEventListener('click', () => {
            if (role !== 'teacher') return;
            sendEvent('teacher_goto', { targetId: section.id });
          });
          sectionGotoGrid.appendChild(button);
        });

        collectVocabularyTerms().slice(0, 12).forEach(term => {
          const button = el('button', { type: 'button', class: 'btn', text: 'Spotlight: ' + term });
          button.addEventListener('click', () => {
            if (role !== 'teacher') return;
            sendEvent('teacher_spotlight_word', { word: term });
          });
          wordSpotlightGrid.appendChild(button);
        });
      }

      connectBtn.addEventListener('click', () => {
        if (connected) {
          disconnectSync();
          connectBtn.textContent = 'Connect';
        } else {
          connectSync();
          connectBtn.textContent = 'Disconnect';
        }
      });

      roleSelect.addEventListener('change', () => {
        if (connected) disconnectSync();
        connectBtn.textContent = 'Connect';
        applyRoleUi();
        updateUrlParams();
        refreshStudentLinkMeta();
      });

      roomInput.addEventListener('input', () => {
        updateUrlParams();
        refreshStudentLinkMeta();
      });

      copyLinkBtn.addEventListener('click', async () => {
        const link = getStudentLink();
        if (!link) {
          setSyncStatus('Status: enter room code first.');
          return;
        }
        try {
          await navigator.clipboard.writeText(link);
          setSyncStatus('Status: student link copied.');
        } catch (error) {
          setSyncStatus('Copy failed. Link: ' + link);
        }
      });

      syncShellToggle.addEventListener('click', () => setSyncShellCollapsed(!syncShellCollapsed));

      bringToMeBtn.addEventListener('click', () => {
        if (role === 'teacher') sendEvent('teacher_goto', { targetId: getMostVisibleSectionId() });
      });

      selectorBtn.addEventListener('click', () => {
        if (role !== 'teacher') return;
        const selector = selectorInput.value.trim();
        if (selector) sendEvent('teacher_highlight_selector', { selector });
      });

      ['pointerdown', 'click', 'input', 'change', 'keydown', 'submit', 'toggle'].forEach(eventName => {
        document.addEventListener(eventName, blockTeacherLessonInteraction, true);
      });

      document.addEventListener('focusin', event => {
        focusLabel = describeElement(event.target);
        queuePresence('focus');
      });

      document.addEventListener('click', event => {
        if (connected && role === 'student' && event.target instanceof HTMLElement) {
          const clickTarget = event.target.closest('button, input[type="checkbox"], input[type="radio"], details, summary');
          if (clickTarget instanceof HTMLElement && isLessonSyncTarget(clickTarget)) {
            const payloadTarget = clickTarget.tagName === 'SUMMARY' ? clickTarget.closest('details') : clickTarget;
            const payload = buildFormActionPayload('click', payloadTarget);
            if (payload) queueStudentDomAction(payload);
          }
        }
        queuePresence('click');
      });

      document.addEventListener('input', event => {
        if (!(connected && role === 'student')) return;
        if (!(event.target instanceof HTMLElement) || !isLessonSyncTarget(event.target)) return;
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
        const payload = buildFormActionPayload('input', event.target);
        if (payload) queueStudentDomAction(payload, true);
      }, true);

      document.addEventListener('change', event => {
        if (!(connected && role === 'student')) return;
        if (!(event.target instanceof HTMLElement) || !isLessonSyncTarget(event.target)) return;
        if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) return;
        const payload = buildFormActionPayload('change', event.target);
        if (payload) queueStudentDomAction(payload);
      }, true);

      window.addEventListener('scroll', () => {
        queuePresence('scroll');
        if (lastClientX >= 0) {
          cursorLastSentAt = 0;
          sendCursor(lastClientX, lastClientY);
        }
        rerenderRemoteCursor();
      }, { passive: true });

      window.addEventListener('resize', rerenderRemoteCursor, { passive: true });

      if (typeof window.PointerEvent === 'function') {
        document.addEventListener('pointerdown', event => {
          if (event.isPrimary === false) return;
          lastClientX = event.clientX;
          lastClientY = event.clientY;
          sendCursor(event.clientX, event.clientY);
        }, { passive: true });
        document.addEventListener('pointermove', event => {
          if (event.isPrimary === false) return;
          lastClientX = event.clientX;
          lastClientY = event.clientY;
          sendCursor(event.clientX, event.clientY);
        }, { passive: true });
      } else {
        document.addEventListener('mousemove', event => {
          lastClientX = event.clientX;
          lastClientY = event.clientY;
          sendCursor(event.clientX, event.clientY);
        });
      }

      window.setInterval(() => {
        if (role !== 'teacher' || !lastStudentPresenceAt) return;
        const diffSec = Math.floor((Date.now() - lastStudentPresenceAt) / 1000);
        if (diffSec > 7) studentTracker.textContent = 'Student activity: last update ' + diffSec + 's ago.';
      }, 2500);

      buildTeacherDashboard();
      applyRoleUi();
      updateUrlParams();
      refreshStudentLinkMeta();
      if (autoConnect && roomInput.value.trim()) {
        connectSync();
        connectBtn.textContent = 'Disconnect';
      }
    })();
  </script>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function main() {
  const [, , inputArg, outputArg = 'index.html'] = process.argv;
  if (!inputArg) {
    fail('usage: node scripts/generate-lesson-page.js <lesson-json> [output-html]');
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(process.cwd(), outputArg);
  const spec = readLessonSpec(inputPath);
  validateLessonSpec(spec);
  fs.writeFileSync(outputPath, generateHtml(spec), 'utf8');
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} from ${path.relative(process.cwd(), inputPath)}`);
}

main();
