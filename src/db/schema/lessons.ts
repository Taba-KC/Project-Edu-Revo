import { pgTable, serial, integer, date, timestamp } from 'drizzle-orm/pg-core';
import { chapters } from './chapters';
import { classSubjects } from './classSubjects';

export const lessons = pgTable('lessons', {
  id:             serial('id').primaryKey(),
  chapterId:      integer('chapter_id').notNull().references(() => chapters.id),
  classSubjectId: integer('class_subject_id').notNull().references(() => classSubjects.id),
  date:           date('date').notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});




/** NOTES */

/*
 * A lesson is a confirmed teaching event. 
 * As the specification states, a lesson record is only created once the teacher completes the confirmation step — not when they save a plan. 
 * It records that on a specific date, a specific chapter was taught to a specific class in a specific subject.

   What each column does:

 * chapterId — the chapter this lesson belongs to. 
    - Determines which concepts were available to teach.
 * classSubjectId — the subject-in-a-class this lesson belongs to. 
    - Together with chapterId, this fully locates the lesson in the curriculum hierarchy.
 * date — the date the lesson took place. 
    - We use date rather than timestamp here because a lesson happened on a day, not at a specific time down to the second.
 * createdAt — auto-filled timestamp recording when the confirmation was submitted.

    Why both chapterId and classSubjectId:

 * You might notice that classSubjectId could be derived by going through chapterId — a chapter already knows its classSubjectId. 
   - So why store it again on the lesson?

    Two reasons. 
 * First, querying is simpler and faster — to fetch all lessons for a subject-in-a-class, you query directly on classSubjectId without joining through chapters. 
 * Second, it makes the lesson record self-contained and explicit — it says clearly "this lesson belongs to this subject in this class" without requiring extra joins to establish that fact.

   Notice what is not here — the concepts taught:
 * A lesson records which concepts were confirmed taught, but those are not columns on this table. 
 * A lesson can cover multiple concepts, and a column cannot hold a list. 
 * That relationship needs its own table — lessonConcepts — which we will create next.
 */