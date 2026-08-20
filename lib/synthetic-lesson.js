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
  Object.freeze({ id: 'reading', title: 'Reading', subtitle: 'Read the text', durationMinutes: 5, icon: 'book' }),
  Object.freeze({ id: 'listening', title: 'Listening', subtitle: 'Listen to the audio', durationMinutes: 3, icon: 'audio' }),
  Object.freeze({ id: 'grammar-presentation', title: 'Grammar Presentation', subtitle: 'Complete the Rule', durationMinutes: 5, icon: 'cap' }),
  Object.freeze({ id: 'grammar-focus', title: 'Grammar Focus', durationMinutes: 8, icon: 'cap' }),
  Object.freeze({ id: 'guided-speaking', title: 'Guided Speaking', durationMinutes: 8, icon: 'chat' }),
  Object.freeze({ id: 'wrap-up', title: 'Wrap-Up', durationMinutes: 3, icon: 'check' }),
]);

const LISTENING_SCRIPT = [
  'Alex: Hey, Mia! Are you here for AFK Summer too?',
  'Mia: Yes! I got bored at home, so I decided to go offline this summer and come to the camp office today.',
  'Alex: Same here. I used to stay up late every night. Last month I tried to beat a game, but I got stuck on the last boss.',
  'Mia: Did you beat the boss later?',
  'Alex: Not yet. I need to level up first. This week I want to hang out with friends in real life.',
  'Mia: That’s why I chose AFK Summer. I want to spend time outdoors and try something new.',
  'Alex: So, what are you going to pack?',
  'Mia: I have my backpack here. I’m going to bring my guitar. There is a music workshop on Tuesday.',
  'Alex: Nice! We’re going to stay in cabins, right? The woman at the camp office just told me that.',
  'Mia: Yes. The cabins are near the trees. Don’t forget sunscreen. The sun is strong near the water.',
  'Alex: Sunscreen, a water bottle, and my old backpack. I also want to chill out in the evening.',
  'Mia: We can chill out after the workshop and hang out with friends near the cabins.',
  'Alex: Perfect. I get bored if I sit inside too long.',
  'Mia: At home I stay up late and then I feel tired. Here we can go to bed earlier.',
  'Alex: We’re going to leave on Friday morning, so we have five full days to go AFK.',
  'Mia: Five days offline. No games, and no getting stuck at my computer.',
  'Alex: If I get bored, I’ll take a walk or play the guitar with you.',
  'Mia: And if you get stuck on a hiking trail, I’ll help you.',
  'Alex: Deal. Let’s finish our lists at the camp office and enjoy the camp.',
  'Mia: Deal. See you at the cabins!',
].join('\n');

function createSyntheticLesson(topic) {
  const normalizedTopic = String(topic || '').trim();
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: {
      topic: normalizedTopic,
      title: normalizedTopic,
      level: 'A2',
      lessonNumber: 1,
      durationMinutes: 50,
      generatedBy: 'synthetic',
    },
    stages: STAGE_BLUEPRINTS.map((stage, index) => {
      const content = stage.id === 'warm-up'
        ? [{
          type: 'teacherNote',
          id: 'warm-up-teacher-note',
          text: '- Не заставляйте ученика сразу строить длинные ответы.\n- Покажите варианты и спросите, что он делал чаще этим летом.\n- Принимайте ответы словом или короткой фразой.\n\n**Say:** “Welcome back! Let’s see how you spent your summer. Which one did you do more?”',
        }, {
          type: 'markdownCard',
          id: 'warm-up-your-turn-card',
          title: 'Your turn!',
          text: 'Which one did you do more this summer? Answer with a word or a short sentence.',
          icon: 'chat',
          accentColor: '#1EAD58',
          studentVisibility: 'always',
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
            type: 'markdownCard',
            id: 'lead-in-your-turn-card',
            title: 'Your turn!',
            text: 'Read the message and discuss it together.',
            icon: 'chat',
            accentColor: '#1EAD58',
            studentVisibility: 'always',
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
            type: 'markdownCard',
            id: 'lead-in-suggested-answers-card',
            title: 'Suggested answers',
            text: '1. “Touch grass” = go outside, spend time in real life, away from screens.\n2. Possible answer: I don’t agree. Real-world graphics can be beautiful. / I agree. Video games are more exciting.\n3. Personal answer.',
            icon: 'check',
            accentColor: '#1EAD58',
            studentVisibility: 'controlled',
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
            }, {
              type: 'markdownCard',
              id: 'target-vocabulary-card',
              title: 'Vocabulary',
              text: '1. **to hang out (with friends)** — spend free time together\n2. **to beat a game / a boss** — win and finish it\n3. **to go offline / go AFK** — disconnect from the internet\n4. **to chill out** — relax\n5. **to level up** — get better / reach a new stage\n6. **to get bored** — feel no interest\n7. **to stay up late** — go to bed very late\n8. **to try something new** — do something different for the first time\n9. **to spend time outdoors** — be outside\n10. **to get stuck** — be unable to continue',
              icon: 'book',
              accentColor: '#20A85B',
              studentVisibility: 'controlled',
            }, {
              type: 'matchWords',
              id: 'target-vocabulary-match-words',
              title: 'Task 1 · Match the Words',
              instruction: 'Match the words with the pictures.',
              items: [{
                id: 'hang-out',
                term: 'to hang out (with friends)',
                imagePrompt: 'Colorful square cartoon illustration of three diverse teenage friends sitting together, chatting and smiling, friendly educational style, clean white background, no text.',
              }, {
                id: 'beat-game-boss',
                term: 'to beat a game / a boss',
                imagePrompt: 'Colorful square cartoon illustration of a video game victory after defeating a large friendly fantasy boss, triumphant player, bright celebratory effects, no text.',
              }, {
                id: 'go-offline-afk',
                term: 'to go offline / go AFK',
                imagePrompt: 'Colorful square cartoon illustration of a computer monitor with disconnected Wi-Fi and a small away sign, friendly educational style, no words or letters.',
              }, {
                id: 'chill-out',
                term: 'to chill out',
                imagePrompt: 'Colorful square cartoon illustration of a relaxed teenager resting in a soft beanbag chair and listening to music, friendly educational style, no text.',
              }, {
                id: 'level-up',
                term: 'to level up',
                imagePrompt: 'Colorful square cartoon game-style illustration of a character becoming stronger with glowing green upward arrows and sparkling progress symbols, no text or letters.',
              }, {
                id: 'get-bored',
                term: 'to get bored',
                imagePrompt: 'Colorful square cartoon illustration of a bored teenager resting their head on one hand at a desk, tired expression, friendly educational style, no text.',
              }, {
                id: 'stay-up-late',
                term: 'to stay up late',
                imagePrompt: 'Colorful square cartoon illustration of a sleepy teenager using a computer late at night, moon and clock visible through a window, no text.',
              }, {
                id: 'try-something-new',
                term: 'to try something new',
                imagePrompt: 'Colorful square cartoon illustration of a teenager learning to skateboard for the first time, slightly unsure but excited, friendly educational style, no text.',
              }, {
                id: 'spend-time-outdoors',
                term: 'to spend time outdoors',
                imagePrompt: 'Colorful square cartoon illustration of a teenager hiking along a sunny mountain trail surrounded by trees and nature, friendly educational style, no text.',
              }, {
                id: 'get-stuck',
                term: 'to get stuck',
                imagePrompt: 'Colorful square cartoon video game scene of a confused player character trapped between obstacles and unable to move forward, friendly educational style, no text.',
              }],
            }, {
              type: 'markdownCard',
              id: 'target-vocabulary-extra-explanation-card',
              title: '1. Words That Need Extra Explanation',
              text: '- **go offline / go AFK** — explain that AFK = “away from keyboard”.\n- **level up** — usually used in games; means “reach the next level” and become stronger or better.\n- **get stuck** — explain with examples: in a game (can’t move forward) or in real life (have a problem).\n- **beat a game / a boss** — clarify: “beat a boss” = win against a very strong enemy.\n- **spend time outdoors** — “outdoors” = outside, in nature or outside the house.',
              icon: 'book',
              accentColor: '#6545F5',
              studentVisibility: 'teacherOnly',
            }, {
              type: 'dropdownChoice',
              id: 'target-vocabulary-context-dropdown',
              title: 'Task 2 · Vocabulary in Context — Dropdown',
              instruction: 'Fill in the blanks with the correct words from the dropdown lists.',
              segments: [{
                type: 'text',
                text: 'This summer, I wanted ',
              }, {
                type: 'choice',
                id: 'hang-out-context',
                options: ['to get bored', 'to hang out (with friends)', 'to stay up late'],
                answer: 'to hang out (with friends)',
              }, {
                type: 'text',
                text: ' and spend less time at home. I decided ',
              }, {
                type: 'choice',
                id: 'go-offline-context',
                options: ['to spend time outdoors', 'to go offline / go AFK', 'to chill out'],
                answer: 'to go offline / go AFK',
              }, {
                type: 'text',
                text: ' when my friends and I met outside. Sometimes we would play games online, and I tried hard ',
              }, {
                type: 'choice',
                id: 'beat-game-context',
                options: ['to level up', 'to get stuck', 'to beat a game / a boss'],
                answer: 'to beat a game / a boss',
              }, {
                type: 'text',
                text: ' in my favorite game. It felt great ',
              }, {
                type: 'choice',
                id: 'level-up-context',
                options: ['to try something new', 'to get bored', 'to level up'],
                answer: 'to level up',
              }, {
                type: 'text',
                text: ' and unlock new rewards! But on some days, I seemed ',
              }, {
                type: 'choice',
                id: 'get-stuck-context',
                options: ['to chill out', 'to get stuck', 'to go offline / go AFK'],
                answer: 'to get stuck',
              }, {
                type: 'text',
                text: '. When that happened, I took a break and remembered ',
              }, {
                type: 'choice',
                id: 'outdoors-context',
                options: ['to spend time outdoors', 'to hang out (with friends)', 'to stay up late'],
                answer: 'to spend time outdoors',
              }, {
                type: 'text',
                text: ' in the park. Last week, I even decided ',
              }, {
                type: 'choice',
                id: 'try-new-context',
                options: ['to get bored', 'to try something new', 'to chill out'],
                answer: 'to try something new',
              }, {
                type: 'text',
                text: ' by taking up a new sport. Of course, sometimes I was tempted ',
              }, {
                type: 'choice',
                id: 'stay-up-late-context',
                options: ['to level up', 'to stay up late', 'to spend time outdoors'],
                answer: 'to stay up late',
              }, {
                type: 'text',
                text: ' while watching tutorials!',
              }],
            }, {
              type: 'markdownCard',
              id: 'target-vocabulary-context-answer-key',
              title: 'Answer Key',
              text: '1. **to hang out (with friends)**\n2. **to go offline / go AFK**\n3. **to beat a game / a boss**\n4. **to level up**\n5. **to get stuck**\n6. **to spend time outdoors**\n7. **to try something new**\n8. **to stay up late**',
              icon: 'check',
              accentColor: '#20A85B',
              studentVisibility: 'teacherOnly',
            }, {
              type: 'fillInBlanks',
              id: 'target-vocabulary-fill-in-blanks',
              title: 'Task 3 · Fill in the Blanks',
              instruction: 'Type the correct word or phrase in each blank.',
              items: [{
                id: 'fill-item-chill-out',
                before: 'After a long week, I like to',
                answer: 'chill out',
                after: 'and watch a movie.',
              }, {
                id: 'fill-item-spend-time-outdoors',
                before: 'We decided to',
                answer: 'spend time outdoors',
                after: 'and explore a new hiking trail.',
              }, {
                id: 'fill-item-get-stuck',
                before: 'It’s annoying when you',
                answer: 'get stuck',
                after: 'in a level and can’t find the next step.',
              }, {
                id: 'fill-item-hangs-out',
                before: 'My brother',
                answer: 'hangs out',
                after: 'every weekend with his online gaming team.',
              }, {
                id: 'fill-item-beat',
                before: 'I felt proud when I finally',
                answer: 'beat',
                after: 'the last boss in the game!',
              }, {
                id: 'fill-item-go-offline',
                before: 'If I’m too tired, I might',
                answer: 'go offline',
                after: 'and take a short break.',
              }],
            }, {
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
            }, {
              type: 'markdownCard',
              id: 'target-vocabulary-sentence-starters-card',
              title: 'Support: Sentence Starters',
              text: 'Use these starters if you need help answering.\n\n- **I usually like to ...**\n- **One time I ...**\n- **I feel ... when ...**',
              icon: 'chat',
              accentColor: '#20A85B',
              studentVisibility: 'always',
            }, {
              type: 'describeAndGuess',
              id: 'target-vocabulary-describe-and-guess',
              title: 'Extra Task · Describe and Guess',
              instruction: 'Take turns with your teacher. Describe the word without saying it. Can your partner guess it?',
              items: [{
                id: 'describe-hang-out',
                text: 'to hang out (with friends)',
              }, {
                id: 'describe-go-offline-afk',
                text: 'to go offline / go AFK',
              }, {
                id: 'describe-spend-time-outdoors',
                text: 'to spend time outdoors',
              }, {
                id: 'describe-try-something-new',
                text: 'to try something new',
              }, {
                id: 'describe-level-up',
                text: 'to level up',
              }, {
                id: 'describe-get-stuck',
                text: 'to get stuck',
              }],
              howToPlay: {
                title: 'How to Play',
                steps: [
                  'Choose a word from the list.',
                  'Describe it without saying the word or any part of it.',
                  'Your partner guesses the word.',
                  'Click the word when it’s guessed. It will be crossed out.',
                  'Take turns and keep playing!',
                ],
                tip: 'You can use examples, actions, feelings and details, but don’t say the word!',
              },
            }]
            : stage.id === 'reading'
              ? [{
                type: 'teacherNote',
                id: 'reading-teacher-note',
                text: '- Перед чтением спросите, знаком ли ученик с форматом blog post.\n- Попросите сначала прочитать текст быстро и определить главную идею.\n- В Task 2 напомните ученику искать ответы только в тексте.\n- После заданий обсудите, почему опыт оказался лучше ожиданий.',
              }, {
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
              }, {
                type: 'multipleChoice',
                id: 'reading-gist-quiz',
                title: 'Task 1. Reading for Gist',
                instruction: 'Choose the best answer.',
                items: [{
                  id: 'main-idea',
                  question: 'What is the main idea of the text?',
                  options: [
                    'The writer had a terrible trip and wants to forget it.',
                    'The writer discovered that an exchange week was challenging but rewarding.',
                    'The writer mostly wanted to talk about famous places in Bristol.',
                  ],
                  answer: 'The writer discovered that an exchange week was challenging but rewarding.',
                  explanation: 'The text is about expectations, challenges, and positive results.',
                }],
              }, {
                type: 'multipleChoice',
                id: 'reading-detail-quiz',
                title: 'Task 2. Reading for Detail',
                instruction: 'Read the questions and choose A, B or C.',
                items: [{
                  id: 'nervous-before-trip',
                  question: 'Why was the writer nervous before the trip?',
                  options: [
                    'Because they had never stayed with a host family before.',
                    'Because they were afraid of missing the flight.',
                    'Because they did not want to leave their friends.',
                  ],
                  answer: 'Because they had never stayed with a host family before.',
                  explanation: 'The writer was nervous because they had never stayed with a host family before.',
                }, {
                  id: 'first-day',
                  question: 'What happened on the first day?',
                  options: [
                    'The writer made friends immediately.',
                    'The writer got lost in the school building.',
                    'The writer missed the first lesson.',
                  ],
                  answer: 'The writer got lost in the school building.',
                  explanation: 'On the first day, the writer got lost in the school building.',
                }, {
                  id: 'mia-at-lunch',
                  question: 'How did Mia help the writer?',
                  options: [
                    'She helped the writer find the classroom.',
                    'She invited the writer to join her table at lunch.',
                    'She translated the teacher’s words.',
                  ],
                  answer: 'She invited the writer to join her table at lunch.',
                  explanation: 'Mia helped the writer feel more comfortable at lunch.',
                }, {
                  id: 'best-part',
                  question: 'What was the best part of the week?',
                  options: [
                    'Visiting the Clifton Suspension Bridge.',
                    'Learning how normal daily life was in another country.',
                    'Working on a science project.',
                  ],
                  answer: 'Learning how normal daily life was in another country.',
                  explanation: 'The best part of the week was learning about real daily life in another country.',
                }, {
                  id: 'exchange-taught',
                  question: 'What did the exchange teach the writer?',
                  options: [
                    'How to cook new food.',
                    'To adapt, speak up, and enjoy small moments.',
                    'That school exchanges are always easy.',
                  ],
                  answer: 'To adapt, speak up, and enjoy small moments.',
                }],
              }, {
                type: 'markdownCard',
                id: 'reading-answer-key',
                title: 'Answer Key',
                text: '**Task 1:**\n\nB — The text is about expectations, challenges, and positive results.\n\n**Task 2:**\n\n1A — The writer was nervous because they had never stayed with a host family before.\n\n2B — On the first day, the writer got lost in the school building.\n\n3B — Mia helped the writer feel more comfortable at lunch.\n\n4B — The best part of the week was learning about real daily life in another country.\n\n5B',
                icon: 'check',
                accentColor: '#20A85B',
                studentVisibility: 'teacherOnly',
              }]
            : stage.id === 'listening'
              ? [{
                type: 'teacherNote',
                id: 'listening-teacher-note',
                text: '- Цель первого прослушивания: понять общую ситуацию, где происходит разговор и о чём он.\n- Цель второго прослушивания: услышать детали и выбрать точные ответы.\n- Не нужно объяснять заранее слова: camp, backpack, sunscreen, cabin, workshop, guitar.\n- Предложение к Target Grammar: “We’re going to stay in cabins.”, “I’m going to bring my guitar.”, “We’re going to leave on Friday morning.”\n- Ответы, которые могут вызвать обсуждение: почему ребята выбрали AFK Summer и что ученик сам взял бы с собой.',
              }, {
                type: 'audioPlayer',
                id: 'listening-audio',
                title: 'Listen to the audio',
                script: LISTENING_SCRIPT,
              }, {
                type: 'checkboxChoice',
                id: 'listening-gist-quiz',
                title: 'Task 1. Listening for Gist',
                instruction: 'Choose the correct options.',
                items: [{
                  id: 'conversation-place',
                  question: 'Where does the conversation take place?',
                  options: [
                    'At home',
                    'At the AFK Summer camp office',
                    'On a school bus',
                  ],
                  answers: ['At the AFK Summer camp office'],
                }, {
                  id: 'speakers-topic',
                  question: 'What are the speakers talking about?',
                  options: [
                    'What to pack for AFK Summer',
                    'Why they chose the camp',
                    'Their English homework',
                  ],
                  answers: ['What to pack for AFK Summer', 'Why they chose the camp'],
                }],
              }, {
                type: 'audioPlayer',
                id: 'listening-audio-again',
                title: 'Listen to the audio one more time',
                script: LISTENING_SCRIPT,
              }, {
                type: 'multipleChoice',
                id: 'listening-detail-quiz',
                title: 'Task 2. Listening for Detail',
                instruction: 'Choose the correct options.',
                items: [{
                  id: 'leave-when',
                  question: 'When are they going to leave?',
                  options: [
                    'Thursday evening',
                    'Friday morning',
                    'Saturday morning',
                  ],
                  answer: 'Friday morning',
                  explanation: 'They are going to leave on Friday morning.',
                }, {
                  id: 'stay-where',
                  question: 'Where are they going to stay?',
                  options: [
                    'In tents',
                    'In a hotel',
                    'In cabins',
                  ],
                  answer: 'In cabins',
                  explanation: 'They are going to stay in cabins.',
                }, {
                  id: 'mia-bring',
                  question: 'What is Mia going to bring?',
                  options: [
                    'Her guitar',
                    'Her laptop',
                    'Her skateboard',
                  ],
                  answer: 'Her guitar',
                  explanation: 'Mia is going to bring her guitar.',
                }, {
                  id: 'mia-activity',
                  question: 'Which activity does Mia mention?',
                  options: [
                    'Kayaking',
                    'A music workshop',
                    'Painting',
                  ],
                  answer: 'A music workshop',
                  explanation: 'There is a music workshop on Tuesday.',
                }, {
                  id: 'forget-sunscreen',
                  question: 'What does Mia tell Alex not to forget?',
                  options: [
                    'The date',
                    'Sports clothes',
                    'Sunscreen',
                  ],
                  answer: 'Sunscreen',
                }],
              }, {
                type: 'markdownCard',
                id: 'listening-answer-key',
                title: 'Answer Key',
                text: '**Task 1:**\n\n1B — The conversation happens at the AFK Summer camp office.\n\n2A, B — They talk about packing and why they chose AFK Summer.\n\n**Task 2:**\n\n1B — They are going to leave on Friday morning.\n\n2C — They are going to stay in cabins.\n\n3A — Mia is going to bring her guitar.\n\n4B — There is a music workshop on Tuesday.\n\n5C',
                icon: 'check',
                accentColor: '#20A85B',
                studentVisibility: 'teacherOnly',
              }]
            : stage.id === 'grammar-presentation'
              ? [{
                type: 'teacherNote',
                id: 'grammar-presentation-teacher-note',
                text: '- **Notice pattern:** “used to” = past habit/state that is different now; “get used to” = become accustomed to something new.\n- **CCQs to ask orally:** “Was it true in the past or is it true now?” “Was it easy at first?” “Are we talking about a past habit or a new situation?” “After ‘to’, do we use a base verb or -ing here?”\n- **Explain simply:** “used to” talks about before; “get used to” talks about adaptation over time.\n- **Typical mistakes:** “get used to + base verb” instead of “-ing”; confusing “used to” with past simple; writing “use to” in affirmative sentences.',
              }, {
                type: 'textPanel',
                id: 'grammar-presentation-notice-rule',
                text: '{l}**Notice the Rule**{/l}\n\n{s}Look at the examples. What grammar structure is used here?{/s}\n\n1. I **used to** think an exchange year would feel like one long adventure.\n2. I **used to** finish school at 2:30.\n3. I couldn’t **get used to** eating lunch at 11:15.\n4. I **got used to** the workload after a few weeks.\n5. I’m finally **getting used to** asking teachers for help.',
                backgroundColor: '#FFFFFF',
                accentColor: '#6545F5',
                showBorder: false,
              }, {
                type: 'textPanel',
                id: 'grammar-presentation-concept-checking',
                text: '{l}**Concept-checking questions:**{/l}\n\n1. In sentence 2, was that routine true in the past or is it true now?\n2. In sentence 3, was eating lunch at 11:15 easy at first?\n3. In sentences 4–5, are we talking about a habit or a change over time?\n4. After “get used to”, do we use a noun / -ing form or a base verb?',
                backgroundColor: '#FFFFFF',
                accentColor: '#20A85B',
                showBorder: true,
              }, {
                type: 'dragWordsInText',
                id: 'grammar-presentation-complete-the-rule',
                title: 'Complete the Rule',
                instruction: 'Drag the correct words into the gaps.',
                words: ['past', 'base verb', 'comfortable', '-ing', 'future', 'infinitive with to'],
                text: 'used to + [[base verb]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation.',
              }]
            : null;
      return { ...stage, number: index + 1, content };
    }),
  };
}

module.exports = { STAGE_BLUEPRINTS, createSyntheticLesson };
