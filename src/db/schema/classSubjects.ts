import { pgTable, serial, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { classes } from './classes';
import { subjects } from './subjects';

export const classSubjects = pgTable('class_subjects', {
  id:        serial('id').primaryKey(),
  classId:   integer('class_id').notNull().references(() => classes.id),
  subjectId: integer('subject_id').notNull().references(() => subjects.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.classId, table.subjectId),
]);



/** NOTES */

/*
 * This is the atomic unit the specification talks about — "Subject-in-a-Class." 
 * Every row here represents one subject being studied by one specific class. 
 * This is the table that lessons, chapters, homework, and feedback all attach to.

 * When an administrator assigns a stream to a class, the application reads all the subjects in that stream from streamSubjects and creates one classSubjects row for each. 
 * From that point on, the class has its own independent record for each subject it studies.

   Why this table exists separately from streamSubjects:

 * You might wonder — if a class already points to a stream, and a stream already lists its subjects, why do we need classSubjects at all? 
   - Why not just look up the subjects through the stream every time?

    Two reasons:
 
  * First, teaching activity — chapters, lessons, homework — needs something stable and class-specific to attach to. 
     - If a class's stream changed, everything attached to it would break. 
     - classSubjects gives each class its own permanent subject records that do not shift when stream definitions change.

  * Second, flexibility — a class might need a subject added or removed from its specific list without changing the stream for every other class on it. 
     - classSubjects allows that without touching the stream definition.


 schools
  └── grades
        └── classes (gradeId, streamId)
              └── classSubjects (classId, subjectId)
                    └── chapters, lessons, homework (coming next)
 */