import { db } from '../db';
import { concepts } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function createConcept(data: {
  chapterId: number;
  name: string;
  orderIndex: number;
}) {
  const [concept] = await db.insert(concepts).values(data).returning();
  return concept;
}

export async function getConceptsByChapter(chapterId: number) {
  return db.select().from(concepts)
    .where(eq(concepts.chapterId, chapterId))
    .orderBy(concepts.orderIndex);
}