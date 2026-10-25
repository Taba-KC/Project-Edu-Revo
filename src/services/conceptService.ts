/**
 * Lower-level concept creation and chapter listing. New shared curriculum editing is
 * coordinated by curriculumService, while teacher planning uses scoped
 * teacherWorkspaceService operations.
 */
import { db } from '../db';
import { concepts, topics, chapters } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
/**
 * Insert a chapter concept through this low-level helper; shared import/edit validation has
 * a separate service.
 */
export async function createConcept(data: { chapterId: number; topicId?: number; name: string; orderIndex: number }) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    const [chapter] = await tx.select().from(chapters).where(and(eq(chapters.id, data.chapterId), eq(chapters.active, true)));
    if (!chapter) throw new Error('Active chapter not found');
    let [topic] = await tx.select().from(topics).where(and(eq(topics.chapterId, data.chapterId), eq(topics.active, true), ...(data.topicId ? [eq(topics.id, data.topicId)] : []))).orderBy(topics.orderIndex).limit(1);
    if (!topic && data.topicId) throw new Error('Topic does not belong to this chapter');
    if (!topic) [topic] = await tx.insert(topics).values({ chapterId: data.chapterId, name: 'General', orderIndex: 1 }).returning();
    const [concept] = await tx.insert(concepts).values({ ...data, topicId: topic!.id }).returning();
    return concept;
  });
}
/**
 * Read the chapter's active concepts in their stored order.
 */
export async function getConceptsByChapter(chapterId: number, database: Pick<typeof db, 'select'> = db) {
  const rows = await database.select({ concept: concepts }).from(concepts).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
    .where(and(eq(concepts.chapterId, chapterId), eq(concepts.active, true), eq(topics.active, true), eq(chapters.active, true)))
    .orderBy(topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
  return rows.map(row => row.concept);
}
