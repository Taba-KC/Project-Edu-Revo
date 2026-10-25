/**
 * Aggregate binary concept feedback for recent confirmed lessons and queue concepts for
 * review. An added concept goes to an upcoming owned plan when possible, otherwise to a
 * next-lesson draft. Original taught history is retained.
 */
import { and, eq, inArray, desc, asc, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { lessons, lessonFeedback, learners, concepts, chapters, topics, lessonConcepts, lessonReviewConcepts } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
import { teacherScope, lessonScope, TeacherError, schoolDate } from './teacherWorkspaceService';
import { orderedTeachingConcepts } from './teacherConceptOrder';
import { conceptUnderstanding, understandingScore } from './lessonUnderstanding';
type Database = Pick<typeof db, 'transaction'>;

/**
 * Read recent owned confirmed lessons, count current-roster binary responses and sort their
 * concepts by understanding. No learner-name list is returned.
 */
export async function getLessonFeedback(caller: AuthPayload, classSubjectId: number, database: Database = db) {
  return database.transaction(async tx => {
    const scope = await teacherScope(tx, caller, classSubjectId);
    const chapterIds = scope.chapters.map(chapter => chapter.id);
    if (!chapterIds.length) return [];
    const sets = await tx.select({ id: lessons.id, lessonId: lessons.id, lessonNumber: lessons.lessonNumber, lessonDate: lessons.date, createdAt: lessons.createdAt, chapterName: chapters.name })
      .from(lessons).innerJoin(chapters, eq(chapters.id, lessons.chapterId))
      .where(and(eq(lessons.classSubjectId, classSubjectId), inArray(lessons.chapterId, chapterIds), eq(lessons.status, 'confirmed'))).orderBy(desc(lessons.lessonNumber)).limit(10);
    if (!sets.length) return [];
    const roster = await tx.select({ id: learners.id }).from(learners).where(eq(learners.classId, scope.allocation.classId));
    const items = await tx.select({ id: lessonConcepts.id, lessonId: lessonConcepts.lessonId, conceptId: concepts.id, name: concepts.name, teachingBrief: lessonConcepts.teachingBrief }).from(lessonConcepts)
      .innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
      .where(inArray(lessonConcepts.lessonId, sets.map(set => set.id))).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
    /**
     * Count only learners on the current class roster and only responses to the retrieved lesson
     * associations.
     */
    const reactions = items.length && roster.length ? await tx.select({ learnerId: lessonFeedback.learnerID, lessonConceptId: lessonFeedback.lessonConceptId, reaction: lessonFeedback.reaction })
      .from(lessonFeedback).where(and(inArray(lessonFeedback.lessonConceptId, items.map(item => item.id)), inArray(lessonFeedback.learnerID, roster.map(learner => learner.id)))) : [];
    const available = await orderedTeachingConcepts(tx, chapterIds, classSubjectId);
    return sets.map(set => ({ ...set, totalLearners: roster.length, concepts: items.filter(item => item.lessonId === set.id).map(item => ({ id: item.conceptId, name: item.teachingBrief?.conceptName ?? item.name, teachingBrief: item.teachingBrief, canReview: available.some(concept => concept.id === item.conceptId), counts: conceptUnderstanding(item.id, reactions, roster.length) })).sort((a, b) => understandingScore(a.counts) - understandingScore(b.counts) || 0) }));
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

/**
 * Validate that the concept belongs to the source lesson, then add it to an upcoming owned
 * plan or queue it once for later planning.
 */
export async function addLessonConceptToNextLesson(caller: AuthPayload, lessonId: number, conceptId: number, database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    const source = await lessonScope(tx, caller, lessonId);
    if (source.status !== 'confirmed') throw new TeacherError('Choose a confirmed lesson.');
    const classSubjectId = source.classSubjectId;
    await tx.execute(sql`select pg_advisory_xact_lock(7413, ${classSubjectId})`);
    const scope = await teacherScope(tx, caller, classSubjectId);
    const [item] = await tx.select({ id: lessonConcepts.id }).from(lessonConcepts).where(and(eq(lessonConcepts.lessonId, lessonId), eq(lessonConcepts.conceptId, conceptId))).limit(1);
    const ordered = await orderedTeachingConcepts(tx, scope.chapters.map(chapter => chapter.id), classSubjectId);
    if (!item || !ordered.some(concept => concept.id === conceptId)) throw new TeacherError('Choose an active concept from this lesson and your teaching allocation.');
    const [next] = scope.chapters.length ? await tx.select().from(lessons).where(and(eq(lessons.classSubjectId, classSubjectId), eq(lessons.status, 'planned'), gte(lessons.date, schoolDate(now)), inArray(lessons.chapterId, scope.chapters.map(chapter => chapter.id))))
      .orderBy(asc(lessons.date), asc(lessons.id)).limit(1).for('update') : [];
    /**
     * An upcoming plan exists: add the concept once to that plan and clear any duplicate queued
     * suggestion.
     */
    if (next) {
      const planned = await tx.select({ conceptId: lessonConcepts.conceptId }).from(lessonConcepts).where(eq(lessonConcepts.lessonId, next.id));
      if (planned.length >= 120 && !planned.some(item => item.conceptId === conceptId)) throw new TeacherError('The next lesson already has 120 concepts.');
      await tx.insert(lessonConcepts).values({ lessonId: next.id, conceptId }).onConflictDoNothing();
      await tx.delete(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId), eq(lessonReviewConcepts.conceptId, conceptId)));
      return { destination: 'lesson' as const, lessonId: next.id, date: next.date };
    }
    /**
     * No suitable plan exists: retain a unique suggestion for the next planning form to show
     * checked.
     */
    const draft = await tx.select({ conceptId: lessonReviewConcepts.conceptId }).from(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId)));
    if (draft.length >= 100 && !draft.some(item => item.conceptId === conceptId)) throw new TeacherError('The next lesson draft already has 100 lesson review concepts.');
    await tx.insert(lessonReviewConcepts).values({ classSubjectId, personId: caller.accountId, conceptId }).onConflictDoNothing();
    return { destination: 'draft' as const, lessonId: null, date: null };
  });
}
