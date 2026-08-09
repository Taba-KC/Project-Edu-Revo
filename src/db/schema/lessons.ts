import { pgTable, serial, integer, text, date, timestamp } from 'drizzle-orm/pg-core';
import { chapters } from './chapters';
import { classSubjects } from './classSubjects';

export const lessons = pgTable('lessons', {
  id:             serial('id').primaryKey(),
  chapterId:      integer('chapter_id').notNull().references(() => chapters.id),
  classSubjectId: integer('class_subject_id').notNull().references(() => classSubjects.id),
  date:           date('date').notNull(),
  status:         text('status').notNull().default('planned'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});




/** NOTES */

/*
 * The lessonPreviewFeedback table references a lessonId — meaning a lesson record must exist before a learner can preview it. 
 * But in Session 7, we built lessons as confirmed teaching events — a lesson is only created after teaching happens.

 * That creates a gap: if a lesson only exists after it is taught, there is nothing for a learner to preview beforehand.

 * The fix: lessons need two states — planned and confirmed.

    - Teacher plans a lesson — creates a lesson record with a future date and the concepts they intend to cover. Status: planned. 
        - Learners can now see and preview it.
    - Teacher teaches the lesson, then confirms it — updates the status to confirmed and adjusts which concepts were actually covered (some may have been skipped or added).
    - Learners give post-lesson feedback on the confirmed concepts.
 * This requires a small schema change — adding a status column to the lessons table with values planned or confirmed.

 * It also means the lesson creation route from Session 7 becomes the planning step, and we add a new confirm step.
 */