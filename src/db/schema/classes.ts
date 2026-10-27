/**
 * Named classes within a school grade, with stream and class-manager relationships. A class
 * ID stays stable when its visible name is changed.
 */
import { sql } from 'drizzle-orm';
import { pgTable, serial, integer, text, timestamp, unique, jsonb } from 'drizzle-orm/pg-core';
import { grades } from './grades';
import { streams } from './streams';
import { people } from './people';

export const classes = pgTable('classes', {
  academicYear: integer('academic_year').notNull().default(sql`EXTRACT(YEAR FROM CURRENT_DATE)::integer`),
  streamRevision: integer('stream_revision').notNull().default(0),
  streamConfiguration: jsonb('stream_configuration').$type<{ primarySubjectId: number; locations: { subjectId: number; building: string; classroom: string }[] }>(),
  id:              serial('id').primaryKey(),
  gradeId:         integer('grade_id').notNull().references(() => grades.id),
  streamId:        integer('stream_id').references(() => streams.id),
  classTeacherId:  integer('class_teacher_id').references(() => people.id),
  name:            text('name').notNull(),
  description:     text('description'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.gradeId, table.name),
]);



/** NOTES */

/*
 * A class is a group of learners within a grade — for example 11A, 11B, or 11C. 
 * Each class belongs to exactly one grade, and through that grade, to exactly one school.

  What each column does:

 * id — auto-generated unique identifier.
 * gradeId — foreign key pointing to the grade this class belongs to. Same pattern as schoolId in the grades table.
 * name — the class name, e.g. "11A", "11B". Stored as text because it is a label, not a number.
 * createdAt — auto-filled timestamp.
 * 
 * schools
  └── grades (schoolId → schools.id)
   └── classes (gradeId → grades.id)
 * 
 * This chain means you can always trace any piece of data back to the school it belongs to
 * A class knows its grade. 
 * A grade knows its school. 
 * This is how the hierarchy from the specification is enforced at the database leveL.
 * It is not enforced by application code, but by the structure of the tables themselves.
 * 
 * One new column was added — streamId. 
 * This is a foreign key pointing to the stream assigned to this class. 
 * When an administrator assigns a stream to a class, this column gets filled in.
 * 
 * A class might exist in the system before a stream has been assigned to it. 
 * For example, an administrator creates all the classes first, then assigns streams to them afterwards. 
 * Making streamId nullable allows that workflow — a class can exist without a stream temporarily.
 * 
 * Once a stream is assigned and classSubjects rows are generated from it, the class is fully set up and ready for teachers and learners.
 * 
 * schools
  └── grades          (schoolId → schools.id)
  └── streams         (schoolId → schools.id)
        └── streamSubjects (streamId → streams.id, subjectId → subjects.id)
        └── classes   (gradeId → grades.id, streamId → streams.id)
 * 
 * A class now sits at the intersection of a grade and a stream — 
     - it knows its year level and its subject bundle.
 */
