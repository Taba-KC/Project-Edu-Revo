import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { schools } from './schools';

export const streams = pgTable('streams', {
  id:        serial('id').primaryKey(),
  schoolId:  integer('school_id').notNull().references(() => schools.id),
  name:      text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});



/** NOTES */

/*
   What this table represents:

 * A stream is a named group of subjects created by a school administrator. 
 * For example, Mokgethwa High School might create a stream called "Science Stream" containing Mathematics, Physical Sciences, Life Sciences, and English. 
 * Another stream called "Commerce Stream" might contain Mathematics, Accounting, Business Studies, and English.

   What each column does:

 * id — auto-generated unique identifier.
 * schoolId — foreign key to the school that created this stream. 
     - Streams belong to a specific school — Mokgethwa's "Science Stream" is not the same as another school's "Science Stream", even if they contain the same subjects.
 * name — the stream name as the administrator defines it.
 * createdAt — auto-filled timestamp.
 */