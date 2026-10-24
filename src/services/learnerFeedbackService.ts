import { db } from '../db';
import { lessonConcepts, lessonPreviewFeedback, concepts, topics, chapters } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Flow 5 — get planned concepts for an upcoming lesson (preview)
export async function getLessonPreview(lessonId: number) {
  return db.select({ id: lessonConcepts.id, lessonId: lessonConcepts.lessonId, conceptId: lessonConcepts.conceptId, createdAt: lessonConcepts.createdAt }).from(lessonConcepts)
    .innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
    .where(eq(lessonConcepts.lessonId, lessonId)).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
}

// Flow 5 — learner submits or updates a preview reaction
export async function upsertPreviewFeedback(data: {
  learnerId: number;
  lessonId: number;
  conceptId: number;
  reaction: string;
  isAnonymous: boolean;
}) {
  const existing = await db.select().from(lessonPreviewFeedback)
    .where(and(
      eq(lessonPreviewFeedback.learnerId, data.learnerId),
      eq(lessonPreviewFeedback.lessonId, data.lessonId),
      eq(lessonPreviewFeedback.conceptId, data.conceptId),
    ));

  if (existing.length > 0) {
    const [updated] = await db.update(lessonPreviewFeedback)
      .set({ reaction: data.reaction, isAnonymous: data.isAnonymous, updatedAt: new Date() })
      .where(eq(lessonPreviewFeedback.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(lessonPreviewFeedback).values(data).returning();
  return created;
}
