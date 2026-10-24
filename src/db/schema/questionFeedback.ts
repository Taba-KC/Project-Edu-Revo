import { pgTable, serial, integer, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { learners } from './learners';
import { questions } from './questions';

export const questionFeedback = pgTable('question_feedback', {
  id:          serial('id').primaryKey(),
  learnerId:   integer('learner_id').notNull().references(() => learners.id),
  questionId:  integer('question_id').notNull().references(() => questions.id),
  isDone:      boolean('is_done').notNull().default(false),
  memoRevealed: boolean('memo_revealed').notNull().default(false),
  reaction:    text('reaction'),
  isAnonymous: boolean('is_anonymous').notNull().default(true),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.learnerId, table.questionId),
]);





/** NOTES */

/*
 * This is Flow 4 — a learner does their homework on paper and interacts with it through the app in two separate stages. 
 * Each row records one learner's progress on one question.

    What each column does:

 * learnerId — the learner doing the homework.
 * questionId — the specific question being tracked.
 * isDone — whether the learner has tapped "Mark as done" — 
     - recording that they attempted the question on paper. 
    - This is always visible to the teacher by name, as the specification states, because basic completion tracking is not the sensitive part.
 * memoRevealed — whether the learner has tapped "Reveal answer." 
    - A learner can only do this after the teacher's chosen memo release time has passed. 
    - Tracking this separately from isDone reflects the two distinct deliberate steps in the flow.
 * reaction and isAnonymous — historical homework reaction fields retained to preserve existing records.
    - Homework reaction submission and aggregation have been removed. Understanding feedback belongs to lesson concepts.
 * createdAt — when the record was first created.
 * updatedAt — when it was last changed.

    The two-stage flow reflected in the columns:

 * The specification describes two deliberate steps — "Mark as done" then "Reveal answer." 
 * Those two steps map directly to isDone and memoRevealed. 
 * The schema mirrors the flow exactly, which makes querying straightforward: 
    - to find all learners who marked done but have not yet revealed, query where isDone = true and memoRevealed = false.
 */
