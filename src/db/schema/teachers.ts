import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const teachers = pgTable('teachers', {
  id:        serial('id').primaryKey(),
  title:     text('title').notNull(),
  firstName: text('first_name').notNull(),
  surname:   text('surname').notNull(),
  email:     text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


/** NOTES */

/*
 * A teacher is a user who plans lessons, creates homework, and views aggregated feedback. 
 * A teacher can be assigned to chapters across multiple subjects and multiple classes — their assignment list determines everything they see in the app.

  What each column does:

 * id — auto-generated unique identifier.
 * name — the teacher's full name.
 * email — the teacher's email address. 
    - This will later be used for authentication — when a teacher logs in, they will identify themselves by email. 
    - The .unique() constraint means no two teachers can share the same email address. 
      - PostgreSQL enforces this automatically — if you try to insert a second teacher with an existing email, it will reject the insert.
 * createdAt — auto-filled timestamp.

  Why teachers do not have a schoolId:

 * You might expect a teacher to belong to a school the same way a grade does. 
 * But looking at the specification — a teacher's relationship to a school is established through their chapter assignments, not directly. 
 * A teacher is assigned to chapters, chapters belong to a subject-in-a-class, and that subject-in-a-class belongs to a class in a school. 
 * The link to the school exists, it just goes through the assignment chain rather than a direct foreign key.
 */