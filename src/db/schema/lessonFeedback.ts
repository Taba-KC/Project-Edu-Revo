/**
 * Learner understanding responses attached to a lesson-concept association. The learner
 * bookshelf saves individual Yes/No goalResponses. reaction summarizes a completed set or
 * retains a legacy concept response; historical reactions are never invented goal answers.
 */
import { pgTable, serial, integer, text, boolean, timestamp, unique, jsonb } from 'drizzle-orm/pg-core';
import { learners } from './learners';
import { lessonConcepts } from './lessonConcepts';

export const lessonFeedback = pgTable('lesson_feedback', {
  id:              serial('id').primaryKey(),
  learnerID:       integer('learner_id').notNull().references(() => learners.id),
  lessonConceptId: integer('lesson_concept_id').notNull().references(() => lessonConcepts.id),
  reaction:        text('reaction').notNull(),
  // One answer per goal; goal text identifies the frozen lesson goal as well as its index.
  goalResponses: jsonb('goal_responses').$type<import('../../services/lessonGoals').GoalAnswer[]>().notNull().default([]),
  isAnonymous:     boolean('is_anonymous').notNull().default(true),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.learnerID, table.lessonConceptId),
]);





/** NOTES */

/*
 * After a confirmed lesson, learners answer Yes or No for each learning goal belonging to a taught concept.
 * Each row stores one learner's goal answers for one concept in one lesson.

    What each column does:

 * learnerID — the learner giving the feedback.
 * lessonConceptId — the specific concept from a specific lesson being reacted to.
     - Pointing to lessonConcepts rather than just concepts is important —
       - it ties the feedback to a specific lesson, not just the concept in general.
 * goalResponses — indexed answers and their frozen goal text; changing an answer updates this JSON array.
 * reaction — derived summary for compatibility: any No means didnt_understand, every goal Yes means understood, incomplete all-Yes means goals_pending. Legacy values are retained.
 * isAnonymous — the learner's choice of whether the teacher sees their name or not.
     - Defaults to true — anonymous by default, as the specification states.
 * createdAt — when the feedback was first submitted.
 * updatedAt — when it was last changed.
     - The specification states feedback can be updated any time before the teacher's next lesson plan.
     - This column tracks when the last change happened — it is what drives the "last updated" note shown to the learner.

    The composite unique constraint:

 * One learner has one response row per concept per lesson; it contains all their goal answers.
 * They can change it — that is an update to the existing row, not a new row.
 */
