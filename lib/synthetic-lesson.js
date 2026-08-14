'use strict';

const STAGE_BLUEPRINTS = Object.freeze([
  Object.freeze({ id: 'warm-up', title: 'Warm Up', subtitle: 'This or That?', durationMinutes: 5, icon: 'sparkles' }),
  Object.freeze({ id: 'lead-in', title: 'Lead In', subtitle: 'Gamer Chat', durationMinutes: 5, icon: 'compass' }),
  Object.freeze({
    id: 'target-vocabulary',
    title: 'Target Vocabulary',
    subtitle: 'Summer + Gaming Words',
    durationMinutes: 8,
    icon: 'cards',
  }),
  Object.freeze({ id: 'reading-listening', title: 'Reading / Listening', durationMinutes: 8, icon: 'book' }),
  Object.freeze({ id: 'grammar-focus', title: 'Grammar Focus', durationMinutes: 8, icon: 'cap' }),
  Object.freeze({ id: 'guided-speaking', title: 'Guided Speaking', durationMinutes: 8, icon: 'chat' }),
  Object.freeze({ id: 'wrap-up', title: 'Wrap-Up', durationMinutes: 3, icon: 'check' }),
]);

function createSyntheticLesson(topic) {
  const normalizedTopic = String(topic || '').trim();
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: {
      topic: normalizedTopic,
      title: normalizedTopic,
      level: 'A2',
      lessonNumber: 1,
      durationMinutes: 45,
      generatedBy: 'synthetic',
    },
    stages: STAGE_BLUEPRINTS.map((stage, index) => {
      const content = stage.id === 'warm-up'
        ? [{
          type: 'teacherNote',
          id: 'warm-up-teacher-note',
          text: '- Не заставляйте ученика сразу строить длинные ответы.\n- Покажите варианты и спросите, что он делал чаще этим летом.\n- Принимайте ответы словом или короткой фразой.\n\n**Say:** “Welcome back! Let’s see how you spent your summer. Which one did you do more?”',
        }, {
          type: 'taskPrompt',
          id: 'warm-up-your-turn-prompt',
          variant: 'yourTurn',
          title: 'Your turn!',
          text: 'Which one did you do more this summer? Answer with a word or a short sentence.',
        }, {
          type: 'thisOrThat',
          id: 'warm-up-this-or-that',
          items: [{
            id: 'summer-choice-one',
            options: [{
              id: 'minecraft-house',
              caption: 'Building a house in Minecraft',
              imagePrompt: 'Colorful square cartoon illustration of a child building a wooden house in a block-based video game, bright summer sky, friendly educational style, no text.',
            }, {
              id: 'beach-sandcastle',
              caption: 'Building a sandcastle on the beach',
              imagePrompt: 'Colorful square cartoon illustration of a large sandcastle with a red flag, bucket and shovel on a sunny tropical beach, friendly educational style, no text.',
            }],
          }, {
            id: 'summer-choice-two',
            options: [{
              id: 'sea-swimming',
              caption: 'Swimming in the sea',
              imagePrompt: 'Colorful square cartoon illustration of a happy child swimming in clear blue sea water on a sunny day, friendly educational style, no text.',
            }, {
              id: 'video-game-swimming',
              caption: 'Swimming in a video game',
              imagePrompt: 'Colorful square cartoon illustration of a child wearing headphones and playing a swimming video game on a desktop computer, friendly educational style, no text.',
            }],
          }, {
            id: 'summer-choice-three',
            options: [{
              id: 'game-monsters',
              caption: 'Fighting zombies or creepers',
              imagePrompt: 'Colorful square cartoon illustration of a brave player facing blocky fantasy monsters at night in a video game world, child-friendly, no text.',
            }, {
              id: 'fighting-mosquitoes',
              caption: 'Fighting mosquitoes',
              imagePrompt: 'Funny colorful square cartoon illustration of a mosquito hovering over a person’s arm during summer, friendly educational style, no text.',
            }],
          }, {
            id: 'summer-choice-four',
            options: [{
              id: 'online-maps',
              caption: 'Exploring new maps online',
              imagePrompt: 'Colorful square cartoon illustration of a fantasy map open on a tablet screen with routes and landmarks, friendly educational style, no text.',
            }, {
              id: 'city-exploring',
              caption: 'Exploring new places in your city or country',
              imagePrompt: 'Colorful square cartoon illustration of a young traveler with a backpack overlooking a sunny city, friendly educational style, no text.',
            }],
          }],
        }, {
          type: 'taskPrompt',
          id: 'warm-up-follow-up-prompt',
          variant: 'followUp',
          title: 'Follow-up questions:',
          text: 'What was your favorite game this summer? Did you play every day?',
          support: {
            title: 'Possible language:',
            text: 'I built…, I swam…, I explored…',
          },
        }]
        : stage.id === 'lead-in'
          ? [{
            type: 'teacherNote',
            id: 'lead-in-teacher-note',
            text: '- Прочитайте сообщение вместе или по очереди.\n- Объясните мем “touch grass” и используйте его как вход в тему.\n- Encourage short opinions first, then ask why.',
          }, {
            type: 'taskPrompt',
            id: 'lead-in-your-turn-prompt',
            variant: 'yourTurn',
            title: 'Your turn!',
            text: 'Read the message and discuss it together.',
          }, {
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
          }, {
            type: 'textPanel',
            id: 'lead-in-discussion-questions',
            text: '1. What does “touch grass” mean?\n2. Do you agree that real-world graphics are boring?\n3. How many days can you survive without your PC or console?',
            backgroundColor: '#FFFFFF',
          }, {
            type: 'suggestedAnswers',
            id: 'lead-in-suggested-answers',
            text: '1. “Touch grass” = go outside, spend time in real life, away from screens.\n2. Possible answer: I don’t agree. Real-world graphics can be beautiful. / I agree. Video games are more exciting.\n3. Personal answer.',
          }]
          : stage.id === 'target-vocabulary'
            ? [{
              type: 'teacherNote',
              id: 'target-vocabulary-teacher-note',
              blocks: [{
                type: 'teacherNoteBlock',
                id: 'target-vocabulary-pronunciation-check',
                title: 'Pronunciation Check',
                titleColor: '#6545F5',
                icon: 'audio',
                text: 'Use these online dictionaries to check and play the pronunciation:\n\n- Cambridge Dictionary – cambridge.org/dictionary\n- Merriam-Webster – merriam-webster.com\n- Oxford Learner’s Dictionaries – oxfordlearnersdictionaries.com',
                tip: {
                  text: 'Play the audio for students and have them repeat.\nPay attention to stress: of-FLINE, lev-EL up, out-DOORS.',
                },
              }, {
                type: 'teacherNoteBlock',
                id: 'target-vocabulary-exercise-lead-in',
                title: 'What to Say & How to Lead Into Each Exercise',
                titleColor: '#20A85B',
                icon: 'chat',
                text: 'Intro phrases for teachers:\n\n- **Exercise 1:** “Let’s start with some new words. Match the phrases with the pictures.”\n- **Exercise 2:** “Now, choose the correct phrase from the list and complete the sentences.”\n- **Exercise 3:** “Great! Now fill in the blank with the correct words.”\n- **Exercise 4:** “Now, let’s talk! I’ll ask you some questions about you.”\n- **Extra Task:** “Let’s play a game! Take turns describing the word without saying it. Can your partner guess it?”',
              }, {
                type: 'teacherNoteBlock',
                id: 'target-vocabulary-extra-phrases',
                title: 'Extra Teacher Phrases You Can Use',
                titleColor: '#6545F5',
                icon: 'chatDots',
                text: '- “Can you think of another example?”\n- “What does this mean in your own words?”\n- “Let’s use this word in a sentence together.”\n- “Good! Can you say it another way?”',
              }],
            }]
            : null;
      return { ...stage, number: index + 1, content };
    }),
  };
}

module.exports = { STAGE_BLUEPRINTS, createSyntheticLesson };
