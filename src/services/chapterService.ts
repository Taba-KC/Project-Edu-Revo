import { db } from '../db';
import { chapters, classChapters } from '../db/schema';
import { eq, and } from 'drizzle-orm';

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

export async function getChaptersBySubjectGrade(subjectId: number, gradeNumber: number) {
  return db.select().from(chapters)
    .where(and(eq(chapters.subjectId, subjectId), eq(chapters.gradeNumber, gradeNumber)))
    .orderBy(chapters.orderIndex);
}

export async function assignChapterToClass(classSubjectId: number, chapterId: number) {
  const [existing] = await db.select().from(classChapters)
    .where(and(eq(classChapters.classSubjectId, classSubjectId), eq(classChapters.chapterId, chapterId)));

  if (existing) return existing;

  const [classChapter] = await db.insert(classChapters).values({ classSubjectId, chapterId }).returning();
  return classChapter;
}

export async function assignPersonToClassChapter(classSubjectId: number, chapterId: number, personId: number) {
  const [updated] = await db.update(classChapters)
    .set({ personId })
    .where(and(eq(classChapters.classSubjectId, classSubjectId), eq(classChapters.chapterId, chapterId)))
    .returning();
  return updated;
}

export async function getClassChapters(classSubjectId: number) {
  return db.select().from(classChapters)
    .where(eq(classChapters.classSubjectId, classSubjectId));
}