import { db } from '../db';
import { schools } from '../db/schema';
import { eq, isNull } from 'drizzle-orm';

export async function seedSchool(data: {
  circuitId: number;
  name: string;
  activationCode: string;
}) {
  const [school] = await db.insert(schools).values(data).returning();
  return school;
}

export async function getAllSchools() {
  return db.select().from(schools);
}

export async function getSchoolById(id: number) {
  const [school] = await db.select().from(schools).where(eq(schools.id, id));
  return school ?? null;
}

export async function activateSchool(data: {
  schoolId: number;
  code: string;
  activationCode: string;
}) {
  const [school] = await db
    .select()
    .from(schools)
    .where(eq(schools.id, data.schoolId));

  if (!school) return null;
  if (school.activationCode !== data.activationCode) return null;
  if (school.activatedAt !== null) return null;

  const [updated] = await db
    .update(schools)
    .set({
      code: data.code,
      activatedAt: new Date(),
    })
    .where(eq(schools.id, data.schoolId))
    .returning();

  return updated;
}


/** NOTES */

/*
 * This is the service layer for schools. 
 * It contains three functions — one per operation — that talk directly to the database. 
 * Route handlers will call these functions. 
 * Nothing else in the project calls the database directly.

    What each function does:

 * createSchool — inserts a new row into the schools table. 
     -  .returning() tells PostgreSQL to return the newly created row immediately after inserting it, so the caller gets back the full school object including its generated id and createdAt. 
     -  The [school] destructuring takes the first item from the returned array — insert always returns an array even for a single row.
 * getAllSchools — selects every row from the schools table. 
     -  The equivalent of SELECT * FROM schools.
 * getSchoolById — selects one school matching a given id. eq(schools.id, id) is Drizzle's way of writing WHERE id = ?. 
     -  Returns null if no school is found — the ?? operator means "if the left side is undefined, return null instead."
    
     What async and await mean:
 
 * Database calls take time — they go over a network connection to PostgreSQL and wait for a response. 
 * async marks a function as asynchronous — it will not block the server while waiting. 
 * await pauses execution inside that function until the database responds, then continues. 
 * Without this, the server would freeze on every database call.
 * The .NET equivalent is async Task<T> and await — identical concept.
 */




 /** ADDITIONAL NOTES */

 /*
  * createSchool is renamed to seedSchool — matches the new route name and makes the intent clear.
  * activateSchool is new. It does three checks before updating anything:
     - Does the school exist? If not, return null.
     - Does the activation code match? If not, return null.
     - Is the school already activated? If so, return null — a school cannot be activated twice.
  * If all three checks pass, it sets the code the admin chose and stamps activatedAt with the current time. 
  * The route handler gets back the updated school record.

      Why three separate checks instead of one database query:

  * Each check catches a different problem. 
  * Doing them separately means the service always knows exactly why activation failed — 
      - useful for logging and debugging — even though the route handler returns the same generic error to the caller in all three cases.
  */