/**
 * Pending Add to next lesson suggestions scoped to a teacher and class subject. A draft
 * suggestion is not a new confirmed lesson and does not alter original taught history.
 */
import { pgTable, serial, integer, timestamp, unique, jsonb } from 'drizzle-orm/pg-core';
import { classSubjects } from './classSubjects';
import { people } from './people';
import { concepts } from './concepts';

/** Lesson review concepts waiting for this teacher's next lesson plan. */
export const lessonReviewConcepts = pgTable('lesson_review_concepts', {
  id: serial('id').primaryKey(),
  classSubjectId: integer('class_subject_id').notNull().references(() => classSubjects.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  conceptId: integer('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  reviewGoals: jsonb('review_goals').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, table => [unique('lesson_review_concepts_teacher_concept_unique').on(table.classSubjectId, table.personId, table.conceptId)]);
