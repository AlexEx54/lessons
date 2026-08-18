'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

test('synthetic lesson contains seven ordered stages and the mock-aligned warm-up prompts', () => {
  const lesson = createSyntheticLesson('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.durationMinutes, 45);
  assert.equal(lesson.stages.length, 7);
  assert.deepEqual(lesson.stages.map(stage => stage.id), [
    'warm-up', 'lead-in', 'target-vocabulary', 'reading-listening',
    'grammar-focus', 'guided-speaking', 'wrap-up',
  ]);
  assert.ok(lesson.stages.every((stage, index) => stage.number === index + 1));
  assert.equal(lesson.stages[0].subtitle, 'This or That?');
  assert.equal(lesson.stages[1].subtitle, 'Gamer Chat');
  assert.deepEqual(lesson.stages[0].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.equal(lesson.stages[0].content[0].id, 'warm-up-teacher-note');
  assert.match(lesson.stages[0].content[0].text, /^- Не заставляйте/);
  assert.match(lesson.stages[0].content[0].text, /\*\*Say:\*\*/);
  assert.deepEqual(lesson.stages[0].content.filter(component => component.type === 'taskPrompt').map(prompt => prompt.variant), ['followUp']);
  assert.equal(lesson.stages[0].content[1].id, 'warm-up-your-turn-card');
  assert.equal(lesson.stages[0].content[3].id, 'warm-up-follow-up-prompt');
  assert.equal(lesson.stages[0].content[1].support, undefined);
  assert.deepEqual(lesson.stages[0].content[1], {
    type: 'markdownCard',
    id: 'warm-up-your-turn-card',
    title: 'Your turn!',
    text: 'Which one did you do more this summer? Answer with a word or a short sentence.',
    icon: 'chat',
    accentColor: '#1EAD58',
    studentVisibility: 'always',
  });
  assert.equal(lesson.stages[0].content[2].items.length, 4);
  assert.ok(lesson.stages[0].content[2].items.every(item => item.options.length === 2));
  assert.ok(lesson.stages[0].content[2].items.flatMap(item => item.options).every(option => option.imagePrompt && !option.imageSrc));
  assert.deepEqual(lesson.stages[0].content[3], {
    type: 'taskPrompt',
    id: 'warm-up-follow-up-prompt',
    variant: 'followUp',
    title: 'Follow-up questions:',
    text: 'What was your favorite game this summer? Did you play every day?',
    support: {
      title: 'Possible language:',
      text: 'I built…, I swam…, I explored…',
    },
  });
  assert.deepEqual(lesson.stages[1].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'illustratedTextPanel', 'textPanel', 'markdownCard',
  ]);
  assert.equal(lesson.stages[1].content[0].id, 'lead-in-teacher-note');
  assert.equal(lesson.stages[1].content[1].studentVisibility, 'always');
  assert.deepEqual(lesson.stages[1].content[2], {
    type: 'illustratedTextPanel',
    id: 'lead-in-gamer-message',
    text: '**@GamerAlex:** Guys, my parents took my PC away for 2 weeks! They said I need to “touch grass” and go outside. I survived, but the graphics in the real world are boring… 🙄🌿',
    backgroundColor: '#252A38',
    leadingPicture: {
      imagePrompt: 'Circular friendly gamer profile avatar with a purple and blue gradient, playful simplified face, no text, transparent background.',
    },
    trailingPicture: {
      imagePrompt: 'Minimal gray gaming community chat symbol, simple flat icon, no text, transparent background.',
    },
  });
  assert.deepEqual(lesson.stages[1].content[3], {
    type: 'textPanel',
    id: 'lead-in-discussion-questions',
    text: '1. What does “touch grass” mean?\n2. Do you agree that real-world graphics are boring?\n3. How many days can you survive without your PC or console?',
    backgroundColor: '#FFFFFF',
  });
  assert.deepEqual(lesson.stages[1].content[4], {
    type: 'markdownCard',
    id: 'lead-in-suggested-answers-card',
    title: 'Suggested answers',
    text: '1. “Touch grass” = go outside, spend time in real life, away from screens.\n2. Possible answer: I don’t agree. Real-world graphics can be beautiful. / I agree. Video games are more exciting.\n3. Personal answer.',
    icon: 'check',
    accentColor: '#1EAD58',
    studentVisibility: 'controlled',
  });
  assert.deepEqual(lesson.stages[2].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'matchWords', 'markdownCard', 'dropdownChoice', 'markdownCard', 'fillInBlanks',
    'personalizedQuestions', 'markdownCard', 'describeAndGuess',
  ]);
  assert.equal(lesson.stages[2].content[0].id, 'target-vocabulary-teacher-note');
  assert.equal(lesson.stages[2].subtitle, 'Summer + Gaming Words');
  assert.equal(lesson.stages[2].content[0].text, undefined);
  assert.deepEqual(lesson.stages[2].content[0].blocks.map(block => block.icon), ['audio', 'chat', 'chatDots']);
  assert.equal(lesson.stages[2].content[0].blocks[0].tip.text.includes('stress'), true);
  assert.deepEqual(lesson.stages[2].content[1], {
    type: 'markdownCard',
    id: 'target-vocabulary-card',
    title: 'Vocabulary',
    text: '1. **to hang out (with friends)** — spend free time together\n2. **to beat a game / a boss** — win and finish it\n3. **to go offline / go AFK** — disconnect from the internet\n4. **to chill out** — relax\n5. **to level up** — get better / reach a new stage\n6. **to get bored** — feel no interest\n7. **to stay up late** — go to bed very late\n8. **to try something new** — do something different for the first time\n9. **to spend time outdoors** — be outside\n10. **to get stuck** — be unable to continue',
    icon: 'book',
    accentColor: '#20A85B',
    studentVisibility: 'controlled',
  });
  assert.equal(lesson.stages[2].content[2].id, 'target-vocabulary-match-words');
  assert.equal(lesson.stages[2].content[2].items.length, 10);
  assert.deepEqual(
    lesson.stages[2].content[2].items.map(item => item.term),
    ['to hang out (with friends)', 'to beat a game / a boss', 'to go offline / go AFK', 'to chill out',
      'to level up', 'to get bored', 'to stay up late', 'to try something new', 'to spend time outdoors', 'to get stuck'],
  );
  assert.ok(lesson.stages[2].content[2].items.every(item => item.imagePrompt && !item.imageSrc));
  assert.deepEqual(lesson.stages[2].content[3], {
    type: 'markdownCard',
    id: 'target-vocabulary-extra-explanation-card',
    title: '1. Words That Need Extra Explanation',
    text: '- **go offline / go AFK** — explain that AFK = “away from keyboard”.\n- **level up** — usually used in games; means “reach the next level” and become stronger or better.\n- **get stuck** — explain with examples: in a game (can’t move forward) or in real life (have a problem).\n- **beat a game / a boss** — clarify: “beat a boss” = win against a very strong enemy.\n- **spend time outdoors** — “outdoors” = outside, in nature or outside the house.',
    icon: 'book',
    accentColor: '#6545F5',
    studentVisibility: 'teacherOnly',
  });
  const dropdown = lesson.stages[2].content[4];
  assert.equal(dropdown.id, 'target-vocabulary-context-dropdown');
  const choices = dropdown.segments.filter(segment => segment.type === 'choice');
  assert.equal(choices.length, 8);
  assert.deepEqual(choices.map(choice => choice.answer), [
    'to hang out (with friends)',
    'to go offline / go AFK',
    'to beat a game / a boss',
    'to level up',
    'to get stuck',
    'to spend time outdoors',
    'to try something new',
    'to stay up late',
  ]);
  assert.ok(choices.every(choice => choice.options.length === 3 && choice.options.includes(choice.answer)));
  assert.deepEqual(lesson.stages[2].content[5], {
    type: 'markdownCard',
    id: 'target-vocabulary-context-answer-key',
    title: 'Answer Key',
    text: '1. **to hang out (with friends)**\n2. **to go offline / go AFK**\n3. **to beat a game / a boss**\n4. **to level up**\n5. **to get stuck**\n6. **to spend time outdoors**\n7. **to try something new**\n8. **to stay up late**',
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  });
  const fillInBlanks = lesson.stages[2].content[6];
  assert.equal(fillInBlanks.id, 'target-vocabulary-fill-in-blanks');
  assert.equal(fillInBlanks.items.length, 6);
  assert.deepEqual(fillInBlanks.items.map(item => item.answer), [
    'chill out', 'spend time outdoors', 'get stuck', 'hangs out', 'beat', 'go offline',
  ]);
  assert.deepEqual(lesson.stages[2].content[7], {
    type: 'personalizedQuestions',
    id: 'target-vocabulary-personalized-questions',
    title: 'Task 4 · Personalised Questions',
    instruction: 'Answer the questions out loud. There are no right or wrong answers!',
    items: [{
      id: 'favorite-time-outdoors',
      question: 'What’s your favorite way to **spend time outdoors**?',
      followUp: 'Who do you usually spend that time with?',
    }, {
      id: 'hang-out-or-play-online',
      question: 'Do you prefer to **hang out (with friends)** or **play games online**?',
      followUp: 'What do you like to do when you hang out with your friends?',
    }, {
      id: 'beat-hard-game-or-boss',
      question: 'Have you ever tried to **beat a game or a boss** that was really hard?',
      followUp: 'What game was it and how did you feel when you finally did it?',
    }, {
      id: 'level-up-and-unlock',
      question: 'Do you like to **level up** and **unlock** new things in games?',
      followUp: 'What’s the most interesting thing you’ve unlocked?',
    }],
  });
  assert.deepEqual(lesson.stages[2].content[8], {
    type: 'markdownCard',
    id: 'target-vocabulary-sentence-starters-card',
    title: 'Support: Sentence Starters',
    text: 'Use these starters if you need help answering.\n\n- **I usually like to ...**\n- **One time I ...**\n- **I feel ... when ...**',
    icon: 'chat',
    accentColor: '#20A85B',
    studentVisibility: 'always',
  });
  assert.deepEqual(lesson.stages[2].content[9], {
    type: 'describeAndGuess',
    id: 'target-vocabulary-describe-and-guess',
    title: 'Extra Task · Describe and Guess',
    instruction: 'Take turns with your teacher. Describe the word without saying it. Can your partner guess it?',
    items: [{ id: 'describe-hang-out', text: 'to hang out (with friends)' },
      { id: 'describe-go-offline-afk', text: 'to go offline / go AFK' },
      { id: 'describe-spend-time-outdoors', text: 'to spend time outdoors' },
      { id: 'describe-try-something-new', text: 'to try something new' },
      { id: 'describe-level-up', text: 'to level up' },
      { id: 'describe-get-stuck', text: 'to get stuck' }],
    howToPlay: {
      title: 'How to Play',
      steps: ['Choose a word from the list.', 'Describe it without saying the word or any part of it.',
        'Your partner guesses the word.', 'Click the word when it’s guessed. It will be crossed out.',
        'Take turns and keep playing!'],
      tip: 'You can use examples, actions, feelings and details, but don’t say the word!',
    },
  });
  assert.ok(lesson.stages.slice(3).every(stage => stage.content === null));
});

test('synthetic warm-up component copy does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[0].content;
  const second = createSyntheticLesson('Healthy habits').stages[0].content;
  assert.deepEqual(first, second);
});

test('synthetic lead-in component copy does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[1].content;
  const second = createSyntheticLesson('Healthy habits').stages[1].content;
  assert.deepEqual(first, second);
});

test('synthetic target vocabulary teacher note does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[2].content;
  const second = createSyntheticLesson('Healthy habits').stages[2].content;
  assert.deepEqual(first, second);
});
