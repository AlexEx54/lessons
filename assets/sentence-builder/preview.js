(() => {
  'use strict';
  const model = window.SentenceBuilderModel, container = document.getElementById('preview-components');
  const storageKey = 'sentence-builder-preview-v1';
  let component = { type: 'sentenceBuilder', id: 'wrap-up-sentence-builder', title: 'Make the sentence',
    instruction: 'Put the words in the right order.', hintsEnabled: true, completionText: 'Purr-fect! Well done!',
    items: ['My hero can fly.', 'She is wearing [a red cape].', 'He is [stronger than] me.', 'We can [help people] together.']
      .map((text, i) => model.itemFromText(text, `sentence-${i + 1}`)) };
  try { const saved = localStorage.getItem(storageKey); if (saved) component = model.normalizeSentenceBuilder(JSON.parse(saved)); } catch (_) { /* Keep the valid default. */ }
  let node;
  function render() {
    node?.dispose();
    node = window.SentenceBuilderComponent.renderSentenceBuilder(component, {
      onSave: async changes => { component = model.normalizeSentenceBuilder({ ...component, ...changes }); localStorage.setItem(storageKey, JSON.stringify(component)); return component; },
    });
    const reflection = window.ThreeTwoOneComponent.renderThreeTwoOne({ type: 'threeTwoOne', id: 'wrap-up-three-two-one', steps: {
      three: { prompt: 'Name three words or phrases you remember from the lesson.' },
      two: { prompt: 'Create two sentences with the target grammar.' },
      one: { label: 'Can-do question', prompt: 'What can you say in English now?' },
    } });
    container.replaceChildren(node, reflection);
  }
  document.getElementById('restart').addEventListener('click', render);
  document.getElementById('narrow').addEventListener('click', () => container.classList.toggle('narrow'));
  render();
})();
