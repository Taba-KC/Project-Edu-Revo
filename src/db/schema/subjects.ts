import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const subjects = pgTable('subjects', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});



/** NOTES */

/*
 * This is the platform-level subject catalogue — 
    - Mathematics, Physical Sciences, Life Sciences, and so on. 
 * Seeded by us, selected by schools. 
 * No school or class references here — it is a shared list that every school draws from.
 */