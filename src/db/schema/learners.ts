import { pgTable, serial, text, integer, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { classes } from './classes';
import { schools } from './schools';

export const learners = pgTable('learners', {
  id:              serial('id').primaryKey(),
  title:           text('title').notNull(),
  firstName:       text('first_name').notNull(),
  surname:         text('surname').notNull(),
  admissionNumber: text('admission_number').notNull(),
  schoolId:        integer('school_id').notNull().references(() => schools.id),
  classId:         integer('class_id').notNull().references(() => classes.id),
  username:        text('username').unique(),
  passwordHash:    text('password_hash'),
  accountSetUp:    boolean('account_set_up').notNull().default(false),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.schoolId, table.admissionNumber),
]);



/** NOTES */

/*
 * title, firstName, surname — same pattern as teachers.
 * admissionNumber — the number the learner uses to find their account during onboarding, combined with their initials. 
    - Stored as text because admission numbers can have leading zeros or other formatting that would be lost if stored as an integer.
 * schoolId — foreign key to the school. 
    - Needed here alongside classId because the composite unique constraint is school-scoped, and because the onboarding flow identifies the school before looking up the admission number.
 * classId — foreign key to the class this learner belongs to. 
    - Determines their subjects, lessons, and homework.
 * username — the login name the learner creates during onboarding. 
    - null until they complete account setup, hence no .notNull(). 
    - .unique() ensures no two learners share a username across the platform.
 * passwordHash — the hashed password. Also null until account setup is complete. 
    - Never stored as plain text — when auth is implemented, the plain password will be hashed before it ever touches the database.
 * accountSetUp — a boolean flag. 
    - false when the admin adds the learner, true once the learner completes onboarding.
    - The app uses this to know whether to show the learner the setup flow or the main app.
 * createdAt — auto-filled timestamp.

    The second argument to pgTable
 * This is the composite unique constraint. 
 * It tells PostgreSQL: "the combination of school_id and admission_number must be unique." 
 * Two schools can share the same admission number, but within one school, no two learners can have the same one. 
 * This is enforced at the database level, not the application level.
 */