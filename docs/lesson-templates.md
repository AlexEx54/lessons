# Шаблоны уроков как данные

Проектный документ. Описывает формат определения шаблона, коллекцию контролов,
связи по данным между этапами и способ выполнения генерации. Шаблон 2
целиком выражен в новом формате (раздел 6).

## 1. Три уровня

| Уровень | Где живёт | Кто меняет |
|---|---|---|
| **Компонент** — то, что рисуется в уроке (`oddOneOut`, `markdownCard`…) | `assets/components/*` | разработчик |
| **Контрол** — как получить компонент: схема генерации, правила промпта, сборка, проверки, ключ ответов | `lib/template-controls/*` (новое) | разработчик |
| **Шаблон** — этапы, блоки, параметры, тексты, методические указания, связи | системные — JSON-файлы в репозитории, копии — таблица `lesson_templates` | админ |

Контрол и компонент — разные вещи. Один компонент может обслуживаться
несколькими контролами. Например, `markdownCard` собирают `vocabularyList`,
`listCard` и `answerKey`, и у каждого из них свои данные.

## 2. Блок

Каждый элемент этапа — блок одного из четырёх видов:

- **`static`** — готовый компонент из JSON. Правится существующими редакторами
  компонентов, нейросеть его не видит. Примеры: Teacher's Note, видео,
  Self-assessment.
- **`generated`** — контрол с параметрами. Нейросеть заполняет его данные, контрол
  собирает из них компонент. «Обвес» компонента (заголовок, инструкция, цвета,
  видимость) задаётся в шаблоне в `chrome` и нейросети не передаётся.
- **`derived`** — компонент, который строится из других блоков или переменных без
  нейросети. Примеры: Answer Key, Vocabulary meanings quiz.
- **`row`** — контейнер `cardRow` с вложенными блоками.

Static-блок может содержать **слоты**: `{{name}}` в любом текстовом поле и описание
слота в `slots`. Слот бывает двух видов:

- `{ "rule": "…" }` — слот заполняет нейросеть в том же вызове, что и остальной
  этап. Так покрываются Teacher's Notes, где фиксированный текст перемежается
  сгенерированным: «**Success:** …» в Guided Communication, четыре блока в
  Grammar Focus, три пункта в Wrap-Up.
- `{ "from": "<id блока>.<путь>" }` — значение берётся из уже собранного блока
  того же этапа, без нейросети. Пример: слово из первого ряда Odd One Out в
  заметке Warm-Up (`warm-up-odd-one-out.items[0].answer`).

`id` блока совпадает с `id` компонента в уроке и уникален в пределах шаблона.

## 3. Связи по данным

### Порты и переменные

У контрола есть **порты** — именованные типизированные входы и выходы:

```
factOrMyth        out: guessStatements : statements
vocabularyList    out: vocabulary      : vocabulary
storyCards        in:  highlight       : vocabulary   (обязателен)
                  in:  guesses         : statements   (необязателен)
contextDropdown   in:  vocabulary      : vocabulary
answerKey         in:  блоки-источники (особый случай, см. ниже)
```

Шаблон связывает порты через **переменные урока**:

```json
{ "id": "lead-in-fact-or-myth", "control": "factOrMyth",
  "exports": { "guessStatements": "leadInGuesses" } }

{ "id": "target-vocabulary-stories", "control": "storyCards",
  "inputs": { "highlight": "targetVocabulary", "guesses": "leadInGuesses" } }
```

Типов переменных немного, у каждого есть форма и способ показа в промпте:

| Тип | Форма | В промпте |
|---|---|---|
| `vocabulary` | `[{ term, definition, distractor? }]` | `Target Vocabulary: ["…", …]` (только термины) |
| `statements` | `[{ number, text }]` | нумерованный список |
| `text` | строка | как есть |

`statements` хранит номер пункта в исходном упражнении. Поэтому `storyGuessKey`
пишет «**4.** Somebody in our stories…», не зная, сколько в Lead-In
проверочных утверждений.

### Вход из того же этапа или из более раннего

Это различие поведения, а не синтаксиса:

- **Переменная из более раннего этапа** уже известна. Она попадает в user message:
  `Guess statements from the Lead-In: 1. … 2. …`.
- **Переменная из того же этапа** генерируется в том же вызове. Контрол-потребитель
  добавляет в system-промпт правило, которое на неё ссылается («put every item of
  the Vocabulary block in bold exactly once»), и проверяет его после ответа.

Пример — Target Vocabulary шаблона 2: словарь и истории генерируются вместе, а
истории обязаны выделить каждое слово жирным ровно один раз.

### Обратная подсказка производителю

Сейчас в промпте Lead-In прямо написано: «Later in this lesson the student reads
four short first-person stories…». Это знание о потребителе, и в копии шаблона оно
устареет, если истории удалить.

Решение: контрол-потребитель объявляет `producerHint`. Движок добавляет его в
промпт этапа-производителя, только если связь действительно есть.

```
storyCards.inputs.guesses.producerHint =
  "Later the student reads {{stories}} short first-person stories. Each guess
   statement will be confirmed or contradicted by exactly one story, so choose
   details that are easy to show in a short story."
```

Связь сама несёт нужные указания в обе стороны. Если удалить истории, подсказка
исчезнет из Lead-In автоматически.

### Порядок генерации и проверки при сохранении

- Порядок генерации — топологическая сортировка этапов по переменным (входы
  блоков и `$var.…` в `context`). Порядок показа этапов в уроке от него не
  зависит.
- Переменная из более раннего этапа, которую читает блок, должна быть указана в
  `context` этапа: так видно, под какой подписью она попадёт в промпт. Редактор
  добавляет эту строку сам, когда ставит связь.
- Каждая переменная, на которую ссылаются, имеет ровно одного производителя.
- Вход из того же этапа разрешён только от `generated`-блока к
  `generated`/`derived`-блоку.
- Между этапами нет циклов.
- Типы портов совпадают. Например, `vocabularyMeanings` требует `vocabulary` с
  дистракторами, то есть `vocabularyList` с `distractors: true`.
- Параметры укладываются в пределы, заданные контролом.
- В редакторе нельзя удалить блок, на чью переменную кто-то ссылается: сначала
  нужно перепривязать или удалить потребителей.

## 4. Контрол

```js
module.exports = {
  type: 'factOrMyth',
  component: 'factOrMyth',
  label: 'Fact or Myth',
  params: {                                // пределы и значения по умолчанию
    checkStatements: { min: 1, max: 6, default: 3 },
    guessStatements: { min: 0, max: 4, default: 2 },
  },
  chrome: ['title', 'instruction'],        // что задаёт шаблон, а не нейросеть
  fields: ['checkStatements', 'guessStatements'], // поля ответа нейросети, которыми владеет блок
  inputs: {},
  outputs: { guessStatements: 'statements' },
  schema({ params, links }) { /* { <поле>: JSON Schema } */ },
  rules({ params, links, f }) { /* технические правила промпта: количество, формат, запрет разметки — не редактируются */ },
  defaultInstructions: '…',                // методика по умолчанию — копируется в шаблон и редактируется
  build(data, { id, params, chrome, links, random }) { /* → компонент */ },
  exports(component) { /* → значения выходных портов */ },
  answerKey(component) { /* → [{ title, text }] — для answerKey */ },
  example(params) { /* данные для синтетического режима и превью в каталоге */ },
};
```

- `rules()` — неизменяемая техническая часть промпта. Количество элементов
  зависит от `params`, поэтому редактор не может сломать схему.
- **Поля ответа.** Ответ нейросети на этап — плоский объект, как сейчас. Блок
  владеет полями, которые объявил контрол (`checkStatements`,
  `guessStatements`). Если в этапе два блока одного контрола, шаблон
  переименовывает поля: `"fields": { "items": "speakingSupport" }`. Правила
  ссылаются на поля через `f.items`, поэтому в промпте стоит итоговое имя.
  Имена полей и слотов в пределах этапа не должны совпадать.
- `instructions` в блоке — редактируемая методика. При копировании шаблона
  копируется текущий текст.
- Существующие нормализаторы и правила «ошибка или предупреждение» (вроде
  `grammarFocusPlain`) уходят внутрь `build`. Поведение не меняется.
- `example()` заменяет синтетические уроки (`SYNTHETIC_*`). Синтетический режим
  начинает работать для любой копии шаблона, а каталог получает превью.

## 5. Выполнение

```
1. lessonMetadata (обложка) — всегда, на уровне движка, не этап шаблона
2. этапы в топологическом порядке; этап без generated-блоков и слотов не вызывает нейросеть
3. для этапа:
   system = learnerProfile
          + «You design one-to-one English lessons.»
          + stage.instructions
          + producerHints от потребителей из других этапов
          + для каждого generated-блока: rules() + правила входов из того же этапа
            + instructions
          + слоты с rule: «<name>: » + rule
          + «Return JSON matching the supplied schema and nothing else.»
   user   = stage.context (входы урока и переменные прошлых этапов)
   schema = плоский объект: поля generated-блоков + слоты с rule
4. build блоков в порядке связей внутри этапа (generated → derived) → exports
   → подстановка слотов в static-блоки
5. снимок шаблона уже лежит в черновике: восстановление генерации работает по снимку
```

Один вызов нейросети на этап остаётся, как сейчас.

**Промпт шаблона 2 не меняется по смыслу.** Имена полей ответа остаются
прежними, текущие промпты нарезаются по контролам почти дословно, а фразы о
связях становятся правилами входов и `producerHint` с той же формулировкой. Тест
собирает промпт каждого этапа из `template-2.json`, и при переходе он
сравнивается с нынешним построчно.

## 6. Шаблон 2 в новом формате

Длинные статические тексты сокращены до `…`. В файле они хранятся полностью,
в том же виде, что сейчас в `synthetic-template-two.js`.

```json
{
  "schemaVersion": "lesson-template-v1",
  "id": "template-2",
  "title": "Шаблон 2",
  "inputs": {
    "topic":        { "label": "Тема урока" },
    "warmUpTopic":  { "label": "Тема Warm-Up", "optional": true, "fallback": "topic" },
    "grammarTopic": { "label": "Грамматика" }
  },
  "lesson": { "durationMinutes": 50 },
  "stages": [
    {
      "id": "warm-up", "title": "Warm Up", "subtitle": "Find the Odd One Out!",
      "durationMinutes": 5, "icon": "sparkles",
      "context": { "Lesson topic": "$input.warmUpTopic" },
      "instructions": "Generate only the variable content for a five-minute Warm-Up in the existing Find the Odd One Out template.",
      "blocks": [
        {
          "id": "warm-up-teacher-note", "kind": "static",
          "component": { "type": "teacherNote", "text": "**Goal:** …\n\n- **Encourage Full Sentences:** If the student just shouts out one word (e.g., \"{{exampleWord}}!\") … '{{exampleWord}} is the odd one out because...' …" },
          "slots": { "exampleWord": { "from": "warm-up-odd-one-out.items[0].answer" } }
        },
        {
          "id": "warm-up-odd-one-out", "kind": "generated", "control": "oddOneOut",
          "params": { "rows": 4, "wordsPerRow": 4 },
          "chrome": { "title": "Find the Odd One Out!", "instruction": "Look at the four words in each row. Find the odd word and explain your choice." },
          "instructions": "In each row, three words share one clear category and exactly one word does not belong… Use a different kind of category in each row… Keep the difficulty growing slightly… Every word must be directly connected to the provided topic… explanation is for the teacher: one short English sentence…"
        },
        { "id": "warm-up-odd-one-out-answer-key", "kind": "derived", "control": "answerKey", "from": ["warm-up-odd-one-out"] }
      ]
    },
    {
      "id": "lead-in", "title": "Lead In", "subtitle": "Fact or Myth?",
      "durationMinutes": 5, "icon": "compass",
      "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic" },
      "instructions": "Generate only the variable content for a five-minute Lead-In in the existing Fact or Myth? template. Every statement is one short sentence at the target CEFR level.",
      "blocks": [
        { "id": "lead-in-teacher-note", "kind": "static", "component": { "type": "teacherNote", "text": "**Say:** \"Now let's play a game called 'Fact or Myth?'…\" …" } },
        {
          "id": "lead-in-fact-or-myth", "kind": "generated", "control": "factOrMyth",
          "params": { "checkStatements": 3, "guessStatements": 2 },
          "chrome": { "title": "Read the sentences. Is it a FACT or MYTH?", "instruction": "Choose Fact or Myth for each sentence." },
          "instructions": "checkStatements: about the lesson topic in general… Use only common, uncontroversial knowledge… guessStatements: about one concrete detail of the people in the stories. Start each with \"Somebody in our stories\". Use the target grammar… Style examples: …",
          "exports": { "guessStatements": "leadInGuesses" }
        },
        {
          "id": "lead-in-speaking-support", "kind": "generated", "control": "listCard",
          "params": { "items": 2, "fixedBefore": ["I think it’s a fact / myth because…"], "format": "paragraphs" },
          "fields": { "items": "speakingSupport" },
          "chrome": { "title": "Speaking Support", "icon": "chat", "accentColor": "#E5AD16", "studentVisibility": "always" },
          "instructions": "Unfinished sentence starters, ending with \"…\", that help the student justify an answer about this topic."
        },
        { "id": "lead-in-fact-or-myth-answer-key", "kind": "derived", "control": "answerKey", "from": ["lead-in-fact-or-myth"] }
      ]
    },
    {
      "id": "target-vocabulary", "title": "Target Vocabulary", "subtitle": "Explore & Practise New Words",
      "durationMinutes": 8, "icon": "cards",
      "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic", "Guess statements from the Lead-In": "$var.leadInGuesses" },
      "instructions": "Generate only the variable content for an eight-minute Target Vocabulary section in the existing template. All English must be natural and at the target CEFR level.",
      "blocks": [
        { "id": "target-vocabulary-teacher-note", "kind": "static", "component": { "type": "teacherNote", "blocks": ["… статичные блоки Pronunciation Check и т.д. …"] } },
        {
          "id": "target-vocabulary-card", "kind": "generated", "control": "vocabularyList",
          "params": { "items": 10, "distractors": true },
          "chrome": { "title": "Vocabulary", "icon": "book", "accentColor": "#20A85B", "studentVisibility": "controlled" },
          "instructions": "Useful words or short phrases for the topic. term is the dictionary form… definition is a short, simple English definition…",
          "exports": { "vocabulary": "targetVocabulary" }
        },
        {
          "id": "target-vocabulary-stories", "kind": "generated", "control": "storyCards",
          "params": { "stories": 4, "minWords": 40, "maxWords": 60, "grammarUses": 2 },
          "chrome": { "title": "Task 1. Read the stories. Pay attention to the words in bold.", "colors": ["#EAE4FC", "#FCE3F0", "#FFF0E5", "#E2FBFB"] },
          "inputs": { "highlight": "targetVocabulary", "guesses": "leadInGuesses" },
          "instructions": "Four different people talk about the lesson topic. Choose people who fit the topic naturally… Style example: …"
        },
        {
          "id": "target-vocabulary-guess-answers", "kind": "derived", "control": "storyGuessKey",
          "from": "target-vocabulary-stories",
          "chrome": { "title": "Lead-In: Check Your Guesses", "accentColor": "#E5AD16" }
        },
        {
          "id": "target-vocabulary-meanings", "kind": "derived", "control": "vocabularyMeanings",
          "inputs": { "vocabulary": "targetVocabulary" },
          "chrome": { "title": "Task 2. Choose the correct meaning for the words from the text.", "instruction": "Choose one answer for each question." }
        },
        {
          "id": "target-vocabulary-context-dropdown", "kind": "generated", "control": "contextDropdown",
          "params": { "gaps": 8, "options": 3, "minWords": 70, "maxWords": 110 },
          "inputs": { "vocabulary": "targetVocabulary" },
          "chrome": { "title": "Task 3. Vocabulary in Context — Dropdown", "instruction": "Fill in the blanks with the correct words from the dropdown lists." },
          "instructions": "One coherent paragraph about a new person connected to the topic…"
        },
        {
          "id": "target-vocabulary-drag-words", "kind": "generated", "control": "dragSentences",
          "params": { "sentences": 6 },
          "inputs": { "vocabulary": "targetVocabulary" },
          "chrome": { "title": "Task 4. Drag the correct words into the gaps.", "instruction": "Use each word once." },
          "instructions": "Short sentences… Style example: \"Night Fox has got a black [[mask]] over his eyes.\""
        },
        {
          "id": "target-vocabulary-type-words", "kind": "generated", "control": "translationHints",
          "params": { "perVocabularyItem": true },
          "inputs": { "vocabulary": "targetVocabulary" },
          "chrome": { "title": "Extra Task. Type the English words.", "instruction": "Type the English word or phrase next to each Russian hint.", "studentVisibility": "controlled" },
          "instructions": "Style example: before \"Shadow Girl has got a black\", hint \"маска\", answer \"mask\""
        },
        {
          "id": "target-vocabulary-personalized-questions", "kind": "generated", "control": "personalizedQuestions",
          "params": { "items": 4 },
          "inputs": { "highlight": "targetVocabulary" },
          "chrome": { "title": "Task 5 · Personalised Questions", "instruction": "Answer the questions out loud. There are no right or wrong answers!" },
          "instructions": "Questions about the student’s own life and experience…"
        },
        {
          "id": "target-vocabulary-sentence-starters-card", "kind": "generated", "control": "listCard",
          "params": { "items": 3, "intro": "Use these starters if you need help answering.", "format": "boldBullets" },
          "fields": { "items": "sentenceStarters" },
          "chrome": { "title": "Support: Sentence Starters", "icon": "chat", "accentColor": "#20A85B", "studentVisibility": "always" },
          "instructions": "Short starters that help answer the personalized questions, ending with \"...\"."
        }
      ]
    },
    {
      "id": "watch-and-interact", "title": "Watch & interact", "subtitle": "Predict, Watch & Discuss",
      "durationMinutes": 10, "icon": "video",
      "blocks": [
        { "id": "watch-teacher-note", "kind": "static", "component": { "type": "teacherNote", "text": "…" } },
        { "id": "watch-prediction", "kind": "static", "component": { "type": "multipleChoice", "mode": "guess", "…": "…" } },
        { "id": "watch-video", "kind": "static", "component": { "type": "videoPlayer", "title": "Watch the video" } },
        { "id": "watch-discussion", "kind": "static", "component": { "type": "markdownCard", "…": "…" } }
      ]
    },
    {
      "id": "grammar-presentation", "title": "Grammar Presentation", "subtitle": "Complete the Rule",
      "durationMinutes": 5, "icon": "cap",
      "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic", "Target Vocabulary": "$var.targetVocabulary" },
      "instructions": "Generate only the variable student-facing content for a five-minute Grammar Presentation in the existing Guided Discovery template. The supplied Grammar topic is authoritative… All questions and activities must be supported by the examples and rules in this section… Naturally reuse some supplied Target Vocabulary…",
      "blocks": [
        { "id": "grammar-presentation-teacher-note", "kind": "static", "component": { "type": "teacherNote", "text": "**Guided discovery**\n\n…" } },
        {
          "id": "grammar-presentation-notice-rule", "kind": "generated", "control": "numberedPanel",
          "params": { "items": 5, "boldOncePerItem": true },
          "fields": { "items": "examples" },
          "chrome": { "heading": "Notice the Rule", "subheading": "Look at the examples. What grammar structure is used here?", "accentColor": "#6545F5", "showBorder": false },
          "instructions": "Short example sentences. Wrap the target grammar form in bold."
        },
        {
          "id": "grammar-presentation-concept-checking", "kind": "generated", "control": "numberedPanel",
          "params": { "items": 4 },
          "fields": { "items": "conceptCheckingQuestions" },
          "chrome": { "heading": "Concept-checking questions:", "accentColor": "#20A85B", "showBorder": true },
          "instructions": "Concise questions that guide the learner to discover meaning, use, and form from the examples."
        },
        {
          "id": "grammar-presentation-complete-the-rule", "kind": "generated", "control": "ruleGaps",
          "params": { "gaps": 4, "distractors": 2 },
          "chrome": { "title": "Complete the Rule", "instruction": "Drag the correct words into the gaps." },
          "instructions": "Each item must form a clear rule statement when before + answer + after are joined."
        },
        {
          "id": "grammar-presentation-quick-rule", "kind": "generated", "control": "quickRule",
          "params": { "minSections": 1, "maxSections": 3 },
          "chrome": { "title": "Quick Rule", "layout": "columns", "icon": "bulb", "accentColor": "#6545F5", "studentVisibility": "always" },
          "instructions": "Concise Markdown bullet points covering meaning, affirmative form, and relevant negative/question forms…"
        },
        {
          "id": "grammar-presentation-check-the-rule", "kind": "generated", "control": "correctSentences",
          "params": { "sentences": 8, "correct": 4 },
          "chrome": { "title": "Task 2. Tick the sentences that are correct.", "instruction": "Read the sentences and tick the grammatically correct ones.", "question": "Which four sentences are grammatically correct?" },
          "instructions": "Each incorrect sentence must contain a clear error in the target grammar. Its explanation must explain the error and give the corrected sentence."
        },
        {
          "id": "grammar-presentation-answer-key", "kind": "derived", "control": "answerKey",
          "chrome": { "title": "Answer key", "layout": "columns" },
          "from": [
            { "block": "grammar-presentation-complete-the-rule", "title": "Task 1 Rule" },
            { "block": "grammar-presentation-check-the-rule", "title": "Task 2", "part": "answers" },
            { "block": "grammar-presentation-check-the-rule", "title": "Short explanations:", "part": "explanations" }
          ]
        }
      ]
    },
    {
      "id": "grammar-focus", "title": "Grammar Focus", "subtitle": "Practice the Rule",
      "durationMinutes": 8, "icon": "cap",
      "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic", "Target Vocabulary": "$var.targetVocabulary" },
      "instructions": "Generate all variable content for a Grammar Focus section… The supplied Grammar topic is authoritative… Use the Lesson topic as one coherent natural context…",
      "blocks": [
        {
          "id": "grammar-focus-teacher-note", "kind": "static",
          "component": { "type": "teacherNote", "blocks": [
            { "id": "grammar-focus-transition-phrases", "title": "Transition phrases", "titleColor": "#6545F5", "icon": "chatDots", "text": "{{transitionPhrases}}" },
            { "id": "grammar-focus-struggle-tips", "title": "Tips if the student struggles", "titleColor": "#2F80ED", "icon": "chat", "text": "{{struggleTips}}" },
            { "id": "grammar-focus-correction-timing", "title": "Correct now / later", "titleColor": "#E0812D", "icon": "chat", "text": "{{correctionTiming}}" },
            { "id": "grammar-focus-free-practice-success", "title": "Success criteria", "titleColor": "#20A85B", "icon": "chatDots", "text": "{{successCriteria}}" }
          ] },
          "slots": {
            "transitionPhrases": { "rule": "Concise Markdown list of transition phrases." },
            "struggleTips": { "rule": "Grammar-specific tips if the student struggles." },
            "correctionTiming": { "rule": "What to correct now and what later." },
            "successCriteria": { "rule": "Measurable success criteria for Tasks 1–4 and the Extra Task." }
          }
        },
        {
          "id": "grammar-focus-choose-the-correct-options", "kind": "generated", "control": "choiceSentences",
          "params": { "items": 8, "options": 3 },
          "chrome": { "title": "**Task 1. Choose the correct options.**", "instruction": "Read each sentence and choose the correct grammar option.", "accentColor": "#6545F5" },
          "instructions": "Vary the position of correct options and include affirmative, negative, and question forms whenever the grammar topic supports them."
        },
        {
          "id": "grammar-focus-answer-key", "kind": "derived", "control": "answerKey",
          "chrome": { "title": "Answer Key & Explanations", "layout": "columns" },
          "from": [
            { "block": "grammar-focus-choose-the-correct-options", "title": "Answers", "part": "answers" },
            { "block": "grammar-focus-choose-the-correct-options", "title": "Short explanations", "part": "explanations" }
          ]
        },
        {
          "id": "grammar-focus-complete-the-gaps", "kind": "generated", "control": "cueGaps",
          "params": { "items": 8 },
          "chrome": { "title": "Task 2. Complete the gaps with the correct form of the verbs.", "instruction": "Read each sentence and type the correct form of the verb.", "accentColor": "#2F80ED" },
          "instructions": "Separate sentences, not a dialogue. cue is the base form the learner must change."
        },
        { "id": "grammar-focus-complete-the-gaps-answer-key", "kind": "derived", "control": "answerKey", "from": ["grammar-focus-complete-the-gaps"] },
        {
          "id": "grammar-focus-correct-the-mistakes", "kind": "generated", "control": "sentenceCorrection",
          "params": { "items": 8 },
          "chrome": { "title": "Task 3. Correct the mistakes.", "instruction": "There is one mistake in each sentence. Rewrite it correctly.", "accentColor": "#6545F5" },
          "instructions": "Exactly one mistake in the target grammar per sentence…"
        },
        { "id": "grammar-focus-correct-the-mistakes-answer-key", "kind": "derived", "control": "answerKey", "from": ["grammar-focus-correct-the-mistakes"] },
        {
          "id": "grammar-focus-match-sentence-halves", "kind": "generated", "control": "sentenceHalves",
          "params": { "pairs": 6 },
          "chrome": { "title": "Task 4. Match the sentence halves." },
          "instructions": "Each left + right must form one natural sentence using the target grammar…"
        },
        {
          "id": "grammar-focus-translate-sentences", "kind": "generated", "control": "translationSentences",
          "params": { "items": 10, "from": "ru", "to": "en" },
          "chrome": { "title": "**Extra Task. Translate the sentences.**", "instruction": "Translate the sentences from Russian to English.", "accentColor": "#6545F5", "studentVisibility": "controlled", "fieldSize": "wide" },
          "instructions": "Choose sentences that have one clear, unambiguous English translation using the target grammar."
        },
        { "id": "grammar-focus-translate-sentences-answer-key", "kind": "derived", "control": "answerKey", "from": ["grammar-focus-translate-sentences"] },
        {
          "id": "grammar-focus-practice-support-row", "kind": "row",
          "blocks": [
            {
              "id": "grammar-focus-writing-support", "kind": "generated", "control": "listCard",
              "params": { "items": 5, "format": "numbered" },
              "fields": { "items": "writingSupport" },
              "chrome": { "title": "Writing Support", "icon": "pencil", "accentColor": "#20A85B", "studentVisibility": "always" },
              "instructions": "Short sentence starters that help the learner use the target grammar."
            },
            {
              "id": "grammar-focus-support", "kind": "generated", "control": "wordBankSupport",
              "params": { "words": 8, "minimumTask": "Write 3 sentences if you need extra support." },
              "inputs": { "vocabulary": "targetVocabulary" },
              "chrome": { "title": "Support", "icon": "lifeRing", "accentColor": "#20A85B", "studentVisibility": "always" },
              "instructions": "modelSentence: one natural sentence using the target grammar and lesson context."
            },
            {
              "id": "grammar-focus-challenge", "kind": "generated", "control": "listCard",
              "params": { "items": 5, "format": "bullets" },
              "fields": { "items": "challengeItems" },
              "chrome": { "title": "Challenge", "icon": "trophy", "accentColor": "#6545F5", "studentVisibility": "always" },
              "instructions": "Concise challenge conditions: a negative, a question, a reason, target vocabulary, and linked ideas when compatible with the grammar."
            }
          ]
        }
      ]
    },
    {
      "id": "guided-speaking", "title": "Guided Communication", "subtitle": "Choose a Card",
      "durationMinutes": 8, "icon": "chat",
      "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic", "Target Vocabulary": "$var.targetVocabulary" },
      "instructions": "Generate the variable content for an eight-minute Guided Communication stage: the learner chooses one card and discusses it with the teacher. The supplied Grammar topic is authoritative…",
      "blocks": [
        {
          "id": "guided-communication-teacher-note", "kind": "static",
          "component": { "type": "teacherNote", "text": "**Start:** You start. Ask: “What would you like to do?”\n\n…\n\n**Success:** {{successCriteria}}" },
          "slots": { "successCriteria": { "rule": "One short measurable sentence describing what the learner can do by the end of the stage." } }
        },
        { "id": "guided-communication-instruction", "kind": "static", "component": { "type": "taskPrompt", "variant": "followUp", "title": "Choose a card", "text": "Choose a card, turn it over, and do the task." } },
        {
          "id": "guided-communication-cards", "kind": "generated", "control": "communicationCards",
          "params": { "questions": 4, "vocabularyMin": 6, "vocabularyMax": 10, "phrases": 5, "starters": 5 },
          "inputs": { "vocabulary": "targetVocabulary" },
          "chrome": { "covers": [
            { "emoji": "😎", "backgroundColor": "#C7DDFB" },
            { "emoji": "🤩", "backgroundColor": "#ECEBFF" },
            { "emoji": "🤓", "backgroundColor": "#DFCEF3" }
          ] },
          "cards": [
            { "instructions": "The learner describes or talks about themselves or their own experience." },
            { "instructions": "The learner imagines, compares or gives opinions with reasons." },
            { "instructions": "The learner asks the teacher questions…", "miniTaskExample": true }
          ]
        }
      ]
    },
    {
      "id": "wrap-up", "title": "Wrap-Up", "subtitle": "3–2–1",
      "durationMinutes": 3, "icon": "check",
      "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic", "Target Vocabulary": "$var.targetVocabulary" },
      "instructions": "Generate only the variable content for a three-minute Wrap-Up in the existing 3–2–1 template. Use the Lesson topic, Grammar topic, and exact Target Vocabulary to review the lesson coherently.",
      "blocks": [
        {
          "id": "wrap-up-teacher-note", "kind": "static",
          "component": { "type": "teacherNote", "text": "- **Signs of success:** {{signsOfSuccess}}\n- **If the student struggles:** {{struggleSupport}}\n- **Positive ending:** {{positiveEnding}}" },
          "slots": {
            "signsOfSuccess": { "rule": "Measurable signs of success." },
            "struggleSupport": { "rule": "Specific support if the learner struggles." },
            "positiveEnding": { "rule": "A ready-to-say positive ending." }
          }
        },
        {
          "id": "wrap-up-three-two-one", "kind": "generated", "control": "threeTwoOne",
          "params": { "twoCues": 2 },
          "inputs": { "vocabulary": "targetVocabulary" },
          "chrome": { "oneLabel": "Can-do question" },
          "instructions": "threePrompt: recall three words or phrases from Target Vocabulary… twoPrompt: two topic-related sentences with the Grammar topic… onePrompt: one practical can-do question…"
        },
        { "id": "wrap-up-self-assessment", "kind": "static", "component": { "type": "selfAssessment", "title": "Self-assessment: How do you feel about today’s lesson?" } },
        {
          "id": "wrap-up-possible-language", "kind": "generated", "control": "listCard",
          "params": { "items": 3, "format": "slashSeparated" },
          "fields": { "items": "possibleLanguage" },
          "chrome": { "title": "Possible language:", "icon": "chat", "accentColor": "#6545F5", "studentVisibility": "always" },
          "instructions": "Short supports for the two and one steps, naturally including the target grammar and relevant vocabulary."
        }
      ]
    }
  ]
}
```

### Граф связей шаблона 2

```
inputs: topic, warmUpTopic, grammarTopic
                │
lead-in ──leadInGuesses──▶ target-vocabulary ──targetVocabulary──▶ grammar-presentation
                           (vocabulary + stories                ├─▶ grammar-focus
                            в одном вызове)                     ├─▶ guided-speaking
                                                                └─▶ wrap-up
warm-up, watch-and-interact — без связей
```

## 7. Коллекция контролов для шаблона 2

| Контрол | Компонент | Входы → выходы |
|---|---|---|
| `oddOneOut` | oddOneOut | |
| `factOrMyth` | factOrMyth | → statements |
| `listCard` | markdownCard (список в одном из форматов: paragraphs / bullets / boldBullets / numbered / slashSeparated) | |
| `vocabularyList` | markdownCard | → vocabulary |
| `storyCards` | storyCards | vocabulary, statements? |
| `storyGuessKey` *derived* | markdownCard | блок storyCards |
| `vocabularyMeanings` *derived* | multipleChoice | vocabulary (с дистракторами) |
| `contextDropdown` | dropdownChoice | vocabulary |
| `dragSentences` | dragWordsInText | vocabulary |
| `translationHints` | gapFill | vocabulary |
| `personalizedQuestions` | personalizedQuestions | vocabulary? |
| `numberedPanel` | textPanel | |
| `ruleGaps` | dragWordsInText | |
| `quickRule` | markdownCard (sections) | |
| `correctSentences` | checkboxChoice | |
| `choiceSentences` | dropdownChoice | |
| `cueGaps` | gapFill | |
| `sentenceCorrection` | sentenceCorrection | |
| `sentenceHalves` | sentenceMatching | |
| `translationSentences` | gapFill | |
| `wordBankSupport` | markdownCard | vocabulary (выбор N слов) |
| `communicationCards` | guidedCommunicationCards | vocabulary (выбор N слов) |
| `threeTwoOne` | threeTwoOne | vocabulary? |
| `answerKey` *derived* | markdownCard | блоки с `answerKey()` |

Это 24 контрола. Шаблон 1 добавит ещё около 8: thisOrThat с картинками,
сообщение Lead-In, чтение с вопросами, аудирование, роли Guided Speaking,
mini-situation и т.п. Многие пересекаются: `numberedPanel`, `ruleGaps` и
`quickRule` уже общие для обоих шаблонов.

«Выбор N слов из словаря» (`wordBankSupport`, `communicationCards`) — общее
поведение входа `vocabulary`. Нейросеть копирует термины, контрол приводит их к
каноническому виду из словаря и предупреждает о чужих словах. Сейчас это делает
`readingVocabularyTerms().lookup`.

## 8. Хранение

- **Системные шаблоны** — `lib/templates/template-1.json` и `template-2.json`.
  Они версионируются вместе с кодом контролов, а их правка проходит обычное
  ревью и тесты.
- **Копии** хранятся в БД:

```sql
CREATE TABLE lesson_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  source_template_id TEXT,                 -- 'template-2' или id другой копии
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  definition_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,     -- оптимистическая блокировка при сохранении
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

ALTER TABLE lesson_drafts ADD COLUMN template_snapshot_json TEXT;
```

`lesson_drafts.template_id` остаётся текстом: `template-2` или id копии.
Восстановление генерации берёт снимок из черновика. У старых черновиков снимка
нет, для них используется системный файл.

## 9. Где поведение изменится

1. **Порядок строк в промптах.** Поля ответа те же, тексты нарезаны почти
   дословно, но строки идут в порядке «этап → блоки → слоты», а не в
   рукописном порядке. Сборщики проверяются побайтно на текущих фикстурах, а
   живые прогоны на 2–3 темах нужны как контроль, без перенастройки промптов.
2. **Wrap-Up шаблона 2** сейчас переиспользует генератор шаблона 1. В новом
   формате оба шаблона просто используют одни и те же контролы, так что особого
   случая больше нет.
3. **Синтетический режим** собирается из `example()` контролов, а не из
   рукописных `SYNTHETIC_*`. Синтетический урок шаблона 2 станет менее
   «сюжетным»: примеры будут разрозненные, а не одна история про супергероев.

## 10. Редактор

Редактор выглядит как сам урок, а не как схема со стрелками.

- **Раскладка.** Слева «Поля при создании» (входы шаблона) и список этапов с
  длительностью; этапы перетаскиваются, есть «+ Этап». В центре — блоки
  выбранного этапа, каждый показан настоящим компонентом на данных
  `example()`; рендеринг берётся из `lesson-editor.js`. Справа — панель
  выбранного блока.
- **Метка вида блока:** «Статичный» (текст правится на месте существующими
  редакторами компонентов), «Генерирует ИИ», «Собирается сам».
- **Слоты.** Кнопка «Вставить поле для ИИ» добавляет в статичный текст
  плашку `{{name}}` с описанием, что туда писать.
- **Связи — плашки на блоках, а не провода.** У потребителя: «Догадки ←
  Lead-In»; клик открывает список совместимых источников (тот же или более
  ранний этап, подходящий тип); единственный подходящий источник ставится сам.
  У производителя: «Отдаёт «Слова урока» → 5 блоков в 4 этапах» со списком и
  переходом к блокам.
- **Удаление источника** открывает диалог «Список слов используют 5 блоков: …
  Удалить вместе с ними / Отмена». Сломанный шаблон сохранить нельзя.
- **Статус в шапке:** «Связи в порядке» или «2 проблемы» со ссылками на блоки
  (ошибки проверки из раздела 3).
- **Панель блока:** параметры с пределами контрола («4 истории (2–6)»),
  оформление (`chrome`), указания для ИИ с кнопкой «Вернуть по умолчанию»,
  свёрнутые технические правила только для чтения.
- **Настройки этапа:** название, подзаголовок, длительность, иконка, общие
  указания ИИ, `context`.
- **«Пробный урок»** создаёт черновик по текущей версии шаблона на тестовую
  тему — главный способ проверить качество генерации.
- **Системные шаблоны** открываются только для чтения, с кнопкой «Сделать
  копию».

Шаг 2 плана — правка того, что уже есть в копии: тексты, параметры, указания,
порядок, удаление блоков и этапов. Шаг 3 — каталог, новые блоки и перенастройка
связей.

## 11. План

| Шаг | Результат | Интерфейс |
|---|---|---|
| 0a | Движок: загрузка определения, проверка связей, топологический порядок, сборка промпта и схемы, слоты | — |
| 0b | Контролы шаблона 2 и `template-2.json`; тесты сборщиков на текущих фикстурах; живые прогоны | — |
| 0c | То же для шаблона 1; удаление `lesson-generation-sections.js` и `synthetic-template-two.js` | — |
| 1 | `lesson_templates`, снимок в черновике, раздел «Шаблоны» (два закреплённых, «Копировать», переименование, удаление), выбор шаблона в «Новом уроке» из API, поля ввода из `inputs` | да |
| 2 | Редактор копии: этапы, static-тексты, параметры, указания, панель связей с ошибками | да |
| 3 | Добавление блоков из каталога с превью на `example()` | да |
