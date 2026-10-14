import { pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';

export const subjects = pgTable('subjects', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('subjects_normalized_name_unique').on(sql`lower(regexp_replace(btrim(${t.name}), '[[:space:]]+', ' ', 'g'))`)]);



/** NOTES */

/*
 * This is the platform-level subject catalogue — 
    - Mathematics, Physical Sciences, Life Sciences, and so on. 
 * Seeded by us, selected by schools. 
 * No school or class references here — it is a shared list that every school draws from.
 */