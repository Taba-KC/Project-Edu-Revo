import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { provinces } from './provinces';

export const districts = pgTable('districts', {
  id:         serial('id').primaryKey(),
  provinceId: integer('province_id').notNull().references(() => provinces.id),
  name:       text('name').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
});



/** NOTES */

/*
 * Each district belongs to exactly one province. 
 * South Africa has 75 education districts spread across the nine provinces. 
 * Like provinces, these will be seeded by us — a school admin never creates a district.
 */