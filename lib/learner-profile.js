'use strict';

// Who a lesson is for. Drafts and library lessons store the values; teachers see the labels.
const LEVELS = Object.freeze(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const AGE_GROUPS = Object.freeze({ '9-11': '9–11 лет', '12-14': '12–14 лет', '15-18': '15–18 лет', adults: 'Взрослые' });

function isAgeGroup(value) {
  return Object.hasOwn(AGE_GROUPS, value);
}

function ageLabel(ageGroup) {
  return AGE_GROUPS[ageGroup] || ageGroup;
}

module.exports = { LEVELS, ageLabel, isAgeGroup };
