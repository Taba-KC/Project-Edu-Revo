/**
 * Accounts allowed to manage the shared curriculum. These are a separate account type from
 * school staff and learners.
 */
import { pgTable, serial, text, boolean, timestamp } from 'drizzle-orm/pg-core';
export const appManagers = pgTable('app_managers', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
