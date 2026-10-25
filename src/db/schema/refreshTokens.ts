/**
 * Hashed refresh tokens with expiry and account identity. A hash is stored rather than the
 * usable bearer token; login/refresh operations are in authService.
 */
import { pgTable, serial, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const refreshTokens = pgTable('refresh_tokens', {
  id:          serial('id').primaryKey(),
  tokenHash:   text('token_hash').notNull().unique(),
  accountType: text('account_type').notNull(),
  accountId:   integer('account_id').notNull(),
  schoolId:    integer('school_id'),
  expiresAt:   timestamp('expires_at').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});