import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { people, grades, classes, classSubjects, classChapters, chapters, topics, concepts, lessons, lessonConcepts, homework, questions, learners, lessonFeedback, lessonReviewConcepts } from '../db/schema';
import { orderedTeachingConcepts } from './teacherConceptOrder';
import { getCurriculum } from './curriculumService';
import type { AuthPayload } from '../middleware/auth';
export class TeacherError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Pick<typeof db, 'transaction'>;
export function schoolDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export async function teacherScope(tx: Tx, caller: AuthPayload, classSubjectId: number, chapterId?: number) {
  const [person] = await tx.select().from(people).where(and(eq(people.id, caller.accountId), eq(people.schoolId, caller.schoolId ?? -1), eq(people.accountSetUp, true)));
  if (caller.accountType !== 'person' || !person || !['teacher', 'principal'].includes(person.role)) throw new TeacherError('Teaching access required.', 403);
  const [allocation] = await tx.select({ id: classSubjects.id, classId: classes.id, className: classes.name, subjectId: classSubjects.subjectId, gradeNumber: grades.number, personId: classSubjects.personId }).from(classSubjects).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId)).where(and(eq(classSubjects.id, classSubjectId), eq(classSubjects.active, true), eq(grades.schoolId, person.schoolId)));
  if (!allocation) throw new TeacherError('Teaching assignment not found.', 404);
  const library = await getCurriculum(allocation.subjectId, allocation.gradeNumber, tx);
  const overrides = await tx.select().from(classChapters).where(eq(classChapters.classSubjectId, classSubjectId));
  const owned = library.chapters.filter(chapter => (overrides.find(link => link.chapterId === chapter.id)?.personId ?? allocation.personId) === person.id);
  if (chapterId ? !owned.some(chapter => chapter.id === chapterId) : !owned.length && allocation.personId !== person.id) throw new TeacherError('You are not assigned to this chapter or class subject.', 403);
  return { allocation, chapters: owned };
}
export async function lessonScope(tx: Tx, caller: AuthPayload, lessonId: number) {
  const [lesson] = await tx.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson) throw new TeacherError('Lesson not found.', 404);
  await teacherScope(tx, caller, lesson.classSubjectId, lesson.chapterId);
  return lesson;
}
export async function getPlanning(caller: AuthPayload, classSubjectId: number, database: Database = db) {
  return database.transaction(async tx => {
    const scope = await teacherScope(tx, caller, classSubjectId);
    const history = await tx.select().from(lessons).where(eq(lessons.classSubjectId, classSubjectId)).orderBy(desc(lessons.date), desc(lessons.id));
    const confirmed = history.filter(row => row.status === 'confirmed');
    const items = confirmed.length ? await tx.select().from(lessonConcepts).where(inArray(lessonConcepts.lessonId, confirmed.map(row => row.id))) : [];
    const taught = new Set(items.map(item => item.conceptId));
    const progress = scope.chapters.map(chapter => { const count = chapter.topics.flatMap(topic => topic.concepts); return { ...chapter, total: count.length, taught: count.filter(concept => taught.has(concept.id)).length }; });
    const current = progress.find(chapter => chapter.taught < chapter.total) ?? progress[progress.length - 1] ?? null;
    const customConcepts = current ? await tx.select({ id: concepts.id, name: concepts.name, topicId: concepts.topicId }).from(concepts).where(and(eq(concepts.chapterId, current.id), eq(concepts.classSubjectId, classSubjectId), eq(concepts.active, true), eq(concepts.isCustom, true))).orderBy(concepts.orderIndex, concepts.id) : [];
    const roster = await tx.select({ id: learners.id }).from(learners).where(eq(learners.classId, scope.allocation.classId));
    const reactions = items.length && roster.length ? await tx.select({ lessonConceptId: lessonFeedback.lessonConceptId, reaction: lessonFeedback.reaction }).from(lessonFeedback).where(and(inArray(lessonFeedback.lessonConceptId, items.map(item => item.id)), inArray(lessonFeedback.learnerID, roster.map(row => row.id)))) : [];
    const flags = [...(current?.topics.flatMap(topic => topic.concepts) ?? []), ...customConcepts].flatMap(concept => {
      for (const lesson of confirmed) {
        const item = items.find(item => item.lessonId === lesson.id && item.conceptId === concept.id);
        if (!item) continue;
        const feedback = reactions.filter(row => row.lessonConceptId === item.id);
        if (!feedback.length) continue;
        const count = feedback.filter(row => row.reaction === 'didnt_understand').length;
        return roster.length && count / roster.length >= .3 ? [{ ...concept, didntUnderstand: count, totalLearners: roster.length }] : [];
      }
      return [];
    });
    const draft = await tx.select().from(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId)));
    const ordered = await orderedTeachingConcepts(tx, scope.chapters.map(chapter => chapter.id), classSubjectId);
    const reviewConcepts = ordered.filter(concept => draft.some(item => item.conceptId === concept.id));
    const nextConcepts = ordered.filter(concept => !taught.has(concept.id)).slice(0, 10);
    const planningConcepts = ordered.filter(concept => nextConcepts.some(next => next.id === concept.id) || reviewConcepts.some(review => review.id === concept.id));
    return { chapter: current, customConcepts, reviewConcepts, planningConcepts, taughtConceptIds: Array.from(taught), flaggedConcepts: flags, suggestedDate: schoolDate(), aiAvailable: !!process.env.OPENAI_API_KEY };
  });
}
export async function savePlan(caller: AuthPayload, classSubjectId: number, data: { chapterId: number; date: string; conceptIds: number[]; reviewConceptIds?: number[]; customConcepts?: { name: string; topicId: number }[] }, database: Database = db) {
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7413, ${classSubjectId})`);
    const scope = await teacherScope(tx, caller, classSubjectId, data.chapterId);
    const chapter = scope.chapters.find(row => row.id === data.chapterId)!;
    const draft = await tx.select().from(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId)));
    const ordered = await orderedTeachingConcepts(tx, scope.chapters.map(chapter => chapter.id), classSubjectId);
    const review = ordered.filter(concept => draft.some(item => item.conceptId === concept.id));
    const taughtItems = await tx.select({ conceptId: lessonConcepts.conceptId }).from(lessonConcepts).innerJoin(lessons, eq(lessons.id, lessonConcepts.lessonId)).where(and(eq(lessons.classSubjectId, classSubjectId), eq(lessons.status, 'confirmed')));
    const taught = new Set(taughtItems.map(item => item.conceptId));
    const valid = new Set(ordered.filter(concept => !taught.has(concept.id)).slice(0, 10).map(concept => concept.id));
    review.forEach(concept => valid.add(concept.id));
    if (data.conceptIds.some(id => !valid.has(id))) throw new TeacherError('Choose from the first 10 untaught concepts or concepts added from lesson feedback. Refresh the plan if teaching has changed.');
    if (new Set(data.conceptIds).size !== data.conceptIds.length) throw new TeacherError('Concepts must not be duplicated.');
    const custom = data.customConcepts ?? [];
    if (!data.conceptIds.length && !custom.length) throw new TeacherError('Choose at least one concept.');
    if (data.conceptIds.length + custom.length > 120) throw new TeacherError('A lesson can include at most 120 concepts, including lesson reviews.');
    if (custom.some(item => !chapter.topics.some(topic => topic.id === item.topicId))) throw new TeacherError('Custom concepts need a topic in this chapter.');
    // Custom concepts are additive lesson content, never part of the shared ATP library.
    const created = custom.length ? await tx.insert(concepts).values(custom.map((item, index) => ({ chapterId: chapter.id, classSubjectId, topicId: item.topicId, name: item.name.trim(), orderIndex: 100000 + index, isCustom: true }))).returning() : [];
    const selected = new Set([...data.conceptIds, ...created.map(row => row.id)]);
    const primaryChapterId = ordered.find(concept => selected.has(concept.id))?.chapterId ?? chapter.id;
    const [plan] = await tx.insert(lessons).values({ classSubjectId, chapterId: primaryChapterId, date: data.date, status: 'planned' }).returning();
    const curriculumOrder = await orderedTeachingConcepts(tx, scope.chapters.map(chapter => chapter.id), classSubjectId);
    await tx.insert(lessonConcepts).values(curriculumOrder.filter(concept => selected.has(concept.id)).map(concept => ({ lessonId: plan!.id, conceptId: concept.id, teachingBrief: { conceptName: concept.name, prerequisites: concept.prerequisites, learningOutcomes: concept.learningOutcomes } })));
    // Consume both accepted and declined suggestions shown by this form. Suggestions
    // added in another tab after it loaded stay queued for the following plan.
    const reviewed = review.filter(concept => (data.reviewConceptIds ?? review.map(row => row.id)).includes(concept.id));
    if (reviewed.length) await tx.delete(lessonReviewConcepts).where(and(eq(lessonReviewConcepts.classSubjectId, classSubjectId), eq(lessonReviewConcepts.personId, caller.accountId), inArray(lessonReviewConcepts.conceptId, reviewed.map(row => row.id))));
    return plan!;
  });
}
export async function confirmPlan(caller: AuthPayload, lessonId: number, conceptIds: number[], database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    await tx.select().from(lessons).where(eq(lessons.id, lessonId)).for('update');
    const lesson = await lessonScope(tx, caller, lessonId);
    if (lesson.status !== 'planned') throw new TeacherError('This lesson has already been confirmed.', 409);
    if (lesson.date > schoolDate(now)) throw new TeacherError('Confirm the lesson on or after its date.');
    const planned = await tx.select().from(lessonConcepts).where(eq(lessonConcepts.lessonId, lessonId));
    if (new Set(conceptIds).size !== conceptIds.length || conceptIds.some(id => !planned.some(item => item.conceptId === id))) throw new TeacherError('Only planned concepts can be confirmed.');
    const omitted = planned.filter(item => !conceptIds.includes(item.conceptId));
    if (omitted.length) await tx.delete(lessonConcepts).where(inArray(lessonConcepts.id, omitted.map(item => item.id)));
    // Planned lessons use current shared guidance; freeze it only when taught.
    const kept = planned.filter(item => conceptIds.includes(item.conceptId));
    const guidance = kept.length ? await tx.select().from(concepts).where(inArray(concepts.id, kept.map(item => item.conceptId))) : [];
    for (const item of kept) {
      const concept = guidance.find(concept => concept.id === item.conceptId)!;
      await tx.update(lessonConcepts).set({ teachingBrief: { conceptName: concept.name, prerequisites: concept.prerequisites, learningOutcomes: concept.learningOutcomes } }).where(eq(lessonConcepts.id, item.id));
    }
    const [confirmed] = await tx.update(lessons).set({ status: 'confirmed' }).where(eq(lessons.id, lessonId)).returning();
    return confirmed!;
  });
}
export async function getHomeworkContext(caller: AuthPayload, lessonId: number, database: Database = db) {
  return database.transaction(async tx => {
    const lesson = await lessonScope(tx, caller, lessonId);
    if (lesson.status !== 'confirmed') throw new TeacherError('Confirm what was taught before creating homework.');
    const [existing] = await tx.select({ id: homework.id }).from(homework).where(eq(homework.lessonId, lessonId));
    const items = await tx.select({ id: concepts.id, name: concepts.name }).from(lessonConcepts).innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId)).where(eq(lessonConcepts.lessonId, lessonId)).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id);
    const [chapter] = await tx.select().from(chapters).where(eq(chapters.id, lesson.chapterId));
    return { lesson, concepts: items, existingHomeworkId: existing?.id ?? null, chapterName: chapter!.name, gradeNumber: chapter!.gradeNumber, aiAvailable: !!process.env.OPENAI_API_KEY };
  });
}
export type HomeworkInput = { dueDate: string; memoReleaseType: 'immediately' | 'at_due_date' | 'custom'; memoReleaseAt?: string; questions: { conceptId: number; body: string; memo?: string }[] };
export async function sendHomework(caller: AuthPayload, lessonId: number, data: HomeworkInput, database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    // Serialize sends for this lesson so retries never create partial or duplicate sets.
    await tx.select().from(lessons).where(eq(lessons.id, lessonId)).for('update');
    const context = await getHomeworkContext(caller, lessonId, tx);
    if (context.existingHomeworkId) throw new TeacherError('This lesson already has homework.', 409);
    if (!data.questions.length || data.questions.some(question => !context.concepts.some(concept => concept.id === question.conceptId) || !question.body.trim())) throw new TeacherError('Each question must test a concept confirmed in this lesson.');
    const dueDate = new Date(data.dueDate), memoReleaseAt = data.memoReleaseAt ? new Date(data.memoReleaseAt) : null;
    if (!Number.isFinite(dueDate.getTime()) || dueDate <= now || (data.memoReleaseType === 'custom' && (!memoReleaseAt || !Number.isFinite(memoReleaseAt.getTime())))) throw new TeacherError('Choose a future due date and a valid memo release time.');
    const [set] = await tx.insert(homework).values({ lessonId, dueDate, memoReleaseType: data.memoReleaseType, memoReleaseAt: data.memoReleaseType === 'custom' ? memoReleaseAt : null }).returning();
    await tx.insert(questions).values(data.questions.map((question, index) => ({ homeworkId: set!.id, conceptId: question.conceptId, body: question.body.trim(), memo: question.memo?.trim() || null, orderIndex: index + 1 })));
    return set!;
  });
}

export async function updateQuestionMemo(caller: AuthPayload, questionId: number, memo: string, database: Database = db) {
 return database.transaction(async tx=>{
  const [question]=await tx.select({id:questions.id,lessonId:homework.lessonId}).from(questions).innerJoin(homework,eq(homework.id,questions.homeworkId)).where(eq(questions.id,questionId));
  if(!question) throw new TeacherError('Question not found.',404);
  await lessonScope(tx,caller,question.lessonId);
  const [updated]=await tx.update(questions).set({memo:memo.trim()||null}).where(eq(questions.id,questionId)).returning({id:questions.id,memo:questions.memo});
  return updated;
 });
}
