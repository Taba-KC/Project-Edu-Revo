import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
export const authAttemptWindows=pgTable('auth_attempt_windows',{
 key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
}, table => [index('auth_attempt_windows_expiry').on(table.expiresAt)]);
