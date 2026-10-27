/**
 * Staff roster creation, listing and account claiming. Staff IDs/roles belong to people
 * records; password hashes are authentication data, not display fields for the register.
 */
import { db } from '../db';
import { classChapters, classSubjects, chapters, people, schools } from '../db/schema';
import { and, count, eq, sql } from 'drizzle-orm';

/**
 * Create a staff roster record, separate from the later account-claim step.
 */
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

/**
 * Select staff display/account-status fields for the register rather than returning password
 * hashes.
 */
export async function getPeopleBySchool(schoolId: number) {
  return db
    .select({
      id: people.id,
      title: people.title,
      firstName: people.firstName,
      surname: people.surname,
      staffNumber: people.staffNumber,
      role: people.role,
      schoolId: people.schoolId,
      username: people.username,
      accountSetUp: people.accountSetUp,
      createdAt: people.createdAt,
      administrativeWork:sql<string[]>`ARRAY(select capability from administrative_work aw where aw.person_id=${people.id})`,
      assignedChapterCount: sql<number>`count(${classChapters.id}) filter (where ${classSubjects.active} = true and ${chapters.active} = true)::int`,
      assignedSubjectCount: sql<number>`(select count(*)::int from class_subjects cs where cs.person_id = ${people.id} and cs.active = true)`,
    })
    .from(people)
    .leftJoin(classChapters, eq(classChapters.personId, people.id))
    .leftJoin(classSubjects, eq(classSubjects.id, classChapters.classSubjectId))
    .leftJoin(chapters, eq(chapters.id, classChapters.chapterId))
    .where(eq(people.schoolId, schoolId))
    .groupBy(
      people.id,
      people.title,
      people.firstName,
      people.surname,
      people.staffNumber,
      people.role,
      people.schoolId,
      people.username,
      people.accountSetUp,
      people.createdAt,
    )
    .orderBy(people.surname);
}

/**
 * Insert staff roster rows through the lower-level bulk helper.
 */
export async function bulkAddPeople(
  staff: { title: string; firstName: string; surname: string; staffNumber: string }[],
  schoolId: number,
) {
  const succeeded: number[] = [];
  const errors: { row: number; staffNumber: string; reason: string }[] = [];

  for (let i = 0; i < staff.length; i++) {
    const row = staff[i];
    try {
      const person = await addPerson({ ...row, schoolId });
      succeeded.push(person.id);
    } catch (err: any) {
      const isDuplicate =
        err.cause?.code === '23505' ||
        (err.cause?.message ?? '').toLowerCase().includes('duplicate key');
      const reason = isDuplicate
        ? 'Staff number already exists for this school'
        : 'Failed to import row';
      errors.push({ row: i + 2, staffNumber: row.staffNumber, reason });
    }
  }

  return { succeeded: succeeded.length, failed: errors.length, errors };
}

/**
 * Find an existing staff record from its school and claim details.
 */
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

/**
 * Save claimed staff credentials with a password hash rather than a plaintext password.
 */
export async function completePeopleOnboarding(personId: number, username: string, passwordHash: string) {
  const [updated] = await db.update(people)
    .set({ username, passwordHash, accountSetUp: true })
    .where(eq(people.id, personId))
    .returning();
  return updated;
}
