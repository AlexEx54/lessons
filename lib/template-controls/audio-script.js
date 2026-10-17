'use strict';

const { normalizeAudioPlayer } = require('../../assets/components/audio-player.js');
const { requiredText } = require('./helpers.js');

// An audio recording made from a generated script; `repeatAudio` plays the same script again.

module.exports = {
  type: 'audioScript',
  label: 'Аудио',
  group: 'comprehension',
  description: 'Аудио для аудирования: ИИ пишет текст, урок его озвучивает.',
  chrome: ['title'],
  fields: ['script'],
  schema: () => ({ script: { type: 'string', minLength: 1 } }),
  defaultInstructions: '',
  build({ script }, context) {
    const player = {
      type: 'audioPlayer',
      id: context.id,
      title: context.chrome.title ?? 'Listen to the audio',
      script: requiredText(script, 'сценарий аудио', context),
    };
    // Validation only: the stored player keeps its authored shape.
    normalizeAudioPlayer(player);
    return player;
  },
  example: () => ({
    script: 'Alex: Hi, Mia! Are you ready for the trip?\nMia: Yes! I packed my bag last night.\nAlex: Great. See you at the station!',
  }),
};
