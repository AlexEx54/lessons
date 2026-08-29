'use strict';

const READING_TEACHER_NOTE_TEXT = `In this part of the lesson, your student will practice two key skills: **reading for gist** (skimming) and **reading for detail** (scanning). Explain these techniques to the student if needed before starting the tasks.

**Differentiation based on the student's level:**

- **For weaker students:** Ask them to read the text out loud right from the start. This helps you monitor their pronunciation and keeps them focused.
- **For stronger students:** Allow them to read the text silently to themselves for the first time (Task 1).

When moving to **Task 2**, ask the student to read the text (or the specific paragraphs where the answers are hidden) out loud for the second time to complete the quiz and justify their answers.

**Task 1:** say "Now we are going to read a text. First, let's use a reading technique called **skimming**. It means reading the text very quickly just to understand the general idea, without translating or worrying about every single word. Take a minute to skim the text, and then choose the correct option in Task 1 to define the main idea." *Note for teacher: Give the student a strict time limit (e.g., 1-2 minutes) to ensure they actually skim the text rather than reading it in detail.*

**Task 2:** say "Great job! Now we understand what the text is generally about. Let's move to Task 2. This time, I want you to read the text out loud more carefully to find specific information. Then pay attention to the quiz. There are 6 questions in total. A good strategy is to read the question first, and then look for the exact answer in the text. Let's start with the first one."

- **Post-Reading Discussion:** say "Well done with the questions! Now that we've read the whole story, tell me: what was the most interesting or surprising fact in this text for you? Have you ever experienced a similar situation or felt the same way as the author?" *Note for teacher: Use these questions to transition smoothly from reading to speaking. Encourage the student to express their personal opinion about the topic.*`;

function createReadingTeacherNote() {
  return {
    type: 'teacherNote',
    id: 'reading-teacher-note',
    text: READING_TEACHER_NOTE_TEXT,
  };
}

module.exports = { createReadingTeacherNote, READING_TEACHER_NOTE_TEXT };
