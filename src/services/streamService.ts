/**
 * Manage school streams and their subject memberships. Updating memberships synchronizes
 * affected class allocations, so a stream change can affect more than the stream register.
 */
import { db } from '../db';
import { streams, streamSubjects, subjects, classes, classStreams } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { syncStreamClasses, syncClassSubjects } from './classSubjectService';

/**
 * Create a named stream within a school. Subject membership is saved separately.
 */
export async function createStream(data: { schoolId: number; name: string }) {
  const [stream] = await db.insert(streams).values(data).returning();
  return stream;
}

/**
 * Read stream records belonging to the requested school.
 */
export async function getStreamsBySchool(schoolId: number) {
  return db.select().from(streams).where(eq(streams.schoolId, schoolId));
}

/**
 * Rename a stream without changing its identity or rebuilding its memberships.
 */
export async function updateStream(streamId: number, data: { name: string }) {
  const [stream] = await db
    .update(streams)
    .set({ name: data.name })
    .where(eq(streams.id, streamId))
    .returning();
  return stream;
}

/**
 * Detach affected classes, synchronize their allocations and remove stream memberships
 * before deleting the stream.
 */
export async function deleteStream(streamId: number) {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    await tx.select().from(streams).where(eq(streams.id, streamId)).for('update');
    const affected = await tx.selectDistinct({id:classes.id}).from(classes).leftJoin(classStreams,eq(classStreams.classId,classes.id)).where(sql`${classes.streamId}=${streamId} or ${classStreams.streamId}=${streamId}`);
    await tx.delete(classStreams).where(eq(classStreams.streamId,streamId));
    for(const cls of affected){
      const remaining=await tx.select().from(classStreams).where(eq(classStreams.classId,cls.id)).orderBy(classStreams.streamId);
      await tx.update(classes).set({streamId:remaining[0]?.streamId??null,streamRevision:sql`${classes.streamRevision}+1`}).where(eq(classes.id,cls.id));
      await syncClassSubjects(tx,cls.id);
    }
    await tx.delete(streamSubjects).where(eq(streamSubjects.streamId, streamId));
    await tx.delete(streams).where(eq(streams.id, streamId));
  });
  return { id: streamId };
}

/**
 * Insert the membership and resynchronize classes using this stream inside the same
 * transaction.
 */
export async function addSubjectToStream(data: { streamId: number; subjectId: number }) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    await tx.select().from(streams).where(eq(streams.id, data.streamId)).for('update');
    const [row] = await tx.insert(streamSubjects).values(data).returning();
    await syncStreamClasses(tx, data.streamId);
    return row;
  });
}

/**
 * Replace the subject on an existing membership, then synchronize affected classes.
 */
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

/**
 * Remove one membership and synchronize classes while retaining historical allocations.
 */
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

/**
 * Join membership IDs to subject names for the stream's subject list.
 */
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
