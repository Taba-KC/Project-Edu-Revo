/**
 * Learner roster and account-claim operations. Callers enforce administrative access;
 * creation validates the class and records membership, while listings omit credentials.
 */
import { db } from '../db';
import { learners, schools, classes, grades, learnerClassHistory, learnerStreamSelections, streams } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

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
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
    await tx.execute(sql`select pg_advisory_xact_lock(7412,${data.schoolId})`);
    const [target] = await tx.select({year:classes.academicYear}).from(classes).innerJoin(grades,eq(grades.id,classes.gradeId)).where(and(eq(classes.id,data.classId),eq(grades.schoolId,data.schoolId)));
    if(!target) throw new Error('Choose a class in your school.');
    const [learner] = await tx.insert(learners).values(data).returning();
    await tx.insert(learnerClassHistory).values({learnerId:learner.id,classId:data.classId,academicYear:target.year});
    return learner;
  });
}

/**
 * Return register fields and the current subject confirmation. Delegated administrators
 * need names and activation state, never learner passwords or credential hashes.
 */
export async function getLearnersByClass(classId: number) {
  return db.select({id:learners.id,firstName:learners.firstName,surname:learners.surname,admissionNumber:learners.admissionNumber,schoolId:learners.schoolId,classId:learners.classId,accountSetUp:learners.accountSetUp,username:learners.username,createdAt:learners.createdAt,selectedStreamName:streams.name})
    .from(learners).innerJoin(classes,eq(classes.id,learners.classId))
    .leftJoin(learnerStreamSelections,and(eq(learnerStreamSelections.learnerId,learners.id),eq(learnerStreamSelections.classId,classes.id),eq(learnerStreamSelections.academicYear,classes.academicYear),eq(learnerStreamSelections.revision,classes.streamRevision)))
    .leftJoin(streams,eq(streams.id,learnerStreamSelections.streamId))
    .where(eq(learners.classId, classId)).orderBy(learners.surname);
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
