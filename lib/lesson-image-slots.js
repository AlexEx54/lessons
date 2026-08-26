'use strict';

function imageSlots(value) {
  const slots = [];

  function visit(candidate, path) {
    if (!candidate || typeof candidate !== 'object') return;
    if (!Array.isArray(candidate)
      && typeof candidate.imagePrompt === 'string'
      && candidate.imagePrompt.trim()) {
      slots.push({
        path: [...path],
        prompt: candidate.imagePrompt.trim(),
        imageSrc: typeof candidate.imageSrc === 'string' && candidate.imageSrc.trim()
          ? candidate.imageSrc.trim()
          : null,
      });
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    Object.entries(candidate).forEach(([key, item]) => {
      if (key !== 'imageSrc') visit(item, [...path, key]);
    });
  }

  visit(value, []);
  return slots;
}

function pendingImageSlots(value) {
  return imageSlots(value).filter(slot => !slot.imageSrc);
}

function resolveImageSlot(value, path) {
  if (!Array.isArray(path)) return null;
  let candidate = value;
  for (const segment of path) {
    if (!candidate || typeof candidate !== 'object') return null;
    if (typeof segment === 'number') {
      if (!Array.isArray(candidate) || !Number.isInteger(segment) || segment < 0) return null;
    } else if (typeof segment !== 'string' || Array.isArray(candidate)) {
      return null;
    }
    candidate = candidate[segment];
  }
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
}

module.exports = { imageSlots, pendingImageSlots, resolveImageSlot };
