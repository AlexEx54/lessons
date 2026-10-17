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
  singleSource: true,
  sourceLabel: 'аудио',
  acceptsSource: control => (control.type === 'audioScript' ? null : 'повторить можно только аудио.'),
  build({ sources }, { id, chrome }) {
    if (sources.length !== 1) fail(`Повтор аудио ${id} должен ссылаться ровно на одно аудио.`);
    const player = {
      type: 'audioPlayer',
      id,
      title: chrome.title ?? 'Listen to the audio one more time',
      script: sources[0].component.script,
    };
    normalizeAudioPlayer(player);
    return player;
  },
};
