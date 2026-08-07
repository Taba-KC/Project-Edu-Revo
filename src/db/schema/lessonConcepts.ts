import { pgTable, serial, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { lessons } from './lessons';
import { concepts } from './concepts';

export const lessonConcepts = pgTable('lesson_concepts', {
  id:         serial('id').primaryKey(),
  lessonId:   integer('lesson_id').notNull().references(() => lessons.id),
  conceptId:  integer('concept_id').notNull().references(() => concepts.id),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.lessonId, table.conceptId),
]);




/** NOTES */

/*
 * This join table records which concepts were confirmed as taught in a specific lesson. 
 * Each row says: "this concept was covered in this lesson."

 * A lesson can cover many concepts. 
 * A concept can be covered across many lessons — 
    - the specification explicitly allows re-teaching a concept that learners struggled with. 
 * This many-to-many relationship is why a join table is needed.

    The composite unique constraint:

  unique().on(table.lessonId, table.conceptId)

 * A concept cannot be listed twice in the same lesson. If "Solving quadratic equations" is confirmed taught in lesson 5, it appears exactly once — not multiple times.

   How this connects to the flows in the specification:

 * In Flow 1, when a teacher confirms what was taught, the application creates the lesson record and then creates one lessonConcept row for each concept the teacher checked. 
 * In Flow 3, when a learner gives feedback on a lesson, they give a reaction per concept — 
     - the application reads the lessonConcepts for that lesson to know which concepts to show. 
 * In Flow 6, when the teacher views aggregated feedback, the application reads lessonConcepts to know which concepts to display feedback counts for.

 * Everything that involves "what was taught in this lesson" goes through this table.
 */