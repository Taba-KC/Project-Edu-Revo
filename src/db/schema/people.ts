import { pgTable, serial, text, integer, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { schools } from './schools';

export const people = pgTable('people', {
  id:           serial('id').primaryKey(),
  title:        text('title').notNull(),
  firstName:    text('first_name').notNull(),
  surname:      text('surname').notNull(),
  staffNumber:  text('staff_number').notNull(),
  role:         text('role').notNull().default('teacher'),
  schoolId:     integer('school_id').notNull().references(() => schools.id),
  username:     text('username').unique(),
  passwordHash: text('password_hash'),
  accountSetUp: boolean('account_set_up').notNull().default(false),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique().on(table.schoolId, table.staffNumber),
]);