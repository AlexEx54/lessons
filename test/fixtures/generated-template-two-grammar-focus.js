'use strict';

const TRAVEL_TERMS = ['ticket', 'platform', 'luggage', 'delay', 'journey', 'passport', 'seat', 'timetable', 'map', 'bus stop'];

const GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS = Object.freeze({
  teacherNotes: {
    transitionPhrases: '- “Now let’s practise the Past Simple.”\n- “Choose the form and tell me why.”',
    struggleTips: '- Ask the student to find the time clue first.\n- Remind them: **did + base verb** in questions and negatives.',
    correctionTiming: '- **Correct now:** wrong Past Simple forms.\n- **Correct later:** pronunciation slips.',
    successCriteria: '- At least 6 of 8 correct answers in each task.\n- The student explains two answers.',
  },
  task1Items: [
    ['Last summer, we ', ' a long journey by train.', ['made', 'make', 'making'], 'made', 'Last summer shows a finished past action.'],
    ['Mia did not ', ' her passport.', ['forgot', 'forget', 'forgets'], 'forget', 'After did not, use the base verb.'],
    ['Did you ', ' the timetable?', ['check', 'checked', 'checking'], 'check', 'After Did, use the base verb.'],
    ['The train ', ' an hour late yesterday.', ['arrives', 'arrived', 'arriving'], 'arrived', 'Yesterday needs the Past Simple.'],
    ['I ', ' my luggage on the platform.', ['leave', 'leaving', 'left'], 'left', 'Left is the past form of leave.'],
    ['We ', ' a map at the bus stop.', ['bought', 'buy', 'buying'], 'bought', 'Bought is the past form of buy.'],
    ['They did not ', ' about the delay.', ['knew', 'know', 'knows'], 'know', 'After did not, use the base verb.'],
    ['Where ', ' you sit on the plane?', ['did', 'do', 'were'], 'did', 'Past questions use did.'],
  ].map(([before, after, options, answer, explanation]) => ({ before, after, options, answer, explanation })),
  task2Items: [
    ['Yesterday, I ', ' my ticket online.', 'book', 'booked'],
    ['Our train ', ' at nine.', 'leave', 'left'],
    ['We ', ' our seats easily.', 'not find', 'did not find'],
    ['', ' you pack your luggage?', 'do', 'Did'],
    ['Tom ', ' the bus at the bus stop.', 'miss', 'missed'],
    ['The journey ', ' five hours.', 'take', 'took'],
    ['I ', ' my passport at home.', 'forget', 'forgot'],
    ['She ', ' us a map of the city.', 'give', 'gave'],
  ].map(([before, after, cue, answer]) => ({ before, after, cue, answer })),
  correctionItems: [
    ['We buyed tickets at the station.', ['We bought tickets at the station.']],
    ['Did you saw the timetable?', ['Did you see the timetable?']],
    ['The train leaved late.', ['The train left late.']],
    ['I didn’t found my seat.', ['I didn’t find my seat.', 'I did not find my seat.']],
    ['She go to the platform ten minutes ago.', ['She went to the platform ten minutes ago.']],
    ['They not waited at the bus stop.', ['They did not wait at the bus stop.', 'They didn’t wait at the bus stop.']],
    ['Where you did put the map?', ['Where did you put the map?']],
    ['The delay make us angry yesterday.', ['The delay made us angry yesterday.']],
  ].map(([incorrect, corrections]) => ({ incorrect, corrections })),
  matchingItems: [
    ['Last year, we travelled', 'to Italy by train.'],
    ['I lost my luggage', 'at the airport in May.'],
    ['Did you find', 'a seat near the window?'],
    ['The bus did not stop', 'at our bus stop.'],
    ['We checked the map', 'before the journey.'],
    ['She showed her passport', 'to the officer.'],
  ].map(([left, right]) => ({ left, right })),
  translations: [
    ['Вчера я купил билет.', 'Yesterday I bought a ticket'],
    ['Поезд опоздал.', 'The train was late'],
    ['Мы не взяли карту.', 'We did not take a map'],
    ['Ты нашёл своё место?', 'Did you find your seat?'],
    ['Она потеряла паспорт.', 'She lost her passport'],
    ['Они ждали на платформе.', 'They waited on the platform'],
    ['Путешествие было долгим.', 'The journey was long'],
    ['Я не видел расписание.', 'I did not see the timetable'],
    ['Где ты оставил багаж?', 'Where did you leave the luggage?'],
    ['Автобус пришёл вовремя.', 'The bus came on time'],
  ].map(([ru, en]) => ({ ru, en })),
  writingSupport: ['Last weekend, I ...', 'First, we ...', 'I did not ...', 'Did you ...?', 'It was ... because ...'],
  supportWordBank: TRAVEL_TERMS.slice(0, 8),
  modelSentence: 'Last weekend, I bought a ticket and travelled to the sea.',
  challengeItems: ['Add a negative sentence.', 'Ask one question.', 'Give a reason with because.',
    'Use three words from the word bank.', 'Link ideas with but or so.'],
});

module.exports = { GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, TRAVEL_TERMS };
