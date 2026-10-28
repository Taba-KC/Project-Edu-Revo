import { lessonRoster } from './classStreamService';
/**
 * Aggregate Yes/No learning-goal feedback for confirmed lessons and queue concepts for
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
import { goalUnderstanding } from './lessonGoals';
type Database = Pick<typeof db, 'transaction'>;

/**
 * Read recent owned confirmed lessons and rank concepts by No answers to their frozen goals.
 * Original-lesson audience counts are anonymous; legacy concept counts remain for older API consumers.
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
    const audiences = new Map<number, { id: number }[]>();
    for (const set of sets) audiences.set(set.id, await lessonRoster(tx, set.id));
    const items = await tx.select({ id: lessonConcepts.id, lessonId: lessonConcepts.lessonId, conceptId: concepts.id, name: concepts.name, teachingBrief: lessonConcepts.teachingBrief, learningOutcomes: concepts.learningOutcomes }).from(lessonConcepts)
      .innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
      .where(inArray(lessonConcepts.lessonId, sets.map(set => set.id))).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
    /**
     * Count only learners in the original lesson audience and responses to the retrieved lesson
     * associations.
     */
    const reactions = items.length ? await tx.select({ learnerId: lessonFeedback.learnerID, lessonConceptId: lessonFeedback.lessonConceptId, reaction: lessonFeedback.reaction, goalResponses: lessonFeedback.goalResponses })
      .from(lessonFeedback).where(and(inArray(lessonFeedback.lessonConceptId, items.map(item => item.id)))) : [];
    const available = await orderedTeachingConcepts(tx, chapterIds, classSubjectId);
    return sets.map(set => { const roster = audiences.get(set.id)!; const setReactions = reactions.filter(row => roster.some(learner => learner.id === row.learnerId)); return ({ ...set, totalLearners: roster.length, concepts: items.filter(item => item.lessonId === set.id).map(item => {
      const learningGoals = goalUnderstanding(item.teachingBrief?.learningOutcomes ?? item.learningOutcomes, setReactions.filter(row => row.lessonConceptId === item.id), roster.length);
      return { id: item.conceptId, name: item.teachingBrief?.conceptName ?? item.name, teachingBrief: item.teachingBrief, canReview: available.some(concept => concept.id === item.conceptId), counts: conceptUnderstanding(item.id, setReactions, roster.length), learningGoals, noCount: learningGoals.reduce((sum, goal) => sum + goal.no, 0) };
    }).sort((a, b) => b.noCount - a.noCount || understandingScore(a.counts) - understandingScore(b.counts) || 0) }); });
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

/**
 * Validate that the concept belongs to the source lesson, then add it to an upcoming owned
 * plan or queue it once for later planning.
 */
export async function addLessonConceptToNextLesson(caller: AuthPayload, lessonId: number, conceptId: number, database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    const source = await lessonScope(tx, caller, lessonId);
    if (source.status !== 'confirmed') throw new TeacherError('Choose a confirmed lesson.');
    const classSubjectId = source.classSubjectId;
    await tx.execute(sql`select pg_advisory_xact_lock(7413, ${classSubjectId})`);
    const scope = await teacherScope(tx, caller, classSubjectId);
    const [item] = await tx.select({ id: lessonConcepts.id, teachingBrief: lessonConcepts.teachingBrief }).from(lessonConcepts).where(and(eq(lessonConcepts.lessonId, lessonId), eq(lessonConcepts.conceptId, conceptId))).limit(1);
    const ordered = await orderedTeachingConcepts(tx, scope.chapters.map(chapter => chapter.id), classSubjectId);
    if (!item || !ordered.some(concept => concept.id === conceptId)) throw new TeacherError('Choose an active concept from this lesson and your teaching allocation.');
    const roster = await lessonRoster(tx,lessonId);
    const responses = roster.length ? await tx.select({ learnerId: lessonFeedback.learnerID, goalResponses: lessonFeedback.goalResponses }).from(lessonFeedback).where(and(eq(lessonFeedback.lessonConceptId, item.id), inArray(lessonFeedback.learnerID, roster.map(learner => learner.id)))) : [];
    const goals = item.teachingBrief?.learningOutcomes ?? ordered.find(concept => concept.id === conceptId)!.learningOutcomes;
    const reviewGoals = goalUnderstanding(goals, responses, roster.length).filter(goal => goal.no > 0).map(goal => goal.goal);
    const [next] = scope.chapters.length ? await tx.select().from(lessons).where(and(eq(lessons.classSubjectId, classSubjectId), eq(lessons.status, 'planned'), gte(lessons.date, schoolDate(now)), inArray(lessons.chapterId, scope.chapters.map(chapter => chapter.id))))
      .orderBy(asc(lessons.date), asc(lessons.id)).limit(1).for('update') : [];
    /**
     * An upcoming plan exists: add the concept once to that plan and clear any duplicate queued
     * suggestion.
     */
    if (next) {
      const planned = await tx.select({ conceptId: lessonConcepts.conceptId }).from(lessonConcepts).where(eq(lessonConcepts.lessonId, next.id));
      if (planned.length >= 120 && !planned.some(item => item.conceptId === conceptId)) throw new TeacherError('The next lesson already has 120 concepts.');
      const [existing] = await tx.select({ reviewGoals: lessonConcepts.reviewGoals }).from(lessonConcepts).where(and(eq(lessonConcepts.lessonId, next.id), eq(lessonConcepts.conceptId, conceptId)));
      const focus = [...new Set([...(existing?.reviewGoals ?? []), ...reviewGoals])].slice(0, 5);
      await tx.insert(lessonConcepts).values({ lessonId: next.id, conceptId, reviewGoals: focus }).onConflictDoUpdate({ target: [lessonConcepts.lessonId, lessonConcepts.conceptId], set: { reviewGoals: focus } });
      await tx.delete(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId), eq(lessonReviewConcepts.conceptId, conceptId)));
      return { destination: 'lesson' as const, lessonId: next.id, date: next.date };
    }
    /**
     * No suitable plan exists: retain a unique suggestion for the next planning form to show
     * checked.
     */
    const draft = await tx.select({ conceptId: lessonReviewConcepts.conceptId, reviewGoals: lessonReviewConcepts.reviewGoals }).from(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId)));
    if (draft.length >= 100 && !draft.some(item => item.conceptId === conceptId)) throw new TeacherError('The next lesson draft already has 100 lesson review concepts.');
    const focus = [...new Set([...(draft.find(item => item.conceptId === conceptId)?.reviewGoals ?? []), ...reviewGoals])].slice(0, 5);
    await tx.insert(lessonReviewConcepts).values({ classSubjectId, personId: caller.accountId, conceptId, reviewGoals: focus }).onConflictDoUpdate({ target: [lessonReviewConcepts.classSubjectId, lessonReviewConcepts.personId, lessonReviewConcepts.conceptId], set: { reviewGoals: focus } });
    return { destination: 'draft' as const, lessonId: null, date: null };
  });
}
