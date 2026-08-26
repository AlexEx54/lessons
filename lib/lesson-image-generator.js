'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createDrawThingsImageClient } = require('./drawthings-image-client.js');
const {
  findLessonDraft,
  installGeneratedImage,
} = require('./lesson-draft-store.js');
const {
  createLessonImageGeneration,
  findLessonImageGeneration,
  finishLessonImageGeneration,
  setLessonImageGenerationStatus,
  startLessonImageGeneration,
  updateLessonImageGenerationProgress,
} = require('./lesson-image-generation-store.js');
const { imageSlots, pendingImageSlots } = require('./lesson-image-slots.js');

function progressForContent(content) {
  const slots = imageSlots(content);
  return {
    completed: slots.filter(slot => slot.imageSrc).length,
    total: slots.length,
  };
}

class LessonImageGenerator {
  constructor({ database, assetsDirectory, clientFactory = createDrawThingsImageClient }) {
    this.database = database;
    this.assetsDirectory = assetsDirectory;
    this.clientFactory = clientFactory;
    this.client = null;
    this.queue = [];
    this.queuedDraftIds = new Set();
    this.active = null;
    this.drainPromise = null;
  }

  initialize(draftId, content) {
    const progress = progressForContent(content);
    return createLessonImageGeneration({ draftId, ...progress }, this.database);
  }

  enqueue(draftId, ownerAdminId) {
    if ((this.active?.draftId === draftId && !this.active.controller.signal.aborted)
      || this.queuedDraftIds.has(draftId)) return;
    this.queuedDraftIds.add(draftId);
    this.queue.push({ draftId, ownerAdminId });
    this.drain();
  }

  restart(draftId, ownerAdminId) {
    const draft = findLessonDraft(draftId, ownerAdminId, this.database);
    if (!draft) throw Object.assign(new Error('Черновик урока не найден.'), { statusCode: 404 });
    if (draft.status !== 'review' || !draft.content) {
      throw Object.assign(new Error('Изображения можно генерировать только для черновика на проверке.'), { statusCode: 409 });
    }
    const current = findLessonImageGeneration(draftId, this.database);
    if (current && ['pending', 'running'].includes(current.status)) {
      throw Object.assign(new Error('Генерация изображений уже запущена.'), { statusCode: 409 });
    }
    this.initialize(draftId, draft.content);
    this.enqueue(draftId, ownerAdminId);
    return findLessonDraft(draftId, ownerAdminId, this.database);
  }

  stop(draftId, ownerAdminId, message = 'Генерация изображений остановлена пользователем.') {
    const draft = findLessonDraft(draftId, ownerAdminId, this.database);
    if (!draft) throw Object.assign(new Error('Черновик урока не найден.'), { statusCode: 404 });
    const generation = findLessonImageGeneration(draftId, this.database);
    if (!generation || !['pending', 'running'].includes(generation.status)) {
      throw Object.assign(new Error('Генерация изображений сейчас не выполняется.'), { statusCode: 409 });
    }
    this.queuedDraftIds.delete(draftId);
    if (this.active?.draftId === draftId) this.active.controller.abort();
    setLessonImageGenerationStatus(draftId, 'stopped', message, this.database);
    return findLessonDraft(draftId, ownerAdminId, this.database);
  }

  remove(draftId) {
    this.queuedDraftIds.delete(draftId);
    if (this.active?.draftId === draftId) this.active.controller.abort();
  }

  async drain() {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = (async () => {
      while (this.queue.length) {
        const item = this.queue.shift();
        if (!this.queuedDraftIds.delete(item.draftId)) continue;
        const generation = findLessonImageGeneration(item.draftId, this.database);
        if (generation?.status !== 'pending') continue;
        await this.run(item);
      }
    })().finally(() => {
      this.drainPromise = null;
      if (this.queue.length) this.drain();
    });
    return this.drainPromise;
  }

  async getClient() {
    if (!this.client) this.client = this.clientFactory();
    return this.client;
  }

  async run({ draftId, ownerAdminId }) {
    const controller = new AbortController();
    this.active = { draftId, controller };
    try {
      startLessonImageGeneration(draftId, this.database);
      const client = await this.getClient();
      try {
        await client.available(controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn(`Draw Things is unavailable for draft ${draftId}:`, error.message);
          setLessonImageGenerationStatus(
            draftId,
            'unavailable',
            'Сервер Draw Things не отвечает. Подключите его и нажмите «Продолжить».',
            this.database,
          );
        }
        return;
      }

      while (!controller.signal.aborted) {
        const draft = findLessonDraft(draftId, ownerAdminId, this.database);
        if (!draft || draft.status !== 'review' || !draft.content) {
          setLessonImageGenerationStatus(
            draftId, 'stopped', 'Черновик больше недоступен для генерации изображений.', this.database,
          );
          return;
        }
        const pending = pendingImageSlots(draft.content);
        const progress = progressForContent(draft.content);
        updateLessonImageGenerationProgress({ draftId, ...progress }, this.database);
        if (pending.length === 0) {
          finishLessonImageGeneration(draftId, this.database);
          return;
        }

        const slot = pending[0];
        const generated = await client.generate(slot.prompt, controller.signal);
        if (controller.signal.aborted) return;
        if (!Buffer.isBuffer(generated.buffer) || generated.width !== 512 || generated.height !== 512) {
          throw new Error('Draw Things вернул некорректный PNG; ожидалось изображение 512×512.');
        }

        const directory = path.join(this.assetsDirectory, draftId);
        await fs.promises.mkdir(directory, { recursive: true });
        const fileName = `${crypto.randomUUID()}.png`;
        const finalPath = path.join(directory, fileName);
        const temporaryPath = `${finalPath}.tmp`;
        let installed = false;
        try {
          await fs.promises.writeFile(temporaryPath, generated.buffer, { flag: 'wx' });
          if (controller.signal.aborted) return;
          await fs.promises.rename(temporaryPath, finalPath);
          if (controller.signal.aborted) return;
          const imageSrc = `/api/lesson-draft-assets/${encodeURIComponent(draftId)}/${encodeURIComponent(fileName)}`;
          const result = installGeneratedImage({
            id: draftId,
            ownerAdminId,
            path: slot.path,
            prompt: slot.prompt,
            imageSrc,
          }, this.database);
          installed = result.installed;
        } finally {
          await fs.promises.rm(temporaryPath, { force: true });
          if (!installed) await fs.promises.rm(finalPath, { force: true });
        }
      }
    } catch (error) {
      const current = findLessonImageGeneration(draftId, this.database);
      if (!controller.signal.aborted && current && ['pending', 'running'].includes(current.status)) {
        setLessonImageGenerationStatus(
          draftId, 'failed', error.message || 'Не удалось сгенерировать изображение.', this.database,
        );
      }
    } finally {
      if (this.active?.controller === controller) this.active = null;
    }
  }
}

module.exports = { LessonImageGenerator, progressForContent };
