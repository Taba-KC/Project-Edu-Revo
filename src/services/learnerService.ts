/**
 * Learner roster and account-claim operations. These are older low-level helpers; callers
 * must enforce access. In particular, the raw class listing should not be treated as an
 * example of a minimal safe public response.
 */
import { db } from '../db';
import { learners, schools } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Create a learner roster record using the supplied school/class information.
 */
export async function addLearner(data: {
  firstName: string;
  surname: string;
  admissionNumber: string;
  schoolId: number;
  classId: number;
}) {
  const [learner] = await db.insert(learners).values(data).returning();
  return learner;
}

/**
 * Read learner rows for a class. This raw selection includes account fields; do not expose
 * it as a new public DTO without explicit safe-field selection and authorization.
 */
export async function getLearnersByClass(classId: number) {
  return db.select().from(learners).where(eq(learners.classId, classId)).orderBy(learners.surname);
}

/**
 * Find the roster record matching the learner's claim details before credential setup.
 */
export async function findLearnerForOnboarding(schoolCode: string, admissionNumber: string, initials: string) {
  const [school] = await db.select().from(schools).where(eq(schools.code, schoolCode));
  if (!school) return null;

  const [learner] = await db.select().from(learners)
    .where(and(eq(learners.schoolId, school.id), eq(learners.admissionNumber, admissionNumber)));
  if (!learner) return null;

  const expectedInitials = (learner.firstName[0] + learner.surname[0]).toUpperCase();
  if (initials.toUpperCase() !== expectedInitials) return null;

  return learner;
}

/**
 * Claim a learner record with validated login details and a hashed password.
 */
export async function completeLearnerOnboarding(learnerId: number, username: string, passwordHash: string) {
  const [updated] = await db.update(learners)
    .set({ username, passwordHash, accountSetUp: true })
    .where(eq(learners.id, learnerId))
    .returning();
  return updated;
}

/**
 * Insert multiple learner roster records through the older bulk helper; current reviewed
 * imports use rosterImportService.
 */
export async function bulkAddLearners(
  learners: { firstName: string; surname: string; admissionNumber: string }[],
  schoolId: number,
  classId: number,
) {
  const succeeded: number[] = [];
  const errors: { row: number; admissionNumber: string; reason: string }[] = [];

  for (let i = 0; i < learners.length; i++) {
    const row = learners[i];
    try {
      const learner = await addLearner({ ...row, schoolId, classId });
      succeeded.push(learner.id);
    } catch (err: any) {
      const isDuplicate =
        err.cause?.code === '23505' ||
        (err.cause?.message ?? '').toLowerCase().includes('duplicate key');
      const reason = isDuplicate
        ? 'Admission number already exists for this school'
        : 'Failed to import row';
      errors.push({ row: i + 2, admissionNumber: row.admissionNumber, reason });
    }
  }

  return { succeeded: succeeded.length, failed: errors.length, errors };
}
