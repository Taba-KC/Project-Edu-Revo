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
  const [existing] = await db.select().from(classChapters)
    .where(and(eq(classChapters.classSubjectId, classSubjectId), eq(classChapters.chapterId, chapterId)));

  if (existing) return existing;

  const [subject] = await db.select().from(classSubjects).where(eq(classSubjects.id, classSubjectId));
  const [classChapter] = await db.insert(classChapters).values({ classSubjectId, chapterId, personId: subject?.personId }).returning();
  return classChapter;
}

/**
 * Update the teacher for a particular class-chapter assignment.
 */
export async function assignPersonToClassChapter(classSubjectId: number, chapterId: number, personId: number) {
  const [updated] = await db.update(classChapters)
    .set({ personId })
    .where(and(eq(classChapters.classSubjectId, classSubjectId), eq(classChapters.chapterId, chapterId)))
    .returning();
  return updated;
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