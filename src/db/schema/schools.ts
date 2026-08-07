import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const schools = pgTable('schools', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  code:      text('code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});






/** NOTES */

/*
 * Did we just create a table in the database?
 * No. Not yet. Writing this file does not touch the database at all. 
 * We have described what the table should look like, in TypeScript. 
 * The actual table in PostgreSQL only gets created when we run the migration later. 
 * Think of this file as a blueprint — drawing the blueprint does not build the house.
 */

/*
 * code is added — a short unique identifier for each school, 
 * e.g. "MOK". .unique() here makes sense because school codes must be unique across the entire platform — 
 * two schools cannot share the same code, since learners enter it to identify which school they belong to.
 */