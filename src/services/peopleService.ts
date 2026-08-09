import { db } from '../db';
import { people, schools } from '../db/schema';
import { and, eq } from 'drizzle-orm';

export async function addPerson(data: {
  title: string;
  firstName: string;
  surname: string;
  staffNumber: string;
  schoolId: number;
}) {
  const [person] = await db.insert(people).values(data).returning();
  return person;
}

export async function getPeopleBySchool(schoolId: number) {
  return db.select().from(people).where(eq(people.schoolId, schoolId)).orderBy(people.surname);
}

export async function findPersonForOnboarding(schoolCode: string, staffNumber: string, initials: string) {
  const [school] = await db.select().from(schools).where(eq(schools.code, schoolCode));
  if (!school) return null;

   const [person] = await db.select().from(people)
    .where(and(eq(people.schoolId, school.id), eq(people.staffNumber, staffNumber)));
  if (!person) return null;

  const expectedInitials = (person.firstName[0] + person.surname[0]).toUpperCase();
  if (initials.toUpperCase() !== expectedInitials) return null;

  return person;
}

export async function completePeopleOnboarding(personId: number, username: string, passwordHash: string) {
  const [updated] = await db.update(people)
    .set({ username, passwordHash, accountSetUp: true })
    .where(eq(people.id, personId))
    .returning();
  return updated;
}