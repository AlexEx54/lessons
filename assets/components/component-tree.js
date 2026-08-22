(function initComponentTreeModule(root) {
  'use strict';

  // Реестр «детей» по типу компонента. Каждый составной компонент сам
  // регистрирует функцию слотов при загрузке своего модуля, поэтому обходчик
  // не знает внутренностей конкретных типов.
  const childSlotGetters = new Map();

  function damagedStructureError() {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    return error;
  }

  function registerChildSlots(type, getSlots) {
    if (typeof type !== 'string' || !type.trim()) {
      throw new Error('ComponentTree requires a non-empty component type.');
    }
    if (typeof getSlots !== 'function') {
      throw new Error('ComponentTree requires a slots getter function.');
    }
    childSlotGetters.set(type, getSlots);
  }

  function assertStagesShape(stages) {
    if (!Array.isArray(stages)) throw damagedStructureError();
    for (const stage of stages) {
      if (!stage || typeof stage !== 'object'
        || (stage.content !== null && !Array.isArray(stage.content))) {
        throw damagedStructureError();
      }
    }
  }

  function childComponentsOf(component) {
    if (!component || typeof component !== 'object' || typeof component.type !== 'string') return [];
    const getSlots = childSlotGetters.get(component.type);
    if (!getSlots) return [];
    const children = getSlots(component);
    return Array.isArray(children) ? children : [];
  }

  // Плоский список всех компонентов черновика в порядке документа (DFS):
  // верхнеуровневые компоненты стадий плюс все зарегистрированные вложенные дети.
  function collectComponents(stages) {
    assertStagesShape(stages);
    const collected = [];
    const visit = (component) => {
      if (!component || typeof component !== 'object') return;
      collected.push(component);
      childComponentsOf(component).forEach(visit);
    };
    for (const stage of stages) {
      for (const component of stage.content || []) visit(component);
    }
    return collected;
  }

  // Все совпадения по type + id в порядке документа. Вызывающий код сохраняет
  // прежнюю семантику: 0 совпадений → 404, больше одного → 409.
  function findComponentMatches(stages, type, id) {
    if (typeof type !== 'string' || !type.trim()) {
      throw new Error('ComponentTree requires a component type.');
    }
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('ComponentTree requires a component id.');
    }
    return collectComponents(stages)
      .filter(component => component?.type === type && component.id === id);
  }

  const api = {
    childComponentsOf,
    collectComponents,
    findComponentMatches,
    registerChildSlots,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ComponentTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
