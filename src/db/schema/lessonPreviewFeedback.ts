import { pgTable, serial, integer, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { learners } from './learners';
import { concepts } from './concepts';
import { lessons } from './lessons';

export const lessonPreviewFeedback = pgTable('lesson_preview_feedback', {
  id:          serial('id').primaryKey(),
  learnerId:   integer('learner_id').notNull().references(() => learners.id),
  conceptId:   integer('concept_id').notNull().references(() => concepts.id),
  lessonId:    integer('lesson_id').notNull().references(() => lessons.id),
  reaction:    text('reaction').notNull(),
  isAnonymous: boolean('is_anonymous').notNull().default(true),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.learnerId, table.conceptId, table.lessonId),
]);




/** NOTES */

/*
 * This is Flow 5 — before a lesson happens, a learner can preview the concepts the teacher has planned and give one of three reactions: 
   - "New to me", "Getting it", or "Will see it in the lesson". 
 * This gives the teacher a sense of where the class is starting from before they walk in.

    What each column does:

 * learnerId — the learner giving the preview reaction.
 * conceptId — the concept being previewed.
 * lessonId — the upcoming lesson this preview is attached to. 
    - This is important — a concept can appear in multiple lessons across time. 
    - The lessonId anchors the preview to a specific upcoming lesson, not just the concept in general.
 * reaction — one of three values: "new_to_me", "getting_it", or "will_see_it".
 * isAnonymous — same default-anonymous pattern as the other feedback tables.
 * createdAt and updatedAt — the specification states preview feedback is changeable at any time up until the lesson happens, so updatedAt tracks the last change.

    The composite unique constraint — three columns this time:

        unique().on(table.learnerId, table.conceptId, table.lessonId)

 * A learner can only give one preview reaction per concept per upcoming lesson. 
 * The three-column constraint is necessary because the same learner could preview the same concept in a different lesson at a different point in time — 
     - that would be a separate row, not a duplicate.
 */