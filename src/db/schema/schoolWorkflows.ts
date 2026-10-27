import { pgTable, serial, integer, text, timestamp, unique, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { classes } from './classes';
import { streams } from './streams';
import { people } from './people';
import { learners } from './learners';
import { schools } from './schools';

export const classStreams = pgTable('class_streams', {
  id: serial('id').primaryKey(), classId: integer('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  streamId: integer('stream_id').notNull().references(() => streams.id, { onDelete: 'cascade' }),
}, t => [unique().on(t.classId, t.streamId)]);
export const learnerStreamSelections = pgTable('learner_stream_selections', {
  id: serial('id').primaryKey(), learnerId: integer('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  classId: integer('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }), academicYear: integer('academic_year').notNull(),
  streamId: integer('stream_id').notNull().references(() => streams.id, { onDelete: 'cascade' }), revision: integer('revision').notNull(),
}, t => [unique().on(t.learnerId, t.classId, t.academicYear)]);
export const learnerClassHistory = pgTable('learner_class_history', {
  id: serial('id').primaryKey(), learnerId: integer('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  classId: integer('class_id').references(() => classes.id, { onDelete: 'set null' }), academicYear: integer('academic_year').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(), endedAt: timestamp('ended_at'),
}, t => [uniqueIndex('learner_one_open_membership').on(t.learnerId).where(sql`${t.endedAt} IS NULL`)]);
export const administrativeWork = pgTable('administrative_work', {
  id: serial('id').primaryKey(), schoolId: integer('school_id').notNull().references(() => schools.id),
  personId: integer('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }), capability: text('capability').notNull(),
}, t => [unique().on(t.personId, t.capability),check('administrative_work_capability_check',sql`${t.capability} IN ('grades','streams','staff','learners','curriculum')`)]);
