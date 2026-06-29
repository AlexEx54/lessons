# Lesson Generator Template

This document defines the content contract for generating an interactive English lesson page in the current platform style.

The generator should produce structured JSON, not HTML. The app or a human renderer can then map each block to existing lesson controls, sync keys, answer checks, and visual styles.

## Source Notes

The teacher brief and embedded screenshots describe an 8-screen lesson:

1. Warm Up: word association cards that can be crossed out after use.
2. Lead-In: opinion statements sorted into Agree / Not sure / Disagree columns.
3. Target Vocabulary: word-definition matching, vocabulary gap fill, and optional phrasal verbs practice.
4. Reading: short reading text plus quiz questions with radio buttons.
5. Grammar: simple rule explanation, examples, and "complete the rule" / choose-correct controls.
6. Grammar Practice: controlled and semi-controlled grammar tasks.
7. Speaking: discussion questions or Translation Time cards with self-check.
8. Resources: text area for links/materials.

Corrections from the screenshots:

- Warm-up is not a mood/reaction block; it is a strike-through word card list.
- Lead-in should preserve the 3 large opinion columns and use short draggable statement chips.
- Vocabulary matching is visual chip-to-definition matching; gap-fill can use draggable chips or select/dropdown slots.
- Phrasal verbs practice has two parts: match letters to definitions, then fill sentence gaps from a small verb bank.
- Grammar should include at least one "complete the rule" control, not only rule cards.
- Grammar practice uses both typed transformations and dropdown choice controls.
- Speaking may be a simple question list or a Russian-to-English Translation Time self-check card.
- Reading may include a task list wrapper before the text/quiz.

## LessonSpec v1

Return only valid JSON matching this shape:

```json
{
  "schemaVersion": "lesson-spec-v1",
  "meta": {
    "topic": "{{topic}}",
    "level": "A2",
    "lessonLanguage": "English",
    "supportLanguage": "Russian",
    "durationMinutes": 60,
    "studentProfile": "one-to-one adult or teen English learner",
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
```

General rules:

- Use A2-safe English by default: short sentences, familiar verbs, concrete examples.
- Do not generate HTML, CSS, Markdown tables, or explanations outside JSON.
- Every checked control must include an answer key.
- Every control must have a stable lowercase kebab-case `id`.
- Student-facing instructions should be in English.
- Russian is allowed only in Translation Time items or optional teacher notes.
- Keep content tied to the requested topic; avoid generic filler.
- Allowed control types: `wordAssociationStrikeList`, `opinionSort`, `discussionQuestions`, `definitionMatch`, `gapFillBank`, `phrasalVerbPractice`, `taskList`, `readingText`, `readingQuizRadio`, `grammarRuleCards`, `completeRule`, `chooseCorrect`, `controlledInputPractice`, `dropdownChoicePractice`, `speakingQuestions`, `translationSelfCheck`, `resourceNotes`.

## Required Sections

### 1. Warm Up

Use `wordAssociationStrikeList`.

```json
{
  "id": "warmup",
  "title": "1) Warm Up",
  "controls": [
    {
      "type": "wordAssociationStrikeList",
      "id": "warmup-associations",
      "instruction": "Say the first word that comes to mind for each word. Click a word after you discuss it.",
      "items": ["", "", "", "", "", "", "", "", ""]
    }
  ]
}
```

Rules:

- Generate exactly 9 short words or very short phrases.
- Items should be useful for quick oral associations.
- Avoid rare words, idioms, and long collocations here.

### 2. Lead-In

Preferred control: `opinionSort`.

```json
{
  "id": "lead-in",
  "title": "2) Lead-In",
  "controls": [
    {
      "type": "opinionSort",
      "id": "lead-in-opinion-sort",
      "instruction": "Move each statement to Agree, Not sure, or Disagree. Be ready to explain your choice.",
      "columns": ["Agree", "Not sure / It depends", "Disagree"],
      "items": [
        { "id": "statement-1", "text": "" }
      ]
    }
  ]
}
```

Rules:

- Generate 6-8 statements, preferably an even number.
- Statements should be ethical, personal, or opinion-based.
- Do not include a correct answer for this section.
- If the topic does not fit opinion sorting, use `discussionQuestions` with 3-4 questions.

Fallback shape:

```json
{
  "type": "discussionQuestions",
  "id": "lead-in-questions",
  "instruction": "Discuss the questions with your teacher.",
  "items": ["", "", ""]
}
```

### 3. Target Vocabulary

Use `definitionMatch`, `gapFillBank`, and optionally the phrasal verbs controls.

```json
{
  "id": "target-vocabulary",
  "title": "3) Target Vocabulary",
  "controls": [
    {
      "type": "definitionMatch",
      "id": "vocab-definition-match",
      "instruction": "Match the words with the definitions.",
      "items": [
        { "id": "vocab-1", "term": "", "definition": "" }
      ]
    },
    {
      "type": "gapFillBank",
      "id": "vocab-gap-fill",
      "instruction": "Complete the sentences with the correct words.",
      "wordBank": [],
      "items": [
        { "id": "gap-1", "before": "", "answer": "", "after": "" }
      ],
      "interaction": "drag-or-select"
    },
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
  ]
}
```

Rules:

- Generate about 10 vocabulary items: words, collocations, or phrasal verbs.
- Definitions should be simple, not dictionary-heavy.
- Generate 8-10 vocabulary gap-fill sentences.
- If phrasal verbs are appropriate, generate 4-5 phrasal verbs and 6-8 practice gaps.
- Keep all answer strings exactly reusable as options.

### 4. Reading

Use `readingText` and `readingQuizRadio`. A task list wrapper is allowed.

```json
{
  "id": "reading",
  "title": "4) Reading",
  "controls": [
    {
      "type": "taskList",
      "id": "reading-tasks",
      "items": ["Read the text.", "Answer the quiz.", "Discuss one question."]
    },
    {
      "type": "readingText",
      "id": "reading-text",
      "title": "Time to Read!",
      "paragraphs": ["", "", "", ""]
    },
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
  ]
}
```

Rules:

- Generate 4-6 short paragraphs.
- Use target vocabulary naturally in the text.
- Generate 4-6 quiz questions.
- Each quiz question must have exactly 3 options and exactly one answer.

### 5. Grammar

Use `grammarRuleCards`, `completeRule`, and `chooseCorrect`.

```json
{
  "id": "grammar",
  "title": "5) Grammar",
  "controls": [
    {
      "type": "grammarRuleCards",
      "id": "grammar-rule",
      "cards": [
        { "title": "", "body": "", "examples": [""] }
      ]
    },
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
    },
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
  ]
}
```

Rules:

- Explain the target grammar in simple English.
- Include positive, negative, and question examples if relevant.
- Use dropdown-friendly options.
- Keep wrong options plausible but not confusing.

### 6. Grammar Practice

Use two controls: one controlled transformation/fill task and one dropdown/choice task.

```json
{
  "id": "grammar-practice",
  "title": "6) Grammar Practice",
  "controls": [
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
          "baseVerb": "",
          "answer": "",
          "after": ""
        }
      ]
    },
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
  ]
}
```

Rules:

- Generate 6-8 items per practice exercise.
- Include 1-3 examples for the controlled task when useful.
- For `controlledInputPractice`, every item must include `baseVerb`: the verb in its first/base form. The UI must show this value as the default/placeholder text in the input cell.
- The answer should match the exact expected user input.
- If spelling variations are likely, add `acceptedAnswers`.
- For `controlledInputPractice`, check input live as the learner types. If the current value is correct, show a green check mark immediately.
- For `controlledInputPractice`, when the learner presses Enter with an incorrect value, show a red cross mark.

### 7. Speaking

Default: `speakingQuestions`. Alternative: `translationSelfCheck`.

```json
{
  "id": "speaking",
  "title": "7) Speaking",
  "controls": [
    {
      "type": "speakingQuestions",
      "id": "speaking-questions",
      "instruction": "Answer the questions. Give reasons and examples.",
      "items": ["", "", ""]
    }
  ],
  "alternativeControls": [
    {
      "type": "translationSelfCheck",
      "id": "translation-time",
      "instruction": "Translate the sentences. Then open self-check.",
      "items": [
        { "id": "translation-1", "sourceRu": "", "answerEn": "" }
      ]
    }
  ]
}
```

Rules:

- Generate 4-6 speaking questions.
- Questions should recycle target vocabulary and grammar.
- For Translation Time, generate 6-8 Russian sentences and English answers.
- Translation answers should be hidden behind a self-check card in the UI.

### 8. Resources

Use `resourceNotes`.

```json
{
  "id": "resources",
  "title": "8) Resources",
  "controls": [
    {
      "type": "resourceNotes",
      "id": "lesson-resources",
      "instruction": "Add useful links or materials here.",
      "placeholder": "Write links or notes here...",
      "initialValue": ""
    }
  ]
}
```

Rules:

- Usually leave `initialValue` empty.
- If the user provides source links, include them as plain text.

## Ready Prompt

Copy this prompt and replace the variables.

```text
You are generating content for an interactive English lesson page.

Topic: {{topic}}
CEFR level: {{level | default: A2}}
Learner profile: {{learnerProfile | default: one-to-one adult or teen English learner}}
Target grammar: {{targetGrammar | optional}}
Support language: Russian only for Translation Time or teacher notes.

Return only valid JSON. Do not return HTML, Markdown, comments, or explanatory text.

Use schemaVersion "lesson-spec-v1".

Generate an 8-section lesson in this exact order:
1. warmup
2. lead-in
3. target-vocabulary
4. reading
5. grammar
6. grammar-practice
7. speaking
8. resources

Follow these control requirements:
- Warm Up: wordAssociationStrikeList with exactly 9 short topic words or short phrases.
- Lead-In: opinionSort with 6-8 short opinion/ethical statements and columns "Agree", "Not sure / It depends", "Disagree". If opinion sorting does not fit the topic, use discussionQuestions with 3-4 questions.
- Target Vocabulary: definitionMatch with about 10 terms and simple definitions; gapFillBank with 8-10 sentences; phrasalVerbPractice with 4-5 phrasal verbs and 6-8 gap sentences if phrasal verbs naturally fit the topic.
- Reading: readingText with 4-6 short paragraphs using target vocabulary; readingQuizRadio with 4-6 questions, exactly 3 options each, one correct answer each.
- Grammar: grammarRuleCards, completeRule, and chooseCorrect. Explain grammar simply and include examples.
- Grammar Practice: controlledInputPractice and dropdownChoicePractice, 6-8 items each.
- Speaking: speakingQuestions with 4-6 questions. Also include alternativeControls.translationSelfCheck with 6-8 Russian sentences and English self-check answers if the topic and level allow it.
- Resources: resourceNotes with an empty initialValue unless source links are provided.

Quality rules:
- Keep language appropriate for {{level | default: A2}}.
- Use short, clear student instructions in English.
- Make all content specific to the topic.
- Include answer keys for every checked activity.
- Keep option strings and answer strings exactly reusable by the UI.
- Use stable lowercase kebab-case ids.
- Avoid rare idioms, culturally sensitive stereotypes, unsafe advice, and unsupported control types.
```

## Minimal Validation Checklist

- JSON parses with no trailing comments or Markdown wrapper.
- All 8 section ids are present and in order.
- Every control has `type`, `id`, and `instruction` where applicable.
- Checked controls include exact `answer` values.
- Warm-up has 9 items.
- Lead-in has 6-8 statements or 3-4 fallback questions.
- Reading has 4-6 paragraphs and 4-6 quiz questions.
- Quiz questions have exactly 3 options.
- Grammar has rule cards plus complete-the-rule.
- Grammar practice has two exercise controls.
- Grammar practice controlled input items include `baseVerb` for the input placeholder/default text.
- Grammar practice typed answers show a green check while typing when correct and a red cross on Enter when incorrect.
- Speaking has questions and optional self-check translations.
