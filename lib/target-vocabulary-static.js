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
      text: `**Task 1:** say "We are going to do some matching and work with new words. Please, look through the words and match them with the pictures. Start with the words you already know. Let's guess the rest together."

*Note for teacher: After matching, use the "Words That Need Extra Explanation" box to clarify tricky terms.*

**Task 2:** say "Now let's see how these words are used in real life. Please read the short story and choose the correct word from the dropdown menu to fill in the blanks. Tip: read the whole sentence first to understand the context."

**Task 3:** "Let's practice a bit more. Read the sentences and type the correct word or phrase into each gap. Pay attention to the meaning of the whole sentence."

**Task 4:** "Great job! Now it's time to speak. I am going to ask you some questions about you and your preferences. There are no right or wrong answers. If you don't know how to start, you can use the sentence starters in the green box below."

*Note for teacher: Don't forget to ask the grey follow-up questions to encourage longer answers.*

**Extra Task:** "To finish our lesson, let's play a guessing game! We will take turns. You choose a word and describe it using examples or situations, but you cannot say the word itself. I will try to guess it, and then it will be my turn to describe. I can go first to show you how!"`,
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
