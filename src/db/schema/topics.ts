import { pgTable, serial, integer, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { chapters } from './chapters';
export const topics = pgTable('topics', {
  id: serial('id').primaryKey(),
  chapterId: integer('chapter_id').notNull().references(() => chapters.id),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, t => [unique('topics_id_chapter_unique').on(t.id, t.chapterId)]);
