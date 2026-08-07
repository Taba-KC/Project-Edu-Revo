import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { homework } from './homework';
import { concepts } from './concepts';

export const questions = pgTable('questions', {
  id:          serial('id').primaryKey(),
  homeworkId:  integer('homework_id').notNull().references(() => homework.id),
  conceptId:   integer('concept_id').notNull().references(() => concepts.id),
  orderIndex:  integer('order_index').notNull(),
  body:        text('body').notNull(),
  memo:        text('memo'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});




/** NOTES */

/*
 * A question belongs to a homework set and is tagged to exactly one concept. 
 * It optionally has a memo — a worked answer the learner can check their work against after attempting the question.

   What each column does:

 * homeworkId — foreign key to the homework set this question belongs to.
 * conceptId — the concept this question tests. 
    - Every question must be tagged to one concept. 
    - This is what allows the aggregated feedback in Flow 6 to show per-concept understanding — 
      - the application knows which concept each question tested.
 * orderIndex — the position of this question within the homework set. Question 1, Question 2, and so on. 
    - Same pattern as chapters and concepts.
 * body — the question text itself. 
    - What the learner reads and answers on paper.
 * memo — the worked answer. 
    - No .notNull() because the specification explicitly states that sending homework is never blocked by missing memos. 
    - A teacher can send homework without memos and add them later. 
    - A question with no memo simply has no self-check stage in Flow 4.
 * createdAt — auto-filled timestamp.

   The homework structure is now complete:

   lessons
    └── homework    (lessonId → lessons.id)
            └── questions (homeworkId → homework.id, conceptId → concepts.id)
 */