import { db } from '../db';
import { chapters } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function createChapter(data: {
  classSubjectId: number;
  name: string;
  orderIndex: number;
  label?: string;
}) {
  const [chapter] = await db.insert(chapters).values(data).returning();
  return chapter;
}

export async function assignPersonToChapter(chapterId: number, personId: number) {
  const [updated] = await db.update(chapters)
    .set({ personId })
    .where(eq(chapters.id, chapterId))
    .returning();
  return updated;
}

export async function getChaptersByClassSubject(classSubjectId: number) {
  return db.select().from(chapters)
    .where(eq(chapters.classSubjectId, classSubjectId))
    .orderBy(chapters.orderIndex);
}