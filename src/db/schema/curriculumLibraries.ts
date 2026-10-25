/**
 * Revision number for each shared subject/grade curriculum. The editor submits its revision
 * so a stale browser cannot silently overwrite a newer save.
 */
import { pgTable, serial, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { subjects } from './subjects';
export const curriculumLibraries = pgTable('curriculum_libraries', {
  id: serial('id').primaryKey(),
  subjectId: integer('subject_id').notNull().references(() => subjects.id),
  gradeNumber: integer('grade_number').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, t => [unique().on(t.subjectId, t.gradeNumber)]);
