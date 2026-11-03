'use strict';

const { CONTROL_CATALOG } = require('../../lib/template-controls/index.js');

// The Sentence Builder block's example with default parameters, as a lesson gets it.
function sentenceBuilderComponent(id = 'sentence-builder') {
  const control = CONTROL_CATALOG.get('sentenceBuilder');
  const params = Object.fromEntries(Object.entries(control.params).map(([name, spec]) => [name, spec.default]));
  return control.build(control.example({ params }), { id, params, chrome: {} });
}

module.exports = { sentenceBuilderComponent };
