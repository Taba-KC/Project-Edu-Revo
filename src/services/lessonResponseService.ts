/**
 * Learner submission rules for confirmed-lesson feedback. Verify the learner belongs to the
 * lesson's class, stop responses when a later lesson exists, and update the learner's
 * existing concept response rather than adding duplicates.
 */
import { and, eq, gt, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { learners, classes, grades, classSubjects, lessons, lessonConcepts, lessonFeedback, concepts, topics, chapters } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
import { TeacherError } from './teacherWorkspaceService';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Pick<typeof db, 'transaction'>;
export type LessonReaction = 'understood' | 'didnt_understand';

/**
 * Check that the caller is an active learner in this lesson's class and that it is
 * confirmed. A newer lesson closes the response window.
 */
async function learnerLesson(tx: Tx, caller: AuthPayload, lessonId: number) {
  const [lesson] = await tx.select({ id: lessons.id, status: lessons.status, createdAt: lessons.createdAt, lessonNumber: lessons.lessonNumber, classSubjectId: lessons.classSubjectId }).from(lessons)
    .innerJoin(classSubjects, eq(classSubjects.id, lessons.classSubjectId)).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
    .innerJoin(learners, eq(learners.classId, classes.id))
    .where(and(eq(lessons.id, lessonId), eq(classSubjects.active, true), eq(learners.id, caller.accountId), eq(learners.accountSetUp, true), eq(learners.schoolId, caller.schoolId ?? -1), eq(grades.schoolId, caller.schoolId ?? -1)));
  if (caller.accountType !== 'learner' || !lesson || lesson.status !== 'confirmed') throw new TeacherError('Confirmed lesson not found.', 404);
  const [next] = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.classSubjectId, lesson.classSubjectId), gt(lessons.lessonNumber, lesson.lessonNumber), gte(lessons.createdAt, lesson.createdAt))).limit(1);
  return { ...lesson, canRespond: !next };
}

/**
 * Return this learner's own responses and permitted confirmed concepts in curriculum order.
 */
export async function getLearnerLessonFeedback(caller: AuthPayload, lessonId: number, database: Database = db) {
  return database.transaction(async tx => {
    const lesson = await learnerLesson(tx, caller, lessonId);
    const items = await tx.select({ lessonConceptId: lessonConcepts.id, conceptId: concepts.id, name: concepts.name, reaction: lessonFeedback.reaction }).from(lessonConcepts)
      .innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
      .leftJoin(lessonFeedback, and(eq(lessonFeedback.lessonConceptId, lessonConcepts.id), eq(lessonFeedback.learnerID, caller.accountId)))
      .where(eq(lessonConcepts.lessonId, lessonId)).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
    return { canRespond: lesson.canRespond, concepts: items.map(item => ({ ...item, reaction: item.reaction === 'understood' || item.reaction === 'didnt_understand' ? item.reaction : null })) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

/**
 * Serialize with lesson planning, recheck the response window, then insert or update the
 * unique learner/concept response.
 */
export async function submitLessonFeedback(caller: AuthPayload, data: { lessonConceptId: number; reaction: LessonReaction; isAnonymous: boolean }, database: Database = db) {
  if (!['understood', 'didnt_understand'].includes(data.reaction)) throw new TeacherError('Choose I get it or I don’t get it.');
  return database.transaction(async tx => {
    const [item] = await tx.select({ lessonId: lessonConcepts.lessonId, classSubjectId: lessons.classSubjectId }).from(lessonConcepts).innerJoin(lessons, eq(lessons.id, lessonConcepts.lessonId)).where(eq(lessonConcepts.id, data.lessonConceptId));
    if (!item) throw new TeacherError('Lesson concept not found.', 404);
    await tx.execute(sql`select pg_advisory_xact_lock(7413, ${item.classSubjectId})`);
    const lesson = await learnerLesson(tx, caller, item.lessonId);
    if (!lesson.canRespond) throw new TeacherError('Feedback closed when the next lesson was planned.', 409);
    const [result] = await tx.insert(lessonFeedback).values({ learnerID: caller.accountId, ...data }).onConflictDoUpdate({ target: [lessonFeedback.learnerID, lessonFeedback.lessonConceptId], set: { reaction: data.reaction, isAnonymous: data.isAnonymous, updatedAt: new Date() } }).returning({ lessonConceptId: lessonFeedback.lessonConceptId, reaction: lessonFeedback.reaction });
    return result;
  });
}
