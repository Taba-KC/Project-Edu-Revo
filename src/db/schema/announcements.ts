import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { schools } from './schools';
import { people } from './people';

export const announcements = pgTable('announcements', {
  id:             serial('id').primaryKey(),
  schoolId:       integer('school_id').notNull().references(() => schools.id),
  createdBy:      integer('created_by').notNull().references(() => people.id),
  title:          text('title').notNull(),
  body:           text('body').notNull(),
  audienceType:   text('audience_type').notNull(), // 'all' | 'grade' | 'class' | 'stream'
  audienceId:     integer('audience_id'),           // null when audienceType = 'all'
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});