'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { createLessonDraft, findLessonDraft } = require('../lib/lesson-draft-store.js');
const {
  completeLessonGeneration,
  createLessonGeneration,
  failLessonGeneration,
  failInterruptedLessonGenerations,
  findLessonGeneration,
  retryLessonGeneration,
  updateLessonGenerationStream,
} = require('../lib/lesson-generation-store.js');
const { createUser } = require('../lib/user-store.js');

function setup() {
  const database = openDatabase(':memory:');
  const owner = createUser({
    email: 'generation@example.com', displayName: 'Generator', passwordHash: 'unused', role: 'admin',
  }, database);
  const draft = createLessonDraft({
    ownerAdminId: owner.id, topic: 'Space', template: 'template-1', content: { stages: [] },
  }, database);
  return { database, owner, draft };
}

test('generation stream and exact OpenRouter usage are persisted with draft summary', () => {
  const { database, owner, draft } = setup();
  createLessonGeneration({ draftId: draft.id, mode: 'ai', model: 'google/gemini-3.7-flash' }, database);
  updateLessonGenerationStream({
    draftId: draft.id, reasoning: 'Thinking', output: '{"warm":', providerGenerationId: 'gen-1',
  }, database);
  const completed = completeLessonGeneration({
    draftId: draft.id,
    reasoning: 'Thinking carefully',
    output: '{"warm":true}',
    providerGenerationId: 'gen-1',
    usage: { cost: 0.012345, promptTokens: 120, completionTokens: 80, reasoningTokens: 30 },
  }, database);
  assert.equal(completed.costUsd, 0.012345);
  assert.equal(completed.reasoningTokens, 30);
  assert.equal(findLessonDraft(draft.id, owner.id, database).generation.costUsd, 0.012345);
  database.close();
});

test('running generation is failed rather than silently restarted', () => {
  const { database, owner, draft } = setup();
  createLessonGeneration({ draftId: draft.id, mode: 'ai', model: 'google/gemini-3.7-flash' }, database);
  assert.deepEqual(failInterruptedLessonGenerations(database), [draft.id]);
  assert.equal(findLessonGeneration(draft.id, database).status, 'failed');
  const failedDraft = findLessonDraft(draft.id, owner.id, database);
  assert.equal(failedDraft.status, 'failed');
  assert.match(failedDraft.errorMessage, /перезапуском сервера/);
  database.close();
});

test('failed AI generation can restart from a validated output prefix', () => {
  const { database, draft } = setup();
  createLessonGeneration({ draftId: draft.id, mode: 'ai', model: 'google/gemini-3.7-flash' }, database);
  failLessonGeneration({
    draftId: draft.id,
    reasoning: 'Old reasoning',
    output: 'invalid tail',
    usage: { cost: 0.02 },
    errorMessage: 'Invalid section',
  }, database);

  const retried = retryLessonGeneration({ draftId: draft.id, output: 'validated prefix' }, database);
  assert.equal(retried.status, 'running');
  assert.equal(retried.reasoning, '');
  assert.equal(retried.output, 'validated prefix');
  assert.equal(retried.costUsd, 0.02);
  assert.equal(retried.errorMessage, null);
  assert.throws(
    () => retryLessonGeneration({ draftId: draft.id, output: '' }, database),
    /неудачной AI-генерации/,
  );
  database.close();
});
