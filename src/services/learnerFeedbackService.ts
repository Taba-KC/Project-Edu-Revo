import { db } from '../db';
import { lessons, lessonConcepts, lessonFeedback, lessonPreviewFeedback, homework, questions, questionFeedback } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Flow 5 — get planned concepts for an upcoming lesson (preview)
export async function getLessonPreview(lessonId: number) {
  return db.select().from(lessonConcepts)
    .where(eq(lessonConcepts.lessonId, lessonId));
}

// Flow 5 — learner submits or updates a preview reaction
export async function upsertPreviewFeedback(data: {
  learnerId: number;
  lessonId: number;
  conceptId: number;
  reaction: string;
  isAnonymous: boolean;
}) {
  const existing = await db.select().from(lessonPreviewFeedback)
    .where(and(
      eq(lessonPreviewFeedback.learnerId, data.learnerId),
      eq(lessonPreviewFeedback.lessonId, data.lessonId),
      eq(lessonPreviewFeedback.conceptId, data.conceptId),
    ));

  if (existing.length > 0) {
    const [updated] = await db.update(lessonPreviewFeedback)
      .set({ reaction: data.reaction, isAnonymous: data.isAnonymous, updatedAt: new Date() })
      .where(eq(lessonPreviewFeedback.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(lessonPreviewFeedback).values(data).returning();
  return created;
}

// Flow 3 — learner submits or updates post-lesson feedback
export async function upsertLessonFeedback(data: {
  learnerId: number;
  lessonConceptId: number;
  reaction: string;
  isAnonymous: boolean;
}) {
  const existing = await db.select().from(lessonFeedback)
    .where(and(
      eq(lessonFeedback.learnerID, data.learnerId),
      eq(lessonFeedback.lessonConceptId, data.lessonConceptId),
    ));

  if (existing.length > 0) {
    const [updated] = await db.update(lessonFeedback)
      .set({ reaction: data.reaction, isAnonymous: data.isAnonymous, updatedAt: new Date() })
      .where(eq(lessonFeedback.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(lessonFeedback)
    .values({ learnerID: data.learnerId, ...data })
    .returning();
  return created;
}

// Flow 4 — get homework questions for a lesson
export async function getLearnerHomework(lessonId: number) {
  const [hw] = await db.select().from(homework).where(eq(homework.lessonId, lessonId));
  if (!hw) return null;
  const questionList = await db.select().from(questions).where(eq(questions.homeworkId, hw.id));
  return { homework: hw, questions: questionList };
}

// Flow 4 — learner marks a question as done or reveals memo
export async function upsertQuestionFeedback(data: {
  learnerId: number;
  questionId: number;
  isDone?: boolean;
  memoRevealed?: boolean;
  reaction?: string;
  isAnonymous?: boolean;
}) {
  const existing = await db.select().from(questionFeedback)
    .where(and(
      eq(questionFeedback.learnerId, data.learnerId),
      eq(questionFeedback.questionId, data.questionId),
    ));

  if (existing.length > 0) {
    const [updated] = await db.update(questionFeedback)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(questionFeedback.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(questionFeedback).values(data).returning();
  return created;
}

// Flow 6 — teacher views aggregated lesson feedback
export async function getAggregatedLessonFeedback(lessonId: number) {
  const conceptRows = await db.select().from(lessonConcepts)
    .where(eq(lessonConcepts.lessonId, lessonId));

  const result = await Promise.all(conceptRows.map(async (lc) => {
    const feedback = await db.select().from(lessonFeedback)
      .where(eq(lessonFeedback.lessonConceptId, lc.id));

    const counts = { understood: 0, not_sure: 0, didnt_understand: 0 };
    for (const f of feedback) {
      if (f.reaction === 'understood') counts.understood++;
      else if (f.reaction === 'not_sure') counts.not_sure++;
      else if (f.reaction === 'didnt_understand') counts.didnt_understand++;
    }

    return { lessonConceptId: lc.id, conceptId: lc.conceptId, counts };
  }));

  return result;
}