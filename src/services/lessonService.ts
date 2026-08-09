import { db } from '../db';
import { lessons, lessonConcepts } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function createLesson(data: {
  chapterId: number;
  classSubjectId: number;
  date: string;
  conceptIds: number[];
}) {
  const { conceptIds, ...lessonData } = data;

  const [lesson] = await db.insert(lessons).values(lessonData).returning();

  if (conceptIds.length > 0) {
    await db.insert(lessonConcepts).values(
      conceptIds.map(conceptId => ({ lessonId: lesson.id, conceptId }))
    );
  }

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