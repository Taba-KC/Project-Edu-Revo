import { pgTable, serial, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const refreshTokens = pgTable('refresh_tokens', {
  id:          serial('id').primaryKey(),
  tokenHash:   text('token_hash').notNull().unique(),
  accountType: text('account_type').notNull(),
  accountId:   integer('account_id').notNull(),
  schoolId:    integer('school_id').notNull(),
  expiresAt:   timestamp('expires_at').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});