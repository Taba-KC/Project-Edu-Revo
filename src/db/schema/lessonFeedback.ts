import { pgTable, serial, integer, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { learners } from './learners';
import { lessonConcepts } from './lessonConcepts';

export const lessonFeedback = pgTable('lesson_feedback', {
  id:              serial('id').primaryKey(),
  learnerID:       integer('learner_id').notNull().references(() => learners.id),
  lessonConceptId: integer('lesson_concept_id').notNull().references(() => lessonConcepts.id),
  reaction:        text('reaction').notNull(),
  isAnonymous:     boolean('is_anonymous').notNull().default(true),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.learnerID, table.lessonConceptId),
]);





/** NOTES */

/*
 * This is Flow 3 — after a lesson, a learner gives one of three reactions to each concept that was taught: "Understood it", "Not sure", or "Didn't understand". 
 * Each row records one learner's reaction to one concept from one lesson.

    What each column does:

 * learnerID — the learner giving the feedback.
 * lessonConceptId — the specific concept from a specific lesson being reacted to. 
     - Pointing to lessonConcepts rather than just concepts is important — 
       - it ties the feedback to a specific lesson, not just the concept in general.
 * reaction — one of three values: "understood", "not_sure", or "didnt_understand".
 * isAnonymous — the learner's choice of whether the teacher sees their name or not. 
     - Defaults to true — anonymous by default, as the specification states.
 * createdAt — when the feedback was first submitted.
 * updatedAt — when it was last changed. 
     - The specification states feedback can be updated any time before the teacher's next lesson plan. 
     - This column tracks when the last change happened — it is what drives the "last updated" note shown to the learner.

    The composite unique constraint:

 * One learner can only submit one reaction per concept per lesson. 
 * They can change it — that is an update to the existing row, not a new row.
 */