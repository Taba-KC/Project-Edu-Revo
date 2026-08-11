import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { classSubjects } from './classSubjects';
import { chapters } from './chapters';
import { people } from './people';

export const classChapters = pgTable('class_chapters', {
  id:             serial('id').primaryKey(),
  classSubjectId: integer('class_subject_id').notNull().references(() => classSubjects.id),
  chapterId:      integer('chapter_id').notNull().references(() => chapters.id),
  personId:       integer('person_id').references(() => people.id),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});