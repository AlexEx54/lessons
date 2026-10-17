'use strict';

const { normalizeStoryCards } = require('../../assets/components/story-cards.js');
const { blockName, countWord, exactList, fail, integer, listSchema, requiredText, timesWord } = require('./helpers.js');

// Short first-person stories. With `highlight` the vocabulary is bolded in them; with
// `guesses` every guess from an earlier task is confirmed or contradicted by one story,
// and `guessChecks` says which (storyGuessKey shows it to the teacher).

const HIGHLIGHT_RULE = 'In the stories, put every vocabulary item in bold with ** exactly once, in the form that fits the sentence. Spread two or three items per story. Bold nothing else.';

const EXAMPLE_STORIES = Object.freeze([
  { name: 'Flash Kid', emoji: '⚡', text: "Hi! I'm Flash Kid. I've got **curly hair** and **big eyes**. My superhero clothes are blue and yellow. I've got a yellow cape, too. I can run very fast!" },
  { name: 'Moon Girl', emoji: '🌙', text: "My name is Moon Girl. I've got **long straight hair**. I've got a **silver mask** and a purple **superhero suit**. Nobody knows who I am when I wear my mask!" },
  { name: 'Fire Boy', emoji: '🔥', text: "I'm Fire Boy. I've got red **boots** and orange **gloves**. I've also got a black **belt** with my superhero tools. I help people when there is danger." },
  { name: 'Forest Elf', emoji: '🌿', text: "Hi! I'm Forest Elf. I've got **green hair** and two **pointed ears**. I've got brown boots, a green cape and a superhero suit. I can talk to animals and climb trees very quickly." },
  { name: 'Ice Girl', emoji: '❄️', text: "I'm Ice Girl. I've got a white **cape** and a blue **mask**. I can make snow in summer!" },
  { name: 'Night Fox', emoji: '🦊', text: "I'm Night Fox. I've got a black suit and orange gloves. I can see in the dark." },
]);

const DEFAULT_COLORS = Object.freeze(['#EAE4FC', '#FCE3F0', '#FFF0E5', '#E2FBFB']);
const plainStory = text => text.replace(/\*\*/g, '');

module.exports = {
  type: 'storyCards',
  label: 'Истории',
  group: 'comprehension',
  description: 'Короткие истории разных людей со словами урока.',
  params: {
    stories: integer('Историй', 2, 6, 4),
    minWords: integer('Слов в истории: от', 10, 150, 40, { atMost: 'maxWords' }),
    maxWords: integer('Слов в истории: до', 20, 200, 60),
    grammarUses: integer('Грамматика в каждой истории, раз', 0, 4, 2),
  },
  chrome: ['title', 'colors'],
  fields: ['stories', 'guessChecks'],
  inputs: {
    highlight: { type: 'vocabulary', sameStageRule: () => HIGHLIGHT_RULE },
    guesses: {
      type: 'statements',
      producerHint: ({ params }) => `Later in this lesson the student reads ${countWord(params.stories)} short first-person stories: ${countWord(params.stories)} different people talk about the lesson topic using the target grammar. The stories are written after you and will follow your guess statements.`,
    },
  },
  schema: ({ params, links }) => ({
    stories: listSchema(params.stories, {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'emoji', 'text'],
      properties: {
        name: { type: 'string', minLength: 1 },
        emoji: { type: 'string', minLength: 1 },
        text: { type: 'string', minLength: 1 },
      },
    }),
    ...(links.guesses ? {
      guessChecks: listSchema(links.guesses.size, {
        type: 'object',
        additionalProperties: false,
        required: ['story', 'answer', 'evidence'],
        properties: {
          story: { type: 'string', minLength: 1 },
          answer: { type: 'string', enum: ['fact', 'myth'] },
          evidence: { type: 'string', minLength: 1 },
        },
      }),
    } : {}),
  }),
  rules: ({ params, links, f }) => [
    `${f.stories}: exactly ${countWord(params.stories)} short first-person stories (${params.minWords}–${params.maxWords} words each). name is the person’s name used as the story title; emoji is one emoji that fits the person.`,
    params.grammarUses > 0 ? `Use the target grammar at least ${timesWord(params.grammarUses)} in every story.` : '',
    links.highlight && !links.highlight.sameStage ? HIGHLIGHT_RULE : '',
    ...(links.guesses ? [
      'The student has already made guesses about the stories earlier in the lesson; the guess statements are listed below. Each guess statement must be clearly confirmed or clearly contradicted by exactly one story; the other stories must not mention that detail.',
      `${f.guessChecks}: one check per guess statement, in the same order. story is the exact name of that story, answer is fact if the story confirms the statement or myth if it contradicts it, and evidence is one sentence copied exactly from that story without the ** markers.`,
    ] : []),
  ],
  defaultInstructions: 'Different people talk about the lesson topic. Choose people who fit the topic naturally.',
  build({ stories, guessChecks }, context) {
    const { id, params, chrome, links } = context;
    exactList(stories, params.stories, 'историй', context);
    if (links.guesses) {
      exactList(guessChecks, links.guesses.value.length, 'проверок догадок', context);
      guessChecks.forEach(check => {
        const story = stories.find(candidate => candidate?.name === check?.story);
        const evidence = requiredText(check?.evidence, 'цитату из истории для догадки', context).replace(/\s+/g, ' ');
        if (!story || typeof story.text !== 'string' || !plainStory(story.text).includes(evidence)) {
          fail(`${blockName(context)}: цитата для догадки должна дословно совпадать с текстом названной истории.`);
        }
        if (!['fact', 'myth'].includes(check.answer)) fail(`${blockName(context)}: ответ на догадку должен быть fact или myth.`);
      });
    }
    const colors = chrome.colors ?? DEFAULT_COLORS;
    return normalizeStoryCards({
      type: 'storyCards',
      id,
      title: chrome.title ?? 'Read the stories.',
      items: stories.map((story, index) => ({
        id: `story-${index + 1}`, emoji: story?.emoji, title: story?.name, text: story?.text,
        backgroundColor: colors[index % colors.length],
      })),
    });
  },
  example({ params, links }) {
    const stories = EXAMPLE_STORIES.slice(0, params.stories);
    const data = { stories };
    if (links.guesses) {
      data.guessChecks = links.guesses.value.map((_, index) => {
        const story = stories[index % stories.length];
        return { story: story.name, answer: 'fact', evidence: plainStory(story.text).split(/(?<=[.!?])\s/)[0] };
      });
    }
    return data;
  },
};
