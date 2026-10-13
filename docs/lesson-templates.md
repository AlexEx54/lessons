# Шаблоны уроков как данные

Проектный документ. Описывает формат определения шаблона, коллекцию контролов,
связи по данным между этапами и способ выполнения генерации. Шаблон 2
целиком выражен в новом формате: `lib/templates/template-2.json` (раздел 6).

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
  сгенерированным: «**Success:** …» в Guided Communication.
- `{ "from": "<id блока>.<путь>" }` — значение берётся из уже собранного блока
  того же этапа, без нейросети. Пример: слово из первого ряда Odd One Out в
  заметке Warm-Up (`warm-up-odd-one-out.items[0].answer`). `"capitalize": true`
  делает первую букву заглавной.

Заметка, которая целиком состоит из сгенерированных разделов (четыре блока в
Grammar Focus, три пункта в Wrap-Up), — это `generated`-блок
`teacherNoteSections`. Ответ остаётся вложенным объектом `teacherNotes`, как
сейчас.

`id` блока совпадает с `id` компонента в уроке и уникален в пределах шаблона.

## 3. Связи по данным

### Порты и переменные

У контрола есть **порты** — именованные типизированные входы и выходы:

```
factOrMyth        out: guessStatements : statements
vocabularyList    out: vocabulary      : vocabulary
storyCards        in:  highlight       : vocabulary   (необязателен)
                  in:  guesses         : statements   (необязателен)
storyGuessKey     in:  guesses         : statements
contextDropdown   in:  vocabulary      : vocabulary
answerKey         from: блоки-источники (особый случай, см. раздел 7)
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
  добавляет в system-промпт правило, которое на неё ссылается («In the stories,
  put every vocabulary item in bold with ** exactly once…»).

Пример — Target Vocabulary шаблона 2: словарь и истории генерируются вместе, а
истории обязаны выделить каждое слово жирным ровно один раз.

### Обратная подсказка производителю

Сейчас в промпте Lead-In прямо написано: «Later in this lesson the student reads
four short first-person stories…». Это знание о потребителе, и в копии шаблона оно
устареет, если истории удалить.

Решение: контрол-потребитель объявляет `producerHint`. Движок добавляет его в
промпт этапа-производителя, только если связь действительно есть.

```
storyCards.inputs.guesses.producerHint = ({ params }) =>
  `Later in this lesson the student reads ${count(params.stories)} short
   first-person stories: … The stories are written after you and will follow
   your guess statements.`
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
  label: 'Fact or Myth',
  params: {                                // пределы и значения по умолчанию
    checkStatements: { min: 1, max: 6, default: 3 },
    guessStatements: { min: 1, max: 4, default: 2 },
  },
  chrome: ['title', 'instruction', 'guessNote'], // что задаёт шаблон, а не нейросеть
  fields: ['checkStatements', 'guessStatements'], // поля ответа нейросети, которыми владеет блок
  inputs: {},
  outputs: {
    guessStatements: { type: 'statements', field: 'guessStatements', size: params => params.guessStatements },
  },
  schema({ params, links }) { /* { <поле>: JSON Schema } */ },
  rules({ params, links, f }) { /* технические правила промпта: количество, формат, запрет разметки — не редактируются */ },
  defaultInstructions: '…',                // методика по умолчанию — копируется в шаблон и редактируется
  build(data, { id, params, chrome, links, random }) { /* → компонент */ },
  exports(component, { params, data }) { /* → значения выходных портов */ },
  answerKey({ component, data, params, part }) { /* → { lines, list } */ },
  example({ params, links }) { /* данные для синтетического режима и превью в каталоге */ },
};
```

- `rules()` — неизменяемая техническая часть промпта. Количество элементов
  зависит от `params`, поэтому редактор не может сломать схему.
- **Поля ответа.** Ответ нейросети на этап — плоский объект, как сейчас. Блок
  владеет полями, которые объявил контрол (`checkStatements`,
  `guessStatements`). Если в этапе два блока одного контрола, шаблон
  переименовывает поля: `"fields": { "items": "speakingSupport" }`. Правила
  ссылаются на поля через `f.items`, поэтому в промпте стоит итоговое имя.
  Имена полей и слотов в пределах этапа не должны совпадать. `schema` может не
  вернуть поле, которое не нужно: например, `guessChecks` у историй без входа
  `guesses`.
- `instructions` в блоке — редактируемая методика, может быть в несколько
  строк. При копировании шаблона копируется текущий текст.
- **Связи, которые видит контрол** (`links` в `schema`, `rules`, `build`,
  `example`): `{ variable, type, sameStage, source, size?, label?, value? }`.
  `size` — размер переменной по параметрам производителя (10 слов, 2 догадки):
  по нему контрол задаёт длину списков в схеме. `label` — подпись переменной
  из прошлого этапа в `context` («Target Vocabulary»), чтобы правило говорило
  то же, что видит нейросеть. `value` есть только при сборке.
- **Параметр-структура** (список разделов заметки, фиксированные строки списка)
  задаётся значением по умолчанию нужной формы и функцией `check(value)`,
  которая возвращает текст ошибки или `null`.
- Существующие нормализаторы и правила «ошибка или предупреждение» (вроде
  `grammarFocusPlain`) ушли внутрь `build`.
- `example()` заменит синтетические уроки (`SYNTHETIC_*`) на шаге 0c.
  Синтетический режим начнёт работать для любой копии шаблона, а каталог
  получит превью. Тест собирает пример каждого контрола на наименьших,
  наибольших и обычных параметрах.

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
          (повторяющиеся строки — например, одинаковое правило двух блоков — остаются один раз)
   user   = stage.context (входы урока и переменные прошлых этапов)
   schema = плоский объект: поля generated-блоков и слоты с rule в порядке показа блоков
4. build блоков в порядке связей внутри этапа (generated → derived) → exports
   → подстановка слотов в static-блоки
5. снимок шаблона уже лежит в черновике: восстановление генерации работает по снимку
```

Один вызов нейросети на этап остаётся, как сейчас.

Сервер видит любой шаблон как **план генерации** (`lib/lesson-generation-plan.js`):
шаги `{ key, name, needsModel }`, `start`, `generate`, `apply`. Для шаблона 1
это обёртка над прежними секциями, для шаблона 2 — движок. Запуск генерации и
восстановление после сбоя работают только с планом. В журнале генерации
заголовок шага — название этапа: `=== Warm Up ===`.

**Промпт шаблона 2 не изменился по смыслу.** Имена полей ответа, user message
и JSON Schema этапов совпадают с прежними. Строки промпта нарезаны по
контролам: техническая часть с количеством ушла в `rules()`, методика осталась
в `instructions` почти дословно. Каждая изменённая строка перечислена в
`test/fixtures/template-two-prompt-changes.js`, и тест
`test/template-two-migration.test.js` сравнивает с прежними сборщиками промпты,
схемы и уроки, собранные из одних и тех же ответов. Уроки совпадают побайтно,
кроме сокращённых id пунктов внутри заданий (раздел 9).

## 6. Шаблон 2 в новом формате

Файл — `lib/templates/template-2.json`. Его статичные компоненты взяты из
прежнего кода без изменений, указания для ИИ — из прежних промптов. Сокращённый
пример одного этапа:

```json
{
  "id": "lead-in", "title": "Lead In", "subtitle": "Fact or Myth?",
  "durationMinutes": 5, "icon": "compass",
  "context": { "Lesson topic": "$input.topic", "Grammar topic": "$input.grammarTopic" },
  "instructions": "Generate only the variable content for a five-minute Lead-In in the existing Fact or Myth? template.\nEvery statement is one short sentence at the target CEFR level.",
  "blocks": [
    { "id": "lead-in-teacher-note", "kind": "static", "component": { "type": "teacherNote", "text": "**Say:** \"Now let's play a game called '**Fact or Myth?**'…" } },
    {
      "id": "lead-in-fact-or-myth", "kind": "generated", "control": "factOrMyth",
      "params": { "checkStatements": 3, "guessStatements": 2 },
      "chrome": { "title": "Read the sentences. Is it a FACT or MYTH?", "instruction": "Choose Fact or Myth for each sentence.", "guessNote": "Students guess now and check later in the stories." },
      "exports": { "guessStatements": "leadInGuesses" },
      "instructions": "checkStatements: statements about the lesson topic in general…\nguessStatements: statements about one concrete detail of the people in the stories…\nStyle examples from other lessons…"
    },
    {
      "id": "lead-in-speaking-support", "kind": "generated", "control": "listCard",
      "params": { "items": 2, "format": "paragraphs", "fixedBefore": ["I think it’s a fact / myth because…"], "plainText": true },
      "fields": { "items": "speakingSupport" },
      "chrome": { "title": "Speaking Support", "icon": "chat", "accentColor": "#E5AD16", "studentVisibility": "always" },
      "instructions": "speakingSupport: unfinished sentence starters, ending with \"…\", that help the student justify an answer about this topic."
    },
    { "id": "lead-in-fact-or-myth-answer-key", "kind": "derived", "control": "answerKey", "from": ["lead-in-fact-or-myth"], "chrome": { "title": "Answer Keys" } }
  ]
}
```

Остальные этапы устроены так же. Особенности:

- **Warm Up** — слово-пример в заметке берётся слотом
  `{ "from": "warm-up-odd-one-out.items[0].answer", "capitalize": true }`.
- **Target Vocabulary** — `vocabularyList` отдаёт `targetVocabulary`; истории,
  Dropdown, Drag, Extra Task и личные вопросы берут его из того же этапа;
  `storyGuessKey` собирается из историй и догадок Lead-In.
- **Watch & interact** — только статичные блоки, нейросеть не вызывается.
- **Grammar Presentation** и **Grammar Focus** — общий ключ ответов
  `answerKey` с несколькими источниками и частями (`answers`, `explanations`).
  Заметка Grammar Focus — `teacherNoteSections` в виде четырёх блоков.
- **Guided Communication** — success criteria — слот `rule` в статичной заметке.
- **Wrap-Up** — заметка `teacherNoteSections` в виде списка, 3–2–1 и
  `listCard` со строкой через « / ».

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
| `listCard` | markdownCard (список: paragraphs / bullets / boldBullets / numbered / slashSeparated) | |
| `teacherNoteSections` | teacherNote (разделы блоками или списком) | |
| `vocabularyList` | markdownCard | → vocabulary |
| `storyCards` | storyCards | vocabulary?, statements? |
| `storyGuessKey` *derived* | markdownCard | блок storyCards, statements |
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
| `threeTwoOne` | threeTwoOne | |
| `answerKey` *derived* | markdownCard | блоки с `answerKey()` |

Это 25 контролов в `lib/template-controls/`. Шаблон 1 добавит ещё около 8:
thisOrThat с картинками, сообщение Lead-In, чтение с вопросами, аудирование,
роли Guided Speaking, mini-situation и т.п. Многие пересекаются: `numberedPanel`,
`ruleGaps` и `quickRule` уже общие для обоих шаблонов.

**Ключ ответов.** Контрол задания отдаёт `answerKey()` → `{ lines, list }`:
строки ключа и признак, что это пункты Markdown-списка. Если частей ключа
несколько (ответы и пояснения), контрол перечисляет их в `answerKeyParts`, а
источник в шаблоне выбирает часть: `{ "block": "…", "part": "explanations",
"title": "Short explanations:", "id": "short-explanations" }`. Один источник без
заголовка даёт обычную карточку: список или ответы в две колонки. Несколько
источников дают по разделу на каждый.

«Выбор N слов из словаря» (`wordBankSupport`, `communicationCards`) — общее
поведение входа `vocabulary`. Нейросеть копирует термины, контрол приводит их к
каноническому виду из словаря и предупреждает о чужих словах.

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

Для шаблона 2 после шага 0b:

1. **Строки промптов.** Строка «exactly N … + методика» разделена на техническое
   правило контрола и указание блока. Строки идут в порядке «этап → блоки →
   слоты». Правило «Use plain text only» называет свои поля. Все изменённые
   строки перечислены в `test/fixtures/template-two-prompt-changes.js`. Живые
   прогоны на 2–3 темах нужны как контроль, без перенастройки промптов.
2. **Target Vocabulary:** в схеме ответа `vocabularyItems` идёт перед `stories`,
   потому что карточка слов показывается первой. Модель сначала выбирает
   слова, потом пишет истории.
3. **Wrap-Up:** русский текст в заметке учителю и в Possible language теперь
   даёт предупреждение в журнале, а не ошибку генерации. В заданиях 3–2–1 это
   по-прежнему ошибка. Особый случай «Wrap-Up шаблона 2 использует генератор
   шаблона 1» исчез: оба шаблона используют одни и те же контролы.
4. **Повтор слова в словаре** останавливает генерацию сразу на Target
   Vocabulary. Раньше падал следующий этап.
5. **id пунктов внутри заданий** Grammar Focus стали короче (`choice-1`,
   `gap-1`, `correction-1`, `pair-1`, `translation-1`), разделы Quick Rule —
   `quick-rule-1`. Ни код, ни правки уроков на них не ссылаются.
6. **Журнал генерации** называет шаги по этапам (`=== Warm Up ===`,
   `=== Lead In ===`), схемы — `easyclass_template_2_<этап>`. Если повторить
   генерацию черновика, упавшего до выкладки, Warm Up и дальнейшие этапы
   сгенерируются заново.
7. **Синтетический режим** пока прежний. На шаге 0c он будет собираться из
   `example()` контролов, а не из рукописных `SYNTHETIC_*`, и станет менее
   «сюжетным». Сейчас на синтетический урок шаблона 2 опираются тесты
   компонентов, им нужен будет отдельный фикстурный урок.

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
| 0a ✓ | Движок: загрузка определения, проверка связей, топологический порядок, сборка промпта и схемы, слоты | — |
| 0b | Контролы шаблона 2 и `template-2.json`; план генерации на сервере; сравнение с прежними сборщиками; живые прогоны | — |
| 0c | То же для шаблона 1; синтетический режим на `example()`; удаление `lesson-generation-sections.js`, `synthetic-template-two.js`, прежних сборщиков шаблона 2 и теста сравнения | — |
| 1 | `lesson_templates`, снимок в черновике, раздел «Шаблоны» (два закреплённых, «Копировать», переименование, удаление), выбор шаблона в «Новом уроке» из API, поля ввода из `inputs` | да |
| 2 | Редактор копии: этапы, static-тексты, параметры, указания, панель связей с ошибками | да |
| 3 | Добавление блоков из каталога с превью на `example()` | да |
