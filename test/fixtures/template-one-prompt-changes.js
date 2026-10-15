'use strict';

// Every line of the Template 1 prompts that the move to lib/templates/template-1.json
// changed: technical counts became control rules, methodology stayed in the block
// instructions, and Target Vocabulary, Grammar Presentation and the question tasks speak
// about their new fields. Lines not listed here are word for word the same.
// Removed together with the old Template 1 prompt builders in step 0c.
module.exports = Object.freeze({
  "lead-in": {
    "removed": [
      "Create exactly three student-facing questions in natural English at the target CEFR level.",
      "Create exactly three suggestedAnswers in the same order. Answers 1 and 2 must answer from the message; answer 3 must be a plausible example personal answer, not “Personal answer”."
    ],
    "added": [
      "Create exactly three questions.",
      "questions are student-facing, in natural English at the target CEFR level.",
      "suggestedAnswers: exactly three items.",
      "suggestedAnswers answer the questions in the same order. Answers 1 and 2 must answer from the message; answer 3 must be a plausible example personal answer, not “Personal answer”."
    ]
  },
  "target-vocabulary": {
    "removed": [
      "Create exactly 10 distinct, useful target words or short phrases. Prefer lexical chunks that a learner at the target CEFR level can use when speaking about the topic.",
      "Give every term a short, simple English definition and an English imagePrompt.",
      "Select exactly 5 of those terms that genuinely need extra explanation and explain each briefly for the teacher in simple English.",
      "Create exactly 8 connected context items that form one coherent topic-related paragraph when joined in order.",
      "Each context item must have text before and/or after the gap, use one exact vocabulary term as the answer, and provide exactly 3 distinct options from the 10 exact vocabulary terms including the answer.",
      "Vary the answer position across context-item option lists; do not consistently put the correct answer first.",
      "Use 8 different correct vocabulary terms across the context items.",
      "Create exactly 6 Fill in the Blanks sentences. Each targetTerm must exactly match a vocabulary term; answer may be its grammatically correct inflected form. Use 6 different target terms.",
      "Create exactly 4 personalized question and follow-up pairs using 4 different vocabulary terms.",
      "In every personalized question, include the exact targetTerm and wrap only that occurrence in **bold** Markdown.",
      "Create short, topic-relevant sentence starters as plain text without Markdown. Each starter must include a targetTerm from the personalized questions, copied exactly, so the learner can reuse those words when answering.",
      "Select exactly 6 distinct exact vocabulary terms for Describe and Guess."
    ],
    "added": [
      "vocabularyItems: exactly ten items. term is the dictionary form shown in the vocabulary list. definition is a short, simple English definition. imagePrompt is an English prompt for a picture that shows the term.",
      "vocabularyItems: distinct, useful target words or short phrases. Prefer lexical chunks that a learner at the target CEFR level can use when speaking about the topic.",
      "extraExplanations: select exactly five vocabulary items that genuinely need extra explanation and explain each briefly for the teacher in simple English.",
      "contextText: one coherent paragraph (70–110 words) with eight gaps written [[1]] to [[8]] in order.",
      "contextChoices: one choice per gap, in the same order. options are three different vocabulary items in the form that fits the gap; answer is one of them, copied exactly. Use eight different answers and vary the position of the answer.",
      "contextText is a topic-related story.",
      "Create exactly six fillInBlanks sentences. Each targetTerm must exactly match a vocabulary item; answer may be its grammatically correct inflected form. Use six different target terms.",
      "personalizedQuestions: exactly four questions. followUp is a short extra question.",
      "Each question contains at least one vocabulary item in **bold**.",
      "personalizedQuestions are about the student’s own life and experience. Use a different vocabulary item in each question.",
      "sentenceStarters: exactly three items.",
      "Use plain text only in sentenceStarters: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML.",
      "sentenceStarters: short, topic-relevant sentence starters. Each starter must include a vocabulary item from the personalizedQuestions, copied exactly, so the learner can reuse those words when answering.",
      "Select exactly six distinct vocabulary items for describeAndGuessTerms."
    ]
  },
  "reading": {
    "removed": [
      "Create one gistQuestion about the main idea and exactly five detailQuestions whose answers are stated or clearly supported by the text.",
      "Every question must have exactly three distinct plain-text options, one answer copied exactly from its options, and a short useful explanation."
    ],
    "added": [
      "gistQuestions: exactly one question.",
      "Every question in gistQuestions must have exactly three distinct plain-text options, one answer copied exactly from its options, and a short useful explanation.",
      "gistQuestions ask about the main idea of the text.",
      "detailQuestions: exactly five questions.",
      "Every question in detailQuestions must have exactly three distinct plain-text options, one answer copied exactly from its options, and a short useful explanation.",
      "The answers to detailQuestions are stated or clearly supported by the text."
    ]
  },
  "listening": {
    "removed": [
      "Create exactly two gistQuestions with exactly three options each.",
      "Create exactly five detailQuestions with exactly three options and one correct answer each.",
      "Every answer must be copied exactly from its question options. Give every question a short useful explanation for the teacher Answer Key."
    ],
    "added": [
      "gistQuestions: exactly two questions.",
      "Every question in gistQuestions must have exactly three distinct plain-text options, one to two answers copied exactly from its options, and a short useful explanation.",
      "detailQuestions: exactly five questions.",
      "Every question in detailQuestions must have exactly three distinct plain-text options, one answer copied exactly from its options, and a short useful explanation."
    ]
  },
  "grammar-presentation": {
    "removed": [
      "Create exactly five short example sentences. In every example, wrap the target grammar form in exactly one pair of **bold** Markdown markers.",
      "Create exactly four concept-checking questions. Keep them concise and guide the learner to discover meaning, use, and form from the examples.",
      "The four ruleItem answers must be distinct. Provide exactly two plausible but incorrect ruleDistractors, distinct from each other and from every answer.",
      "Do not use Markdown, HTML, or [[gap]] markers in ruleItems, ruleDistractors, or checkItems.",
      "Create one to three Quick Rule sections. Use concise Markdown bullet points to cover meaning, affirmative form, and relevant negative/question forms, with an example at the target CEFR level where useful.",
      "Create exactly five checkItems. Each item must form one natural sentence when before + answer + after are joined.",
      "Give every checkItem exactly three distinct options, copy answer exactly from its options, and add one short explanation for the teacher."
    ],
    "added": [
      "Create exactly five examples.",
      "examples: in every item, wrap the target grammar form in exactly one pair of **bold** Markdown markers.",
      "examples: short example sentences.",
      "Create exactly four conceptCheckingQuestions.",
      "conceptCheckingQuestions: keep them concise and guide the learner to discover meaning, use, and form from the examples.",
      "The four answers in ruleItems must be distinct. Provide exactly two plausible but incorrect ruleDistractors, distinct from each other and from every answer.",
      "Do not use Markdown, HTML, or [[gap]] markers in ruleItems or ruleDistractors.",
      "Create one to three quickRuleSections, each with a short title and Markdown text.",
      "Use concise Markdown bullet points to cover meaning, affirmative form, and relevant negative/question forms, with an example at the target CEFR level where useful.",
      "Create exactly five checkItems. Each must form one natural sentence from before + answer + after, have exactly three distinct plain-text options, copy answer exactly from its options, and include a short explanation."
    ]
  },
  "grammar-focus": {
    "removed": [
      "Create one connected dialogue of six to eight turns for Task 2. Put every turn on a separate line in task2Dialogue, so the parsed string contains a newline (\\n) between consecutive turns. Start every line with a speaker label formatted as **Name:** and place exactly nine literal {{gap}} markers in reading order.",
      "Create exactly five short writingSupport sentence starters that help the learner use the target grammar.",
      "Create exactly five concise challengeItems, including a negative, a question, a reason, target vocabulary, and linked ideas when compatible with the grammar."
    ],
    "added": [
      "Create one connected dialogue of six to eight turns. Put every turn on a separate line in task2Dialogue, so the parsed string contains a newline (\\n) between consecutive turns. Start every line with a speaker label formatted as **Name:** and place exactly nine literal {{gap}} markers in reading order.",
      "writingSupport: exactly five items.",
      "writingSupport: short sentence starters that help the learner use the target grammar.",
      "challengeItems: exactly five items.",
      "challengeItems: concise conditions, including a negative, a question, a reason, target vocabulary, and linked ideas when compatible with the grammar."
    ]
  },
  "guided-speaking": {
    "removed": [
      "For every Speaking Support category create exactly three short phrases suitable for the generated situation. Keep clarification phrases generally reusable and make other examples topic-relevant where natural.",
      "Create a coherent Example Dialogue of 6 to 10 alternating Teacher and Student turns. It must reflect the role-card information without exposing private facts unnaturally, demonstrate useful support phrases and selected vocabulary, and finish with the shared decision."
    ],
    "added": [
      "Write every part of teacherNotes in English, including instructions and direct address to the teacher. Do not use Russian or any other language in teacherNotes.",
      "dialogue: an Example Dialogue of 6 to 10 alternating Teacher and Student turns.",
      "The Example Dialogue must be coherent, reflect the role-card information without exposing private facts unnaturally, demonstrate useful support phrases and selected vocabulary, and finish with the shared decision.",
      "For every category in speakingSupport create exactly three short phrases.",
      "Make the phrases suitable for the generated situation. Keep clarification phrases generally reusable and make other examples topic-relevant where natural."
    ]
  },
  "wrap-up": {
    "removed": [
      "Create exactly two concrete twoCues. Each cue must give a different topic-related idea for one sentence and make the intended grammar use clear without supplying the complete answer.",
      "Create exactly three short Possible language supports. Make them useful for answering the two and one steps, and naturally include the target grammar and relevant supplied vocabulary where possible."
    ],
    "added": [
      "Create exactly two twoCues.",
      "Each of the twoCues must be concrete, give a different topic-related idea for one sentence and make the intended grammar use clear without supplying the complete answer.",
      "possibleLanguage: exactly three items.",
      "possibleLanguage: short Possible language supports. Make them useful for answering the two and one steps, and naturally include the target grammar and relevant supplied vocabulary where possible."
    ]
  }
});
