import { people, classes, grades } from '../db/schema';
import { SetupError } from './classSubjectService';
import { sql } from 'drizzle-orm';
/**
 * Lower-level chapter and class-chapter assignment operations. Shared curriculum editing has
 * a fuller workflow in curriculumService; this module also supports older chapter endpoints.
 */
import { db } from '../db';
import { chapters, classChapters, classSubjects } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Insert a shared chapter for its subject and grade; orderIndex determines its curriculum
 * position.
 */
export async function createChapter(data: {
  subjectId:   number;
  gradeNumber: number;
  name:        string;
  orderIndex:  number;
  label?:      string;
}) {
  const [chapter] = await db.insert(chapters).values(data).returning();
  return chapter;
}

/**
 * Read active chapters matching a shared subject/grade pair in curriculum order.
 */
export async function getChaptersBySubjectGrade(subjectId: number, gradeNumber: number) {
  return db.select().from(chapters)
    .where(and(eq(chapters.subjectId, subjectId), eq(chapters.gradeNumber, gradeNumber), eq(chapters.active, true)))
    .orderBy(chapters.orderIndex);
}

/**
 * Link a shared chapter to an existing class-subject allocation instead of copying the
 * chapter content.
 */
export async function assignChapterToClass(classSubjectId: number, chapterId: number) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
    const [scope] = await tx.select({ subjectId: classSubjects.subjectId, gradeNumber: grades.number, personId: classSubjects.personId }).from(classSubjects).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId)).where(and(eq(classSubjects.id,classSubjectId),eq(classSubjects.active,true),eq(classSubjects.academicYear,classes.academicYear)));
    const [chapter] = await tx.select().from(chapters).where(eq(chapters.id,chapterId));
    if (!scope || !chapter || !chapter.active || chapter.subjectId!==scope.subjectId || chapter.gradeNumber!==scope.gradeNumber) throw new SetupError('Choose an active curriculum chapter matching this class subject and grade.');
    const [existing] = await tx.select().from(classChapters).where(and(eq(classChapters.classSubjectId,classSubjectId),eq(classChapters.chapterId,chapterId)));
    if (existing) return existing;
    const [created] = await tx.insert(classChapters).values({classSubjectId,chapterId,personId:scope.personId}).returning();
    return created;
  });
}

/**
 * Update the teacher for a particular class-chapter assignment.
 */
export async function assignPersonToClassChapter(classSubjectId: number, chapterId: number, personId: number) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
    const [scope] = await tx.select({ schoolId: grades.schoolId, subjectId: classSubjects.subjectId, gradeNumber: grades.number }).from(classSubjects).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId)).where(and(eq(classSubjects.id, classSubjectId), eq(classSubjects.active, true), eq(classSubjects.academicYear, classes.academicYear)));
    const [person] = await tx.select().from(people).where(eq(people.id, personId));
    const [chapter] = await tx.select().from(chapters).where(eq(chapters.id, chapterId));
    if (!scope || !person || person.schoolId !== scope.schoolId || !['teacher','principal'].includes(person.role) || !chapter || chapter.subjectId !== scope.subjectId || chapter.gradeNumber !== scope.gradeNumber || !chapter.active) throw new SetupError('Choose a current chapter and teaching staff member from this school.');
    const [updated] = await tx.update(classChapters).set({ personId }).where(and(eq(classChapters.classSubjectId, classSubjectId), eq(classChapters.chapterId, chapterId))).returning();
    return updated;
  });
}

/**
 * Read the chapter links for one class-subject allocation.
 */
export async function getClassChapters(classSubjectId: number) {
  return db.select().from(classChapters)
    .innerJoin(chapters, eq(chapters.id, classChapters.chapterId))
    .where(and(eq(classChapters.classSubjectId, classSubjectId), eq(chapters.active, true)))
    .then(rows => rows.map(row => row.class_chapters));
}