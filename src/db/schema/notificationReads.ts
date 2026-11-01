import { pgTable, integer, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { schools } from './schools';

/** Receipts are scoped to both account type and school; staff and learner IDs overlap. */
export const notificationReads = pgTable('notification_reads', {
  schoolId: integer('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  accountType: text('account_type').notNull(),
  accountId: integer('account_id').notNull(),
  notificationId: text('notification_id').notNull(),
  readAt: timestamp('read_at').defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.schoolId, table.accountType, table.accountId, table.notificationId] })]);
