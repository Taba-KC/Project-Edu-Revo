import { db } from '../db';
import { classes, streamSubjects, classSubjects } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function createClass(data: { gradeId: number; name: string }) {
  const [cls] = await db.insert(classes).values(data).returning();
  return cls;
}

export async function getClassesByGrade(gradeId: number) {
  return db
    .select()
    .from(classes)
    .where(eq(classes.gradeId, gradeId))
    .orderBy(classes.name);
}

export async function assignStreamToClass(classId: number, streamId: number) {
  await db
    .update(classes)
    .set({ streamId })
    .where(eq(classes.id, classId));

  const streamSubs = await db
    .select()
    .from(streamSubjects)
    .where(eq(streamSubjects.streamId, streamId));

  if (streamSubs.length > 0) {
    await db.insert(classSubjects).values(
      streamSubs.map(ss => ({
        classId,
        subjectId: ss.subjectId,
      }))
    );
  }

  return db.select().from(classes).where(eq(classes.id, classId));
}