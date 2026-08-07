import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { schools } from './schools';

export const grades = pgTable('grades', {
  id:        serial('id').primaryKey(),
  schoolId:  integer('school_id').notNull().references(() => schools.id),
  number:    integer('number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});





/** NOTES */

/* 
 * A grade is a year level within a school — Grade 8, 9, 10, 11, or 12. Each grade belongs to exactly one school. A school will have five grade records, one per year level.
 
  What each column does:

 * id — same pattern as before, auto-generated unique identifier.
 * schoolId — this is a foreign key. It stores the id of the school this grade belongs to. integer because schools.id is a serial, which is an integer underneath. .references(() => schools.id) is what makes it a foreign key — it tells PostgreSQL: "this value must match an existing id in the schools table." If you try to insert a grade pointing at a school that does not exist, PostgreSQL will reject it.
 * number — the grade number: 8, 9, 10, 11, or 12. We store it as an integer rather than text because it is genuinely a number, not a label.
 * createdAt — same as before, auto-filled timestamp.

  What a foreign key is:

 * A foreign key is a column that points to a row in another table. 
 * It is the mechanism that links tables together and enforces that relationships stay valid. 
 * Without it, you could insert a grade with schoolId: 999 even if no school with id 999 exists — the database would not complain. 
 * With the foreign key, PostgreSQL enforces the link and rejects invalid references.


  Why we import schools:

 * The .references(() => schools.id) line needs to know what column it is pointing at. 
 * We import the schools table definition so Drizzle can read its id column. 
 * This is a TypeScript import, not a database join — it just gives Drizzle the information it needs to generate the correct SQL.
 */