import { pgTable, serial, integer, text, boolean, timestamp, foreignKey } from 'drizzle-orm/pg-core';
import { chapters } from './chapters';
import { topics } from './topics';
import { classSubjects } from './classSubjects';

export const concepts = pgTable('concepts', {
  id:         serial('id').primaryKey(),
  chapterId:  integer('chapter_id').notNull().references(() => chapters.id),
  topicId: integer('topic_id').notNull(),
  name:       text('name').notNull(),
  orderIndex: integer('order_index').notNull(),
  active: boolean('active').notNull().default(true),
  isCustom:   boolean('is_custom').notNull().default(false),
  classSubjectId: integer('class_subject_id').references(() => classSubjects.id),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, t => [foreignKey({ name: 'concepts_topic_chapter_fk', columns: [t.topicId, t.chapterId], foreignColumns: [topics.id, topics.chapterId] })]);



/** NOTES */

/*
 * A concept is the smallest teachable unit in the platform — the atomic idea that a teacher teaches in a lesson and a learner gives feedback on. 
 * Inside the chapter "Algebra" for example, the concepts might be: 
   - "Solving linear equations", 
   - "Solving quadratic equations", 
   - "Inequalities". 
 *Everything in the platform — lessons, homework questions, learner feedback, flagged concepts — ultimately references a concept.

   What each column does:

 * topicId — foreign key to its topic; chapterId retains the chapter association.
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
                            └── topics (chapterId)
                                └── concepts (topicId, chapterId)

 * This is the entire curriculum structure. 
    - Everything that happens in the platform — lessons taught, homework assigned, feedback given — attaches somewhere on this tree.
 */