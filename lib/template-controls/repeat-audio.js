'use strict';

const { normalizeAudioPlayer } = require('../../assets/components/audio-player.js');
const { fail } = require('./helpers.js');

// The same recording once more, for example before a listening-for-detail task.

module.exports = {
  type: 'repeatAudio',
  kind: 'derived',
  label: 'Повтор аудио',
  group: 'comprehension',
  description: 'То же аудио ещё раз, для повторного прослушивания. Без ИИ.',
  chrome: ['title'],
  sourceLabel: 'аудио',
  acceptsSource: control => (control.type === 'audioScript' ? null : 'повторить можно только аудио.'),
  build({ source }, { id, chrome }) {
    if (!source) fail(`Повтор аудио ${id} должен ссылаться на аудио.`);
    const player = {
      type: 'audioPlayer',
      id,
      title: chrome.title ?? 'Listen to the audio one more time',
      script: source.component.script,
    };
    normalizeAudioPlayer(player);
    return player;
  },
};
