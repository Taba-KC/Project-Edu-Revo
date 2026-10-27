/**
 * Learner submission rules for confirmed-lesson feedback, including goal-level Yes/No answers. Verify the learner belongs to the
 * lesson's class, stop responses when a later lesson exists, and update the learner's
 * existing concept response rather than adding duplicates.
 */
import { and, eq, gt, gte, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { learners, classes, grades, classSubjects, lessons, lessonConcepts, lessonFeedback, concepts, topics, chapters } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
import { TeacherError } from './teacherWorkspaceService';

import { learnerSubjectIds } from './classStreamService';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Pick<typeof db, 'transaction'>;
export type LessonReaction = 'understood' | 'didnt_understand';

/**
 * Check that the caller is an active learner in this lesson's class and that it is
 * confirmed. A newer lesson closes the response window.
 */
async function learnerLesson(tx: Tx, caller: AuthPayload, lessonId: number) {
  const enrolled=await learnerSubjectIds(tx,caller);
  const [lesson] = await tx.select({ id: lessons.id, status: lessons.status, createdAt: lessons.createdAt, lessonNumber: lessons.lessonNumber, classSubjectId: lessons.classSubjectId }).from(lessons)
    .innerJoin(classSubjects, eq(classSubjects.id, lessons.classSubjectId)).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
    .innerJoin(learners, eq(learners.classId, classes.id))
    .where(and(eq(lessons.id, lessonId), inArray(classSubjects.subjectId,enrolled.length?enrolled:[-1]), eq(classSubjects.active, true), eq(learners.id, caller.accountId), eq(learners.accountSetUp, true), eq(learners.schoolId, caller.schoolId ?? -1), eq(grades.schoolId, caller.schoolId ?? -1)));
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
// Compatibility endpoint for older clients. The learner bookshelf uses submitLearningGoalFeedback below.
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

/** Save one Yes/No atomically without losing the learner's answers to the other goals. */
export async function submitLearningGoalFeedback(caller: AuthPayload, lessonConceptId: number, data: { goalIndex: number; answer: 'yes' | 'no' }, database: Database = db) {
  if (!Number.isInteger(data.goalIndex) || data.goalIndex < 0 || data.goalIndex > 4 || !['yes', 'no'].includes(data.answer)) throw new TeacherError('Choose a valid learning goal and Yes or No.');
  return database.transaction(async tx => {
    const [link] = await tx.select({ lessonId: lessonConcepts.lessonId, classSubjectId: lessons.classSubjectId }).from(lessonConcepts).innerJoin(lessons, eq(lessons.id, lessonConcepts.lessonId)).where(eq(lessonConcepts.id, lessonConceptId));
    if (!link) throw new TeacherError('Lesson concept not found.', 404);
    await tx.execute(sql`select pg_advisory_xact_lock(7413, ${link.classSubjectId})`);
    const lesson = await learnerLesson(tx, caller, link.lessonId);
    if (!lesson.canRespond) throw new TeacherError('Feedback closed when the next lesson was planned.', 409);
    const [item] = await tx.select({ brief: lessonConcepts.teachingBrief, name: concepts.name, prerequisites: concepts.prerequisites, learningOutcomes: concepts.learningOutcomes }).from(lessonConcepts).innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).where(eq(lessonConcepts.id, lessonConceptId));
    // Older lessons did not freeze guidance. Freeze once on first response so goal indices cannot drift.
    const brief = item!.brief ?? { conceptName: item!.name, prerequisites: item!.prerequisites, learningOutcomes: item!.learningOutcomes };
    const goal = brief.learningOutcomes[data.goalIndex];
    if (!goal) throw new TeacherError('This learning goal is not part of this lesson.');
    if (!item!.brief) await tx.update(lessonConcepts).set({ teachingBrief: brief }).where(eq(lessonConcepts.id, lessonConceptId));
    const [existing] = await tx.select().from(lessonFeedback).where(and(eq(lessonFeedback.lessonConceptId, lessonConceptId), eq(lessonFeedback.learnerID, caller.accountId)));
    const goalResponses = (existing?.goalResponses ?? []).filter(answer => answer.goalIndex !== data.goalIndex && brief.learningOutcomes[answer.goalIndex] === answer.goal);
    goalResponses.push({ goalIndex: data.goalIndex, goal, answer: data.answer });
    goalResponses.sort((a, b) => a.goalIndex - b.goalIndex);
    const reaction = goalResponses.some(answer => answer.answer === 'no') ? 'didnt_understand' : goalResponses.length === brief.learningOutcomes.length ? 'understood' : 'goals_pending';
    await tx.insert(lessonFeedback).values({ learnerID: caller.accountId, lessonConceptId, reaction, goalResponses, isAnonymous: true }).onConflictDoUpdate({ target: [lessonFeedback.learnerID, lessonFeedback.lessonConceptId], set: { goalResponses, reaction, isAnonymous: true, updatedAt: new Date() } });
    return { lessonConceptId, goalResponses };
  });
}
