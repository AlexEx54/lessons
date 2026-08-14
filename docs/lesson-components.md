# Lesson components

Этот документ описывает компоненты, которые нейросеть может использовать при генерации `lesson-draft-v1`. Генератор возвращает только JSON: HTML и CSS внутри данных запрещены.

Каждая стадия урока содержит `content`: массив компонентов в порядке отображения. Если компонентов нет, используйте `null`.

## Teacher’s Note

Teacher’s Note содержит подсказки, инструкции и готовые формулировки только для преподавателя.

Простой вариант с одним редактируемым текстом:

```json
{
  "type": "teacherNote",
  "id": "warm-up-teacher-note",
  "text": "- Не заставляйте ученика сразу строить длинные ответы.\n- Принимайте ответы словом или короткой фразой.\n\n**Say:** Welcome back!"
}
```

Составной вариант с неизменяемыми вложенными карточками:

```json
{
  "type": "teacherNote",
  "id": "target-vocabulary-teacher-note",
  "blocks": [{
    "type": "teacherNoteBlock",
    "id": "target-vocabulary-pronunciation-check",
    "title": "Pronunciation Check",
    "titleColor": "#6545F5",
    "icon": "audio",
    "text": "Use these dictionaries to check the pronunciation.",
    "tip": {
      "text": "Play the audio and have the student repeat."
    }
  }]
}
```

Поля:

- `type` — строго `teacherNote`.
- `id` — обязательный стабильный идентификатор в lowercase kebab-case, уникальный в пределах урока.
- `text` — опциональная строка с общим редактируемым содержимым заметки. Она
  отображается после `blocks`; пустое значение не передавайте.
- `blocks` — опциональный массив вложенных `teacherNoteBlock` в порядке отображения.
  В заметке должен присутствовать непустой `text`, хотя бы один блок или оба поля.

Поля вложенного `teacherNoteBlock`:

- `type` — строго `teacherNoteBlock`.
- `id` — обязательный уникальный внутри заметки lowercase kebab-case идентификатор.
- `title` — обязательный непустой заголовок без Markdown.
- `titleColor` — обязательный цвет заголовка и иконки в формате `#RRGGBB`.
- `icon` — строго `audio`, `chat` или `chatDots`.
- `text` — обязательный непустой текст с общим Markdown subset.
- `tip` — опциональный объект с обязательным непустым `text`. Интерфейс сам
  добавляет подпись `Tip:`, иконку лампочки и оформление.

В редакторе черновика администратор может изменять только общий `text` и удалять
существующие вложенные блоки. Заголовки, цвета, иконки, содержимое и порядок блоков
не редактируются; добавлять или восстанавливать блоки через редактор нельзя. Поля
`type`, `id` и интерфейсный заголовок `Teacher’s Notes` остаются неизменными.
Сохранённое содержимое нормализуется обратно в описанный ниже Markdown subset.

В `text` разрешён только следующий Markdown subset:

- `**текст**` — жирное выделение;
- `*текст*` — курсив;
- строки вида `- пункт` — маркированный список;
- строки вида `1. пункт` — нумерованный список; при сохранении номера нормализуются
  последовательно, начиная с единицы;
- пустая строка — разделитель абзацев или блоков.

Не используйте HTML, заголовки Markdown, ссылки, изображения, таблицы или вложенные
списки. Для внешней заметки не передавайте подпись, цвет или начальное состояние
сворачивания: интерфейс добавляет их самостоятельно, а заметка всегда открыта при
первой отрисовке. Настройки `titleColor` и `icon` относятся только к вложенным блокам.

## Task Prompt

`taskPrompt` сообщает ученику, что нужно сделать. Один тип поддерживает два
семантических варианта с оформлением, которое определяет интерфейс:

- `yourTurn` — основная инструкция ученику;
- `followUp` — вопросы или следующий шаг после основного задания.

Простой вариант:

```json
{
  "type": "taskPrompt",
  "id": "warm-up-your-turn-prompt",
  "variant": "yourTurn",
  "title": "Your turn!",
  "text": "What comes to mind first? Answer with a word or a short sentence."
}
```

Вариант с дополнительной языковой опорой:

```json
{
  "type": "taskPrompt",
  "id": "warm-up-follow-up-prompt",
  "variant": "followUp",
  "title": "Follow-up questions:",
  "text": "Why did you choose it? Can you give an example?",
  "support": {
    "title": "Possible language:",
    "text": "I chose… because…\n\n**For example:** …"
  }
}
```

Поля:

- `type` — строго `taskPrompt`.
- `id` — обязательный стабильный идентификатор в lowercase kebab-case, уникальный
  среди `taskPrompt` в пределах урока.
- `variant` — строго `yourTurn` или `followUp`.
- `title` — обязательная непустая строка с заголовком.
- `text` — обязательная непустая строка с основной инструкцией.
- `support` — опциональный объект. Если он присутствует, его `title` и `text`
  обязательны и не могут быть пустыми.

`text` и `support.text` поддерживают тот же Markdown subset, что `teacherNote`:
жирное и курсивное выделение, маркированные и нумерованные списки и разделённые
пустой строкой абзацы. `title` и `support.title` являются обычным текстом без Markdown.

В редакторе администратор может изменять оба заголовка и оба текста, а также
добавлять или удалять `support`. При добавлении интерфейс создаёт пустую
дополнительную секцию и не подставляет предметный заголовок: например,
`Possible language:` должен приходить из JSON конкретного урока. Поля `type`,
`id` и `variant` неизменяемы.
Разделитель показывается автоматически перед существующим `support`.

Не передавайте в JSON цвет, иконку, рамку или разделитель. Не включайте тему
конкретного урока в имена полей или технические шаблоны идентификаторов: используйте
роль и положение компонента, например `warm-up-follow-up-prompt`, а не
`summer-speaking-starters`.

## Text Panel

`textPanel` показывает простой текстовый блок с настраиваемым цветом фона. Этот
тип не содержит изображений.

```json
{
  "type": "textPanel",
  "id": "lead-in-discussion-questions",
  "text": "1. What does “touch grass” mean?\n2. Do you agree that real-world graphics are boring?\n3. How many days can you survive without your PC or console?",
  "backgroundColor": "#FFFFFF"
}
```

Поля:

- `type` — строго `textPanel`.
- `id` — обязательный уникальный идентификатор в lowercase kebab-case.
- `text` — обязательная непустая строка с общим Markdown subset, включая
  маркированные и нумерованные списки.
- `backgroundColor` — обязательный цвет в формате `#RRGGBB`. Интерфейс автоматически
  выбирает контрастный тёмный или белый цвет текста.

Администратор может редактировать `text` и `backgroundColor`. Поля
`leadingPicture` и `trailingPicture` для этого типа запрещены.

## Illustrated Text Panel

`illustratedTextPanel` показывает текстовую панель с настраиваемым цветом фона и
независимыми декоративными изображениями слева и справа.

```json
{
  "type": "illustratedTextPanel",
  "id": "lead-in-gamer-message",
  "text": "**@GamerAlex:** Guys, my parents took my PC away for two weeks!",
  "backgroundColor": "#252A38",
  "leadingPicture": {
    "imagePrompt": "Circular friendly gamer profile avatar, no text, transparent background."
  },
  "trailingPicture": {
    "imagePrompt": "Minimal gaming chat symbol, no text, transparent background."
  }
}
```

Поля:

- `type` — строго `illustratedTextPanel`.
- `id` — обязательный уникальный идентификатор в lowercase kebab-case.
- `text` — обязательная непустая строка с тем же Markdown subset, что `teacherNote`.
- `backgroundColor` — обязательный цвет в формате `#RRGGBB`. Интерфейс автоматически
  выбирает контрастный тёмный или белый цвет текста.
- `leadingPicture` и `trailingPicture` — независимые опциональные объекты. Можно не
  передавать ни один, один или оба объекта.
- `imagePrompt` — обязательный непустой английский промт для каждого присутствующего
  изображения. Изображение должно быть без текста и с прозрачным фоном, когда это
  уместно для иллюстрации.
- `imageSrc` — опциональный служебный URL загруженного изображения. Нейросеть это поле
  не создаёт: его добавляет сервер после загрузки администратором.

Администратор может редактировать `text` и `backgroundColor`, а также загружать,
заменять и удалять файл в уже объявленных слотах. Плейсхолдер незагруженного слота и
инструменты управления изображением показываются только после входа в режим
редактирования; обычный preview отображает только готовый текст и уже загруженные
изображения. Не создавайте пустые picture-объекты: если изображение не нужно,
соответствующее поле должно отсутствовать целиком.

## This or That

`thisOrThat` показывает от одной до восьми независимых пар. В каждой паре ученик
выбирает один из двух вариантов.

```json
{
  "type": "thisOrThat",
  "id": "warm-up-this-or-that",
  "items": [{
    "id": "summer-choice-one",
    "options": [{
      "id": "minecraft-house",
      "caption": "Building a house in Minecraft",
      "imagePrompt": "Colorful square cartoon illustration of a child building a wooden house in a block-based video game, no text."
    }, {
      "id": "beach-sandcastle",
      "caption": "Building a sandcastle on the beach",
      "imagePrompt": "Colorful square cartoon illustration of a sandcastle on a sunny beach, no text."
    }]
  }]
}
```

Поля:

- `type` — строго `thisOrThat`.
- `id` — обязательный уникальный идентификатор компонента в lowercase kebab-case.
- `items` — массив из 1–8 пар; у каждой пары обязательный уникальный `id` и ровно два `options`.
- `caption` — обязательная непустая подпись, отображаемая под вариантом.
- `imagePrompt` — обязательный непустой промт на английском для квадратной иллюстрации без текста. Пока изображения нет, интерфейс показывает помещающуюся часть промта и кнопку копирования полного текста.
- `imageSrc` — опциональный служебный URL загруженного изображения. Нейросеть это поле не создаёт: его добавляет сервер после загрузки администратором.

Все идентификаторы внутри компонента уникальны и записываются в lowercase kebab-case.
Не передавайте состояние выбора: оно локальное, независимо для каждой пары и не
сохраняется после перезагрузки. В редакторе можно только загрузить, заменить или
удалить изображение; `caption` и `imagePrompt` остаются неизменными. После удаления
изображения снова показывается сохранённый промт.

## Suggested Answers

`suggestedAnswers` содержит готовые или примерные ответы к заданию. Содержимое
всегда доступно преподавателю, а кнопка `Показать` / `Скрыть` управляет только
предполагаемой видимостью карточки на экране ученика.

```json
{
  "type": "suggestedAnswers",
  "id": "lead-in-suggested-answers",
  "text": "1. “Touch grass” = go outside, spend time in real life.\n2. Possible answer: I don’t agree.\n3. Personal answer."
}
```

Поля:

- `type` — строго `suggestedAnswers`.
- `id` — обязательный уникальный идентификатор в lowercase kebab-case.
- `text` — обязательная непустая строка с тем же Markdown subset, что
  `teacherNote`, включая маркированные и нумерованные списки.

Заголовок `Suggested answers`, зелёное оформление и иконка задаются интерфейсом.
Администратор может редактировать только `text`; `type` и `id` неизменяемы.
Состояние показа ученику не хранится в JSON и по умолчанию выключено. В режиме
ученика скрытый компонент не добавляется на страницу, а управляющие кнопки не
отображаются.
