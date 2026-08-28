'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

test('synthetic lesson contains nine ordered stages and the mock-aligned content', () => {
  const lesson = createSyntheticLesson('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.durationMinutes, 50);
  assert.equal(lesson.stages.length, 9);
  assert.deepEqual(lesson.stages.map(stage => stage.id), [
    'warm-up', 'lead-in', 'target-vocabulary', 'reading', 'listening',
    'grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up',
  ]);
  assert.ok(lesson.stages.every((stage, index) => stage.number === index + 1));
  assert.equal(lesson.stages[0].subtitle, 'This or That?');
  assert.equal(lesson.stages[1].subtitle, 'Gamer Chat');
  assert.equal(lesson.stages[3].subtitle, 'Read the text');
  assert.equal(lesson.stages[4].subtitle, 'Listen to the audio');
  assert.equal(lesson.stages[5].subtitle, 'Complete the Rule');
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
  assert.match(lesson.stages[2].content[0].blocks[0].text, /Используйте эти онлайн-словари/);
  assert.match(lesson.stages[2].content[0].blocks[0].tip.text, /Обратите внимание на ударение/);
  assert.doesNotMatch(
    JSON.stringify(lesson.stages[2].content[0]),
    /of-FLINE|lev-EL up|out-DOORS/,
  );
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
  assert.equal(dropdown.segments, undefined);
  assert.match(dropdown.text, /\[\[hang-out-context\]\]/);
  const choices = dropdown.choices;
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
  assert.deepEqual(lesson.stages[3].content.map(component => component.type), [
    'teacherNote', 'textReading', 'multipleChoice', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(lesson.stages[3].content[0].id, 'reading-teacher-note');
  assert.match(lesson.stages[3].content[0].text, /форматом blog post/);
  assert.match(lesson.stages[3].content[0].text, /В Task 2/);
  assert.deepEqual(lesson.stages[3].content[1], {
    type: 'textReading',
    id: 'reading-text',
    title: 'My Exchange Week Surprise',
    subtitle: 'by ClaryNomad16 · Posted Aug 20',
    headerImage: {
      imagePrompt: 'Small friendly circular avatar of a teenage student with short brown hair, warm smile, blue hoodie, clean colorful educational illustration, no text, simple background.',
    },
    text: 'Last month, I joined a one-week school exchange in Bristol. Before the trip, I thought everything would be exciting and easy. I imagined friendly classmates, fun lessons, and lots of time to explore the city. To be honest, I was also nervous because I had never stayed with a host family before.\n\nOn the first day, things felt harder than I expected. I got lost in the school building. I didn’t understand the teacher’s accent, and I was too shy to start conversations. At lunch, I almost sat alone, but then a girl called Mia invited me to join her table. After that, the day slowly became better.\n\nDuring the week, I tried new food, worked on a science project with local students, and visited the Clifton Suspension Bridge. The best part was learning how normal daily life was in another country. It wasn’t a movie-like adventure every minute, but it felt real and interesting.\n\nBy the end of the week, I was much more confident. The exchange was not perfect, but it taught me to adapt, speak up, and enjoy small moments. Now I would definitely do it again.',
    textImage: {
      imagePrompt: 'Colorful wide educational illustration of a teenage exchange student with a backpack standing in a friendly Bristol school hallway, lockers and diverse classmates in the background, a small exchange program welcome sign with no readable text, warm modern cartoon style.',
    },
  });
  const gistQuiz = lesson.stages[3].content[2];
  assert.equal(gistQuiz.id, 'reading-gist-quiz');
  assert.equal(gistQuiz.items.length, 1);
  assert.equal(gistQuiz.items[0].options.length, 3);
  assert.equal(
    gistQuiz.items[0].answer,
    'The writer discovered that an exchange week was challenging but rewarding.',
  );
  assert.equal(gistQuiz.items[0].explanation, 'The text is about expectations, challenges, and positive results.');
  const detailQuiz = lesson.stages[3].content[3];
  assert.equal(detailQuiz.id, 'reading-detail-quiz');
  assert.equal(detailQuiz.items.length, 5);
  assert.deepEqual(detailQuiz.items.map(item => item.options.indexOf(item.answer)), [0, 1, 1, 1, 1]);
  assert.equal(detailQuiz.items[0].explanation, 'The writer was nervous because they had never stayed with a host family before.');
  assert.equal(detailQuiz.items[3].explanation, 'The best part of the week was learning about real daily life in another country.');
  assert.equal(detailQuiz.items[4].explanation, undefined);
  assert.deepEqual(lesson.stages[3].content[4], {
    type: 'markdownCard',
    id: 'reading-answer-key',
    title: 'Answer Key',
    text: '**Task 1:**\n\nB — The text is about expectations, challenges, and positive results.\n\n**Task 2:**\n\n1A — The writer was nervous because they had never stayed with a host family before.\n\n2B — On the first day, the writer got lost in the school building.\n\n3B — Mia helped the writer feel more comfortable at lunch.\n\n4B — The best part of the week was learning about real daily life in another country.\n\n5B',
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  });
  assert.match(lesson.stages[3].content[4].text, /\*\*Task 1:\*\*\n\nB —/);
  assert.doesNotMatch(lesson.stages[3].content[4].text, /Possible follow-up/);
  assert.doesNotMatch(lesson.stages[3].content[4].text, /5B —/);
  assert.deepEqual(lesson.stages[4].content.map(component => component.type), [
    'teacherNote', 'audioPlayer', 'checkboxChoice', 'audioPlayer', 'multipleChoice', 'markdownCard',
  ]);
  assert.deepEqual(lesson.stages[4].content[0], {
    type: 'teacherNote',
    id: 'listening-teacher-note',
    text: '- Цель первого прослушивания: понять общую ситуацию, где происходит разговор и о чём он.\n- Цель второго прослушивания: услышать детали и выбрать точные ответы.\n- Не нужно объяснять заранее слова: camp, backpack, sunscreen, cabin, workshop, guitar.\n- Предложение к Target Grammar: “We’re going to stay in cabins.”, “I’m going to bring my guitar.”, “We’re going to leave on Friday morning.”\n- Ответы, которые могут вызвать обсуждение: почему ребята выбрали AFK Summer и что ученик сам взял бы с собой.',
  });
  const listeningAudio = lesson.stages[4].content[1];
  assert.equal(listeningAudio.id, 'listening-audio');
  assert.equal(listeningAudio.title, 'Listen to the audio');
  assert.equal(listeningAudio.audioSrc, undefined);
  assert.match(listeningAudio.script, /to hang out with friends/);
  assert.match(listeningAudio.script, /beat a game/);
  assert.match(listeningAudio.script, /go offline/);
  assert.match(listeningAudio.script, /go AFK/);
  assert.match(listeningAudio.script, /chill out/);
  assert.match(listeningAudio.script, /level up/);
  assert.match(listeningAudio.script, /got bored/);
  assert.match(listeningAudio.script, /stay up late/);
  assert.match(listeningAudio.script, /try something new/);
  assert.match(listeningAudio.script, /spend time outdoors/);
  assert.match(listeningAudio.script, /got stuck/);
  assert.match(listeningAudio.script, /We’re going to stay in cabins/);
  assert.match(listeningAudio.script, /I’m going to bring my guitar/);
  assert.match(listeningAudio.script, /We’re going to leave on Friday morning/);
  assert.match(listeningAudio.script, /\bcamp\b/);
  assert.match(listeningAudio.script, /\bbackpack\b/);
  assert.match(listeningAudio.script, /\bsunscreen\b/);
  assert.match(listeningAudio.script, /\bcabin/);
  assert.match(listeningAudio.script, /\bworkshop\b/);
  assert.match(listeningAudio.script, /\bguitar\b/);
  const spokenWords = listeningAudio.script.replace(/^[^:]+:\s*/gm, '').split(/\s+/).filter(Boolean);
  assert.ok(spokenWords.length >= 250 && spokenWords.length <= 360, `expected ~2 minutes of speech, got ${spokenWords.length} words`);
  const listeningGist = lesson.stages[4].content[2];
  assert.equal(listeningGist.id, 'listening-gist-quiz');
  assert.equal(listeningGist.items.length, 2);
  assert.deepEqual(listeningGist.items[0].answers, ['At the AFK Summer camp office']);
  assert.deepEqual(listeningGist.items[1].answers, ['What to pack for AFK Summer', 'Why they chose the camp']);
  const listeningAudioAgain = lesson.stages[4].content[3];
  assert.equal(listeningAudioAgain.id, 'listening-audio-again');
  assert.equal(listeningAudioAgain.title, 'Listen to the audio one more time');
  assert.equal(listeningAudioAgain.script, listeningAudio.script);
  assert.equal(listeningAudioAgain.audioSrc, undefined);
  const listeningDetail = lesson.stages[4].content[4];
  assert.equal(listeningDetail.id, 'listening-detail-quiz');
  assert.equal(listeningDetail.items.length, 5);
  assert.deepEqual(listeningDetail.items.map(item => item.options.indexOf(item.answer)), [1, 2, 0, 1, 2]);
  assert.equal(listeningDetail.items[4].explanation, undefined);
  assert.deepEqual(lesson.stages[4].content[5], {
    type: 'markdownCard',
    id: 'listening-answer-key',
    title: 'Answer Key',
    text: '**Task 1:**\n\n1B — The conversation happens at the AFK Summer camp office.\n\n2A, B — They talk about packing and why they chose AFK Summer.\n\n**Task 2:**\n\n1B — They are going to leave on Friday morning.\n\n2C — They are going to stay in cabins.\n\n3A — Mia is going to bring her guitar.\n\n4B — There is a music workshop on Tuesday.\n\n5C',
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  });
  const grammarPresentation = lesson.stages[5];
  assert.equal(grammarPresentation.title, 'Grammar Presentation');
  assert.equal(grammarPresentation.durationMinutes, 5);
  assert.deepEqual(grammarPresentation.content.map(component => component.type), [
    'teacherNote', 'textPanel', 'textPanel', 'dragWordsInText', 'markdownCard', 'dropdownChoice', 'markdownCard',
  ]);
  assert.deepEqual(grammarPresentation.content[0], {
    type: 'teacherNote',
    id: 'grammar-presentation-teacher-note',
    text: '- **Notice pattern:** “used to” = past habit/state that is different now; “get used to” = become accustomed to something new.\n- **CCQs to ask orally:** “Was it true in the past or is it true now?” “Was it easy at first?” “Are we talking about a past habit or a new situation?” “After ‘to’, do we use a base verb or -ing here?”\n- **Explain simply:** “used to” talks about before; “get used to” talks about adaptation over time.\n- **Typical mistakes:** “get used to + base verb” instead of “-ing”; confusing “used to” with past simple; writing “use to” in affirmative sentences.',
  });
  assert.deepEqual(grammarPresentation.content[1], {
    type: 'textPanel',
    id: 'grammar-presentation-notice-rule',
    text: '{l}**Notice the Rule**{/l}\n\n{muted}{s}Look at the examples. What grammar structure is used here?{/s}{/muted}\n\n1. I **used to** think an exchange year would feel like one long adventure.\n2. I **used to** finish school at 2:30.\n3. I couldn’t **get used to** eating lunch at 11:15.\n4. I **got used to** the workload after a few weeks.\n5. I’m finally **getting used to** asking teachers for help.',
    backgroundColor: '#FFFFFF',
    accentColor: '#6545F5',
    showBorder: false,
  });
  assert.deepEqual(grammarPresentation.content[2], {
    type: 'textPanel',
    id: 'grammar-presentation-concept-checking',
    text: '{l}**Concept-checking questions:**{/l}\n\n1. In sentence 2, was that routine true in the past or is it true now?\n2. In sentence 3, was eating lunch at 11:15 easy at first?\n3. In sentences 4–5, are we talking about a habit or a change over time?\n4. After “get used to”, do we use a noun / -ing form or a base verb?',
    backgroundColor: '#FFFFFF',
    accentColor: '#20A85B',
    showBorder: true,
  });
  assert.deepEqual(grammarPresentation.content[3], {
    type: 'dragWordsInText',
    id: 'grammar-presentation-complete-the-rule',
    title: 'Complete the Rule',
    instruction: 'Drag the correct words into the gaps.',
    words: ['past', 'base verb', 'comfortable', '-ing', 'future', 'infinitive with to'],
    text: 'used to + [[base verb]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation.',
  });
  assert.deepEqual(grammarPresentation.content[4], {
    type: 'markdownCard',
    id: 'grammar-presentation-quick-rule',
    title: 'Quick Rule',
    layout: 'columns',
    sections: [{
      id: 'used-to',
      title: 'USED TO',
      text: '- **past habit** / state that is different now\n- **form:** subject + used to + base verb\n- **negative:** didn’t use to + base verb\n- **question:** Did you use to ...?\n- **example:** “I used to finish school at 2:30.”',
    }, {
      id: 'get-used-to',
      title: 'GET USED TO',
      text: '- become comfortable with something new\n- **form:** get / got / am getting used to + noun / verb-ing\n- **after “to”:** use a noun or -ing, not a base verb\n- **example:** “I got used to the workload after a few weeks.”',
    }],
    icon: 'bulb',
    accentColor: '#6545F5',
    studentVisibility: 'always',
  });
  assert.deepEqual(grammarPresentation.content[5].choices.map(choice => choice.answer), [
    'used to', 'get used to', 'getting used to', 'used to', 'get used to',
  ]);
  assert.match(grammarPresentation.content[5].text, /^1\. Before the exchange/);
  assert.equal(grammarPresentation.content[6].icon, 'check');
  assert.equal(grammarPresentation.content[6].headingSize, 'large');
  assert.equal(grammarPresentation.content[6].studentVisibility, 'teacherOnly');
  assert.equal(grammarPresentation.content[6].sections[0].title, '');
  assert.equal(grammarPresentation.content[6].sections[1].title, 'Short explanations:');
  assert.equal(grammarPresentation.content[6].sections[1].headingSize, undefined);
  const grammarFocus = lesson.stages[6];
  assert.equal(grammarFocus.title, 'Grammar Focus');
  assert.equal(grammarFocus.subtitle, 'Practice the Rule');
  assert.equal(grammarFocus.durationMinutes, 8);
  assert.deepEqual(grammarFocus.content.map(component => component.type), [
    'teacherNote', 'dropdownChoice', 'markdownCard', 'gapFill', 'markdownCard', 'miniSituation', 'cardRow',
  ]);
  assert.equal(grammarFocus.content[0].id, 'grammar-focus-teacher-note');
  assert.deepEqual(grammarFocus.content[0].blocks.map(block => block.id), [
    'grammar-focus-transition-phrases',
    'grammar-focus-struggle-tips',
    'grammar-focus-correction-timing',
    'grammar-focus-free-practice-success',
  ]);
  assert.deepEqual(grammarFocus.content[0].blocks.map(block => block.title), [
    'Transition phrases',
    'Tips if the student struggles',
    'Correct now / later',
    'Free Practice success',
  ]);
  assert.equal(new Set(grammarFocus.content[0].blocks.map(block => block.titleColor)).size, 4);
  assert.equal(grammarFocus.content[1].id, 'grammar-focus-choose-the-correct-options');
  assert.equal(grammarFocus.content[1].title, '**Task 1. Choose the correct options.**');
  assert.equal(grammarFocus.content[1].accentColor, '#6545F5');
  assert.deepEqual(grammarFocus.content[1].choices.map(choice => choice.answer), [
    'used to', 'get used to', 'got used to', 'am getting used to',
    'use to', 'use to', 'get used to', 'used to',
  ]);
  assert.match(grammarFocus.content[1].text, /^\*\*1\.\*\* Before AFK Summer/);
  assert.equal(grammarFocus.content[2].id, 'grammar-focus-answer-key');
  assert.equal(grammarFocus.content[2].title, 'Answer Key & Explanations');
  assert.equal(grammarFocus.content[2].layout, 'columns');
  assert.deepEqual(grammarFocus.content[2].sections.map(section => section.id), [
    'answers', 'short-explanations',
  ]);
  assert.equal(grammarFocus.content[2].studentVisibility, 'teacherOnly');
  assert.equal(grammarFocus.content[3].id, 'grammar-focus-complete-the-gaps');
  assert.equal(grammarFocus.content[3].title, '**Task 2. Complete the gaps with the correct form of the verbs.**');
  assert.equal(grammarFocus.content[3].accentColor, '#6545F5');
  assert.equal(grammarFocus.content[3].gaps.length, 9);
  assert.equal(grammarFocus.content[3].gaps.filter(gap => gap.example).length, 8);
  assert.equal(grammarFocus.content[3].gaps[6].id, 'mia-did');
  assert.equal(grammarFocus.content[3].gaps[6].example, undefined);
  assert.deepEqual(grammarFocus.content[3].gaps.map(gap => gap.answer), [
    'did you use to do', 'used to play', 'used to stay', 'couldn’t get used to',
    'am getting used to', 'used to record', 'Did', 'use to help', 'am getting used to',
  ]);
  assert.match(grammarFocus.content[3].text, /^\*\*Mia:\*\* Hi, Leo!/);
  assert.equal(grammarFocus.content[4].id, 'grammar-focus-complete-the-gaps-answer-key');
  assert.equal(grammarFocus.content[4].title, 'Answer key');
  assert.equal(grammarFocus.content[4].layout, 'columns');
  assert.deepEqual(grammarFocus.content[4].sections.map(section => section.id), [
    'answers-left', 'answers-right',
  ]);
  assert.equal(grammarFocus.content[4].studentVisibility, 'teacherOnly');
  assert.equal(grammarFocus.content[5].id, 'grammar-focus-mini-situation');
  assert.equal(grammarFocus.content[5].sentenceCount, 5);
  assert.equal(grammarFocus.content[5].situation.id, 'grammar-focus-mini-situation-prompt');
  assert.ok(grammarFocus.content[5].situation.leadingPicture.imagePrompt);
  assert.equal(grammarFocus.content[5].situation.trailingPicture, undefined);
  assert.equal(grammarFocus.content[6].type, 'cardRow');
  assert.equal(grammarFocus.content[6].id, 'grammar-focus-practice-support-row');
  assert.deepEqual(grammarFocus.content[6].items.map(item => item.id), [
    'grammar-focus-writing-support',
    'grammar-focus-support',
    'grammar-focus-challenge',
  ]);
  assert.deepEqual(grammarFocus.content[6].items.map(item => item.icon), ['pencil', 'lifeRing', 'trophy']);
  assert.ok(grammarFocus.content[6].items.every(item => item.studentVisibility === 'always'));
  const guidedSpeaking = lesson.stages[7];
  assert.equal(guidedSpeaking.title, 'Guided Speaking');
  assert.equal(guidedSpeaking.subtitle, 'Plan Together');
  assert.equal(guidedSpeaking.durationMinutes, 8);
  assert.deepEqual(guidedSpeaking.content.map(component => component.type), [
    'teacherNote', 'textPanel', 'howToPlay', 'guidedRoleCards', 'speakingSupport', 'markdownCard',
  ]);
  assert.equal(guidedSpeaking.content[0].id, 'guided-speaking-teacher-note');
  assert.match(guidedSpeaking.content[0].text, /\*\*Start:\*\*/);
  assert.match(guidedSpeaking.content[0].text, /used to \/ get used to/);
  assert.deepEqual(guidedSpeaking.content[1], {
    type: 'textPanel',
    id: 'guided-speaking-read-instructions',
    text: '{l}**Read the instructions.**{/l}',
    backgroundColor: '#FFFFFF',
    accentColor: '#20243B',
    showBorder: false,
  });
  assert.deepEqual(guidedSpeaking.content[2], {
    type: 'howToPlay',
    id: 'guided-speaking-how-to-play',
    title: 'How to Play',
    steps: [
      'Read your role. Keep your card secret.',
      'Talk to your partner. Listen, answer and complete your secret mission.',
      'Decide together. Complete the Shared Outcome.',
    ],
  });
  assert.deepEqual(guidedSpeaking.content[3], {
    type: 'guidedRoleCards',
    id: 'guided-speaking-role-cards',
    roles: {
      student: {
        title: 'Student',
        sections: {
          want: '- Go swimming\n- Have a picnic',
          avoid: '- Long walks',
          secret: '- You have £15.\n- Swimming costs £8.',
          mission: '- Ask 1 question.\n- Say 1 idea.',
          goal: '- Choose the final plan together.',
        },
      },
      teacher: {
        title: 'Teacher',
        sections: {
          want: '- Go for a bike ride\n- Spend time outside',
          avoid: '- Go shopping',
          secret: '- Be home by 5:00 p.m.\n- Bike rental closes at 3:00 p.m.',
          mission: '- Suggest another idea.\n- Ask: Do you agree?',
          goal: '- Choose the final plan together.',
        },
      },
    },
  });
  assert.equal(guidedSpeaking.content[4].type, 'speakingSupport');
  assert.equal(guidedSpeaking.content[4].id, 'guided-speaking-support');
  assert.deepEqual(Object.keys(guidedSpeaking.content[4].sections), [
    'reacting', 'followUpQuestions', 'clarification',
    'suggestions', 'agreeingDisagreeing', 'decision',
  ]);
  assert.deepEqual(guidedSpeaking.content[5], {
    type: 'markdownCard',
    id: 'guided-speaking-example-dialogue',
    title: 'Example Dialogue',
    icon: 'chat',
    headingSize: 'large',
    accentColor: '#3563D4',
    studentVisibility: 'always',
    text: '**Teacher:** What would you like to do on our offline summer day?\n\n**Student:** I’d like to go swimming because it’s fun and relaxing.\n\n**Teacher:** That sounds nice, but I’m not sure. What about having a picnic instead?\n\n**Student:** Why do you think a picnic is better?\n\n**Teacher:** Because it’s cheaper, and we can spend more time outdoors.\n\n**Student:** I see. That makes sense. Let’s choose the picnic, then.\n\n**Teacher:** Great. Do you agree with that plan?\n\n**Student:** Yes, I do. I think it’s the best option for both of us.',
  });
  const wrapUp = lesson.stages[8];
  assert.equal(wrapUp.title, 'Wrap-Up');
  assert.equal(wrapUp.subtitle, '3–2–1');
  assert.equal(wrapUp.durationMinutes, 3);
  assert.deepEqual(wrapUp.content.map(component => component.type), [
    'teacherNote', 'threeTwoOne', 'selfAssessment', 'markdownCard',
  ]);
  assert.equal(wrapUp.content[0].id, 'wrap-up-teacher-note');
  assert.match(wrapUp.content[0].text, /\*\*Signs of success:\*\*/);
  assert.deepEqual(wrapUp.content[1], {
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
  });
  assert.deepEqual(wrapUp.content[2], {
    type: 'selfAssessment',
    id: 'wrap-up-self-assessment',
    title: 'Self-assessment: How do you feel about today’s lesson?',
  });
  assert.deepEqual(wrapUp.content[3], {
    type: 'markdownCard',
    id: 'wrap-up-possible-language',
    title: 'Possible language:',
    text: 'I used to think... / You may need to get used to... / I’d recommend it because...',
    icon: 'chat',
    accentColor: '#6545F5',
    studentVisibility: 'always',
  });
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

test('synthetic reading content does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[3].content;
  const second = createSyntheticLesson('Healthy habits').stages[3].content;
  assert.deepEqual(first, second);
});

test('synthetic listening teacher notes do not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[4].content;
  const second = createSyntheticLesson('Healthy habits').stages[4].content;
  assert.deepEqual(first, second);
});

test('synthetic wrap-up content does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[8].content;
  const second = createSyntheticLesson('Healthy habits').stages[8].content;
  assert.deepEqual(first, second);
});
