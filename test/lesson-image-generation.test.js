'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const {
  completeLessonDraft,
  createLessonDraft,
  findLessonDraft,
  installGeneratedImage,
} = require('../lib/lesson-draft-store.js');
const {
  createLessonImageGeneration,
  findLessonImageGeneration,
  setLessonImageGenerationStatus,
  startLessonImageGeneration,
  stopInterruptedLessonImageGenerations,
} = require('../lib/lesson-image-generation-store.js');
const { LessonImageGenerator } = require('../lib/lesson-image-generator.js');
const { imageSlots, pendingImageSlots } = require('../lib/lesson-image-slots.js');
const { configuredGenerationConfig } = require('../lib/drawthings-image-client.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { createUser } = require('../lib/user-store.js');

function setup(suffix = 'images') {
  const database = openDatabase(':memory:');
  const owner = createUser({
    email: `${suffix}@example.com`, displayName: 'Image Admin', passwordHash: 'unused', role: 'admin',
  }, database);
  return { database, owner };
}

function lesson(prompts = ['First', 'Second']) {
  return {
    stages: [{
      id: 'warm-up',
      content: [{
        type: 'thisOrThat',
        id: 'choices',
        items: prompts.map((prompt, index) => ({
          id: `item-${index}`,
          options: [{ id: `option-${index}`, imagePrompt: prompt }],
        })),
      }],
    }],
  };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

test('image slot traversal finds all nested prompts and only returns empty slots', () => {
  const synthetic = createSyntheticLesson('Summer');
  assert.equal(imageSlots(synthetic).length, 23);
  assert.equal(pendingImageSlots(synthetic).length, 23);
  synthetic.stages[0].content[2].items[0].options[0].imageSrc = '/manual.png';
  assert.equal(imageSlots(synthetic).length, 23);
  assert.equal(pendingImageSlots(synthetic).length, 22);
});

test('Draw Things config keeps output at one 512x512 image while allowing model overrides', () => {
  const config = configuredGenerationConfig({
    DRAWTHINGS_CONFIG_JSON: JSON.stringify({ width: 1024, height: 768, steps: 7 }),
    DRAWTHINGS_MODEL: 'custom-model.ckpt',
    DRAWTHINGS_LORA: 'custom-lora.ckpt',
    DRAWTHINGS_LORA_WEIGHT: '0.75',
  });
  assert.equal(config.width, 512);
  assert.equal(config.height, 512);
  assert.equal(config.batchCount, 1);
  assert.equal(config.batchSize, 1);
  assert.equal(config.steps, 7);
  assert.equal(config.model, 'custom-model.ckpt');
  assert.deepEqual(config.loras, [{ file: 'custom-lora.ckpt', weight: 0.75 }]);
});

test('image generation lifecycle persists stop, failure, and restart interruption independently from draft status', () => {
  const { database, owner } = setup('image-lifecycle');
  const pendingDraft = createLessonDraft({
    ownerAdminId: owner.id, topic: 'Topic', template: 'template-1', content: lesson(),
  }, database);
  completeLessonDraft(pendingDraft.id, owner.id, lesson(), database);
  createLessonImageGeneration({ draftId: pendingDraft.id, completed: 0, total: 2 }, database);
  startLessonImageGeneration(pendingDraft.id, database);
  assert.deepEqual(stopInterruptedLessonImageGenerations(database), [pendingDraft.id]);
  assert.equal(findLessonImageGeneration(pendingDraft.id, database).status, 'stopped');
  assert.equal(findLessonDraft(pendingDraft.id, owner.id, database).status, 'review');

  createLessonImageGeneration({ draftId: pendingDraft.id, completed: 1, total: 2 }, database);
  startLessonImageGeneration(pendingDraft.id, database);
  setLessonImageGenerationStatus(pendingDraft.id, 'failed', 'Provider error', database);
  assert.equal(findLessonImageGeneration(pendingDraft.id, database).errorMessage, 'Provider error');
  database.close();
});

test('generated image installation uses the latest draft and never overwrites a manual image', () => {
  const { database, owner } = setup('image-conflict');
  const pendingDraft = createLessonDraft({
    ownerAdminId: owner.id, topic: 'Topic', template: 'template-1', content: lesson(['Prompt']),
  }, database);
  const ready = completeLessonDraft(pendingDraft.id, owner.id, lesson(['Prompt']), database);
  const [slot] = pendingImageSlots(ready.content);
  const installed = installGeneratedImage({
    id: ready.id, ownerAdminId: owner.id, path: slot.path, prompt: slot.prompt, imageSrc: '/generated.png',
  }, database);
  assert.equal(installed.installed, true);
  const conflict = installGeneratedImage({
    id: ready.id, ownerAdminId: owner.id, path: slot.path, prompt: slot.prompt, imageSrc: '/late.png',
  }, database);
  assert.equal(conflict.installed, false);
  assert.equal(conflict.reason, 'image-exists');
  assert.equal(imageSlots(findLessonDraft(ready.id, owner.id, database).content)[0].imageSrc, '/generated.png');
  database.close();
});

test('coordinator serializes drafts and persists each generated 512x512 image immediately', async t => {
  const { database, owner } = setup('image-queue');
  const assetsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-images-'));
  t.after(() => {
    database.close();
    fs.rmSync(assetsDirectory, { recursive: true, force: true });
  });
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const client = {
    async available() { return true; },
    async generate(prompt) {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await new Promise(resolve => setTimeout(resolve, 5));
      activeRequests -= 1;
      return { buffer: Buffer.from(`png:${prompt}`), width: 512, height: 512 };
    },
  };
  const generator = new LessonImageGenerator({
    database, assetsDirectory, clientFactory: () => client,
  });
  const drafts = ['One', 'Two'].map(topic => {
    const pending = createLessonDraft({
      ownerAdminId: owner.id, topic, template: 'template-1', content: lesson([`${topic} prompt`]),
    }, database);
    const ready = completeLessonDraft(pending.id, owner.id, lesson([`${topic} prompt`]), database);
    generator.initialize(ready.id, ready.content);
    generator.enqueue(ready.id, owner.id);
    return ready;
  });

  await waitFor(
    () => drafts.every(draft => findLessonImageGeneration(draft.id, database).status === 'completed'),
    'Image generation did not complete.',
  );
  assert.equal(maximumActiveRequests, 1);
  for (const draft of drafts) {
    const stored = findLessonDraft(draft.id, owner.id, database);
    const [slot] = imageSlots(stored.content);
    assert.match(slot.imageSrc, new RegExp(`/api/lesson-draft-assets/${draft.id}/.+\\.png$`));
    assert.equal(fs.existsSync(path.join(assetsDirectory, draft.id, path.basename(slot.imageSrc))), true);
  }
});

test('stopping an active coordinator request keeps the draft in review and allows restart', async t => {
  const { database, owner } = setup('image-stop');
  const assetsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-stop-'));
  t.after(() => {
    database.close();
    fs.rmSync(assetsDirectory, { recursive: true, force: true });
  });
  const client = {
    async available() { return true; },
    generate(_prompt, signal) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
      });
    },
  };
  const generator = new LessonImageGenerator({ database, assetsDirectory, clientFactory: () => client });
  const pending = createLessonDraft({
    ownerAdminId: owner.id, topic: 'Stop', template: 'template-1', content: lesson(['Slow']),
  }, database);
  const ready = completeLessonDraft(pending.id, owner.id, lesson(['Slow']), database);
  generator.initialize(ready.id, ready.content);
  generator.enqueue(ready.id, owner.id);
  await waitFor(
    () => findLessonImageGeneration(ready.id, database).status === 'running',
    'Image generation did not start.',
  );
  const stopped = generator.stop(ready.id, owner.id);
  assert.equal(stopped.status, 'review');
  assert.equal(stopped.imageGeneration.status, 'stopped');
  const restarted = generator.restart(ready.id, owner.id);
  assert.equal(restarted.imageGeneration.status, 'pending');
  generator.stop(ready.id, owner.id);
});
