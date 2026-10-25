/** The learner library is scoped by the authenticated account's current class, never a client-supplied class ID. */
import { and, eq, inArray, asc, or } from 'drizzle-orm';
import { db } from '../db';
import { learners, schools, classes, grades, classSubjects, subjects, chapters, topics, concepts, lessons, lessonConcepts, lessonFeedback, homework, questions } from '../db/schema';
import type { AuthPayload } from '../middleware/auth';
import { TeacherError } from './teacherWorkspaceService';
import { getCurriculum } from './curriculumService';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Pick<typeof db, 'transaction'>;

async function learnerScope(tx: Tx, caller: AuthPayload) {
  const [profile] = await tx.select({ id: learners.id, firstName: learners.firstName, surname: learners.surname, number: learners.admissionNumber, username: learners.username, classId: learners.classId, className: classes.name, gradeNumber: grades.number, schoolName: schools.name })
    .from(learners).innerJoin(classes, eq(classes.id, learners.classId)).innerJoin(grades, eq(grades.id, classes.gradeId)).innerJoin(schools, eq(schools.id, grades.schoolId))
    .where(and(eq(learners.id, caller.accountId), eq(learners.accountSetUp, true), eq(learners.schoolId, caller.schoolId ?? -1), eq(grades.schoolId, caller.schoolId ?? -1)));
  if (caller.accountType !== 'learner' || !profile) throw new TeacherError('Learner library not found.', 404);
  return profile;
}

/** Resolve release policy on the server. An invalid or incomplete policy fails closed. */
export function answerRelease(activity: { memoReleaseType: string; createdAt: Date; dueDate: Date; memoReleaseAt: Date | null }, now = new Date()) {
  const release = activity.memoReleaseType === 'immediately' ? activity.createdAt : activity.memoReleaseType === 'at_due_date' ? activity.dueDate : activity.memoReleaseType === 'custom' ? activity.memoReleaseAt : null;
  return { releaseAt: release?.toISOString() ?? null, canReveal: !!release && Number.isFinite(release.getTime()) && now.getTime() >= release.getTime() };
}

export async function getLearnerWorkspace(caller: AuthPayload, database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    const profile = await learnerScope(tx, caller);
    const allocations = await tx.select({ id: classSubjects.id, subjectId: classSubjects.subjectId, subjectName: subjects.name }).from(classSubjects).innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .where(and(eq(classSubjects.classId, profile.classId), eq(classSubjects.active, true))).orderBy(subjects.name, classSubjects.id);
    const result = [];
    for (const allocation of allocations) {
      const curriculum = await getCurriculum(allocation.subjectId, profile.gradeNumber, tx);
      // Curriculum is shared; class-specific additions are visible only to their own class subject.
      const chapterIds = curriculum.chapters.map(chapter => chapter.id);
      const syllabus = chapterIds.length ? await tx.select({ id: concepts.id, name: concepts.name, chapterName: chapters.name, topicName: topics.name, prerequisites: concepts.prerequisites, learningOutcomes: concepts.learningOutcomes })
        .from(concepts).innerJoin(chapters, eq(chapters.id, concepts.chapterId)).innerJoin(topics, eq(topics.id, concepts.topicId))
        .where(and(inArray(concepts.chapterId, chapterIds), eq(concepts.active, true), eq(topics.active, true), or(eq(concepts.isCustom, false), eq(concepts.classSubjectId, allocation.id))))
        .orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id) : [];
      const history = await tx.select().from(lessons).where(eq(lessons.classSubjectId, allocation.id)).orderBy(asc(lessons.lessonNumber));
      const items = history.length ? await tx.select({ lessonId: lessonConcepts.lessonId, lessonConceptId: lessonConcepts.id, id: concepts.id, name: concepts.name, chapterName: chapters.name, topicName: topics.name, prerequisites: concepts.prerequisites, learningOutcomes: concepts.learningOutcomes, teachingBrief: lessonConcepts.teachingBrief, reviewGoals: lessonConcepts.reviewGoals, goalResponses: lessonFeedback.goalResponses })
        .from(lessonConcepts).innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
        .leftJoin(lessonFeedback, and(eq(lessonFeedback.lessonConceptId, lessonConcepts.id), eq(lessonFeedback.learnerID, caller.accountId)))
        .where(inArray(lessonConcepts.lessonId, history.map(lesson => lesson.id))).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id) : [];
      const completed = history.filter(lesson => lesson.status === 'confirmed');
      const taught = new Set(items.filter(item => completed.some(lesson => lesson.id === item.lessonId)).map(item => item.id));
      const activities = completed.length ? await tx.select().from(homework).where(inArray(homework.lessonId, completed.map(lesson => lesson.id))).orderBy(homework.createdAt, homework.id) : [];
      // Deliberately do NOT select questions.memo. The answer endpoint independently enforces release time.
      const activityQuestions = activities.length ? await tx.select({ id: questions.id, homeworkId: questions.homeworkId, body: questions.body, conceptId: questions.conceptId, conceptName: concepts.name, chapterName: chapters.name, topicName: topics.name })
        .from(questions).innerJoin(concepts, eq(concepts.id, questions.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId))
        .where(inArray(questions.homeworkId, activities.map(activity => activity.id))).orderBy(questions.orderIndex, questions.id) : [];
      result.push({ ...allocation, syllabus: syllabus.map(concept => ({ ...concept, taught: taught.has(concept.id) })),
        lessons: history.filter(lesson => ['planned', 'confirmed'].includes(lesson.status)).map(lesson => ({ id: lesson.id, lessonNumber: lesson.lessonNumber, date: lesson.date, status: lesson.status,
          canRespond: lesson.status === 'confirmed' && !history.some(next => next.lessonNumber > lesson.lessonNumber && next.createdAt >= lesson.createdAt),
          concepts: items.filter(item => item.lessonId === lesson.id).map(item => {
            const brief = lesson.status === 'confirmed' ? item.teachingBrief : null;
            const goals = brief?.learningOutcomes ?? item.learningOutcomes;
            return { id: item.id, lessonConceptId: item.lessonConceptId, name: brief?.conceptName ?? item.name, chapterName: item.chapterName, topicName: item.topicName, prerequisites: brief?.prerequisites ?? item.prerequisites, learningOutcomes: goals, reviewGoals: item.reviewGoals,
              answers: goals.map((goal, goalIndex) => item.goalResponses?.find(answer => answer.goalIndex === goalIndex && answer.goal === goal)?.answer ?? null) };
          }) })),
        homework: activities.map((activity, index) => ({ id: activity.id, activityNumber: index + 1, lessonId: activity.lessonId, dueDate: activity.dueDate, ...answerRelease(activity, now), questions: activityQuestions.filter(question => question.homeworkId === activity.id) })) });
    }
    return { profile, subjects: result };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function getLearnerAnswer(caller: AuthPayload, questionId: number, database: Database = db, now = new Date()) {
  return database.transaction(async tx => {
    const profile = await learnerScope(tx, caller);
    const [row] = await tx.select({ memo: questions.memo, activity: homework }).from(questions).innerJoin(homework, eq(homework.id, questions.homeworkId)).innerJoin(lessons, eq(lessons.id, homework.lessonId)).innerJoin(classSubjects, eq(classSubjects.id, lessons.classSubjectId))
      .where(and(eq(questions.id, questionId), eq(classSubjects.classId, profile.classId), eq(classSubjects.active, true), eq(lessons.status, 'confirmed')));
    if (!row) throw new TeacherError('Question not found.', 404);
    if (!answerRelease(row.activity, now).canReveal) throw new TeacherError('The teacher has not released this answer yet.', 409);
    return { questionId, memo: row.memo };
  });
}
