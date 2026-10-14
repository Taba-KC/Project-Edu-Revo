import { db } from '../db';
import { grades } from '../db/schema';
import { eq } from 'drizzle-orm';

// Grades are provisioned by the database when a school is created.
export async function getGradesBySchool(schoolId: number) {
  return db.select().from(grades).where(eq(grades.schoolId, schoolId)).orderBy(grades.number);
}
