import { db } from '../db';
import { streams, streamSubjects, subjects, classes } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { syncStreamClasses, syncClassSubjects } from './classSubjectService';

export async function createStream(data: { schoolId: number; name: string }) {
  const [stream] = await db.insert(streams).values(data).returning();
  return stream;
}

export async function getStreamsBySchool(schoolId: number) {
  return db.select().from(streams).where(eq(streams.schoolId, schoolId));
}

export async function updateStream(streamId: number, data: { name: string }) {
  const [stream] = await db
    .update(streams)
    .set({ name: data.name })
    .where(eq(streams.id, streamId))
    .returning();
  return stream;
}

export async function deleteStream(streamId: number) {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    await tx.select().from(streams).where(eq(streams.id, streamId)).for('update');
    const affected = await tx.update(classes).set({ streamId: null }).where(eq(classes.streamId, streamId)).returning();
    for (const cls of affected) await syncClassSubjects(tx, cls.id);
    await tx.delete(streamSubjects).where(eq(streamSubjects.streamId, streamId));
    await tx.delete(streams).where(eq(streams.id, streamId));
  });
  return { id: streamId };
}

export async function addSubjectToStream(data: { streamId: number; subjectId: number }) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    await tx.select().from(streams).where(eq(streams.id, data.streamId)).for('update');
    const [row] = await tx.insert(streamSubjects).values(data).returning();
    await syncStreamClasses(tx, data.streamId);
    return row;
  });
}

export async function updateStreamSubject(data: { streamSubjectId: number; subjectId: number }) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    const [existing] = await tx.select().from(streamSubjects).where(eq(streamSubjects.id, data.streamSubjectId));
    if (!existing) return undefined;
    await tx.select().from(streams).where(eq(streams.id, existing.streamId)).for('update');
    const [row] = await tx.update(streamSubjects).set({ subjectId: data.subjectId }).where(eq(streamSubjects.id, data.streamSubjectId)).returning();
    await syncStreamClasses(tx, existing.streamId);
    return row;
  });
}

export async function removeSubjectFromStream(streamSubjectId: number) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    const [existing] = await tx.select().from(streamSubjects).where(eq(streamSubjects.id, streamSubjectId));
    if (existing) {
      await tx.select().from(streams).where(eq(streams.id, existing.streamId)).for('update');
      await tx.delete(streamSubjects).where(eq(streamSubjects.id, streamSubjectId));
      await syncStreamClasses(tx, existing.streamId);
    }
    return { id: streamSubjectId };
  });
}

export async function getStreamSubjects(streamId: number) {
  return db
    .select({
      id: streamSubjects.id,
      streamId: streamSubjects.streamId,
      subjectId: subjects.id,
      subjectName: subjects.name,
      createdAt: streamSubjects.createdAt,
    })
    .from(streamSubjects)
    .innerJoin(subjects, eq(streamSubjects.subjectId, subjects.id))
    .where(eq(streamSubjects.streamId, streamId))
    .orderBy(subjects.name);
}
