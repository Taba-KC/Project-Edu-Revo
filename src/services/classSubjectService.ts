/**
 * Synchronize a class's subject allocations with its stream and assign subject teachers.
 * Deactivate removed allocations rather than deleting their teaching history. Chapter
 * overrides can differ from the default teacher.
 */
import { db } from '../db';
import { classes, grades, streams, streamSubjects, classSubjects, subjects, people, chapters, classChapters } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
export type SetupTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class SetupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/**
 * Reconcile active allocations with the chosen stream. Keep historical allocation IDs, and
 * link missing shared chapters for this grade.
 */
export async function syncClassSubjects(tx: SetupTransaction, classId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId)).for('update');
  if (!cls) throw new SetupError('Class not found', 404);
  const [grade] = await tx.select().from(grades).where(eq(grades.id, cls.gradeId));
  if (!grade) throw new SetupError('Grade not found', 404);
  if (cls.streamId) {
    const [stream] = await tx.select().from(streams).where(and(eq(streams.id, cls.streamId), eq(streams.schoolId, grade.schoolId)));
    if (!stream) throw new SetupError('Stream must belong to this school');
  }
  const desired = cls.streamId ? await tx.select().from(streamSubjects).where(eq(streamSubjects.streamId, cls.streamId)) : [];
  const wanted = new Set(desired.map(item => item.subjectId));
  const existing = await tx.select().from(classSubjects).where(eq(classSubjects.classId, classId));
  for (const row of existing) {
    await tx.update(classSubjects).set({ active: wanted.has(row.subjectId) }).where(eq(classSubjects.id, row.id));
  }
  for (const item of desired) {
    let cs = existing.find(row => row.subjectId === item.subjectId);
    if (!cs) [cs] = await tx.insert(classSubjects).values({ classId, subjectId: item.subjectId }).returning();
    const curriculum = await tx.select().from(chapters).where(and(eq(chapters.subjectId, item.subjectId), eq(chapters.gradeNumber, grade.number), eq(chapters.active, true)));
    const linked = await tx.select().from(classChapters).where(eq(classChapters.classSubjectId, cs!.id));
    const missing = curriculum.filter(ch => !linked.some(link => link.chapterId === ch.id));
    if (missing.length) await tx.insert(classChapters).values(missing.map(ch => ({ classSubjectId: cs!.id, chapterId: ch.id, personId: cs!.personId })));
  }
}

/**
 * Resynchronize every class using this stream after its subject memberships change.
 */
export async function syncStreamClasses(tx: SetupTransaction, streamId: number) {
  const rows = await tx.select({ id: classes.id }).from(classes).where(eq(classes.streamId, streamId)).orderBy(classes.id);
  for (const row of rows) await syncClassSubjects(tx, row.id);
}

/**
 * Join subject and optional teacher names into a display response, scoped to the requested
 * school and class.
 */
export async function getClassSubjects(schoolId: number, classId: number) {
  return db.select({ id: classSubjects.id, subjectId: subjects.id, subjectName: subjects.name, personId: classSubjects.personId,
    teacherTitle: people.title, teacherFirstName: people.firstName, teacherSurname: people.surname })
    .from(classSubjects).innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
    .leftJoin(people, eq(people.id, classSubjects.personId))
    .where(and(eq(grades.schoolId, schoolId), eq(classes.id, classId), eq(classSubjects.active, true))).orderBy(subjects.name);
}

/**
 * Validate a school-local teaching account, update the allocation default and preserve
 * genuine chapter-specific overrides.
 */
export async function assignSubjectTeacher(tx: SetupTransaction, schoolId: number, classId: number, classSubjectId: number, personId: number | null) {
  await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
  await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, classId)).for('update');
  const [row] = await tx.select({ cs: classSubjects }).from(classSubjects)
    .innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
    .where(and(eq(grades.schoolId, schoolId), eq(classes.id, classId), eq(classSubjects.id, classSubjectId), eq(classSubjects.active, true))).for('update');
  if (!row) throw new SetupError('Active class subject not found', 404);
  if (personId !== null) {
    const [person] = await tx.select().from(people).where(and(eq(people.id, personId), eq(people.schoolId, schoolId), inArray(people.role, ['teacher', 'principal'])));
    if (!person) throw new SetupError('Choose teaching staff from this school');
  }
  await tx.update(classSubjects).set({ personId }).where(eq(classSubjects.id, classSubjectId));
  // Keep chapter-specific overrides; update chapters using the previous default.
  await tx.update(classChapters).set({ personId }).where(and(eq(classChapters.classSubjectId, classSubjectId),
    sql`(${classChapters.personId} IS NULL OR ${classChapters.personId} IS NOT DISTINCT FROM ${row.cs.personId})`));
}
