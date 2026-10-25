/**
 * Read a school's grades in numeric order. The database identity of a grade and its
 * displayed grade number are different values.
 */
import { db } from '../db';
import { grades } from '../db/schema';
import { eq } from 'drizzle-orm';

// Grades are provisioned by the database when a school is created.
/**
 * Return the school's grades in number order; grade IDs remain the keys used by related
 * class records.
 */
export async function getGradesBySchool(schoolId: number) {
  return db.select().from(grades).where(eq(grades.schoolId, schoolId)).orderBy(grades.number);
}
