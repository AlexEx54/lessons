'use strict';
const { normalizeOddOneOut, createOddOneOutAnswerKey } = require('../assets/components/odd-one-out.js');

const { normalizeFactOrMyth, createFactOrMythAnswerKey } = require('../assets/components/fact-or-myth.js');

const { normalizeMultipleChoice } = require('../assets/components/multiple-choice.js');
const { normalizeDropdownChoice } = require('../assets/components/dropdown-choice.js');
const { normalizeDragWordsInText } = require('../assets/components/drag-words-in-text.js');
const { normalizeSentenceCorrection, createSentenceCorrectionAnswerKey } = require('../assets/components/sentence-correction.js');
const { normalizeGapFill } = require('../assets/components/gap-fill.js');
const { normalizePersonalizedQuestions } = require('../assets/components/personalized-questions.js');
const { normalizeGuidedCommunicationCards } = require('../assets/components/guided-communication-cards.js');
const { normalizeStoryCards } = require('../assets/components/story-cards.js');
const { createTargetVocabularyTeacherNote } = require('./target-vocabulary-static.js');

const { normalizeCheckboxChoice } = require('../assets/components/checkbox-choice.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { normalizeTeacherNote } = require('../assets/components/teacher-note.js');
const { normalizeSentenceMatching } = require('../assets/components/sentence-matching.js');
const { normalizeCardRow } = require('../assets/components/card-row.js');

// Template 2 owns its stage list independently of Template 1.
const TEMPLATE_2_STAGES = Object.freeze([
  { id: 'warm-up', title: 'Warm Up', subtitle: 'Find the Odd One Out!', durationMinutes: 5, icon: 'sparkles' },
  { id: 'lead-in', title: 'Lead In', subtitle: 'Fact or Myth?', durationMinutes: 5, icon: 'compass' },
  { id: 'target-vocabulary', title: 'Target Vocabulary', subtitle: 'Explore & Practise New Words', durationMinutes: 8, icon: 'cards' },
  { id: 'watch-and-interact', title: 'Watch & interact', subtitle: 'Predict, Watch & Discuss', durationMinutes: 10, icon: 'video' },
  { id: 'grammar-presentation', title: 'Grammar Presentation', subtitle: 'Complete the Rule', durationMinutes: 5, icon: 'cap' },
  { id: 'grammar-focus', title: 'Grammar Focus', subtitle: 'Practice the Rule', durationMinutes: 8, icon: 'cap' },
  { id: 'guided-speaking', title: 'Guided Communication', subtitle: 'Choose a Card', durationMinutes: 8, icon: 'chat' },
  { id: 'wrap-up', title: 'Wrap-Up', subtitle: '3–2–1', durationMinutes: 3, icon: 'check' },
].map(stage => Object.freeze(stage)));

function validateTemplateTwoGrammarTask(component) {
  if (component.items.length !== 1 || component.items[0].options.length !== 8 || component.items[0].answers.length !== 4) {
    const error = new Error('Task 2 должен содержать 8 предложений и 4 правильных ответа.');
    error.statusCode = 400;
    throw error;
  }
}

// The only key section tied to sentence order: short explanations quote their sentences and survive task edits.
function templateTwoGrammarAnswersSection(component) {
  const item = component.items[0];
  return {
    id: 'task-two-answers', title: 'Task 2',
    text: 'Correct sentences: ' + item.options.flatMap((text, index) => item.answers.includes(text) ? [index + 1] : []).join(', ') + '.',
  };
}

const TEMPLATE_TWO_GRAMMAR_TEACHER_NOTE_TEXT = [
  '**Guided discovery**',
  'Let the student discover the rule before explaining it. Use the examples in this section as the starting point.',
  '**Notice and discuss**',
  'Say: “Read the examples. What do you notice about the highlighted words?” Work through the concept-checking questions. Ask the student to point to an example that supports each answer.',
  '**Build the rule**',
  'Say: “Use the examples to choose the missing words.” If the student gets stuck, focus on one example and offer a choice between two words. Then use Quick Rule to confirm meaning and form.',
  '**Check understanding**',
  'Say: “Read and tick the four grammatically correct sentences. Explain your choices.” Ask the student to correct the remaining sentences. Use the Answer Key explanations when needed.',
  '**Support and challenge**',
  'Give thinking time and let the student reread the examples. For an extra challenge, ask for one personal example using the target grammar.',
  '**Before moving on**',
  'Check that the student can explain the main rule in simple words and produce one accurate example. If needed, revisit one example and try again.',
].join('\n\n');

// Shared by the synthetic lesson and the AI generator: discovery components and check items vary, the rest is fixed.
// checkItems are { sentence, isCorrect, explanation }; only incorrect sentences need an explanation.
function createTemplateTwoGrammarPresentation({ discovery, ruleAnswers, checkItems }) {
  const task = normalizeCheckboxChoice({
    type: 'checkboxChoice', id: 'grammar-presentation-check-the-rule',
    title: 'Task 2. Tick the sentences that are correct.',
    instruction: 'Read the sentences and tick the grammatically correct ones.',
    items: [{ id: 'correct-sentences', question: 'Which four sentences are grammatically correct?',
      options: checkItems.map(item => item.sentence),
      answers: checkItems.filter(item => item.isCorrect).map(item => item.sentence) }],
  });
  validateTemplateTwoGrammarTask(task);
  return [
    { type: 'teacherNote', id: 'grammar-presentation-teacher-note', text: TEMPLATE_TWO_GRAMMAR_TEACHER_NOTE_TEXT },
    ...discovery,
    task,
    normalizeMarkdownCard({
      type: 'markdownCard', id: 'grammar-presentation-answer-key', title: 'Answer key',
      layout: 'columns', icon: 'check', headingSize: 'large', accentColor: '#20A85B',
      studentVisibility: 'teacherOnly',
      sections: [{ id: 'task-one-answers', title: 'Task 1 Rule',
        text: ruleAnswers.map((answer, index) => `${index + 1} ${answer}`).join(', ') + '.' },
      templateTwoGrammarAnswersSection(task), {
        id: 'short-explanations', title: 'Short explanations:',
        text: checkItems.filter(item => !item.isCorrect).map(item => `- *${item.sentence}* — ${item.explanation}`).join('\n'),
      }],
    }),
  ];
}

function createSyntheticTemplateTwoGrammarPresentation() {
  // Intentional copy: the two templates can evolve independently.
  return createTemplateTwoGrammarPresentation({
    discovery: [
      {
        type: "textPanel",
        id: "grammar-presentation-notice-rule",
        text: "{l}**Notice the Rule**{/l}\n\n{muted}{s}Look at the examples. What grammar structure is used here?{/s}{/muted}\n\n1. I **used to** think an exchange year would feel like one long adventure.\n2. I **used to** finish school at 2:30.\n3. I couldn’t **get used to** eating lunch at 11:15.\n4. I **got used to** the workload after a few weeks.\n5. I’m finally **getting used to** asking teachers for help.",
        backgroundColor: "#FFFFFF",
        accentColor: "#6545F5",
        showBorder: false
      },
      {
        type: "textPanel",
        id: "grammar-presentation-concept-checking",
        text: "{l}**Concept-checking questions:**{/l}\n\n1. In sentence 2, was that routine true in the past or is it true now?\n2. In sentence 3, was eating lunch at 11:15 easy at first?\n3. In sentences 4–5, are we talking about a habit or a change over time?\n4. After “get used to”, do we use a noun / -ing form or a base verb?",
        backgroundColor: "#FFFFFF",
        accentColor: "#20A85B",
        showBorder: true
      },
      {
        type: "dragWordsInText",
        id: "grammar-presentation-complete-the-rule",
        title: "Complete the Rule",
        instruction: "Drag the correct words into the gaps.",
        words: [
          "past",
          "base verb",
          "comfortable",
          "-ing",
          "future",
          "infinitive with to"
        ],
        text: "used to + [[base verb]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation."
      },
      {
        type: "markdownCard",
        id: "grammar-presentation-quick-rule",
        title: "Quick Rule",
        layout: "columns",
        sections: [
          {
            id: "used-to",
            title: "USED TO",
            text: "- **past habit** / state that is different now\n- **form:** subject + used to + base verb\n- **negative:** didn’t use to + base verb\n- **question:** Did you use to ...?\n- **example:** “I used to finish school at 2:30.”"
          },
          {
            id: "get-used-to",
            title: "GET USED TO",
            text: "- become comfortable with something new\n- **form:** get / got / am getting used to + noun / verb-ing\n- **after “to”:** use a noun or -ing, not a base verb\n- **example:** “I got used to the workload after a few weeks.”"
          }
        ],
        icon: "bulb",
        accentColor: "#6545F5",
        studentVisibility: "always"
      }
    ],
    ruleAnswers: ['base verb', 'past', '-ing', 'comfortable'],
    checkItems: [
      { sentence: 'I used to finish school at 2:30.', isCorrect: true },
      { sentence: 'She use to play basketball after school.', isCorrect: false,
        explanation: 'Use “used to” for a past habit: She used to play basketball after school.' },
      { sentence: 'I am getting used to eating lunch early.', isCorrect: true },
      { sentence: 'He got used to the new timetable.', isCorrect: true },
      { sentence: 'We are getting used to speak English every day.', isCorrect: false,
        explanation: 'After “get used to”, use -ing: We are getting used to speaking English every day.' },
      { sentence: 'Did you use to walk to school?', isCorrect: true },
      { sentence: 'She didn’t used to like maths.', isCorrect: false,
        explanation: 'After “didn’t”, use “use to”: She didn’t use to like maths.' },
      { sentence: 'They got used to wake up early.', isCorrect: false,
        explanation: 'After “got used to”, use -ing: They got used to waking up early.' },
    ],
  });
}

const answerKeyCard = (id, items) => ({
  type: 'markdownCard', id, title: 'Answer key', layout: 'columns',
  sections: [
    { id: 'answers-left', title: '', text: items.slice(0, Math.ceil(items.length / 2)).join('\n\n') },
    { id: 'answers-right', title: '', text: items.slice(Math.ceil(items.length / 2)).join('\n\n') },
  ],
  icon: 'check', headingSize: 'large', accentColor: '#20A85B', studentVisibility: 'teacherOnly',
});

// Shared by the synthetic lesson and the AI generator: tasks and notes vary, the component chrome is fixed.
function createTemplateTwoGrammarFocus({ teacherNotes, choices, gaps, corrections, halves, translations, support }) {
  const teacherNote = {
    type: 'teacherNote', id: 'grammar-focus-teacher-note',
    blocks: [{
      type: 'teacherNoteBlock', id: 'grammar-focus-transition-phrases', title: 'Transition phrases',
      titleColor: '#6545F5', icon: 'chatDots', text: teacherNotes.transitionPhrases,
    }, {
      type: 'teacherNoteBlock', id: 'grammar-focus-struggle-tips', title: 'Tips if the student struggles',
      titleColor: '#2F80ED', icon: 'chat', text: teacherNotes.struggleTips,
    }, {
      type: 'teacherNoteBlock', id: 'grammar-focus-correction-timing', title: 'Correct now / later',
      titleColor: '#E0812D', icon: 'chat', text: teacherNotes.correctionTiming,
    }, {
      type: 'teacherNoteBlock', id: 'grammar-focus-free-practice-success', title: 'Success criteria',
      titleColor: '#20A85B', icon: 'chatDots', text: teacherNotes.successCriteria,
    }],
  };
  const choiceTask = {
    type: 'dropdownChoice', id: 'grammar-focus-choose-the-correct-options',
    title: '**Task 1. Choose the correct options.**',
    instruction: 'Read each sentence and choose the correct grammar option.',
    text: choices.map((item, index) => `**${index + 1}.** ${item.before}[[grammar-focus-choice-${index + 1}]]${item.after}`).join('\n'),
    accentColor: '#6545F5',
    choices: choices.map((item, index) => ({ id: `grammar-focus-choice-${index + 1}`, options: item.options, answer: item.answer })),
  };
  const choiceKey = {
    type: 'markdownCard', id: 'grammar-focus-answer-key', title: 'Answer Key & Explanations', layout: 'columns',
    sections: [{
      id: 'answers', title: 'Answers',
      text: choices.map((item, index) => `**${index + 1}.** ${item.answer}`).join('\n\n'),
    }, {
      id: 'short-explanations', title: 'Short explanations',
      text: choices.map((item, index) => `${index + 1}. ${item.explanation}`).join('\n'),
    }],
    icon: 'check', headingSize: 'large', accentColor: '#20A85B', studentVisibility: 'teacherOnly',
  };
  const gapTask = normalizeGapFill({
    type: 'gapFill', id: 'grammar-focus-complete-the-gaps',
    title: 'Task 2. Complete the gaps with the correct form of the verbs.',
    instruction: 'Read each sentence and type the correct form of the verb.',
    accentColor: '#2F80ED',
    text: gaps.map((item, index) => `**${index + 1}.** ${item.before}[[grammar-focus-gap-${index + 1}]]${item.after}`).join('\n\n'),
    gaps: gaps.map((item, index) => ({ id: `grammar-focus-gap-${index + 1}`, example: item.cue, answer: item.answer })),
  });
  const correction = normalizeSentenceCorrection({
    type: 'sentenceCorrection', id: 'grammar-focus-correct-the-mistakes',
    title: 'Task 3. Correct the mistakes.',
    instruction: 'There is one mistake in each sentence. Rewrite it correctly.',
    accentColor: '#6545F5',
    items: corrections.map((item, index) => ({ id: `grammar-focus-correction-${index + 1}`, ...item })),
  });
  const matching = normalizeSentenceMatching({
    type: 'sentenceMatching', id: 'grammar-focus-match-sentence-halves',
    title: 'Task 4. Match the sentence halves.', instruction: `Match 1–${halves.length} with A–${String.fromCharCode(64 + halves.length)}.`,
    items: halves.map((item, index) => ({ id: `grammar-focus-pair-${index + 1}`, ...item })),
  });
  const translationTask = normalizeGapFill({
    type: 'gapFill', id: 'grammar-focus-translate-sentences',
    title: '**Extra Task. Translate the sentences.**',
    instruction: 'Translate the sentences from Russian to English.',
    accentColor: '#6545F5', studentVisibility: 'controlled', fieldSize: 'wide',
    text: translations.map((item, index) => `**${index + 1}.** ${item.ru} [[grammar-focus-translation-${index + 1}]]`).join('\n'),
    gaps: translations.map((item, index) => ({ id: `grammar-focus-translation-${index + 1}`, answer: item.en })),
  });
  const supportRow = {
    type: 'cardRow', id: 'grammar-focus-practice-support-row',
    items: [{
      type: 'markdownCard', id: 'grammar-focus-writing-support', title: 'Writing Support',
      icon: 'pencil', accentColor: '#20A85B', studentVisibility: 'always',
      text: support.writingSupport.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    }, {
      type: 'markdownCard', id: 'grammar-focus-support', title: 'Support',
      icon: 'lifeRing', accentColor: '#20A85B', studentVisibility: 'always',
      text: [
        `- **Word bank:** ${support.wordBank.join(', ')}`,
        `- **Model sentence:** “${support.modelSentence}”`,
        '- **Minimum task:** Write 3 sentences if you need extra support.',
      ].join('\n'),
    }, {
      type: 'markdownCard', id: 'grammar-focus-challenge', title: 'Challenge',
      icon: 'trophy', accentColor: '#6545F5', studentVisibility: 'always',
      text: support.challengeItems.map(item => `- ${item}`).join('\n'),
    }],
  };
  // These normalizers only validate: the stored components keep their authored shape.
  normalizeTeacherNote(teacherNote);
  normalizeDropdownChoice(choiceTask);
  normalizeMarkdownCard(choiceKey);
  normalizeCardRow(supportRow);
  return [
    teacherNote, choiceTask, choiceKey,
    gapTask, answerKeyCard('grammar-focus-complete-the-gaps-answer-key', gaps.map((item, index) => `**${index + 1}.** ${item.answer}`)),
    correction, createSentenceCorrectionAnswerKey(correction),
    matching,
    translationTask, answerKeyCard('grammar-focus-translate-sentences-answer-key', translations.map((item, index) => `**${index + 1}.** ${item.en}`)),
    supportRow,
  ];
}

// Intentional copy: the two templates can evolve independently.
const SYNTHETIC_GRAMMAR_FOCUS = Object.freeze({
  teacherNotes: {
    transitionPhrases: '- “Let’s practise the grammar together.”\n- “Now choose the best option.”\n- “Great — tell me why.”\n- “Ready for free speaking?”',
    struggleTips: '- Look for time clues such as “before”, “at first”, “after a few days” and “now”.\n- Ask: “Past habit or adaptation?”\n- Check the form: **used to + base verb**; **get used to + noun / verb-ing**.',
    correctionTiming: '- **Correct now:** target grammar mistakes, especially “use to” after did / didn’t.\n- **Correct later:** pronunciation slips and minor vocabulary errors.',
    successCriteria: '- The student uses the target forms correctly 4–5 times.\n- Gives full sentences.\n- Can self-correct after a prompt.',
  },
  choices: [
    { before: 'Before AFK Summer, Leo ', after: ' play co-op games every evening.', options: ['used to', 'got used to', 'is getting used to'], answer: 'used to',
      explanation: 'Use “used to” for a past habit that is different now.' },
    { before: 'At first, Mia couldn’t ', after: ' waking up early at camp.', options: ['use to', 'get used to', 'got used to'], answer: 'get used to',
      explanation: 'After “couldn’t”, use the base form “get”.' },
    { before: 'After a few days, the team ', after: ' sleeping in cabins.', options: ['used to', 'got used to', 'get used to'], answer: 'got used to',
      explanation: '“Got used to” shows that the change is complete.' },
    { before: 'This week, I ', after: ' spending less time online.', options: ['used to', 'am getting used to', 'got used to'], answer: 'am getting used to',
      explanation: '“Am getting used to” describes adaptation in progress now.' },
    { before: 'Did you ', after: ' stay up late during the holidays?', options: ['used to', 'use to', 'get used to'], answer: 'use to',
      explanation: 'After “did”, use “use to”.' },
    { before: 'We didn’t ', after: ' go hiking every morning.', options: ['used to', 'use to', 'get used to'], answer: 'use to',
      explanation: 'After “didn’t”, use “use to”.' },
    { before: 'Max is trying to ', after: ' the new camp timetable.', options: ['used to', 'get used to', 'got used to'], answer: 'get used to',
      explanation: 'After “trying to”, use the base form “get”.' },
    { before: 'My sister ', after: ' be shy, but now she speaks to everyone.', options: ['used to', 'got used to', 'is getting used to'], answer: 'used to',
      explanation: 'Use “used to” for a past state that is different now.' },
  ],
  gaps: [
    { before: 'Before camp, Leo ', after: ' co-op games every evening.', cue: 'play', answer: 'used to play' },
    { before: 'At first, Mia couldn’t ', after: ' waking up early at camp.', cue: 'get used to', answer: 'get used to' },
    { before: 'After a few days, the team ', after: ' sleeping in cabins and felt comfortable there.', cue: 'get used to', answer: 'got used to' },
    { before: 'This week, I ', after: ' spending less time online, but it still feels strange.', cue: 'get used to', answer: 'am getting used to' },
    { before: 'Did you ', after: ' up late during the holidays?', cue: 'stay', answer: 'use to stay' },
    { before: 'Before camp, we didn’t ', after: ' hiking every morning.', cue: 'go', answer: 'use to go' },
    { before: 'Max is trying to ', after: ' the new camp timetable.', cue: 'get used to', answer: 'get used to' },
    { before: 'My sister ', after: ' shy, but now she speaks to everyone.', cue: 'be', answer: 'used to be' },
  ],
  corrections: [
    { text: 'Before camp, Leo use to play games every evening.', answers: ['Before camp, Leo used to play games every evening.'] },
    { text: 'Mia is getting used to wake up early.', answers: ['Mia is getting used to waking up early.'] },
    { text: 'The team got use to sleeping in cabins.', answers: ['The team got used to sleeping in cabins.'] },
    { text: 'Did you used to stay up late during the holidays?', answers: ['Did you use to stay up late during the holidays?'] },
    { text: 'We didn’t used to go hiking every morning.', answers: ['We didn’t use to go hiking every morning.', 'We did not use to go hiking every morning.'] },
    { text: 'Max is trying to gets used to the new timetable.', answers: ['Max is trying to get used to the new timetable.'] },
    { text: 'My sister used to being shy.', answers: ['My sister used to be shy.'] },
    { text: 'I am get used to spending less time online.', answers: ['I am getting used to spending less time online.', 'I’m getting used to spending less time online.'] },
  ],
  halves: [
    { left: 'Before camp, Leo used to', right: 'play video games every evening.' },
    { left: 'Mia is getting used to waking', right: 'up early for breakfast.' },
    { left: 'The team is used', right: 'to sleeping in cabins now.' },
    { left: 'Did you use', right: 'to stay up late during the holidays?' },
    { left: 'We didn’t use to go', right: 'hiking before we came to camp.' },
    { left: 'It took Max a week to get', right: 'used to the new camp timetable.' },
  ],
  translations: [
    { ru: 'У моего супергероя есть красный плащ.', en: 'My superhero has got a red cape' },
    { ru: 'У неё большие зелёные глаза.', en: 'She has got big green eyes' },
    { ru: 'У меня красные волосы.', en: 'I have got red hair' },
    { ru: 'У Лесного Эльфа есть маска.', en: 'Forest Elf has got a mask' },
    { ru: 'У них есть супергеройские костюмы.', en: 'They have got superhero suits' },
    { ru: 'У него нет перчаток.', en: 'He hasn’t got gloves' },
    { ru: 'У твоего супергероя есть пояс?', en: 'Has your superhero got a belt' },
    { ru: 'У неё острые уши?', en: 'Has she got pointed ears' },
    { ru: 'У тебя есть супергеройский костюм?', en: 'Have you got a superhero suit' },
    { ru: 'У нас нет сапог.', en: 'We haven’t got boots' },
  ],
  support: {
    writingSupport: ['Right now, ...', 'Usually, ...', 'Today, ... but usually ...', 'We still need ...', '... because ...'],
    wordBank: ['stream', 'camp area', 'map', 'mini-games', 'bridge', 'video', 'supplies', 'lunch'],
    modelSentence: 'Right now, Leo is building a new bridge for the stream.',
    challengeItems: ['Use a negative sentence.', 'Ask one question.', 'Add a reason with *because*.',
      'Use at least 3 target vocabulary items.', 'Link ideas with *because*, *but* or *so*.'],
  },
});

const SYNTHETIC_TARGET_VOCABULARY = Object.freeze({
  stories: [
    { name: 'Flash Kid', emoji: '⚡',
      text: "Hi! I'm Flash Kid. I've got **curly hair** and **big eyes**. My superhero clothes are blue and yellow. I've got a yellow cape, too. I can run very fast!" },
    { name: 'Moon Girl', emoji: '🌙',
      text: "My name is Moon Girl. I've got **long straight hair**. I've got a **silver mask** and a purple **superhero suit**. Nobody knows who I am when I wear my mask!" },
    { name: 'Fire Boy', emoji: '🔥',
      text: "I'm Fire Boy. I've got red **boots** and orange **gloves**. I've also got a black **belt** with my superhero tools. I help people when there is danger." },
    { name: 'Forest Elf', emoji: '🌿',
      text: "Hi! I'm Forest Elf. I've got **green hair** and two **pointed ears**. I've got brown boots, a green cape and a superhero suit. I can talk to animals and climb trees very quickly." },
  ],
  vocabularyItems: [
    { term: 'curly hair', definition: 'hair with curls', distractor: 'hair with no curls' },
    { term: 'big eyes', definition: 'large eyes', distractor: 'very small eyes' },
    { term: 'long straight hair', definition: 'long hair without curls', distractor: 'short hair with lots of curls' },
    { term: 'silver mask', definition: 'a silver cover for your face', distractor: 'silver shoes for your feet' },
    { term: 'superhero suit', definition: 'special clothes a superhero wears', distractor: 'a superhero’s house' },
    { term: 'boots', definition: 'shoes that cover your ankles or legs', distractor: 'clothes you wear on your hands' },
    { term: 'gloves', definition: 'clothes that cover your hands', distractor: 'clothes for your head' },
    { term: 'belt', definition: 'something you wear around your waist', distractor: 'something you wear around your neck' },
    { term: 'green hair', definition: 'hair that is green', distractor: 'hair that is very long' },
    { term: 'pointed ears', definition: 'ears with narrow tips', distractor: 'very round ears' },
  ],
  guessChecks: [
    { story: 'Forest Elf', answer: 'fact', evidence: "I've got green hair and two pointed ears." },
    { story: 'Moon Girl', answer: 'myth', evidence: "I've got a silver mask and a purple superhero suit." },
  ],
  contextText: 'Meet Star Kid, our new superhero! His hair has lots of curls, so he has got [[1]]. His [[2]] are large and bright. He wears a [[3]] over his face to hide who he is. His special superhero clothes are a blue [[4]]. A red [[5]] hangs from his shoulders and flies behind his back when he runs. On his feet, he wears [[6]] that cover his legs below the knees. His [[7]] keep his hands warm. Finally, he puts a [[8]] around his waist to carry his tools. Now he is ready to help his friends!',
  contextChoices: [
    { options: ['straight hair', 'curly hair', 'green hair'], answer: 'curly hair' },
    { options: ['big eyes', 'pointed ears', 'gloves'], answer: 'big eyes' },
    { options: ['belt', 'cape', 'mask'], answer: 'mask' },
    { options: ['superhero suit', 'mask', 'belt'], answer: 'superhero suit' },
    { options: ['mask', 'cape', 'belt'], answer: 'cape' },
    { options: ['gloves', 'pointed ears', 'boots'], answer: 'boots' },
    { options: ['gloves', 'boots', 'big eyes'], answer: 'gloves' },
    { options: ['cape', 'belt', 'mask'], answer: 'belt' },
  ],
  dragSentences: [
    'Night Fox has got a black [[mask]] over his eyes.',
    'Ice Girl has got warm blue [[gloves]] on her hands.',
    'Super Sam has got red [[boots]] on his feet.',
    'Bat Boy has got two funny [[pointed ears]].',
    'Star Girl has got a long purple [[cape]] on her back.',
    'Gadget Boy has got a special [[belt]] around his waist.',
  ],
  translationSentences: [
    { before: 'Shadow Girl has got a black', hint: 'маска', answer: 'mask' },
    { before: 'Her brother has got a long red', hint: 'плащ', answer: 'cape' },
    { before: 'Thunder Boy has got yellow', hint: 'сапоги', answer: 'boots' },
    { before: 'Ice Girl has got blue', hint: 'перчатки', answer: 'gloves' },
    { before: 'Robot Kid has got a silver', hint: 'пояс', answer: 'belt' },
    { before: 'Star Girl has got a purple', hint: 'костюм супергероя', answer: 'superhero suit' },
    { before: 'Luna has got', hint: 'кудрявые волосы', answer: 'curly hair' },
    { before: 'Max has got', hint: 'прямые волосы', answer: 'straight hair' },
    { before: 'Owl Boy has got', hint: 'большие глаза', answer: 'big eyes' },
    { before: 'Forest Girl has got', hint: 'острые уши', answer: 'pointed ears' },
  ],
  personalizedQuestions: [
    { question: 'Would you like to wear a **cape** or a **superhero suit**?', followUp: 'What colour would it be?' },
    { question: 'Would your superhero wear a **mask**?', followUp: 'Why or why not?' },
    { question: 'Would your superhero have **curly hair** or **straight hair**?', followUp: 'What colour would their hair be?' },
    { question: 'What colour **boots** and **gloves** would you like to wear?', followUp: 'What special things could they do?' },
  ],
  sentenceStarters: ['I would like to wear ...', 'My superhero has got ...', 'My ... can ...'],
});

const STORY_COLORS = ['#EAE4FC', '#FCE3F0', '#FFF0E5', '#E2FBFB'];

// Shared by the synthetic lesson and the AI generator: stories and tasks come from the model, the rest is fixed.
// guessStatements are the Lead-In guesses that the stories confirm or disprove.
function createTemplateTwoTargetVocabulary({
  stories, vocabularyItems, guessChecks, contextText, contextChoices,
  dragSentences, translationSentences, personalizedQuestions, sentenceStarters,
}, guessStatements) {
  const teacherNote = createTargetVocabularyTeacherNote();
  teacherNote.blocks.find(block => block.id === 'target-vocabulary-exercise-lead-in').text = [
    '**Task 1:** Прочитайте истории. Попросите ученика обратить внимание на выделенные слова. Затем вернитесь к догадкам 4–5 из Lead-In и проверьте их вместе: ответы — в карточке «Lead-In: Check Your Guesses».',
    '**Task 2:** Попросите ученика выбрать значение каждого слова. При затруднении вернитесь к историям. После ошибки можно попробовать ещё раз.',
    '**Task 3:** Сначала прочитайте весь текст, затем выберите слова из выпадающих списков. В конце попросите ученика прочитать получившуюся историю вслух.',
    '**Task 4:** Попросите ученика перетащить слова в пропуски. Каждое слово используется один раз. Затем прочитайте предложения вслух.',
    '**Extra Task:** При необходимости нажмите «Показать», чтобы открыть дополнительное задание ученику. Попросите написать английские слова рядом с русскими подсказками.',
    '**Task 5:** Задайте ученику вопросы о нём самом. Используйте follow-up вопросы и Sentence Starters. Правильных и неправильных ответов нет.',
  ].join('\n\n');
  const dragWords = dragSentences.flatMap(sentence => [...sentence.matchAll(/\[\[(.+?)\]\]/g)].map(match => match[1]));
  return [teacherNote, {
    type: 'markdownCard', id: 'target-vocabulary-card', title: 'Vocabulary',
    icon: 'book', accentColor: '#20A85B', studentVisibility: 'controlled',
    text: vocabularyItems.map(({ term, definition }, index) => `${index + 1}. **${term}** — ${definition}`).join('\n'),
  }, normalizeStoryCards({
    type: 'storyCards', id: 'target-vocabulary-stories',
    title: 'Task 1. Read the stories. Pay attention to the words in bold.',
    items: stories.map(({ name, emoji, text }, index) => ({
      id: `story-${index + 1}`, emoji, title: name, text, backgroundColor: STORY_COLORS[index],
    })),
  }), {
    type: 'markdownCard', id: 'target-vocabulary-guess-answers', title: 'Lead-In: Check Your Guesses',
    icon: 'check', accentColor: '#E5AD16', studentVisibility: 'teacherOnly',
    // Guesses are statements 4–5 of the Lead-In, after the three check statements.
    // Bold numbers instead of a Markdown list, which would renumber them from 1.
    text: guessChecks.map(({ story, answer, evidence }, index) => (
      `**${index + 4}.** ${guessStatements[index]} — **${answer.toUpperCase()}** · ${story}: “${evidence}”`
    )).join('\n\n'),
  }, normalizeMultipleChoice({
    type: 'multipleChoice', id: 'target-vocabulary-meanings', variant: 'compact',
    title: 'Task 2. Choose the correct meaning for the words from the text.',
    instruction: 'Choose one answer for each question.',
    items: vocabularyItems.map(({ term, definition, distractor }, index) => ({
      id: `meaning-${index + 1}`, question: `What does “${term}” mean?`, answer: definition,
      options: index % 2 ? [distractor, definition] : [definition, distractor],
    })),
  }), normalizeDropdownChoice({
    type: 'dropdownChoice', id: 'target-vocabulary-context-dropdown',
    title: 'Task 3. Vocabulary in Context — Dropdown',
    instruction: 'Fill in the blanks with the correct words from the dropdown lists.',
    text: contextText.replace(/\[\[(\d+)\]\]/g, '[[context-$1]]'),
    choices: contextChoices.map(({ options, answer }, index) => ({ id: `context-${index + 1}`, options, answer })),
  }), normalizeDragWordsInText({
    type: 'dragWordsInText', id: 'target-vocabulary-drag-words',
    title: 'Task 4. Drag the correct words into the gaps.',
    instruction: 'Use each word once.',
    // Alphabetical order so the word bank does not follow the order of the sentences.
    words: [...dragWords].sort((a, b) => a.localeCompare(b)),
    text: dragSentences.join('\n'),
  }), normalizeGapFill({
    type: 'gapFill', id: 'target-vocabulary-type-words',
    title: 'Extra Task. Type the English words.',
    instruction: 'Type the English word or phrase next to each Russian hint.',
    studentVisibility: 'controlled',
    text: translationSentences.map(({ before, hint }, index) => `${index + 1}. ${before} **${hint}** [[extra-${index + 1}]]`).join('\n'),
    gaps: translationSentences.map(({ answer }, index) => ({ id: `extra-${index + 1}`, answer })),
  }), normalizePersonalizedQuestions({
    type: 'personalizedQuestions', id: 'target-vocabulary-personalized-questions',
    title: 'Task 5 · Personalised Questions',
    instruction: 'Answer the questions out loud. There are no right or wrong answers!',
    items: personalizedQuestions.map(({ question, followUp }, index) => ({ id: `question-${index + 1}`, question, followUp })),
  }), {
    type: 'markdownCard', id: 'target-vocabulary-sentence-starters-card',
    title: 'Support: Sentence Starters', icon: 'chat', accentColor: '#20A85B', studentVisibility: 'always',
    text: `Use these starters if you need help answering.\n\n${sentenceStarters.map(starter => `- **${starter}**`).join('\n')}`,
  }];
}

const SYNTHETIC_LEAD_IN = Object.freeze({
  checkStatements: [
    { text: 'Batman has got a black cape and a black mask.', answer: 'fact', explanation: 'He has got a black cape and mask.' },
    { text: 'All superheroes have got a cape.', answer: 'myth', explanation: 'Spider-Man and Iron Man have not got a cape.' },
    { text: 'The Hulk has got a cool superhero suit and boots.', answer: 'myth', explanation: 'He has not got a suit or boots. He has got purple shorts and green skin.' },
  ],
  guessStatements: [
    'Somebody in our stories has got green hair.',
    'Somebody in our stories has got a purple jacket.',
  ],
  speakingSupport: ['Batman has got…', 'Spider-Man hasn’t got…'],
});

const LEAD_IN_TEACHER_NOTE_TEXT = [
  '**Say:** "Now let\'s play a game called \'**Fact or Myth?**\'. I will show you some statements. You need to read them and decide: is it a true **Fact**, or a false **Myth**?"',
  '',
  '**Teacher\'s Tips (Handling the activity):**',
  '',
  '- **Check Understanding:** Before you start, make sure the student understands the words **Fact** (100% true) and **Myth** (false / not true). You can use thumbs up 👍 and thumbs down 👎 gestures to make it fun.',
  '- **Elicit Explanations (Questions 1–3):** For the general knowledge statements, don\'t just accept a one-word answer. Point to the **Speaking Support** box and ask: "Why do you think so? Can you prove it?"',
  '- **The "Guess" Factor (Questions 4–5):** The last few statements are usually directly related to the stories they are about to explore. The student cannot know the answer yet. **Do not reveal the correct answer here!** Let them guess. Ask: "What do you think? Let\'s make a guess."',
  '',
  '**Post-Task Discussion**',
  '',
  '**Say:** "You have some really interesting ideas! But are your guesses for the last questions actually right? Well, there is only one way to find out. Let\'s move to the next part of our lesson, read the stories, and check our answers!"',
].join('\n');

// Shared by the synthetic lesson and the AI generator: statements and support lines come from the model, the rest is fixed.
function createTemplateTwoLeadIn({ checkStatements, guessStatements, speakingSupport }) {
  const exercise = normalizeFactOrMyth({
    type: 'factOrMyth', id: 'lead-in-fact-or-myth',
    title: 'Read the sentences. Is it a FACT or MYTH?',
    instruction: 'Choose Fact or Myth for each sentence.',
    items: [
      ...checkStatements.map(({ text, answer, explanation }) => ({ text, mode: 'check', answer, explanation })),
      ...guessStatements.map(text => ({ text, mode: 'guess', answer: null, explanation: 'Students guess now and check later in the stories.' })),
    ].map((item, index) => ({ id: `statement-${index + 1}`, ...item })),
  });
  return [
    { type: 'teacherNote', id: 'lead-in-teacher-note', text: LEAD_IN_TEACHER_NOTE_TEXT },
    exercise,
    { type: 'markdownCard', id: 'lead-in-speaking-support', title: 'Speaking Support', icon: 'chat', accentColor: '#E5AD16', studentVisibility: 'always',
      text: ['I think it’s a fact / myth because…', ...speakingSupport].join('\n\n') },
    createFactOrMythAnswerKey(exercise),
  ];
}

function createTemplateTwoWatchAndInteract() {
  return [
    { type: 'teacherNote', id: 'watch-teacher-note', text: [
      '- Before watching, ask the student to predict what the video is about. Accept any guess and ask why.',
      '- After watching, return to the prediction and discuss what happened. Help the student answer with a short sentence.',
      '- Use the speaking support if the student needs help giving a reason.',
      '**Say:** “What do you think this video is about? Choose your guess and tell me why.”',
    ].join('\n\n') },
    normalizeMultipleChoice({
      type: 'multipleChoice', id: 'watch-prediction', mode: 'guess',
      title: 'Before watching', instruction: 'Prediction — choose your guess.',
      items: [{ id: 'video-topic', question: 'What do you think this video is about?',
        options: ['About teenagers arguing with parents', 'About an unusual lizard', 'About a boy who wants to become famous'],
        answer: null }],
    }),
    { type: 'videoPlayer', id: 'watch-video', title: 'Watch the video' },
    { type: 'markdownCard', id: 'watch-discussion', title: 'After watching',
      icon: 'chat', accentColor: '#8257E5', studentVisibility: 'always',
      headingSize: 'large', layout: 'stacked', variant: 'discussion',
      sections: [
        { id: 'discussion', title: 'Discussion / Speaking', text: 'Would you like to try this? Why / why not?' },
        { id: 'support', title: 'Speaking support', text: '*Yes, I would because…*\n\n*No, I wouldn’t because…*' },
      ],
    },
  ];
}

const GUIDED_COMMUNICATION_COVERS = Object.freeze([
  { emoji: '😎', backgroundColor: '#C7DDFB' },
  { emoji: '🤩', backgroundColor: '#ECEBFF' },
  { emoji: '🤓', backgroundColor: '#DFCEF3' },
]);

function createTemplateTwoGuidedCommunicationTeacherNote(successCriteria) {
  return {
    type: 'teacherNote', id: 'guided-communication-teacher-note',
    text: [
      '**Start:** You start. Ask: “What would you like to do?”',
      '**For weaker students:** Give 2 options and ask short questions.',
      '**For stronger students:** Ask for reasons, alternatives and compromise.',
      '**Watch for:** questions, reactions, suggestions, agreeing/disagreeing.',
      '**If stuck:** Give a choice or a sentence starter: “I think ___ because...”',
      '**Target language:** Aim for 2 target words + 2 grammar examples. Adjust to the student.',
      '**Correct:** Help only if communication stops. Save other corrections for the end.',
      `**Success:** ${successCriteria}`,
    ].join('\n\n'),
  };
}

// Shared by the synthetic lesson and the AI generator: cards and success criteria vary, the chrome is fixed.
function createTemplateTwoGuidedCommunication({ successCriteria, cards }) {
  return [
    createTemplateTwoGuidedCommunicationTeacherNote(successCriteria),
    { type: 'taskPrompt', id: 'guided-communication-instruction', variant: 'followUp',
      title: 'Choose a card', text: 'Choose a card, turn it over, and do the task.' },
    normalizeGuidedCommunicationCards({
      type: 'guidedCommunicationCards', id: 'guided-communication-cards',
      items: cards.map((card, index) => ({
        id: `card-${index + 1}`,
        cover: { ...GUIDED_COMMUNICATION_COVERS[index], title: `Card ${index + 1}` },
        task: {
          title: `Card ${index + 1}. ${card.title}`,
          questions: card.questions,
          miniTask: { text: card.miniTask, example: card.miniTaskExample },
          help: { vocabulary: card.vocabulary, phrases: card.phrases, sentenceStarters: card.sentenceStarters },
        },
      })),
    }),
  ];
}

const SYNTHETIC_GUIDED_COMMUNICATION = Object.freeze({
  successCriteria: 'The student describes a superhero and asks a follow-up question.',
  cards: [{
    title: 'My Superhero',
    questions: [
      'What is your superhero’s name?',
      'Has your superhero got a cape or a mask?',
      'What colour is your superhero suit?',
      'Has your superhero got curly hair, straight hair, big eyes or pointed ears?',
    ],
    miniTask: 'Describe your superhero in 3–4 sentences.',
    miniTaskExample: '',
    vocabulary: ['cape', 'mask', 'superhero suit', 'boots', 'gloves', 'belt', 'curly hair', 'straight hair', 'big eyes', 'pointed ears'],
    phrases: ['My superhero’s name is ...', 'He has got ... / She has got ...', 'He hasn’t got ... / She hasn’t got ...', 'His / Her suit is ...', 'He / She looks ...'],
    sentenceStarters: ['My superhero is called ...', 'He has got ...', 'She has got ...', 'He hasn’t got ...', 'Her favourite colour is ...'],
  }, {
    title: 'My Superhero Friend',
    questions: [
      'Have you got a favourite superhero? Who is it?',
      'What has your perfect superhero friend got?',
      'Has your superhero friend got boots, gloves or a belt?',
      'What special appearance has your superhero friend got?',
    ],
    miniTask: 'Ask your teacher: What has your perfect superhero friend got?',
    miniTaskExample: '',
    vocabulary: ['friend', 'superhero', 'cape', 'mask', 'superhero suit', 'boots', 'gloves', 'belt', 'curly hair', 'straight hair', 'big eyes', 'pointed ears'],
    phrases: ['My perfect superhero friend has got ...', 'He / She has got ...', 'He / She hasn’t got ...', 'I like ... because ...', 'My favourite superhero is ...'],
    sentenceStarters: ['My favourite superhero is ...', 'My perfect superhero friend has got ...', 'He / She has got ... and ...', 'He / She hasn’t got ...', 'I like this superhero because ...'],
  }, {
    title: 'Ask and Answer',
    questions: [
      'Have you got a superhero costume at home?',
      'If you are a superhero, have you got a mask?',
      'What colour boots have you got in your superhero costume?',
      'Has your superhero got a belt with gadgets?',
    ],
    miniTask: 'Ask your teacher one question about their superhero.',
    miniTaskExample: 'Example: Has your superhero got a cape?',
    vocabulary: ['costume', 'mask', 'cape', 'boots', 'belt', 'gadgets', 'superhero suit', 'pointed ears', 'big eyes'],
    phrases: ['Have you got ...?', 'Has your superhero got ...?', 'Yes, I have. / No, I haven’t.', 'Yes, he has. / No, she hasn’t.', 'It is ... / They are ...'],
    sentenceStarters: ['Have you got ...?', 'Has your superhero got ...?', 'Yes, he has got ...', 'No, she hasn’t got ...', 'My superhero has got ...'],
  }],
});

function createTemplateTwoWrapUp() {
  // Intentional copy: the two templates can evolve independently.
  return [{
    type: 'teacherNote',
    id: 'wrap-up-teacher-note',
    text: '- **Signs of success:** Strong answers mention exchange expectations vs. reality and correctly use *used to* / *get used to* to give a personal recommendation.\n- **If the student struggles:** Briefly review the difference between *used to* and *get used to* and remind 2–3 key phrases from the lesson.\n- **Positive ending:** Praise students like: “You can already talk about exchange experiences and give advice clearly.”',
  }, {
    type: 'threeTwoOne',
    id: 'wrap-up-three-two-one',
    steps: {
      three: {
        prompt: 'Name three words or phrases you remember from the lesson.',
      },
      two: {
        prompt: 'Create two sentences with the target grammar.',
        text: '1. Say something you *used to* think about high-school exchange programs.\n2. Say something a student may need to *get used to* during an exchange.',
      },
      one: {
        label: 'Can-do question',
        prompt: 'Would you recommend doing a high-school exchange? Give one expectation, one real difficulty, and one thing students can get used to.',
      },
    },
  }, {
    type: 'selfAssessment',
    id: 'wrap-up-self-assessment',
    title: 'Self-assessment: How do you feel about today’s lesson?',
  }, {
    type: 'markdownCard',
    id: 'wrap-up-possible-language',
    title: 'Possible language:',
    text: 'I used to think... / You may need to get used to... / I’d recommend it because...',
    icon: 'chat',
    accentColor: '#6545F5',
    studentVisibility: 'always',
  }];
}

const SYNTHETIC_WARM_UP_ROWS = Object.freeze([
  { options: ['fly', 'jump', 'run', 'strong'], answer: 'strong',
    explanation: 'It is an adjective; the other words can be verbs.' },
  { options: ['cape', 'car', 'mask', 'boots'], answer: 'car',
    explanation: 'It is a vehicle; the others can be worn.' },
  { options: ['robot', 'spider', 'bat', 'cat'], answer: 'robot',
    explanation: 'It is a machine; the others are animals.' },
  { options: ['head', 'arm', 'laser', 'leg'], answer: 'laser',
    explanation: 'It is not a body part; the others are body parts.' },
]);

function createTemplateTwoWarmUpTeacherNote(exampleAnswer) {
  const word = exampleAnswer.charAt(0).toLocaleUpperCase() + exampleAnswer.slice(1);
  return {
    type: 'teacherNote',
    id: 'warm-up-teacher-note',
    text: [
      '**Goal:** The main goal of this stage is to activate the student\'s background knowledge, get them speaking right away, and introduce the topic of the lesson.',
      '',
      '**Error Correction:** Focus purely on fluency. Do not interrupt the student to correct grammar or minor pronunciation mistakes. Praise their ideas and create a welcoming atmosphere!',
      '',
      '**Say:** "Hello! How are you today? Are you ready for our lesson? Let\'s start our lesson with a quick game called \'Find the Odd One Out\'. Look at the first row of words. Three of them are connected, but one is different. Which word doesn\'t belong here? Can you explain why?"',
      '',
      '**Teacher\'s Tips (Handling the activity):**',
      '',
      `- **Encourage Full Sentences:** If the student just shouts out one word (e.g., "${word}!"), point to the Support box. Ask them: "Can you explain it using this sentence? \'${word} is the odd one out because...\'"`,
      '- **Accept Alternative Answers:** Students often think outside the box. If they choose a "wrong" word but provide a logical, creative explanation, praise them for it! ("That\'s a great reason!") After praising, gently guide them to the intended category: "Now let\'s look at it from another angle. What do the other three words have in common?"',
      '- **Scaffolding for weaker students:** If they struggle to name the category, help them with leading questions about the words\' functions or characteristics: "What do you do with [Word A] and [Word B]? Are they actions / places / objects / feelings?"',
    ].join('\n'),
  };
}

// Shared by the synthetic lesson and the AI generator: rows come from the model, the rest is fixed.
function createTemplateTwoWarmUp(rows) {
  const exercise = normalizeOddOneOut({
    type: 'oddOneOut', id: 'warm-up-odd-one-out',
    title: 'Find the Odd One Out!',
    instruction: 'Look at the four words in each row. Find the odd word and explain your choice.',
    items: rows.map((row, index) => ({ id: `row-${index + 1}`, ...row })),
  });
  return [createTemplateTwoWarmUpTeacherNote(exercise.items[0].answer), exercise, createOddOneOutAnswerKey(exercise)];
}

function createTemplateTwoLesson(topic) {
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: { topic: String(topic || '').trim(), title: String(topic || '').trim(),
      level: 'A2', lessonNumber: 1, durationMinutes: 50, generatedBy: 'synthetic' },
    stages: TEMPLATE_2_STAGES.map((stage, index) => ({ ...stage, number: index + 1,
      content: stage.id === 'warm-up' ? createTemplateTwoWarmUp(SYNTHETIC_WARM_UP_ROWS) : stage.id === 'lead-in' ? createTemplateTwoLeadIn(SYNTHETIC_LEAD_IN) : stage.id === 'target-vocabulary' ? createTemplateTwoTargetVocabulary(SYNTHETIC_TARGET_VOCABULARY, SYNTHETIC_LEAD_IN.guessStatements) : stage.id === 'watch-and-interact' ? createTemplateTwoWatchAndInteract() : stage.id === 'grammar-presentation' ? createSyntheticTemplateTwoGrammarPresentation() : stage.id === 'grammar-focus' ? createTemplateTwoGrammarFocus(SYNTHETIC_GRAMMAR_FOCUS) : stage.id === 'guided-speaking' ? createTemplateTwoGuidedCommunication(SYNTHETIC_GUIDED_COMMUNICATION) : stage.id === 'wrap-up' ? createTemplateTwoWrapUp() : null,
    })),
  };
}
module.exports = { createTemplateTwoLesson, createTemplateTwoLeadIn, createTemplateTwoTargetVocabulary, createTemplateTwoWarmUp, createTemplateTwoGrammarPresentation, createTemplateTwoGrammarFocus, createTemplateTwoGuidedCommunication, validateTemplateTwoGrammarTask, templateTwoGrammarAnswersSection };
