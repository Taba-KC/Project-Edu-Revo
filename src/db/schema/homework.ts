import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { lessons } from './lessons';

export const homework = pgTable('homework', {
  id:              serial('id').primaryKey(),
  lessonId:        integer('lesson_id').notNull().unique().references(() => lessons.id),
  dueDate:         timestamp('due_date').notNull(),
  memoReleaseType: text('memo_release_type').notNull(),
  memoReleaseAt:   timestamp('memo_release_at'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});




/** NOTES */

/*
 * A homework set belongs to exactly one lesson. 
 * It has a due date and a memo release setting — the teacher decides when learners can see the worked answers to each question.

   What each column does:

 * lessonId — foreign key to the lesson this homework belongs to. 
    - The .unique() here enforces a one-to-one relationship — one lesson can have at most one homework set. 
    - You cannot create two homework sets for the same lesson.
 * dueDate — when the homework is due. 
    - Uses timestamp rather than date because the due time matters here — 
    - a teacher might set homework due at 23:59 on a specific day.
 * memoReleaseType — the teacher's chosen release timing. 
    - Will hold one of three values: "immediately", "at_due_date", or "custom". 
    - Stored as text rather than a PostgreSQL enum to keep the schema flexible.
 * memoReleaseAt — only populated when memoReleaseType is "custom". 
    - Holds the specific date and time the memos are released. 
    - null for the other two release types, hence no .notNull().
 * createdAt — auto-filled timestamp.

   Notice what is not here — the questions:

 * Just like a lesson cannot hold a list of concepts in its columns, a homework set cannot hold a list of questions. 
 * Questions are their own table — questions — which we will create next.
 */