'use strict';

const { normalizeStoryCards } = require('../../assets/components/story-cards.js');
const { countWord, exactList, integer, listSchema } = require('./helpers.js');

// Short first-person stories. What they are about — the lesson words in bold, the
// guesses of an earlier task they answer, the grammar of the lesson — is in the
// instructions.

const EXAMPLE_STORIES = Object.freeze([
  { name: 'Flash Kid', emoji: '⚡', text: "Hi! I'm Flash Kid. I've got **curly hair** and **big eyes**. My superhero clothes are blue and yellow. I've got a yellow cape, too. I can run very fast!" },
  { name: 'Moon Girl', emoji: '🌙', text: "My name is Moon Girl. I've got **long straight hair**. I've got a **silver mask** and a purple **superhero suit**. Nobody knows who I am when I wear my mask!" },
  { name: 'Fire Boy', emoji: '🔥', text: "I'm Fire Boy. I've got red **boots** and orange **gloves**. I've also got a black **belt** with my superhero tools. I help people when there is danger." },
  { name: 'Forest Elf', emoji: '🌿', text: "Hi! I'm Forest Elf. I've got **green hair** and two **pointed ears**. I've got brown boots, a green cape and a superhero suit. I can talk to animals and climb trees very quickly." },
  { name: 'Ice Girl', emoji: '❄️', text: "I'm Ice Girl. I've got a white **cape** and a blue **mask**. I can make snow in summer!" },
  { name: 'Night Fox', emoji: '🦊', text: "I'm Night Fox. I've got a black suit and orange gloves. I can see in the dark." },
]);

const DEFAULT_COLORS = Object.freeze(['#EAE4FC', '#FCE3F0', '#FFF0E5', '#E2FBFB']);

module.exports = {
  type: 'storyCards',
  label: 'Истории',
  group: 'comprehension',
  description: 'Короткие истории разных людей от первого лица.',
  params: {
    stories: integer('Историй', 2, 6, 4),
    minWords: integer('Слов в истории: от', 10, 150, 40, { atMost: 'maxWords' }),
    maxWords: integer('Слов в истории: до', 20, 200, 60),
  },
  chrome: ['title', 'colors'],
  fields: ['stories'],
  schema: ({ params }) => ({
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
  }),
  rules: ({ params, f }) => [
    `${f.stories}: exactly ${countWord(params.stories)} short first-person stories (${params.minWords}–${params.maxWords} words each). name is the person’s name used as the story title; emoji is one emoji that fits the person.`,
  ],
  defaultInstructions: 'Different people talk about the lesson topic. Choose people who fit the topic naturally.',
  build({ stories }, context) {
    const { id, params, chrome } = context;
    exactList(stories, params.stories, 'историй', context);
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
  example: ({ params }) => ({ stories: EXAMPLE_STORIES.slice(0, params.stories) }),
};
