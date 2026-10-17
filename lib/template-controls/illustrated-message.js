'use strict';

const { normalizeIllustratedTextPanel } = require('../../assets/components/text-panel.js');
const { requiredText } = require('./helpers.js');

// A short message between two pictures: a sender avatar before it and a thematic symbol after it.

module.exports = {
  type: 'illustratedMessage',
  label: 'Сообщение с картинками',
  group: 'notes',
  description: 'Сообщение от персонажа с аватаром и картинкой по теме.',
  chrome: ['backgroundColor'],
  fields: ['text', 'leadingImagePrompt', 'trailingImagePrompt'],
  schema: () => ({
    text: { type: 'string', minLength: 1 },
    leadingImagePrompt: { type: 'string', minLength: 1 },
    trailingImagePrompt: { type: 'string', minLength: 1 },
  }),
  rules: () => [
    'Both image prompts must describe modern educational illustrations suitable for teenagers, with no text. Avoid childish or preschool aesthetics. The leading image should work as a sender/avatar image and the trailing image as a small thematic symbol related to the message.',
  ],
  defaultInstructions: '',
  build({ text, leadingImagePrompt, trailingImagePrompt }, context) {
    const { id, chrome } = context;
    const panel = {
      type: 'illustratedTextPanel',
      id,
      text: requiredText(text, 'сообщение', context),
      backgroundColor: chrome.backgroundColor ?? '#252A38',
      leadingPicture: { imagePrompt: requiredText(leadingImagePrompt, 'первая картинка', context) },
      trailingPicture: { imagePrompt: requiredText(trailingImagePrompt, 'вторая картинка', context) },
    };
    normalizeIllustratedTextPanel(panel);
    return panel;
  },
  example: () => ({
    text: '**@SkyRider:** I low-key want to fly a plane one day. It looks scary, but so cool!',
    leadingImagePrompt: 'Circular avatar of a smiling teenager in a pilot cap, educational illustration, no text.',
    trailingImagePrompt: 'Small paper plane symbol, educational illustration, no text.',
  }),
};
