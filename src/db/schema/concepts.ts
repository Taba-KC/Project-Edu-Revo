import { pgTable, serial, integer, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { chapters } from './chapters';

export const concepts = pgTable('concepts', {
  id:         serial('id').primaryKey(),
  chapterId:  integer('chapter_id').notNull().references(() => chapters.id),
  name:       text('name').notNull(),
  orderIndex: integer('order_index').notNull(),
  isCustom:   boolean('is_custom').notNull().default(false),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
});



/** NOTES */

/*
 * A concept is the smallest teachable unit in the platform — the atomic idea that a teacher teaches in a lesson and a learner gives feedback on. 
 * Inside the chapter "Algebra" for example, the concepts might be: 
   - "Solving linear equations", 
   - "Solving quadratic equations", 
   - "Inequalities". 
 *Everything in the platform — lessons, homework questions, learner feedback, flagged concepts — ultimately references a concept.

   What each column does:

 * chapterId — foreign key to the chapter this concept belongs to. 
    - A concept always lives inside exactly one chapter.
 * name — the concept name, e.g. "Solving quadratic equations".
 * orderIndex — same pattern as chapters. 
    - Concepts within a chapter have a curriculum order that must be preserved and can be sorted independently of insertion order.
 * isCustom — a boolean flag. 
    - The specification mentions that a teacher can add a concept not on the ATP during lesson planning — something they taught that was not in the national curriculum. 
    - Those concepts are marked isCustom: true. 
    - ATP concepts are isCustom: false. 
    - This flag lets the application treat them identically everywhere while still being able to distinguish them if needed.
 * createdAt — auto-filled timestamp.

 * The full hierarchy now complete down to concepts:

  schools
    └── grades
            └── classes (gradeId, streamId)
                └── classSubjects (classId, subjectId)
                        └── chapters (classSubjectId, teacherId)
                            └── concepts (chapterId)

 * This is the entire curriculum structure. 
    - Everything that happens in the platform — lessons taught, homework assigned, feedback given — attaches somewhere on this tree.
 */