import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { people, administrativeWork, classSubjects, classChapters, classes, grades, chapters } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
export const CAPABILITIES = ['grades', 'streams', 'staff', 'learners', 'curriculum'] as const;
export type Capability = typeof CAPABILITIES[number];
export class AccessError extends Error { constructor(message: string, public status = 403) { super(message); } }
export async function staffAccess(caller: AuthPayload) {
  const [person] = await db.select().from(people).where(and(eq(people.id, caller.accountId), eq(people.schoolId, caller.schoolId ?? -1)));
  if (caller.accountType !== 'person' || !person?.accountSetUp || !['principal', 'teacher'].includes(person.role)) throw new AccessError('School staff access required.');
  const grants = await db.select().from(administrativeWork).where(and(eq(administrativeWork.personId, person.id), eq(administrativeWork.schoolId, person.schoolId)));
  const allocations = await db.select({ id: classSubjects.id, personId: classSubjects.personId }).from(classSubjects).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId)).where(and(eq(grades.schoolId, person.schoolId), eq(classSubjects.active, true)));
  const chapterAssignments = allocations.length ? await db.select().from(classChapters).innerJoin(chapters,eq(chapters.id,classChapters.chapterId)).where(and(eq(chapters.active,true),eq(classChapters.personId, person.id), inArray(classChapters.classSubjectId, allocations.map(row => row.id)))) : [];
  return {
    isPrincipal: person.role === 'principal', canTeach: allocations.some(row => row.personId === person.id) || chapterAssignments.length > 0,
    capabilities: person.role === 'principal' ? [...CAPABILITIES] : grants.map(row => row.capability).filter((key): key is Capability => CAPABILITIES.includes(key as Capability)), schoolId: person.schoolId
  };
}
