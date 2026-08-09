import { db } from '../db';
import { grades } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function createGrade(data: { schoolId: number; number: number }) {
  const [grade] = await db.insert(grades).values(data).returning();
  return grade;
}

export async function getGradesBySchool(schoolId: number) {
  return db
    .select()
    .from(grades)
    .where(eq(grades.schoolId, schoolId))
    .orderBy(grades.number);
}