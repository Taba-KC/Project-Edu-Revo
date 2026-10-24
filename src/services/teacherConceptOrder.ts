import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import { chapters, topics, concepts } from '../db/schema';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One canonical chapter → topic → concept ordering, including class custom concepts. */
export async function orderedTeachingConcepts(tx: Tx, chapterIds: number[], classSubjectId: number) {
  if (!chapterIds.length) return [];
  return tx.select({ id: concepts.id, name: concepts.name, topicId: concepts.topicId, chapterId: concepts.chapterId, prerequisites: concepts.prerequisites, learningOutcomes: concepts.learningOutcomes })
    .from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
    .where(and(inArray(chapters.id, chapterIds), eq(chapters.active, true), eq(topics.active, true), eq(concepts.active, true), or(eq(concepts.isCustom, false), eq(concepts.classSubjectId, classSubjectId))))
    .orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
}
