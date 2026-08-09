import { db } from '../db';
import { streams, streamSubjects, subjects } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function createStream(data: { schoolId: number; name: string }) {
  const [stream] = await db.insert(streams).values(data).returning();
  return stream;
}

export async function getStreamsBySchool(schoolId: number) {
  return db.select().from(streams).where(eq(streams.schoolId, schoolId));
}

export async function addSubjectToStream(data: { streamId: number; subjectId: number }) {
  const [streamSubject] = await db.insert(streamSubjects).values(data).returning();
  return streamSubject;
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