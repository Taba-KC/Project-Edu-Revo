import { pgTable, serial, integer, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { learners } from './learners';
import { people } from './people';

export type ClaimContent = { classSubjectId: number; lessonId: number | null; homeworkId: number | null }[];
/** Revoked candidates retain audit metadata, never usable credentials. */
export const learnerAccountClaims = pgTable('learner_account_claims', {
  id: serial('id').primaryKey(),
  learnerId: integer('learner_id').notNull().references(() => learners.id, { onDelete: 'cascade' }),
  reference: text('reference').notNull().unique(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'),
  username: text('username'),
  passwordHash: text('password_hash'),
  sessionVersion: integer('session_version').notNull().default(0),
  visibleContent: jsonb('visible_content').$type<ClaimContent>().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: integer('reviewed_by').references(() => people.id, { onDelete: 'set null' }),
}, table => [index('learner_claim_account_idx').on(table.learnerId, table.createdAt), index('learner_claim_username_idx').on(table.username)]);
