(function initClassPlan(root) {
  'use strict';
  // Which library lessons suit a class next. The «Новое занятие» window and the library rank lessons in the browser,
  // the «Классы» page gets the next grammar point from the server, and all of them use these rules.
  //
  // A grammar point is covered once the class has a held or planned session on it. Classes rarely go through the
  // program in order, so the next point is the first uncovered one of the class level (filling the gaps), not the one
  // after the last session.

  // Tiers, best first. A lesson of a grammar point belongs to the point's level, a lesson without grammar to its own.
  const TIER = Object.freeze({
    uncovered: 0, // an uncovered point of the class level, for the class age
    uncoveredOtherAge: 1, // the same for another age
    levelWithoutGrammar: 2,
    levelCovered: 3, // a new lesson on a point the class has already covered
    otherLevel: 4, // nearer levels first
    taken: 5, // the class has held or planned this very lesson
  });

  // The state of each lesson the class took: planned (the nearest date) wins over held (the latest date),
  // so the teacher sees what is already booked.
  function takenLessons(history) {
    const taken = new Map();
    for (const session of history) {
      if (!session.library_lesson_id) continue;
      const state = session.held ? 'held' : 'planned';
      const current = taken.get(session.library_lesson_id);
      const better = !current
        || (state === 'planned' && (current.state === 'held' || session.scheduled_at < current.at))
        || (state === 'held' && current.state === 'held' && session.scheduled_at > current.at);
      if (better) taken.set(session.library_lesson_id, { state, at: session.scheduled_at });
    }
    return taken;
  }

  // rank({ lessons, grammar, profile: { level, age }, history }) → { nextPoint, items: [{ lesson, state, at }] }
  // lessons: library cards in the library order; grammar: the program points in program order;
  // history: the class sessions with library_lesson_id, grammar_point, held and scheduled_at.
  // state is 'next', 'planned', 'held' or null; at is the date of a planned or held lesson.
  // A class without a level and age (created before they existed) gets only the planned and held marks.
  function rank({ lessons, grammar, profile, history }) {
    const points = new Map(grammar.map((point, index) => [point.key, { point, index }]));
    const levels = [...new Set(grammar.map(point => point.level))];
    const taken = takenLessons(history);
    const covered = new Set(history.map(session => session.grammar_point).filter(Boolean));
    const known = Boolean(profile?.level && profile?.age);

    const ranked = lessons.map((lesson, order) => {
      const entry = points.get(lesson.grammar_point);
      const level = entry?.point.level ?? lesson.level;
      const distance = Math.abs(levels.indexOf(level) - levels.indexOf(profile?.level));
      const ownAge = lesson.age === profile?.age;
      let tier;
      if (taken.has(lesson.id)) tier = TIER.taken;
      else if (!known) tier = TIER.uncovered;
      else if (distance) tier = TIER.otherLevel;
      else if (!entry) tier = TIER.levelWithoutGrammar;
      else if (covered.has(lesson.grammar_point)) tier = TIER.levelCovered;
      else tier = ownAge ? TIER.uncovered : TIER.uncoveredOtherAge;
      const key = known ? [tier, distance, ownAge ? 0 : 1, levels.indexOf(level), entry?.index ?? -1, order] : [tier, order];
      return { lesson, key, point: entry?.point ?? null, tier };
    });
    ranked.sort((a, b) => {
      const index = a.key.findIndex((value, i) => value !== b.key[i]);
      return index < 0 ? 0 : a.key[index] - b.key[index];
    });

    // The best lesson starts the next point when it is an uncovered one: then every uncovered point either has
    // no lesson for the class age, or comes later in the program.
    const first = ranked[0];
    const nextPoint = known && first && first.tier <= TIER.uncoveredOtherAge ? first.point : null;
    const items = ranked.map(({ lesson, point, tier }) => {
      if (nextPoint && point === nextPoint && tier === first.tier) return { lesson, state: 'next', at: null };
      const mark = taken.get(lesson.id);
      return { lesson, state: mark?.state ?? null, at: mark?.at ?? null };
    });
    return { nextPoint, items };
  }

  const api = { rank };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ClassPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
