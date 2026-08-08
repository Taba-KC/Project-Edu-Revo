import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { circuits } from './circuits';

export const schools = pgTable('schools', {
  id:             serial('id').primaryKey(),
  circuitId:      integer('circuit_id').notNull().references(() => circuits.id),
  name:           text('name').notNull(),
  code: text('code').unique(),
  activationCode: text('activation_code').notNull().unique(),
  activatedAt:    timestamp('activated_at'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});






/** NOTES */

/*
 * Did we just create a table in the database?
 * No. Not yet. Writing this file does not touch the database at all. 
 * We have described what the table should look like, in TypeScript. 
 * The actual table in PostgreSQL only gets created when we run the migration later. 
 * Think of this file as a blueprint — drawing the blueprint does not build the house.
 */

/*
 * code is added — a short unique identifier for each school, 
 * e.g. "MOK". .unique() here makes sense because school codes must be unique across the entire platform — 
 * two schools cannot share the same code, since learners enter it to identify which school they belong to.
 */


/*
    What changed and why:

 * circuitId — foreign key placing the school in the Province → District → Circuit → School hierarchy. 
    - Through this one foreign key you can trace any school all the way up to its province.
 * activationCode — the unique code we generate and send to the legitimate school administrator. 
    - Unique across the platform — no two schools share the same activation code.
 * activatedAt — a timestamp that is null when the school is seeded but not yet claimed. 
    - When an admin successfully activates their school, this gets set to the current time. 
    - The application uses this to distinguish between inactive seeded schools and live active ones. 
    - No .notNull() because it starts as null by design.

    What was removed:

 * Nothing was removed — name and code remain. The admin still fills in the school code (like "MOK") during activation, as you described. The name comes from the seed.
 */