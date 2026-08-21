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
- `{s}текст{/s}`, `{m}текст{/m}`, `{l}текст{/l}`, `{xl}текст{/xl}` — размер
  фрагмента (S / M / L / XL относительно базового размера блока);
- `{muted}текст{/muted}` — приглушённый текст;
- строки вида `- пункт` — маркированный список;
- строки вида `1. пункт` — нумерованный список; при сохранении номера нормализуются
  последовательно, начиная с единицы;
- пустая строка — разделитель абзацев или блоков.

Не используйте HTML, заголовки Markdown, ссылки, изображения, таблицы или вложенные
списки. Для внешней заметки не передавайте подпись, цвет или начальное состояние
сворачивания: интерфейс добавляет их самостоятельно, а заметка всегда открыта при
первой отрисовке. Настройки `titleColor` и `icon` относятся только к вложенным блокам.

## Markdown Card

`markdownCard` — нейтральная визуальная карточка с заголовком, иконкой и Markdown-содержимым.
Она используется для `Your turn!`, `Suggested answers`, `Vocabulary`, сравнений правил
и других блоков с таким же представлением. Карточка содержит либо один `text`, либо
от одной до трёх структурированных `sections`; смешивать два формата нельзя.

```json
{
  "type": "markdownCard",
  "id": "target-vocabulary-card",
  "title": "Vocabulary",
  "text": "1. **to hang out** — spend free time together\n2. **to chill out** — relax",
  "icon": "book",
  "accentColor": "#20A85B",
  "studentVisibility": "controlled"
}
```

Секционный вариант:

```json
{
  "type": "markdownCard",
  "id": "grammar-presentation-quick-rule",
  "title": "Quick Rule",
  "layout": "columns",
  "sections": [{
    "id": "used-to",
    "title": "USED TO",
    "text": "- **past habit** / state that is different now\n- **form:** subject + used to + base verb"
  }, {
    "id": "get-used-to",
    "title": "GET USED TO",
    "text": "- become comfortable with something new\n- **form:** get used to + noun / verb-ing"
  }],
  "icon": "bulb",
  "accentColor": "#6545F5",
  "studentVisibility": "always"
}
```

Поля:

- `type` — строго `markdownCard`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор.
- `title` — обязательный непустой заголовок без Markdown.
- `text` — обязательный непустой текст с тем же Markdown subset, что `teacherNote`,
  если карточка не использует `sections`.
- `sections` — альтернатива `text`: массив от 1 до 3 секций с уникальными kebab-case
  `id`, опциональными обычными `title` и непустым Markdown-текстом в `text`.
- `layout` — обязательное для секционной карточки значение `columns` или `stacked`.
  В узком интерфейсе колонки автоматически складываются вертикально.
- `icon` — строго `book`, `check`, `chat`, `bulb` или `key`.
- `headingSize` — опционально `default` или `large`. Режим `large` увеличивает
  основной заголовок до 16px, а заголовки секций до 14px, сохраняя визуальную
  иерархию. Значение задаётся в JSON и не редактируется администратором.
- `accentColor` — обязательный цвет заголовка, иконки и маркеров в формате `#RRGGBB`.
- `studentVisibility` — строго `always`, `controlled` или `teacherOnly`.

Для `controlled` преподавателю показывается локальная кнопка `Показать` / `Скрыть`.
Состояние не хранится в JSON и по умолчанию выключено. `always` не показывает кнопку
и предназначен для постоянного показа ученику; `teacherOnly` предназначен только
для преподавателя. Реальная синхронизация со student screen в текущей версии не
реализована.

Администратор может редактировать `title` и содержимое выбранного формата. В секционной
карточке разрешено редактировать, добавлять, удалять и переставлять секции в пределах
лимита; существующие id остаются стабильными, новые создаёт интерфейс. `type`, id
карточки, `layout`, `icon`, `accentColor` и `studentVisibility` после генерации
неизменяемы. Рамку и светлый фон интерфейс вычисляет из `accentColor`.

## Task Prompt

`taskPrompt` используется только для follow-up вопросов или следующего шага с
опциональной дополнительной языковой опорой.

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
- `variant` — строго `followUp`.
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

## Personalized Questions

`personalizedQuestions` — неинтерактивный список устных вопросов с отдельной
follow-up репликой для каждого пункта.

```json
{
  "type": "personalizedQuestions",
  "id": "target-vocabulary-personalized-questions",
  "title": "Task 4 · Personalised Questions",
  "instruction": "Answer the questions out loud. There are no right or wrong answers!",
  "items": [{
    "id": "favorite-time-outdoors",
    "question": "What’s your favorite way to **spend time outdoors**?",
    "followUp": "Who do you usually spend that time with?"
  }]
}
```

Поля:

- `type` — строго `personalizedQuestions`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор.
- `title` и `instruction` — обязательные непустые строки.
- `items` — от 1 до 12 элементов с уникальными kebab-case `id` и непустыми
  `question`/`followUp`.
- В вопросах разрешён только безопасный inline Markdown: `**жирный**`,
  `*курсив*` и `***жирный курсив***`. HTML, ссылки, изображения, блочные элементы
  и переносы строк не поддерживаются. Follow-up хранится как обычный текст и
  оформляется курсивом самим компонентом.

Администратор review-черновика может менять заголовок и инструкцию, редактировать,
добавлять и удалять пары, а также менять их порядок. Поля `type`, id компонента и
существующие id элементов не редактируются; новые id создаёт интерфейс.

## Describe and Guess

`describeAndGuess` — финальное дополнительное устное упражнение vocabulary. Ученик и
преподаватель по очереди объясняют слова, не называя их; угаданные слова можно
зачеркнуть нажатием.

```json
{
  "type": "describeAndGuess",
  "id": "target-vocabulary-describe-and-guess",
  "title": "Extra Task · Describe and Guess",
  "instruction": "Take turns with your teacher. Describe the word without saying it. Can your partner guess it?",
  "items": [{
    "id": "describe-hang-out",
    "text": "to hang out (with friends)"
  }],
  "howToPlay": {
    "title": "How to Play",
    "steps": [
      "Choose a word from the list.",
      "Describe it without saying the word or any part of it.",
      "Your partner guesses the word."
    ],
    "tip": "You can use examples, actions, feelings and details, but don’t say the word!"
  }
}
```

Поля:

- `type` — строго `describeAndGuess`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор.
- `title` и `instruction` — обязательные непустые строки без HTML и Markdown.
- `items` — от 1 до 12 слов или фраз с уникальными kebab-case `id` и непустым
  обычным текстом в `text`.
- `howToPlay` — обязательный редактируемый объект. Он содержит непустые `title` и
  `tip`, а также от 1 до 8 непустых строк в `steps`. Генератор использует одинаковый
  стартовый текст правил для всех тем урока.

Нажатие на слово локально включает или снимает зачёркивание. Это состояние не
хранится в JSON и сбрасывается после повторной отрисовки. Кнопка `Показать`
резервируется для отдельной будущей механики student screen и пока не изменяет
состояние компонента.

В review-редакторе администратор может менять заголовок, инструкцию, слова, заголовок
правил, шаги и tip, а также добавлять, удалять и переставлять слова и шаги. Поля
`type`, id компонента и существующие id слов неизменяемы; новые id создаёт интерфейс.

## Text Panel

`textPanel` показывает простой текстовый блок с настраиваемыми цветами фона и
акцента. Панель может отображаться с рамкой или без визуального контейнера. Этот
тип не содержит изображений.

```json
{
  "type": "textPanel",
  "id": "lead-in-discussion-questions",
  "text": "1. What does “touch grass” mean?\n2. Do you agree that real-world graphics are boring?\n3. How many days can you survive without your PC or console?",
  "backgroundColor": "#FFFFFF",
  "accentColor": "#6545F5",
  "showBorder": false
}
```

Поля:

- `type` — строго `textPanel`.
- `id` — обязательный уникальный идентификатор в lowercase kebab-case.
- `text` — обязательная непустая строка с общим Markdown subset, включая
  маркированные и нумерованные списки.
- `backgroundColor` — обязательный цвет в формате `#RRGGBB`. Интерфейс автоматически
  выбирает контрастный тёмный или белый цвет текста.
- `accentColor` — опциональный цвет выделения в формате `#RRGGBB`. Он применяется
  к рамке, жирным фрагментам и маркерам списков. По умолчанию совпадает с
  автоматически выбранным цветом текста.
- `showBorder` — опциональный boolean. По умолчанию `true`. Значение `false`
  убирает рамку, тень, скругление и внутренние отступы панели.

Администратор может редактировать `text`, `backgroundColor`, `accentColor` и
`showBorder`. Поля
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

## Text Reading

`textReading` показывает материал для чтения: заголовок, необязательный серый
подзаголовок, основной текст и до двух независимых иллюстраций.

```json
{
  "type": "textReading",
  "id": "reading-text",
  "title": "My Exchange Week Surprise",
  "subtitle": "by ClaryNomad16 · Posted Aug 20",
  "headerImage": {
    "imagePrompt": "Small friendly circular avatar of a teenage student, no text."
  },
  "text": "Last month, I joined a one-week school exchange in Bristol.\n\n...",
  "textImage": {
    "imagePrompt": "Wide educational illustration of a teenage exchange student in a school hallway, no readable text."
  }
}
```

Поля:

- `type` — строго `textReading`.
- `id` — обязательный уникальный идентификатор в lowercase kebab-case.
- `title` — обязательный однострочный заголовок без Markdown.
- `subtitle` — необязательная однострочная строка. Её можно добавить, изменить или
  удалить в редакторе; пустое значение удаляет поле из JSON.
- `text` — обязательная непустая строка с тем же безопасным Markdown subset, что и
  `teacherNote`. Текст хранится одной строкой, а абзацы разделяются пустой строкой.
- `headerImage` и `textImage` — независимые опциональные объекты. Первый слот
  отображается компактно рядом с заголовком, второй — справа от текста и под ним на
  мобильном экране.
- `imagePrompt` — обязательный непустой английский промт. Он создаётся генератором и
  не редактируется в интерфейсе.
- `imageSrc` — опциональный служебный URL загружанного изображения, который добавляет
  сервер. Администратор может загружать, заменять и удалять изображение только в уже
  объявленном слоте.

Незагруженные image-слоты и их промты видны только в режиме редактирования. В обычном
preview отображаются только загруженные файлы. Не создавайте пустые объекты
`headerImage` или `textImage`, если соответствующая иллюстрация не нужна.

После текста для чтения обычно идут один или несколько `multipleChoice` и
отдельный `markdownCard` Answer Key. Сам `textReading` ответов не содержит.

## Audio Player

`audioPlayer` показывает заголовок и один аудиослот. Нейросеть создаёт текст
для озвучки; администратор копирует его во внешний редактор и загружает готовый
файл на место текста — так же, как `imagePrompt` заменяется на `imageSrc`.

```json
{
  "type": "audioPlayer",
  "id": "listening-audio",
  "title": "Listen to the audio",
  "script": "Alex: Hey, Mia! Are you here for AFK Summer too?\nMia: Yes! I got bored at home, so I decided to go offline this summer."
}
```

Поля:

- `type` — строго `audioPlayer`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор.
- `title` — обязательная непустая однострочная строка без HTML и Markdown.
- `script` — обязательный непустой обычный текст для озвучки. Реплики
  разделяются переводом строки. HTML и Markdown запрещены.
- `audioSrc` — опциональный служебный URL загруженного файла. Нейросеть это
  поле не создаёт: его добавляет сервер после загрузки администратором.

Администратор может редактировать только `title` и загружать, заменять или
удалять файл в уже объявленном слоте. `type`, `id` и `script` после генерации
неизменяемы. Без файла в preview видны иконка аудио, первые две строки текста
для озвучки и кнопка копирования полного скрипта;
загрузка, замена и удаление файла доступны только в режиме редактирования.
Если файл уже загружен, preview показывает заголовок и плеер.

После первого аудиоплеера в listening обычно идут gist-квиз `checkboxChoice`,
повтор того же аудио (`Listen to the audio one more time`), detail-квиз
`multipleChoice` и отдельный `markdownCard` Answer Key. Сам `audioPlayer` ответов
не содержит. Повтор — отдельный компонент с тем же `script` и своим `id`.

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

## Dropdown Choice

`dropdownChoice` показывает связный текст с интерактивными выпадающими списками.
Компонент подходит для контекстных заданий, в которых ученик выбирает правильное
слово или фразу для каждого пропуска.

```json
{
  "type": "dropdownChoice",
  "id": "target-vocabulary-context-dropdown",
  "title": "**Task 2 · Vocabulary in Context — Dropdown**",
  "instruction": "Fill in the blanks with the correct words from the dropdown lists.",
  "text": "**1.** This summer, I wanted [[hang-out-context]] and spend less time at home.",
  "accentColor": "#6545F5",
  "choices": [{
    "id": "hang-out-context",
    "options": ["to get bored", "to hang out (with friends)", "to stay up late"],
    "answer": "to hang out (with friends)"
  }]
}
```

Поля:

- `type` — строго `dropdownChoice`.
- `id` — обязательный уникальный идентификатор компонента в lowercase kebab-case.
- `title` — обязательная непустая строка. Разрешён только `**жирный текст**`;
  выделенный фрагмент окрашивается в `accentColor`.
- `instruction` — обязательная непустая строка без HTML и Markdown.
- `text` — непустой текст с 1–12 маркерами вида `[[choice-id]]`. В обычном тексте
  разрешён только `**жирный текст**`, который окрашивается в `accentColor`.
  Маркеры выделения не могут пересекать dropdown-пропуск или перевод строки.
  Одиночные переводы строки сохраняются, пустая строка создаёт новый абзац.
- `accentColor` — опциональный цвет выделенного жирного текста в формате `#RRGGBB`.
  По умолчанию используется почти чёрный `#17182D`.
- `choices` — от 1 до 12 объектов с уникальными lowercase kebab-case `id`, от 2 до
  12 уникальных `options` и `answer`, который в точности совпадает с вариантом.
- Каждый id из `choices` должен встретиться в `text` ровно один раз, лишние или
  повторные маркеры запрещены. Одинаковый текст ответа разрешён в разных choices.
- HTML и любой Markdown кроме описанного `**жирного текста**` в `title` и `text`
  запрещены. В `instruction`, `options` и `answer` Markdown запрещён полностью.
  Старое поле `segments` не поддерживается.

После выбора неверный вариант подсвечивается красным и остаётся доступным для
повторной попытки. Верный вариант подсвечивается зелёным и блокируется. Состояние
ответов локальное: оно не передаётся в JSON и сбрасывается после повторной отрисовки.
В review-редакторе администратор меняет заголовок, инструкцию и текст прямо в
карточке. Выделенный фрагмент можно превратить в dropdown; для каждого пропуска
можно менять правильный ответ, добавлять и удалять варианты или убрать пропуск.
В режиме редактирования жирное выделение показывается исходными маркерами `**`,
чтобы они сохранялись без потерь. Поля `type`, `id`, `accentColor` компонента и id
существующих choices неизменны.

## Fill in the Blanks

`fillInBlanks` показывает нумерованные предложения с одним текстовым пропуском в
каждом. Компонент подходит для самостоятельного воспроизведения слов и фраз из
vocabulary без списка вариантов.

```json
{
  "type": "fillInBlanks",
  "id": "target-vocabulary-fill-in-blanks",
  "title": "Task 3 · Fill in the Blanks",
  "instruction": "Type the correct word or phrase in each blank.",
  "items": [{
    "id": "fill-item-chill-out",
    "before": "After a long week, I like to",
    "answer": "chill out",
    "after": "and watch a movie."
  }]
}
```

Поля:

- `type` — строго `fillInBlanks`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор компонента.
- `title` и `instruction` — обязательные непустые строки без HTML и Markdown.
- `items` — от 1 до 12 предложений; их `id` уникальны внутри компонента и записаны
  в lowercase kebab-case.
- `before` и `after` задают текст слева и справа от единственного пропуска. Одно из
  этих полей может быть пустым, но не оба одновременно.
- `answer` — обязательное правильное слово или фраза в нужной для предложения
  грамматической форме. HTML и Markdown во всех строках запрещены.

Во время ввода совпадение проверяется без учёта регистра, крайних и повторяющихся
пробелов. Верный ответ получает зелёную галочку; неверный ответ никак не помечается,
и поле остаётся доступным для исправления. Ответы ученика не сохраняются в JSON.

Teacher Answer Key строится непосредственно из `items[].answer` и скрывается в
student view. В review-редакторе администратор может изменять обе части предложения
и правильный ответ, добавлять и удалять строки и менять их порядок. `type`, `id`,
`title` и `instruction` после генерации не редактируются. Нейросеть должна брать
целевые ответы из vocabulary и адаптировать их грамматическую форму к предложению.

## Drag Words in Text

`dragWordsInText` показывает связный текст с пропусками и общий банк слов.
Ученик перетаскивает слово в пропуск или выбирает слово и затем пропуск.
Компонент подходит для Complete the Rule и похожих заданий на восстановление
формулировки.

```json
{
  "type": "dragWordsInText",
  "id": "grammar-presentation-complete-the-rule",
  "title": "Complete the Rule",
  "instruction": "Drag the correct words into the gaps.",
  "words": ["past", "base verb", "comfortable", "-ing", "future", "infinitive with to"],
  "text": "used to + [[base verb]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation."
}
```

Поля:

- `type` — строго `dragWordsInText`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор.
- `title` и `instruction` — обязательные непустые строки без HTML и Markdown.
- `words` — от 2 до 12 уникальных непустых строк в порядке банка.
- `text` — обязательный непустой текст с 1–8 пропусками вида `[[answer]]`.
  Каждый `answer` после нормализации пробелов точно совпадает с одним словом
  из `words`. Ответы уникальны: одно слово банка закрывает максимум один пропуск.
- Слова из `words`, которые не встречаются в пропусках, — дистракторы. Их может
  не быть, если пропусков не меньше двух.
- Внутри `[[...]]` нельзя скобки, перевод строки и пустое значение. В тексте
  вокруг пропусков HTML и Markdown запрещены. `[[` / `]]` вне маркеров запрещены.
- Пустая строка внутри `text` разделяет абзацы; одиночный перевод строки остаётся
  переносом. HTML в JSON не передавайте.

Неверный ответ не остаётся в пропуске: чип возвращается в банк. Верный ответ
подсвечивается зелёным и блокируется. Состояние локальное и не хранится в JSON.

Answer Key в этот компонент не встроен. Если ключ нужен, добавьте отдельный
`markdownCard` с `studentVisibility: "teacherOnly"`.

В review-редакторе администратор правит заголовок, инструкцию, банк и текст
прямо в том же каркасе, без отдельной формы сегментов. Выделенное слово
становится пропуском; маркеры `[[...]]` в интерфейсе не показываются. Поля
`type` и `id` неизменны.

## Checkbox Choice

`checkboxChoice` показывает один или несколько вопросов с чекбоксами. В каждом
вопросе может быть несколько верных вариантов. Компонент подходит для listening
gist и других заданий формата «выберите все верные ответы».

```json
{
  "type": "checkboxChoice",
  "id": "listening-gist-quiz",
  "title": "Task 1. Listening for Gist",
  "instruction": "Choose the correct options.",
  "items": [{
    "id": "conversation-place",
    "question": "Where does the conversation take place?",
    "options": [
      "At home",
      "At the AFK Summer camp office",
      "On a school bus"
    ],
    "answers": ["At the AFK Summer camp office"]
  }]
}
```

Поля:

- `type` — строго `checkboxChoice`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор компонента.
- `title` и `instruction` — обязательные непустые строки без HTML и Markdown.
- `items` — от 1 до 12 вопросов; их `id` уникальны внутри компонента и записаны
  в lowercase kebab-case.
- `question` — обязательный непустой текст вопроса без разметки.
- `options` — от 2 до 8 уникальных непустых строк. Буквы A, B, C в ученическом
  интерфейсе не показываются; в Answer Key они соответствуют порядку вариантов.
- `answers` — обязательный непустой массив уникальных строк. Каждая строка
  в точности совпадает с одним из `options`. Один верный вариант тоже передаётся
  массивом из одного элемента. При сохранении ответы выстраиваются в порядке
  `options`.
- HTML и Markdown во всех видимых строках запрещены. Поля `explanation` нет:
  пояснения живут в отдельном Answer Key.

Один вопрос отображается без нумерации. Несколько вопросов нумеруются. Клик сразу
проверяет вариант. Неверный вариант подсвечивается красным и блокируется. Верный
вариант подсвечивается зелёным, отмечается галочкой и блокируется; остальные
варианты остаются доступными, пока не будут отмечены все `answers`. Для
преподавателя невыбранные верные варианты заранее помечены тускло-зелёным.
Состояние ответов локальное: оно не передаётся в JSON и сбрасывается после
повторной отрисовки.

Teacher Answer Key в этот компонент не встроен. Если ключ нужен, добавьте
отдельный `markdownCard` с `studentVisibility: "teacherOnly"` после всех
квизов стадии. Перечислите верные буквы по порядку вариантов, в том числе
несколько букв у одного пункта: `2A, C`. Краткое пояснение после длинного
тире можно добавить в текст ключа; сам компонент его не хранит.

В listening типичный порядок такой: `teacherNote`, `audioPlayer`, gist-квиз
`checkboxChoice`, повтор `audioPlayer`, detail-квиз `multipleChoice`, затем
Answer Key.

В review-редакторе администратор может изменять заголовок, инструкцию, вопросы,
варианты и набор верных ответов, а также добавлять, удалять и менять порядок
вопросов и вариантов. Поля `type`, id компонента и существующие id вопросов
неизменяемы; новые id создаёт интерфейс.

## Multiple Choice

`multipleChoice` показывает один или несколько вопросов с выбором одного верного
варианта. Компонент подходит для reading/listening и других заданий с фиксированным
правильным ответом.

```json
{
  "type": "multipleChoice",
  "id": "reading-gist-quiz",
  "title": "Task 1. Reading for Gist",
  "instruction": "Choose the best answer.",
  "items": [{
    "id": "main-idea",
    "question": "What is the main idea of the text?",
    "options": [
      "The writer had a terrible trip and wants to forget it.",
      "The writer discovered that an exchange week was challenging but rewarding.",
      "The writer mostly wanted to talk about famous places in Bristol."
    ],
    "answer": "The writer discovered that an exchange week was challenging but rewarding.",
    "explanation": "The text is about expectations, challenges, and positive results."
  }]
}
```

Поля:

- `type` — строго `multipleChoice`.
- `id` — обязательный уникальный lowercase kebab-case идентификатор компонента.
- `title` и `instruction` — обязательные непустые строки без HTML и Markdown.
- `items` — от 1 до 12 вопросов; их `id` уникальны внутри компонента и записаны
  в lowercase kebab-case.
- `question` — обязательный непустой текст вопроса без разметки.
- `options` — от 2 до 8 уникальных непустых строк. Буквы A, B, C интерфейс
  проставляет сам по порядку вариантов.
- `answer` — обязательная строка, которая в точности совпадает с одним из `options`.
- `explanation` — опциональная непустая строка без разметки. Пустое значение не
  передавайте: поле должно отсутствовать целиком. Если пояснение есть, после
  верного ответа интерфейс показывает `Correct!` и этот текст.
- HTML и Markdown во всех видимых строках запрещены.

Один вопрос отображается без нумерации. Несколько вопросов нумеруются и
оборачиваются во внутренние карточки. Неверный вариант подсвечивается красным
и остаётся доступным для повторной попытки. Верный вариант подсвечивается
зелёным и блокирует вопрос. Для преподавателя верные варианты заранее
помечены тускло-зелёным. Состояние ответов локальное: оно не передаётся в JSON
и сбрасывается после повторной отрисовки.

Teacher Answer Key в этот компонент не встроен. Если ключ нужен, добавьте
отдельный `markdownCard` с `studentVisibility: "teacherOnly"` после всех
квизов стадии. Перечислите верные буквы; пояснение после длинного тире
включайте только когда у пункта есть `explanation`.

В reading типичный порядок такой: `teacherNote`, `textReading`, gist-квиз из
одного вопроса, detail-квиз из нескольких вопросов, затем Answer Key. Listening
оформляется отдельной стадией; её `teacherNote` размещается первым, затем
`audioPlayer`, gist-квиз `checkboxChoice`, повтор `audioPlayer`, detail-квиз
`multipleChoice` и Answer Key. Для нескольких квизов в одном ключе группируйте
ответы по Task:

```json
{
  "type": "markdownCard",
  "id": "reading-answer-key",
  "title": "Answer Key",
  "text": "**Task 1:**\n\nB — The text is about expectations, challenges, and positive results.\n\n**Task 2:**\n\n1A — The writer was nervous because they had never stayed with a host family before.\n\n2B — On the first day, the writer got lost in the school building.\n\n5B",
  "icon": "check",
  "accentColor": "#20A85B",
  "studentVisibility": "teacherOnly"
}
```

Абзацы в `text` разделяйте пустой строкой, иначе соседние строки сольются.
Пункт без `explanation` записывайте одной буквой, без тире: `5B`, а не `5B —`.

В review-редакторе администратор может изменять заголовок, инструкцию, вопросы,
варианты, правильный ответ и пояснение, а также добавлять, удалять и менять
порядок вопросов и вариантов. Поля `type`, id компонента и существующие id
вопросов неизменяемы; новые id создаёт интерфейс.
