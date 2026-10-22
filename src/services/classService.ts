import { db, pool } from '../db';
import { classes, grades, learners, people, streams } from '../db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { syncClassSubjects } from './classSubjectService';

export interface ClassInput {
  gradeId: number;
  name: string;
  streamId?: number | null;
  classTeacherId?: number | null;
  description?: string | null;
}

export interface ClassUpdateInput {
  name?: string;
  streamId?: number | null;
  classTeacherId?: number | null;
  description?: string | null;
}

export class InvalidClassNameError extends Error {}
export class DuplicateClassNameError extends Error {}
export class ClassNotFoundError extends Error {}

function normalizeClassName(rawName: string, gradeNumber: number) {
  const withoutGradeWord = rawName.trim().replace(/^grade\s+/i, '');
  const identifier = withoutGradeWord
    .replace(new RegExp(`^${gradeNumber}\\s*`, 'i'), '')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!/^[A-Z]+$/.test(identifier)) {
    throw new InvalidClassNameError(`Class identifier must be letters only, for example ${gradeNumber}A.`);
  }

  return `${gradeNumber}${identifier}`;
}

async function ensureUniqueClassName(gradeId: number, name: string, exceptClassId?: number) {
  const matchingClasses = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.gradeId, gradeId), eq(classes.name, name)));

  const duplicate = matchingClasses.find(cls => cls.id !== exceptClassId);
  if (duplicate) {
    throw new DuplicateClassNameError(`Grade ${name} already exists in this grade.`);
  }
}

export async function createClass(data: ClassInput) {
  const [grade] = await db.select().from(grades).where(eq(grades.id, data.gradeId));
  if (!grade) throw new Error('Grade not found');

  const name = normalizeClassName(data.name, grade.number);
  await ensureUniqueClassName(data.gradeId, name);

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    if (data.streamId) await tx.select({ id: streams.id }).from(streams).where(eq(streams.id, data.streamId)).for('update');
    const [cls] = await tx.insert(classes).values({ ...data, name }).returning();
    await syncClassSubjects(tx, cls.id);
    return cls;
  });
}

export async function getClassesByGrade(gradeId: number) {
  return db
    .select({
      id: classes.id,
      gradeId: classes.gradeId,
      streamId: classes.streamId,
      classTeacherId: classes.classTeacherId,
      name: classes.name,
      description: classes.description,
      createdAt: classes.createdAt,
      classTeacherTitle: people.title,
      classTeacherFirstName: people.firstName,
      classTeacherSurname: people.surname,
      learnerCount: count(learners.id),
    })
    .from(classes)
    .leftJoin(learners, eq(learners.classId, classes.id))
    .leftJoin(people, eq(people.id, classes.classTeacherId))
    .where(eq(classes.gradeId, gradeId))
    .groupBy(
      classes.id,
      classes.gradeId,
      classes.streamId,
      classes.classTeacherId,
      classes.name,
      classes.description,
      classes.createdAt,
      people.title,
      people.firstName,
      people.surname,
    )
    .orderBy(classes.name);
}

export async function assignStreamToClass(classId: number, streamId: number) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    await tx.select({ id: streams.id }).from(streams).where(eq(streams.id, streamId)).for('update');
    await tx.update(classes).set({ streamId }).where(eq(classes.id, classId));
    await syncClassSubjects(tx, classId);
    return tx.select().from(classes).where(eq(classes.id, classId));
  });
}

export async function updateClass(classId: number, data: ClassUpdateInput) {
  const [existing] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!existing) throw new Error('Class not found');

  const updates = { ...data };
  if (data.name) {
    const [grade] = await db.select().from(grades).where(eq(grades.id, existing.gradeId));
    if (!grade) throw new Error('Grade not found');

    updates.name = normalizeClassName(data.name, grade.number);
    await ensureUniqueClassName(existing.gradeId, updates.name, classId);
  }

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    if (data.streamId) await tx.select({ id: streams.id }).from(streams).where(eq(streams.id, data.streamId)).for('update');
    const [updated] = await tx.update(classes).set(updates).where(eq(classes.id, classId)).returning();
    if (!updated) throw new Error('Class not found');
    if (data.streamId !== undefined) await syncClassSubjects(tx, classId);
    return updated;
  });
}

export async function deleteClassContents(client: PoolClient, classIds: number[]) {
  if (classIds.length === 0) return;

  await client.query(`
    DELETE FROM question_feedback
    WHERE learner_id IN (SELECT id FROM learners WHERE class_id = ANY($1::int[]))
       OR question_id IN (
        SELECT q.id
        FROM questions q
        JOIN homework h ON h.id = q.homework_id
        JOIN lessons l ON l.id = h.lesson_id
        JOIN class_subjects cs ON cs.id = l.class_subject_id
        WHERE cs.class_id = ANY($1::int[])
      )
  `, [classIds]);

  await client.query(`
    DELETE FROM lesson_feedback
    WHERE learner_id IN (SELECT id FROM learners WHERE class_id = ANY($1::int[]))
       OR lesson_concept_id IN (
        SELECT lc.id
        FROM lesson_concepts lc
        JOIN lessons l ON l.id = lc.lesson_id
        JOIN class_subjects cs ON cs.id = l.class_subject_id
        WHERE cs.class_id = ANY($1::int[])
      )
  `, [classIds]);

  await client.query(`
    DELETE FROM lesson_preview_feedback
    WHERE learner_id IN (SELECT id FROM learners WHERE class_id = ANY($1::int[]))
       OR lesson_id IN (
        SELECT l.id
        FROM lessons l
        JOIN class_subjects cs ON cs.id = l.class_subject_id
        WHERE cs.class_id = ANY($1::int[])
      )
  `, [classIds]);

  await client.query(`
    DELETE FROM questions
    WHERE homework_id IN (
      SELECT h.id
      FROM homework h
      JOIN lessons l ON l.id = h.lesson_id
      JOIN class_subjects cs ON cs.id = l.class_subject_id
      WHERE cs.class_id = ANY($1::int[])
    )
  `, [classIds]);

  await client.query(`
    DELETE FROM homework
    WHERE lesson_id IN (
      SELECT l.id
      FROM lessons l
      JOIN class_subjects cs ON cs.id = l.class_subject_id
      WHERE cs.class_id = ANY($1::int[])
    )
  `, [classIds]);

  await client.query(`
    DELETE FROM lesson_concepts
    WHERE lesson_id IN (
      SELECT l.id
      FROM lessons l
      JOIN class_subjects cs ON cs.id = l.class_subject_id
      WHERE cs.class_id = ANY($1::int[])
    )
  `, [classIds]);

  await client.query(`
    DELETE FROM lessons
    WHERE class_subject_id IN (
      SELECT id FROM class_subjects WHERE class_id = ANY($1::int[])
    )
  `, [classIds]);

  await client.query(`
    DELETE FROM class_chapters
    WHERE class_subject_id IN (
      SELECT id FROM class_subjects WHERE class_id = ANY($1::int[])
    )
  `, [classIds]);

  await client.query(`
    DELETE FROM refresh_tokens
    WHERE account_type = 'learner'
      AND account_id IN (SELECT id FROM learners WHERE class_id = ANY($1::int[]))
  `, [classIds]);

  await client.query('DELETE FROM learners WHERE class_id = ANY($1::int[])', [classIds]);
  await client.query('DELETE FROM class_subjects WHERE class_id = ANY($1::int[])', [classIds]);
  await client.query("DELETE FROM announcements WHERE audience_type = 'class' AND audience_id = ANY($1::int[])", [classIds]);
}

export async function deleteClassById(classId: number, gradeId: number, schoolId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const classResult = await client.query(
      `
        SELECT c.id
        FROM classes c
        JOIN grades g ON g.id = c.grade_id
        WHERE c.id = $1 AND c.grade_id = $2 AND g.school_id = $3
      `,
      [classId, gradeId, schoolId],
    );

    if (classResult.rowCount === 0) {
      throw new ClassNotFoundError('Class not found');
    }

    await deleteClassContents(client, [classId]);
    await client.query('DELETE FROM classes WHERE id = $1 AND grade_id = $2', [classId, gradeId]);

    await client.query('COMMIT');
    return { id: classId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
