import { db } from '../db';
import { classes, streamSubjects, classSubjects, chapters, classChapters, grades, learners } from '../db/schema';
import { eq, and, count } from 'drizzle-orm';

export async function createClass(data: { gradeId: number; name: string }) {
  const [cls] = await db.insert(classes).values(data).returning();
  return cls;
}

export async function getClassesByGrade(gradeId: number) {
  return db
    .select({
      id: classes.id,
      gradeId: classes.gradeId,
      streamId: classes.streamId,
      name: classes.name,
      createdAt: classes.createdAt,
      learnerCount: count(learners.id),
    })
    .from(classes)
    .leftJoin(learners, eq(learners.classId, classes.id))
    .where(eq(classes.gradeId, gradeId))
    .groupBy(classes.id, classes.gradeId, classes.streamId, classes.name, classes.createdAt)
    .orderBy(classes.name);
}

export async function assignStreamToClass(classId: number, streamId: number) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  const [grade] = await db.select().from(grades).where(eq(grades.id, cls.gradeId));

  await db.update(classes).set({ streamId }).where(eq(classes.id, classId));

  const streamSubs = await db
    .select()
    .from(streamSubjects)
    .where(eq(streamSubjects.streamId, streamId));

  if (streamSubs.length > 0) {
    const insertedClassSubjects = await db.insert(classSubjects).values(
      streamSubs.map(ss => ({ classId, subjectId: ss.subjectId }))
    ).returning();

    for (const cs of insertedClassSubjects) {
      const curriculumChapters = await db.select().from(chapters)
        .where(and(eq(chapters.subjectId, cs.subjectId), eq(chapters.gradeNumber, grade.number)));

      if (curriculumChapters.length > 0) {
        await db.insert(classChapters).values(
          curriculumChapters.map(ch => ({ classSubjectId: cs.id, chapterId: ch.id }))
        );
      }
    }
  }

  return db.select().from(classes).where(eq(classes.id, classId));
}