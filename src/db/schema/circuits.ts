/**
 * Location hierarchy: a circuit belongs to a district and can contain schools. Foreign keys
 * link the hierarchy instead of repeating parent names.
 */
import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { districts } from './districts';

export const circuits = pgTable('circuits', {
  id:         serial('id').primaryKey(),
  districtId: integer('district_id').notNull().references(() => districts.id),
  name:       text('name').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
});



/** NOTES */

/*
 * Each circuit belongs to exactly one district. 
 * Circuits are the most granular administrative unit above individual schools — a circuit manager oversees a group of schools within a district. 
 * Also seeded by us.
 */