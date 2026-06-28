# Copy-Paste Prompt: Lesson Page Generator

Скопируй весь промпт ниже в нейросеть. Перед отправкой замени значения в блоке `INPUT`.

```text
You are an expert ESL lesson designer and interactive lesson content generator.

Your task is to generate content for an interactive English lesson page.
Return ONLY valid JSON. Do not return Markdown, HTML, comments, explanations, or text outside JSON.
Return the JSON as compact JSON on one physical line. Do not pretty-print it.

INPUT
Topic: {{WRITE_TOPIC_HERE}}
CEFR level: A2
Learner profile: one-to-one adult or teen English learner
Target grammar: {{OPTIONAL_TARGET_GRAMMAR_OR_EMPTY}}
Support language: Russian only for Translation Time or teacher notes
Lesson duration: 60 minutes

OUTPUT FORMAT
Generate JSON using this exact top-level structure:

{
  "schemaVersion": "lesson-spec-v1",
  "meta": {
    "topic": "",
    "level": "",
    "lessonLanguage": "English",
    "supportLanguage": "Russian",
    "durationMinutes": 60,
    "studentProfile": "",
    "communicativeGoal": "",
    "targetGrammar": "",
    "targetVocabularyTheme": ""
  },
  "hero": {
    "title": "",
    "subtitle": "",
    "pills": ["Warm Up", "Lead-In", "Vocabulary", "Reading", "Grammar", "Practice", "Speaking", "Resources"]
  },
  "sections": [],
  "teacherNotes": {
    "lessonFlow": [],
    "adaptationNotes": [],
    "answerKeySummary": []
  }
}

IMPORTANT
"schemaVersion": "lesson-spec-v1" is only a version marker. The full LessonSpec v1 contract is described below. You must follow this contract exactly.

GENERAL RULES
- Use A2-safe English unless the INPUT says another level.
- Use short sentences, familiar verbs, concrete examples, and clear instructions.
- Make all content specific to the topic.
- Do not generate HTML or CSS.
- Do not use Markdown inside JSON strings.
- Escape all quotation marks inside JSON strings. Example: use "The movie \"Luca\" is..." or avoid inner quotes.
- Prefer single quotes inside JSON string values when mentioning words. Example: "After the verb 'want', we use..." Do not write unescaped double quotes inside a string.
- Do not put literal line breaks inside JSON strings. Use one-line strings.
- Never wrap a string value across physical lines. If a string is long, keep the whole string on one line.
- Every section must have a stable lowercase kebab-case "id".
- Every control must have a stable lowercase kebab-case "id".
- Student-facing instructions must be in English.
- Russian is allowed only in Translation Time items and optional teacher notes.
- Every checked activity must include exact answer values.
- Keep option strings and answer strings exactly reusable by the UI.
- Avoid rare idioms, stereotypes, unsafe advice, and unsupported control types.

ALLOWED CONTROL TYPES
Use only these control types:
- wordAssociationStrikeList
- opinionSort
- discussionQuestions
- definitionMatch
- gapFillBank
- phrasalVerbPractice
- taskList
- readingText
- readingQuizRadio
- grammarRuleCards
- completeRule
- chooseCorrect
- controlledInputPractice
- dropdownChoicePractice
- speakingQuestions
- translationSelfCheck
- resourceNotes

REQUIRED SECTION ORDER
The "sections" array must contain exactly these 8 sections in this order:
1. warmup
2. lead-in
3. target-vocabulary
4. reading
5. grammar
6. grammar-practice
7. speaking
8. resources

CRITICAL STRUCTURE RULE
Every item in "sections" is a section object, not a control object.
Never put "type", "instruction", "items", "cards", "paragraphs", "wordBank", "matchItems", or "gapFillItems" directly on a section object.
Put all controls inside the section's "controls" array.

Each section must use this shape:

{
  "id": "section-id",
  "title": "Section Title",
  "controls": [
    {
      "type": "controlType",
      "id": "control-id"
    }
  ]
}

The only exception is the speaking section, which may also include "alternativeControls".

The "sections" array must look like this skeleton:

[
  { "id": "warmup", "title": "1) Warm Up", "controls": [] },
  { "id": "lead-in", "title": "2) Lead-In", "controls": [] },
  { "id": "target-vocabulary", "title": "3) Target Vocabulary", "controls": [] },
  { "id": "reading", "title": "4) Reading", "controls": [] },
  { "id": "grammar", "title": "5) Grammar", "controls": [] },
  { "id": "grammar-practice", "title": "6) Grammar Practice", "controls": [] },
  { "id": "speaking", "title": "7) Speaking", "controls": [], "alternativeControls": [] },
  { "id": "resources", "title": "8) Resources", "controls": [] }
]

SECTION 1: WARM UP
Section id: "warmup"
Title: "1) Warm Up"
Put exactly one control inside warmup.controls:

{
  "type": "wordAssociationStrikeList",
  "id": "warmup-associations",
  "instruction": "Say the first word that comes to mind for each word. Click a word after you discuss it.",
  "items": ["", "", "", "", "", "", "", "", ""]
}

Rules:
- Generate exactly 9 short topic words or very short topic phrases.
- Items should work for quick oral association.
- Avoid rare words and long collocations.

SECTION 2: LEAD-IN
Section id: "lead-in"
Title: "2) Lead-In"
Put one preferred control inside lead-in.controls:

{
  "type": "opinionSort",
  "id": "lead-in-opinion-sort",
  "instruction": "Move each statement to Agree, Not sure, or Disagree. Be ready to explain your choice.",
  "columns": ["Agree", "Not sure / It depends", "Disagree"],
  "items": [
    { "id": "statement-1", "text": "" }
  ]
}

Rules:
- Generate 6-8 short opinion, ethical, or personal statements.
- Prefer an even number of statements.
- Do not include correct answers for opinion sorting.
- Statements must be understandable at the chosen CEFR level.

Fallback only if opinion sorting does not fit the topic:

{
  "type": "discussionQuestions",
  "id": "lead-in-questions",
  "instruction": "Discuss the questions with your teacher.",
  "items": ["", "", ""]
}

If using fallback, generate 3-4 discussion questions.

SECTION 3: TARGET VOCABULARY
Section id: "target-vocabulary"
Title: "3) Target Vocabulary"
Put these controls inside target-vocabulary.controls:

Control A:
{
  "type": "definitionMatch",
  "id": "vocab-definition-match",
  "instruction": "Match the words with the definitions.",
  "items": [
    { "id": "vocab-1", "term": "", "definition": "" }
  ]
}

Rules for Control A:
- Generate about 10 vocabulary items.
- Items may be words, collocations, or phrasal verbs.
- Definitions must be simple and student-friendly.

Control B:
{
  "type": "gapFillBank",
  "id": "vocab-gap-fill",
  "instruction": "Complete the sentences with the correct words.",
  "wordBank": [],
  "items": [
    { "id": "gap-1", "before": "", "answer": "", "after": "" }
  ],
  "interaction": "drag-or-select"
}

Rules for Control B:
- Generate 8-10 sentences.
- Use vocabulary from Control A where possible.
- "answer" must exactly match a value in "wordBank".
- Split each sentence into "before", "answer", and "after".

Control C, include only if phrasal verbs naturally fit the topic:
{
  "type": "phrasalVerbPractice",
  "id": "phrasal-verbs-practice",
  "instruction": "Match the phrasal verbs with the definitions. Then complete the sentences.",
  "matchItems": [
    { "id": "pv-1", "term": "", "definition": "", "letter": "a" }
  ],
  "gapFillItems": [
    { "id": "pv-gap-1", "before": "", "answer": "", "after": "" }
  ],
  "wordBank": []
}

Rules for Control C:
- Generate 4-5 phrasal verbs.
- Generate 6-8 gap-fill sentences.
- Every gap answer must exactly match a value in "wordBank".

SECTION 4: READING
Section id: "reading"
Title: "4) Reading"
Put these controls inside reading.controls:

Control A:
{
  "type": "taskList",
  "id": "reading-tasks",
  "items": ["Read the text.", "Answer the quiz.", "Discuss one question."]
}

Control B:
{
  "type": "readingText",
  "id": "reading-text",
  "title": "Time to Read!",
  "paragraphs": ["", "", "", ""]
}

Control C:
{
  "type": "readingQuizRadio",
  "id": "reading-quiz",
  "instruction": "Choose the correct answer.",
  "items": [
    {
      "id": "quiz-1",
      "question": "",
      "options": ["", "", ""],
      "answer": ""
    }
  ]
}

Rules:
- Generate 4-6 short paragraphs.
- Use target vocabulary naturally.
- Generate 4-6 quiz questions.
- Each quiz question must have exactly 3 options.
- Each quiz question must have exactly one correct answer.
- "answer" must exactly match one of the options.

SECTION 5: GRAMMAR
Section id: "grammar"
Title: "5) Grammar"
Put these controls inside grammar.controls:

Control A:
{
  "type": "grammarRuleCards",
  "id": "grammar-rule",
  "cards": [
    { "title": "", "body": "", "examples": [""] }
  ]
}

Control B:
{
  "type": "completeRule",
  "id": "complete-the-rule",
  "instruction": "Complete the rule below.",
  "items": [
    {
      "id": "rule-gap-1",
      "before": "",
      "options": ["", "", ""],
      "answer": "",
      "after": ""
    }
  ]
}

Control C:
{
  "type": "chooseCorrect",
  "id": "grammar-choose-correct",
  "instruction": "Choose the correct option.",
  "items": [
    {
      "id": "choice-1",
      "before": "",
      "options": ["", ""],
      "answer": "",
      "after": ""
    }
  ]
}

Rules:
- If Target grammar is empty, choose grammar that naturally fits the topic and level.
- Explain the grammar in simple English.
- Include positive, negative, and question examples if relevant.
- Generate 2-4 rule cards.
- Generate 3-5 completeRule items.
- Generate 5-6 chooseCorrect items.
- Wrong options should be plausible but not too confusing.
- Each answer must exactly match one of the options.

SECTION 6: GRAMMAR PRACTICE
Section id: "grammar-practice"
Title: "6) Grammar Practice"
Put these controls inside grammar-practice.controls:

Control A:
{
  "type": "controlledInputPractice",
  "id": "grammar-controlled-practice",
  "instruction": "Complete the sentences with the correct form.",
  "examples": [
    { "prompt": "", "answer": "" }
  ],
  "items": [
    {
      "id": "controlled-1",
      "prompt": "",
      "answer": "",
      "after": "",
      "acceptedAnswers": []
    }
  ]
}

Control B:
{
  "type": "dropdownChoicePractice",
  "id": "grammar-dropdown-practice",
  "instruction": "Choose the correct options.",
  "items": [
    {
      "id": "dropdown-1",
      "before": "",
      "options": ["", ""],
      "answer": "",
      "after": ""
    }
  ]
}

Rules:
- Generate 6-8 items for Control A.
- Generate 6-8 items for Control B.
- Include 1-3 examples for Control A.
- For Control A, "prompt" is the visible cue or sentence beginning.
- For Control A, "answer" is the expected typed answer.
- For Control A, use "acceptedAnswers" only if spelling/wording variations are likely.
- For Control B, every answer must exactly match one of the options.

SECTION 7: SPEAKING
Section id: "speaking"
Title: "7) Speaking"
Put this default control inside speaking.controls:

{
  "type": "speakingQuestions",
  "id": "speaking-questions",
  "instruction": "Answer the questions. Give reasons and examples.",
  "items": ["", "", "", ""]
}

Rules:
- Generate 4-6 speaking questions.
- Questions should recycle target vocabulary and grammar.
- Questions should encourage personal answers and discussion.

Also include this alternative control inside speaking.alternativeControls if Russian support is useful:

{
  "type": "translationSelfCheck",
  "id": "translation-time",
  "instruction": "Translate the sentences. Then open self-check.",
  "items": [
    { "id": "translation-1", "sourceRu": "", "answerEn": "" }
  ]
}

Rules for translationSelfCheck:
- Generate 6-8 Russian sentences.
- English answers should use the target vocabulary and grammar.
- Answers are for self-check and should not appear in student instructions.

SECTION 8: RESOURCES
Section id: "resources"
Title: "8) Resources"
Put this control inside resources.controls:

{
  "type": "resourceNotes",
  "id": "lesson-resources",
  "instruction": "Add useful links or materials here.",
  "placeholder": "Write links or notes here...",
  "initialValue": ""
}

Rules:
- Usually keep "initialValue" empty.
- If source links are provided in INPUT, include them as plain text.

TEACHER NOTES
Fill "teacherNotes" with:
- "lessonFlow": 5-8 short teacher-facing steps.
- "adaptationNotes": 3-5 short notes about making the lesson easier or harder.
- "answerKeySummary": concise answer key notes for checked activities.

FINAL CHECK BEFORE RESPONDING
- The response is valid JSON.
- The response can be parsed by JSON.parse without any repair.
- The response is compact JSON on one physical line.
- There is no Markdown wrapper.
- All 8 sections are present in the correct order.
- Every section has a "controls" array.
- No control object appears directly inside "sections".
- No section object has a direct "type" field.
- All required controls are present.
- Warm-up has exactly 9 items.
- Lead-in has 6-8 statements or 3-4 fallback questions.
- Vocabulary has about 10 terms and 8-10 gap-fill sentences.
- Reading has 4-6 paragraphs and 4-6 quiz questions.
- Every quiz question has exactly 3 options.
- Grammar includes grammarRuleCards, completeRule, and chooseCorrect.
- Grammar Practice includes controlledInputPractice and dropdownChoicePractice.
- Speaking includes speakingQuestions and may include translationSelfCheck.
- Resources includes resourceNotes.
- Every checked item has an exact answer.
```
