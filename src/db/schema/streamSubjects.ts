import { pgTable, serial, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { streams } from './streams';
import { subjects } from './subjects';

export const streamSubjects = pgTable('stream_subjects', {
  id:        serial('id').primaryKey(),
  streamId:  integer('stream_id').notNull().references(() => streams.id),
  subjectId: integer('subject_id').notNull().references(() => subjects.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.streamId, table.subjectId),
]);



/** NOTES */

/*
   What this table represents:

 * This is a join table — a table whose sole purpose is to connect two other tables together. 
 * It represents the many-to-many relationship between streams and subjects.
 * 
 * A stream can contain many subjects. 
 * A subject can appear in many streams. 
   -  You cannot store that relationship on either the streams or subjects table directly — you need a third table that holds the pairs.
 * Each row in this table says: "this stream contains this subject."
 */