'use strict';

function createTargetVocabularyTeacherNote() {
  return {
    type: 'teacherNote',
    id: 'target-vocabulary-teacher-note',
    blocks: [{
      type: 'teacherNoteBlock',
      id: 'target-vocabulary-pronunciation-check',
      title: 'Pronunciation Check',
      titleColor: '#6545F5',
      icon: 'audio',
      text: 'Используйте эти онлайн-словари, чтобы проверить и включить произношение:\n\n- Cambridge Dictionary – cambridge.org/dictionary\n- Merriam-Webster – merriam-webster.com\n- Oxford Learner’s Dictionaries – oxfordlearnersdictionaries.com',
      tip: {
        text: 'Включите аудио ученику и попросите его повторить.\nОбратите внимание на ударение в новых словах и фразах.',
      },
    }, {
      type: 'teacherNoteBlock',
      id: 'target-vocabulary-exercise-lead-in',
      title: 'What to Say & How to Lead Into Each Exercise',
      titleColor: '#20A85B',
      icon: 'chat',
      text: 'Используйте эти фразы для перехода к упражнениям:\n\n- **Exercise 1:** “Let’s start with some new words. Match the phrases with the pictures.”\n- **Exercise 2:** “Now, choose the correct phrase from the list and complete the sentences.”\n- **Exercise 3:** “Great! Now fill in the blank with the correct words.”\n- **Exercise 4:** “Now, let’s talk! I’ll ask you some questions about you.”\n- **Extra Task:** “Let’s play a game! Take turns describing the word without saying it. Can your partner guess it?”',
    }, {
      type: 'teacherNoteBlock',
      id: 'target-vocabulary-extra-phrases',
      title: 'Extra Teacher Phrases You Can Use',
      titleColor: '#6545F5',
      icon: 'chatDots',
      text: 'При необходимости задайте ученику дополнительные вопросы:\n\n- “Can you think of another example?”\n- “What does this mean in your own words?”\n- “Let’s use this word in a sentence together.”\n- “Good! Can you say it another way?”',
    }],
  };
}

function createTargetVocabularyHowToPlay() {
  return {
    title: 'How to Play',
    steps: [
      'Choose a word from the list.',
      'Describe it without saying the word or any part of it.',
      'Your partner guesses the word.',
      'Click the word when it’s guessed. It will be crossed out.',
      'Take turns and keep playing!',
    ],
    tip: 'You can use examples, actions, feelings and details, but don’t say the word!',
  };
}

module.exports = { createTargetVocabularyHowToPlay, createTargetVocabularyTeacherNote };
