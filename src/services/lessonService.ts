import { db } from '../db';
import { lessons, lessonConcepts } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function planLesson(data: {
  chapterId: number;
  classSubjectId: number;
  date: string;
  conceptIds: number[];
}) {
  const { conceptIds, ...lessonData } = data;

  const [lesson] = await db.insert(lessons)
    .values({ ...lessonData, status: 'planned' })
    .returning();

  if (conceptIds.length > 0) {
    await db.insert(lessonConcepts).values(
      conceptIds.map(conceptId => ({ lessonId: lesson.id, conceptId }))
    );
  }

  return lesson;
}

export async function confirmLesson(lessonId: number, conceptIds: number[]) {
  await db.update(lessons)
    .set({ status: 'confirmed' })
    .where(eq(lessons.id, lessonId));

  await db.delete(lessonConcepts).where(eq(lessonConcepts.lessonId, lessonId));

  if (conceptIds.length > 0) {
    await db.insert(lessonConcepts).values(
      conceptIds.map(conceptId => ({ lessonId, conceptId }))
    );
  }

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  return lesson;
}

export async function getLessonsByClassSubject(classSubjectId: number) {
  return db.select().from(lessons)
    .where(eq(lessons.classSubjectId, classSubjectId))
    .orderBy(lessons.date);
}

export async function getLessonConcepts(lessonId: number) {
  return db.select().from(lessonConcepts)
    .where(eq(lessonConcepts.lessonId, lessonId));
}