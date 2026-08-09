import { db } from '../db';
import { learners, schools } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function addLearner(data: {
  title: string;
  firstName: string;
  surname: string;
  admissionNumber: string;
  schoolId: number;
  classId: number;
}) {
  const [learner] = await db.insert(learners).values(data).returning();
  return learner;
}

export async function getLearnersByClass(classId: number) {
  return db.select().from(learners).where(eq(learners.classId, classId)).orderBy(learners.surname);
}

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

export async function completeLearnerOnboarding(learnerId: number, username: string, passwordHash: string) {
  const [updated] = await db.update(learners)
    .set({ username, passwordHash, accountSetUp: true })
    .where(eq(learners.id, learnerId))
    .returning();
  return updated;
}