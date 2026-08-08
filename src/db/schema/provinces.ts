import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const provinces = pgTable('provinces', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});




/** NOTES */

/*
 * South Africa has nine provinces — this table will hold all nine. 
 * Seeded by us, never created by a school admin.
 */