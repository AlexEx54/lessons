'use strict';

// Every line of the Template 2 prompts that the move to lib/templates/template-2.json
// changed: technical counts became control rules, methodology stayed in the block
// instructions. Lines not listed here are word for word the same.
// Removed together with the old Template 2 prompt builders in step 0c.
module.exports = Object.freeze({
  'warm-up': {
    removed: [
      "Use plain text only: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML in any field.",
    ],
    added: [
      "Use plain text only in rows: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML.",
    ],
  },
  'lead-in': {
    removed: [
      "checkStatements: exactly three statements about the lesson topic in general that the student can judge from everyday knowledge and explain. Include at least one fact and at least one myth. Use only common, uncontroversial knowledge: no exact dates, numbers, records, and nothing that is true only in some places or is a matter of opinion. Present Simple is fine here.",
      "guessStatements: exactly two statements about one concrete detail of the people in the stories. Start each with \"Somebody in our stories\". Use the target grammar. Choose details that are easy to show in a short story: appearance, things they have, actions, places, or feelings. The student cannot know the answer and must guess.",
      "speakingSupport: exactly two unfinished sentence starters, ending with \"…\", that help the student justify an answer about this topic.",
      "Use plain text only: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML in any field.",
    ],
    added: [
      "Create exactly three checkStatements and exactly two guessStatements.",
      "Use plain text only in checkStatements and guessStatements: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML.",
      "checkStatements: statements about the lesson topic in general that the student can judge from everyday knowledge and explain. Include at least one fact and at least one myth. Use only common, uncontroversial knowledge: no exact dates, numbers, records, and nothing that is true only in some places or is a matter of opinion. Present Simple is fine here.",
      "guessStatements: statements about one concrete detail of the people in the stories. Start each with \"Somebody in our stories\". Use the target grammar. Choose details that are easy to show in a short story: appearance, things they have, actions, places, or feelings. The student cannot know the answer and must guess.",
      "speakingSupport: exactly two items.",
      "Use plain text only in speakingSupport: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML.",
      "speakingSupport: unfinished sentence starters, ending with \"…\", that help the student justify an answer about this topic.",
    ],
  },
  'target-vocabulary': {
    removed: [
      "stories: exactly four short first-person stories (40–60 words each). Four different people talk about the lesson topic. Choose people who fit the topic naturally. name is the person’s name used as the story title; emoji is one emoji that fits the person.",
      "The student has already made guesses about the stories in the Lead-In; the guess statements are listed below. Each guess statement must be clearly confirmed or clearly contradicted by exactly one story; the other stories must not mention that detail.",
      "vocabularyItems: exactly 10 useful words or short phrases for the topic. term is the dictionary form shown in the vocabulary list. definition is a short, simple English definition. distractor is a plausible but wrong definition of similar length.",
      "contextText: one coherent paragraph (70–110 words) about a new person connected to the topic, with eight gaps written [[1]] to [[8]] in order.",
      "personalizedQuestions: exactly four questions about the student’s own life and experience. Each question contains at least one vocabulary item in **bold**. followUp is a short extra question.",
      "sentenceStarters: exactly three short starters that help answer the personalized questions, ending with \"...\".",
      "Style examples from another lesson (Superheroes, have got). Never copy them; adapt the idea to the given topic and grammar:",
      "- story: \"Hi! I'm Forest Elf. I've got **green hair** and two **pointed ears**. I can talk to animals.\"",
      "- dragSentences: \"Night Fox has got a black [[mask]] over his eyes.\"",
      "- translationSentences: before \"Shadow Girl has got a black\", hint \"маска\", answer \"mask\"",
      "Apart from the ** and [[...]] markers described above, use plain text only: no other Markdown, HTML, or brackets.",
    ],
    added: [
      "Style examples below come from another lesson (Superheroes, have got). Never copy them; adapt the idea to the given topic and grammar.",
      "Apart from the ** and [[...]] markers described below, use plain text only: no other Markdown, HTML, or brackets.",
      "vocabularyItems: exactly ten items. term is the dictionary form shown in the vocabulary list. definition is a short, simple English definition. distractor is a plausible but wrong definition of similar length.",
      "vocabularyItems: useful words or short phrases for the topic.",
      "stories: exactly four short first-person stories (40–60 words each). name is the person’s name used as the story title; emoji is one emoji that fits the person.",
      "The student has already made guesses about the stories earlier in the lesson; the guess statements are listed below. Each guess statement must be clearly confirmed or clearly contradicted by exactly one story; the other stories must not mention that detail.",
      "Four different people talk about the lesson topic. Choose people who fit the topic naturally.",
      "Style example for a story: \"Hi! I'm Forest Elf. I've got **green hair** and two **pointed ears**. I can talk to animals.\"",
      "contextText: one coherent paragraph (70–110 words) with eight gaps written [[1]] to [[8]] in order.",
      "contextText is about a new person connected to the topic.",
      "Style example for dragSentences: \"Night Fox has got a black [[mask]] over his eyes.\"",
      "Style example for translationSentences: before \"Shadow Girl has got a black\", hint \"маска\", answer \"mask\"",
      "personalizedQuestions: exactly four questions. followUp is a short extra question.",
      "Each question contains at least one vocabulary item in **bold**.",
      "personalizedQuestions are about the student’s own life and experience.",
      "sentenceStarters: exactly three items.",
      "Use plain text only in sentenceStarters: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML.",
      "sentenceStarters: short starters that help answer the personalized questions, ending with \"...\".",
    ],
  },
  'grammar-presentation': {
    removed: [
      "Create exactly five short example sentences. In every example, wrap the target grammar form in exactly one pair of **bold** Markdown markers.",
      "Create exactly four concept-checking questions. Keep them concise and guide the learner to discover meaning, use, and form from the examples.",
      "The four ruleItem answers must be distinct. Provide exactly two plausible but incorrect ruleDistractors, distinct from each other and from every answer.",
      "Do not use Markdown, HTML, or [[gap]] markers in ruleItems, ruleDistractors, or checkItems.",
      "Create one to three Quick Rule sections. Use concise Markdown bullet points to cover meaning, affirmative form, and relevant negative/question forms, with an example at the target CEFR level where useful.",
    ],
    added: [
      "Create exactly five examples.",
      "examples: in every item, wrap the target grammar form in exactly one pair of **bold** Markdown markers.",
      "examples: short example sentences.",
      "Create exactly four conceptCheckingQuestions.",
      "conceptCheckingQuestions: keep them concise and guide the learner to discover meaning, use, and form from the examples.",
      "The four answers in ruleItems must be distinct. Provide exactly two plausible but incorrect ruleDistractors, distinct from each other and from every answer.",
      "Do not use Markdown, HTML, or [[gap]] markers in ruleItems or ruleDistractors.",
      "Create one to three quickRuleSections, each with a short title and Markdown text.",
      "Use concise Markdown bullet points to cover meaning, affirmative form, and relevant negative/question forms, with an example at the target CEFR level where useful.",
      "Do not use Markdown, HTML, or [[gap]] markers in checkItems.",
    ],
  },
  'grammar-focus': {
    removed: [
      "Create exactly eight task2Items as separate sentences, not a dialogue. before + answer + after must form one natural sentence. Set cue to the base form the learner must change (for example a base verb) and answer to the correct form.",
      "Create exactly ten translations. ru is a short Russian sentence; en is its natural English translation using the target grammar. Choose sentences that have one clear, unambiguous English translation.",
      "Create exactly five short writingSupport sentence starters that help the learner use the target grammar.",
      "Create exactly five concise challengeItems, including a negative, a question, a reason, target vocabulary, and linked ideas when compatible with the grammar.",
    ],
    added: [
      "Create exactly eight task2Items. before + answer + after must form one natural sentence. Set cue to the base form the learner must change (for example a base verb) and answer to the correct form.",
      "task2Items are separate sentences, not a dialogue.",
      "Create exactly ten translations. ru is a short Russian sentence; en is its natural English translation using the target grammar.",
      "Choose sentences that have one clear, unambiguous English translation.",
      "writingSupport: exactly five items.",
      "writingSupport: short sentence starters that help the learner use the target grammar.",
      "challengeItems: exactly five items.",
      "challengeItems: concise conditions, including a negative, a question, a reason, target vocabulary, and linked ideas when compatible with the grammar.",
    ],
  },
  'guided-speaking': {
    removed: [
      "Each card needs a short title of two to four words, exactly four open questions, one short miniTask, 6–10 distinct entries copied exactly from Target Vocabulary, exactly five useful phrases and exactly five sentence starters ending with \"...\".",
    ],
    added: [
      "Create exactly three cards. Each card needs a short title of two to four words, exactly four open questions, one short miniTask, 6–10 distinct entries copied exactly from Target Vocabulary, exactly five useful phrases and exactly five sentence starters ending with \"...\".",
    ],
  },
  'wrap-up': {
    removed: [
      "Create exactly two concrete twoCues. Each cue must give a different topic-related idea for one sentence and make the intended grammar use clear without supplying the complete answer.",
      "Create exactly three short Possible language supports. Make them useful for answering the two and one steps, and naturally include the target grammar and relevant supplied vocabulary where possible.",
    ],
    added: [
      "Create exactly two twoCues.",
      "Each of the twoCues must be concrete, give a different topic-related idea for one sentence and make the intended grammar use clear without supplying the complete answer.",
      "possibleLanguage: exactly three items.",
      "possibleLanguage: short Possible language supports. Make them useful for answering the two and one steps, and naturally include the target grammar and relevant supplied vocabulary where possible.",
    ],
  },
});
