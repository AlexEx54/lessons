'use strict';

const {
  createTargetVocabularyHowToPlay,
  createTargetVocabularyTeacherNote,
} = require('./target-vocabulary-static.js');
const { createReadingTeacherNote } = require('./reading-static.js');

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
  Object.freeze({ id: 'grammar-focus', title: 'Grammar Focus', subtitle: 'Practice the Rule', durationMinutes: 8, icon: 'cap' }),
  Object.freeze({ id: 'guided-speaking', title: 'Guided Speaking', subtitle: 'Plan Together', durationMinutes: 8, icon: 'chat' }),
  Object.freeze({ id: 'wrap-up', title: 'Wrap-Up', subtitle: '3–2–1', durationMinutes: 3, icon: 'check' }),
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

const LISTENING_TEACHER_NOTE_TEXT = `In this part of the lesson, your student will practice two key skills: **listening for gist** (understanding the main idea) and **listening for detail** (finding specific information). Explain these techniques to the student if needed before starting the tasks.

**Differentiation based on the student's level:**

- **For weaker students:** Give them extra time to read all the questions and options carefully *before* you play the audio. During the second listening (Task 2), you can pause the audio after key information is mentioned to give them time to think.
- **For stronger students:** Encourage them to take brief notes while listening. They can try to answer some questions from Task 2 from memory after the first listening, and use the second listening just to check themselves.

**Task 1:** say "Now we are going to listen to an audio. First, we will practice **listening for gist**. Just like with reading, it means focusing on the general idea. Don't worry if you don't understand every single word. Let's listen to the recording for the first time and choose the correct options in Task 1." *Note for teacher: Play the audio without pauses. Make sure the student focuses only on the main context and doesn't get distracted by the details yet.*

**Task 2:** say "Great job! Now we understand the main situation. Let's move to Task 2. This time, we will practice **listening for detail**. Please, read the questions and options first. I will give you a minute. Then, play the audio one more time, and you need to catch the specific details to choose the right answers. Are you ready?" *Note for teacher: Always let the student read the questions before playing the audio for the second time. It helps them know what specific information they are listening for.*

**Post-Listening Discussion:** say "Excellent work with the quiz! Now, let's discuss what we've just heard. What are your thoughts on the situation from the audio? Have you ever been in a similar situation, or what would you do if you were in the speakers' shoes?" *Note for teacher: Use these questions to transition smoothly from listening to speaking. Encourage the student to personalize the topic and share their own experience.*`;

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
            ? [createTargetVocabularyTeacherNote(), {
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
              text: 'This summer, I wanted [[hang-out-context]] and spend less time at home. I decided [[go-offline-context]] when my friends and I met outside. Sometimes we would play games online, and I tried hard [[beat-game-context]] in my favorite game. It felt great [[level-up-context]] and unlock new rewards! But on some days, I seemed [[get-stuck-context]]. When that happened, I took a break and remembered [[outdoors-context]] in the park. Last week, I even decided [[try-new-context]] by taking up a new sport. Of course, sometimes I was tempted [[stay-up-late-context]] while watching tutorials!',
              choices: [{
                id: 'hang-out-context',
                options: ['to get bored', 'to hang out (with friends)', 'to stay up late'],
                answer: 'to hang out (with friends)',
              }, {
                id: 'go-offline-context',
                options: ['to spend time outdoors', 'to go offline / go AFK', 'to chill out'],
                answer: 'to go offline / go AFK',
              }, {
                id: 'beat-game-context',
                options: ['to level up', 'to get stuck', 'to beat a game / a boss'],
                answer: 'to beat a game / a boss',
              }, {
                id: 'level-up-context',
                options: ['to try something new', 'to get bored', 'to level up'],
                answer: 'to level up',
              }, {
                id: 'get-stuck-context',
                options: ['to chill out', 'to get stuck', 'to go offline / go AFK'],
                answer: 'to get stuck',
              }, {
                id: 'outdoors-context',
                options: ['to spend time outdoors', 'to hang out (with friends)', 'to stay up late'],
                answer: 'to spend time outdoors',
              }, {
                id: 'try-new-context',
                options: ['to get bored', 'to try something new', 'to chill out'],
                answer: 'to try something new',
              }, {
                id: 'stay-up-late-context',
                options: ['to level up', 'to stay up late', 'to spend time outdoors'],
                answer: 'to stay up late',
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
              instruction: 'Use the words and phrases in the box to complete the sentences.',
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
              howToPlay: createTargetVocabularyHowToPlay(),
            }]
            : stage.id === 'reading'
              ? [createReadingTeacherNote(), {
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
                text: LISTENING_TEACHER_NOTE_TEXT,
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
                text: '{l}**Notice the Rule**{/l}\n\n{muted}{s}Look at the examples. What grammar structure is used here?{/s}{/muted}\n\n1. I **used to** think an exchange year would feel like one long adventure.\n2. I **used to** finish school at 2:30.\n3. I couldn’t **get used to** eating lunch at 11:15.\n4. I **got used to** the workload after a few weeks.\n5. I’m finally **getting used to** asking teachers for help.',
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
              }, {
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
              }, {
                type: 'dropdownChoice',
                id: 'grammar-presentation-check-the-rule',
                title: 'Task 2. Check the Rule',
                instruction: 'Choose the correct option from each drop-down list.',
                text: '1. Before the exchange, I [[before-exchange]] finish school at 2:30.\n2. At first, I couldn’t [[lunch-routine]] eating lunch so early.\n3. Now I’m [[speaking-up]] speaking up in class.\n4. My host brother [[basketball-routine]] play basketball after school.\n5. It took me time to [[new-timetable]] the new timetable.',
                choices: [{
                  id: 'before-exchange',
                  options: ['used to', 'getting used to', 'get used to'],
                  answer: 'used to',
                }, {
                  id: 'lunch-routine',
                  options: ['used to', 'getting used to', 'get used to'],
                  answer: 'get used to',
                }, {
                  id: 'speaking-up',
                  options: ['used to', 'getting used to', 'get used to'],
                  answer: 'getting used to',
                }, {
                  id: 'basketball-routine',
                  options: ['used to', 'getting used to', 'get used to'],
                  answer: 'used to',
                }, {
                  id: 'new-timetable',
                  options: ['used to', 'getting used to', 'get used to'],
                  answer: 'get used to',
                }],
              }, {
                type: 'markdownCard',
                id: 'grammar-presentation-answer-key',
                title: 'Answer key',
                layout: 'columns',
                sections: [{
                  id: 'answers',
                  title: '',
                  text: '- **Task 1 Rule:** 1 base verb, 2 past, 3 -ing, 4 comfortable.\n- **Task 2:** 1 used to, 2 get used to, 3 getting used to, 4 used to, 5 get used to.',
                }, {
                  id: 'short-explanations',
                  title: 'Short explanations:',
                  text: '1. Past routine, now different.\n2. After “couldn’t” we use the base form “get”.\n3. An action in progress now.\n4. Past habit.\n5. Adaptation to a new situation.',
                }],
                icon: 'check',
                headingSize: 'large',
                accentColor: '#20A85B',
                studentVisibility: 'teacherOnly',
              }]
            : stage.id === 'grammar-focus'
              ? [{
                type: 'teacherNote',
                id: 'grammar-focus-teacher-note',
                blocks: [{
                  type: 'teacherNoteBlock',
                  id: 'grammar-focus-transition-phrases',
                  title: 'Transition phrases',
                  titleColor: '#6545F5',
                  icon: 'chatDots',
                  text: '- “Let’s practise the grammar together.”\n- “Now choose the best option.”\n- “Great — tell me why.”\n- “Ready for free speaking?”',
                }, {
                  type: 'teacherNoteBlock',
                  id: 'grammar-focus-struggle-tips',
                  title: 'Tips if the student struggles',
                  titleColor: '#2F80ED',
                  icon: 'chat',
                  text: '- Look for time clues such as “before”, “at first”, “after a few days” and “now”.\n- Ask: “Past habit or adaptation?”\n- Check the form: **used to + base verb**; **get used to + noun / verb-ing**.',
                }, {
                  type: 'teacherNoteBlock',
                  id: 'grammar-focus-correction-timing',
                  title: 'Correct now / later',
                  titleColor: '#E0812D',
                  icon: 'chat',
                  text: '- **Correct now:** target grammar mistakes, especially “use to” after did / didn’t.\n- **Correct later:** pronunciation slips and minor vocabulary errors.',
                }, {
                  type: 'teacherNoteBlock',
                  id: 'grammar-focus-free-practice-success',
                  title: 'Free Practice success',
                  titleColor: '#20A85B',
                  icon: 'chatDots',
                  text: '- The student uses the target forms correctly 4–5 times.\n- Gives full sentences.\n- Can self-correct after a prompt.',
                }],
              }, {
                type: 'dropdownChoice',
                id: 'grammar-focus-choose-the-correct-options',
                title: '**Task 1. Choose the correct options.**',
                instruction: 'Read each sentence and choose the correct grammar option.',
                text: '**1.** Before AFK Summer, Leo [[leo-evening-games]] play co-op games every evening.\n**2.** At first, Mia couldn’t [[mia-early-mornings]] waking up early at camp.\n**3.** After a few days, the team [[team-cabins]] sleeping in cabins.\n**4.** This week, I [[less-screen-time]] spending less time online.\n**5.** Did you [[holiday-routine]] stay up late during the holidays?\n**6.** We didn’t [[morning-hikes]] go hiking every morning.\n**7.** Max is trying to [[camp-timetable]] the new camp timetable.\n**8.** My sister [[sister-confidence]] be shy, but now she speaks to everyone.',
                accentColor: '#6545F5',
                choices: [{
                  id: 'leo-evening-games',
                  options: ['used to', 'got used to', 'is getting used to'],
                  answer: 'used to',
                }, {
                  id: 'mia-early-mornings',
                  options: ['use to', 'get used to', 'got used to'],
                  answer: 'get used to',
                }, {
                  id: 'team-cabins',
                  options: ['used to', 'got used to', 'get used to'],
                  answer: 'got used to',
                }, {
                  id: 'less-screen-time',
                  options: ['used to', 'am getting used to', 'got used to'],
                  answer: 'am getting used to',
                }, {
                  id: 'holiday-routine',
                  options: ['used to', 'use to', 'get used to'],
                  answer: 'use to',
                }, {
                  id: 'morning-hikes',
                  options: ['used to', 'use to', 'get used to'],
                  answer: 'use to',
                }, {
                  id: 'camp-timetable',
                  options: ['used to', 'get used to', 'got used to'],
                  answer: 'get used to',
                }, {
                  id: 'sister-confidence',
                  options: ['used to', 'got used to', 'is getting used to'],
                  answer: 'used to',
                }],
              }, {
                type: 'markdownCard',
                id: 'grammar-focus-answer-key',
                title: 'Answer Key & Explanations',
                layout: 'columns',
                sections: [{
                  id: 'answers',
                  title: 'Answers',
                  text: '**1.** used to\n\n**2.** get used to\n\n**3.** got used to\n\n**4.** am getting used to\n\n**5.** use to\n\n**6.** use to\n\n**7.** get used to\n\n**8.** used to',
                }, {
                  id: 'short-explanations',
                  title: 'Short explanations',
                  text: '- **2:** After “couldn’t”, use the base form “get”.\n- **4:** “Am getting used to” describes adaptation in progress now.\n- **5–6:** After “did” / “didn’t”, use “use to”.\n- **7:** After “trying to”, use the base form “get”.',
                }],
                icon: 'check',
                headingSize: 'large',
                accentColor: '#20A85B',
                studentVisibility: 'teacherOnly',
              }, {
                type: 'gapFill',
                id: 'grammar-focus-complete-the-gaps',
                title: '**Task 2. Complete the gaps with the correct form of the verbs.**',
                instruction: 'Read the dialogue and type the correct form of the verbs.',
                text: '**Mia:** Hi, Leo! What [[mia-do]] after school before camp?\n**Leo:** I [[leo-play]] co-op games every evening, and Max [[max-stay]] up late.\n**Mia:** Nice! At first I [[mia-mornings]] the early mornings, but now I [[mia-timetable]] the camp timetable.\n**Leo:** That’s because Ruby [[ruby-record]] a short video for the stream.\n**Mia:** Oh, I see. [[mia-did]] Sofia [[sofia-help]] her?\n**Leo:** Yes, she did. They always worked together on video days.\n**Mia:** Great! I [[mia-camp]] the busy camp days now.',
                accentColor: '#6545F5',
                gaps: [{
                  id: 'mia-do',
                  example: 'do',
                  answer: 'did you use to do',
                }, {
                  id: 'leo-play',
                  example: 'play',
                  answer: 'used to play',
                }, {
                  id: 'max-stay',
                  example: 'stay',
                  answer: 'used to stay',
                }, {
                  id: 'mia-mornings',
                  example: 'not get used to',
                  answer: 'couldn’t get used to',
                }, {
                  id: 'mia-timetable',
                  example: 'get used to',
                  answer: 'am getting used to',
                }, {
                  id: 'ruby-record',
                  example: 'record',
                  answer: 'used to record',
                }, {
                  id: 'mia-did',
                  answer: 'Did',
                }, {
                  id: 'sofia-help',
                  example: 'help',
                  answer: 'use to help',
                }, {
                  id: 'mia-camp',
                  example: 'get used to',
                  answer: 'am getting used to',
                }],
              }, {
                type: 'markdownCard',
                id: 'grammar-focus-complete-the-gaps-answer-key',
                title: 'Answer key',
                layout: 'columns',
                sections: [{
                  id: 'answers-left',
                  title: '',
                  text: '**1.** did you use to do\n\n**2.** used to play\n\n**3.** used to stay\n\n**4.** couldn’t get used to\n\n**5.** am getting used to',
                }, {
                  id: 'answers-right',
                  title: '',
                  text: '**6.** used to record\n\n**7.** Did\n\n**8.** use to help\n\n**9.** am getting used to',
                }],
                icon: 'check',
                headingSize: 'large',
                accentColor: '#20A85B',
                studentVisibility: 'teacherOnly',
              }, {
                type: 'miniSituation',
                id: 'grammar-focus-mini-situation',
                title: 'Task 3. Free Practice — Mini Situation',
                instruction: 'Read the situation and write 3–5 sentences. Your answer will be checked by the teacher.',
                sentenceCount: 5,
                situation: {
                  type: 'illustratedTextPanel',
                  id: 'grammar-focus-mini-situation-prompt',
                  text: 'You are helping to prepare the AFK Summer camp stream. Describe what people are doing now, what they usually do at the camp, and what is different today. Explain what you still need for the stream.',
                  backgroundColor: '#F4F0FF',
                  leadingPicture: {
                    imagePrompt: 'Simple purple line-art camping tent with a small flag, no text, transparent background.',
                  },
                },
              }, {
                type: 'cardRow',
                id: 'grammar-focus-practice-support-row',
                items: [{
                  type: 'markdownCard',
                  id: 'grammar-focus-writing-support',
                  title: 'Writing Support',
                  icon: 'pencil',
                  accentColor: '#20A85B',
                  studentVisibility: 'always',
                  text: '1. Right now, ...\n2. Usually, ...\n3. Today, ... but usually ...\n4. We still need ...\n5. ... because ...',
                }, {
                  type: 'markdownCard',
                  id: 'grammar-focus-support',
                  title: 'Support',
                  icon: 'lifeRing',
                  accentColor: '#20A85B',
                  studentVisibility: 'always',
                  text: '- **Word bank:** stream, camp area, map, mini-games, bridge, video, supplies, lunch\n- **Model sentence:** “Right now, Leo is building a new bridge for the stream.”\n- **Minimum task:** Write 3 sentences if you need extra support.',
                }, {
                  type: 'markdownCard',
                  id: 'grammar-focus-challenge',
                  title: 'Challenge',
                  icon: 'trophy',
                  accentColor: '#6545F5',
                  studentVisibility: 'always',
                  text: '- Use a negative sentence.\n- Ask one question.\n- Add a reason with *because*.\n- Use at least 3 target vocabulary items.\n- Link ideas with *because*, *but* or *so*.',
                }],
              }]
            : stage.id === 'guided-speaking'
              ? [{
                type: 'teacherNote',
                id: 'guided-speaking-teacher-note',
                text: '- **Start:** You start. Ask: “What would you like to do at the camp?”\n- **For weaker students:** Give 2 options and ask short questions: “Game tournament or hiking?” “Why?”\n- **For stronger students:** Ask for reasons, alternatives and compromise: “Why?” “What else could we do?” “Can we find a plan for both of us?”\n- **Watch for:** questions, reactions, suggestions, agreeing/disagreeing.\n- **If stuck:** Give a choice or a sentence starter: “I think ___ because…”\n- **Target language:** Aim for 2 target words (to hang out, to level up) + 2 grammar examples (used to / get used to). Adjust to the student.\n- **Correct:** Help only if communication stops. Save other corrections for the end.\n- **Success:** You make one final plan together with your student.',
              }, {
                type: 'textPanel',
                id: 'guided-speaking-read-instructions',
                text: '{l}**Read the instructions.**{/l}',
                backgroundColor: '#FFFFFF',
                accentColor: '#20243B',
                showBorder: false,
              }, {
                type: 'howToPlay',
                id: 'guided-speaking-how-to-play',
                title: 'How to Play',
                steps: [
                  'Read your role. Keep your card secret.',
                  'Talk to your partner. Listen, answer and complete your secret mission.',
                  'Decide together. Complete the Shared Outcome.',
                ],
              }, {
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
              }, {
                type: 'speakingSupport',
                id: 'guided-speaking-support',
                title: 'Speaking Support',
                sections: {
                  reacting: {
                    title: 'Reacting',
                    text: '- Really?\n- That sounds fun.\n- I see.',
                  },
                  followUpQuestions: {
                    title: 'Follow-up questions',
                    text: '- Why?\n- What about swimming?\n- What are we going to do next?',
                  },
                  clarification: {
                    title: 'Clarification',
                    text: '- What do you mean?\n- Do you mean...?\n- Could you explain?',
                  },
                  suggestions: {
                    title: 'Suggestions',
                    text: '- How about...?\n- Why don’t we...?\n- We could...',
                  },
                  agreeingDisagreeing: {
                    title: 'Agreeing / Disagreeing',
                    text: '- I agree.\n- That makes sense.\n- I see your point, but...',
                  },
                  decision: {
                    title: 'Decision',
                    text: '- So, we agree on...\n- Let’s choose...\n- The best option is...',
                  },
                },
              }, {
                type: 'markdownCard',
                id: 'guided-speaking-example-dialogue',
                title: 'Example Dialogue',
                icon: 'chat',
                headingSize: 'large',
                accentColor: '#3563D4',
                studentVisibility: 'always',
                text: '**Teacher:** What would you like to do on our offline summer day?\n\n**Student:** I’d like to go swimming because it’s fun and relaxing.\n\n**Teacher:** That sounds nice, but I’m not sure. What about having a picnic instead?\n\n**Student:** Why do you think a picnic is better?\n\n**Teacher:** Because it’s cheaper, and we can spend more time outdoors.\n\n**Student:** I see. That makes sense. Let’s choose the picnic, then.\n\n**Teacher:** Great. Do you agree with that plan?\n\n**Student:** Yes, I do. I think it’s the best option for both of us.',
              }]
            : stage.id === 'wrap-up'
              ? [{
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
              }]
              : null;
      return { ...stage, number: index + 1, content };
    }),
  };
}

module.exports = { LISTENING_TEACHER_NOTE_TEXT, STAGE_BLUEPRINTS, createSyntheticLesson };
