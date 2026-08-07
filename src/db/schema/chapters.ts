import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { classSubjects } from './classSubjects';
import { teachers } from './teachers';

export const chapters = pgTable('chapters', {
  id:             serial('id').primaryKey(),
  classSubjectId: integer('class_subject_id').notNull().references(() => classSubjects.id),
  teacherId:      integer('teacher_id').notNull().references(() => teachers.id),
  name:           text('name').notNull(),
  orderIndex:     integer('order_index').notNull(),
  label:          text('label'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});




/** NOTES */

/*
 * A chapter is an ordered unit within a subject-in-a-class. 
 * For example, Mathematics in 11A might have 
    - Chapter 1: Algebra, 
    - Chapter 2: Sequences and Series, 
    - Chapter 3: Finance. 
 * Each chapter is assigned to exactly one teacher and contains an ordered list of concepts.


    What each column does:

 * classSubjectId — foreign key to the subject-in-a-class this chapter belongs to. 
     - A chapter never floats freely — it always belongs to a specific class's specific subject.
 * teacherId — the teacher assigned to this chapter. 
     - In most cases every chapter in a subject points to the same teacher. 
     - But as the specification describes, 
       ... in some subjects like Physical Sciences, ownership transfers between teachers as the syllabus moves through chapters — 
           - a Physics teacher owns some chapters, a Chemistry teacher owns the following ones.
 * name — the chapter name, e.g. "Algebra", "Sequences and Series".
 * orderIndex — a number that determines the order chapters appear in. 
    - Chapter 1 has orderIndex: 1, Chapter 2 has orderIndex: 2, and so on. 
    - When the application fetches chapters, it sorts by this column to always present them in the correct curriculum order.
 * label — optional metadata, e.g. "Paper 1" or "Paper 2". 
    - No .notNull() because most chapters will not have a label. 
    - As the specification states, this is metadata only and does not affect any logic.
 * createdAt — auto-filled timestamp.

    Why orderIndex and not just sorting by id:

 * You might think sorting by id would give the correct order since chapters are inserted in sequence. 
 * But id is a database implementation detail — it reflects insertion order, not curriculum order. 
 * If a chapter is ever inserted out of sequence, deleted and re-added, or reordered, sorting by id would give the wrong result. 
 * orderIndex is an explicit, intentional ordering that can be updated independently of when records were inserted.
 
 */