/**
 * Older low-level lesson helpers. They insert or replace lesson associations directly and do
 * not implement the full ownership/date/review rules of teacherWorkspaceService. Do not
 * confuse the two APIs when changing the teacher bookshelf.
 */
import { db } from '../db';
import { lessons, lessonConcepts } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Older direct insert helper for a plan and its concept links. Full teacher workflow
 * validation/transaction handling lives in teacherWorkspaceService.savePlan.
 */
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

/**
 * Older replacement-based confirmation helper. The current teacher UI uses confirmPlan,
 * which also handles ownership, date checks and guidance snapshots.
 */
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

/**
 * Read lessons for an allocation in date order; this low-level function does not itself
 * authorize a caller.
 */
export async function getLessonsByClassSubject(classSubjectId: number) {
  return db.select().from(lessons)
    .where(eq(lessons.classSubjectId, classSubjectId))
    .orderBy(lessons.date);
}

/**
 * Read lesson/concept association rows. These IDs are distinct from the global concept IDs.
 */
export async function getLessonConcepts(lessonId: number) {
  return db.select().from(lessonConcepts)
    .where(eq(lessonConcepts.lessonId, lessonId));
}