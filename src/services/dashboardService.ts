/**
 * Assemble role-scoped dashboard response data from related records. The browser receives a
 * screen-friendly shape rather than raw tables; learner memo visibility is decided before
 * returning data.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { people, learners, schools, grades, classes, subjects, classSubjects, classChapters, chapters, topics, lessons, lessonConcepts, concepts, homework, questions, lessonFeedback, questionFeedback, announcements } from '../db/schema';
import { getCurriculum } from './curriculumService';
import { learnerSubjectIds } from './classStreamService';
export class DashboardError extends Error { constructor(message: string, public status = 404) { super(message); } }
export type DashboardRole = 'staff' | 'learner';
/**
 * Build the caller's dashboard by joining permitted assignments, curriculum, lessons and
 * homework. Filter learner memo visibility before returning JSON.
 */
export async function getDashboard(role: DashboardRole, accountId: number, schoolId: number, database: Pick<typeof db, 'transaction'> = db, now = new Date()) {
  return database.transaction(async tx => {
    const enrolled=role==='learner'?await learnerSubjectIds(tx,{accountId,schoolId,accountType:'learner'}):[];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const [school] = await tx.select({ id: schools.id, name: schools.name }).from(schools).where(eq(schools.id, schoolId));
    if (!school) throw new DashboardError('School not found');
    const [account] = role === 'staff'
      ? await tx.select({ id: people.id, firstName: people.firstName, surname: people.surname, title: people.title, username: people.username, number: people.staffNumber, accountSetUp: people.accountSetUp }).from(people).where(and(eq(people.id, accountId), eq(people.schoolId, schoolId)))
      : await tx.select({ id: learners.id, firstName: learners.firstName, surname: learners.surname, username: learners.username, number: learners.admissionNumber, accountSetUp: learners.accountSetUp }).from(learners).where(and(eq(learners.id, accountId), eq(learners.schoolId, schoolId)));
    if (!account) throw new DashboardError('Account not found');
    if (!account.accountSetUp) throw new DashboardError('Claim your account before signing in.', 403);
    const [learnerClass] = role === 'learner' ? await tx.select({ id: classes.id, name: classes.name, gradeId: grades.id, gradeNumber: grades.number, streamId: classes.streamId }).from(learners)
      .innerJoin(classes, eq(classes.id, learners.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(eq(learners.id, accountId), eq(learners.schoolId, schoolId), eq(grades.schoolId, schoolId))) : [];
    if (role === 'learner' && !learnerClass) throw new DashboardError('Your class could not be found. Contact your school administrator.');
    const allocations = await tx.select({ id: classSubjects.id, subjectId: subjects.id, subjectName: subjects.name, classId: classes.id, className: classes.name, gradeId: grades.id, gradeNumber: grades.number, streamId: classes.streamId, personId: classSubjects.personId })
      .from(classSubjects).innerJoin(subjects, eq(subjects.id, classSubjects.subjectId)).innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(eq(grades.schoolId, schoolId), eq(classSubjects.active, true), eq(classSubjects.academicYear, classes.academicYear), ...(role === 'learner' ? [eq(classes.id, learnerClass!.id),inArray(classSubjects.subjectId,enrolled.length?enrolled:[-1])] : [])))
      .orderBy(subjects.name, grades.number, classes.name);
    const links = allocations.length ? await tx.select({ classSubjectId: classChapters.classSubjectId, chapterId: chapters.id, subjectId: chapters.subjectId, gradeNumber: chapters.gradeNumber, personId: classChapters.personId }).from(classChapters)
      .innerJoin(chapters, eq(chapters.id, classChapters.chapterId)).where(and(inArray(classChapters.classSubjectId, allocations.map(row => row.id)), eq(chapters.active, true))) : [];
    const visible = allocations.filter(row => role === 'learner' || row.personId === accountId || links.some(link => link.classSubjectId === row.id && link.subjectId === row.subjectId && link.gradeNumber === row.gradeNumber && link.personId === accountId));
    const lessonRows = visible.length ? await tx.select().from(lessons).where(inArray(lessons.classSubjectId, visible.map(row => row.id))).orderBy(desc(lessons.date), desc(lessons.id)) : [];
    const lessonItems = lessonRows.length ? await tx.select({ id: lessonConcepts.id, lessonId: lessonConcepts.lessonId, conceptId: concepts.id, name: concepts.name, prerequisites: concepts.prerequisites, learningOutcomes: concepts.learningOutcomes, teachingBrief: lessonConcepts.teachingBrief, reviewGoals: lessonConcepts.reviewGoals }).from(lessonConcepts).innerJoin(concepts, eq(concepts.id, lessonConcepts.conceptId)).innerJoin(topics, eq(topics.id, concepts.topicId)).innerJoin(chapters, eq(chapters.id, concepts.chapterId)).where(inArray(lessonConcepts.lessonId, lessonRows.map(row => row.id))).orderBy(chapters.orderIndex, chapters.id, topics.orderIndex, topics.id, concepts.orderIndex, concepts.id) : [];
    const homeworkRows = lessonRows.length ? await tx.select().from(homework).where(inArray(homework.lessonId, lessonRows.map(row => row.id))) : [];
    const questionRows = homeworkRows.length ? await tx.select({ id: questions.id, homeworkId: questions.homeworkId, body: questions.body, conceptId: questions.conceptId, orderIndex: questions.orderIndex, hasMemo: questions.memo }).from(questions).where(inArray(questions.homeworkId, homeworkRows.map(row => row.id))).orderBy(questions.orderIndex) : [];
    const responses = role === 'learner' && lessonItems.length ? await tx.select({ lessonConceptId: lessonFeedback.lessonConceptId }).from(lessonFeedback).where(and(eq(lessonFeedback.learnerID, accountId), inArray(lessonFeedback.lessonConceptId, lessonItems.map(row => row.id)), inArray(lessonFeedback.reaction, ['understood', 'didnt_understand']))) : [];
    const questionResponses = role === 'learner' && questionRows.length ? await tx.select().from(questionFeedback).where(and(eq(questionFeedback.learnerId, accountId), inArray(questionFeedback.questionId, questionRows.map(row => row.id)))) : [];
    const subjectList = [];
    for (const row of visible) {
      const library = await getCurriculum(row.subjectId, row.gradeNumber, tx);
      const canTeach = (chapterId: number) => {
        const link = links.find(link => link.classSubjectId === row.id && link.chapterId === chapterId);
        return role === 'learner' || (link?.personId ?? row.personId) === accountId;
      };
      const curriculum = library.chapters.filter(chapter => canTeach(chapter.id));
      const history = lessonRows.filter(lesson => lesson.classSubjectId === row.id && library.chapters.some(chapter => chapter.id === lesson.chapterId) && canTeach(lesson.chapterId));
      const taughtIds = new Set(lessonItems.filter(item => history.some(lesson => lesson.id === item.lessonId && lesson.status === 'confirmed')).map(item => item.conceptId));
      const chapterProgress = curriculum.map(chapter => {
        const items = chapter.topics.flatMap(topic => topic.concepts);
        return { ...chapter, total: items.length, taught: items.filter(item => taughtIds.has(item.id)).length };
      });
      const current = chapterProgress.find(chapter => chapter.total > chapter.taught) ?? chapterProgress[chapterProgress.length - 1] ?? null;
      subjectList.push({ id: row.id, subjectName: row.subjectName, className: row.className, classId: row.classId, gradeNumber: row.gradeNumber,
        currentChapter: current ? { id: current.id, name: current.name, total: current.total, taught: current.taught } : null,
        totalConcepts: chapterProgress.reduce((sum, chapter) => sum + chapter.total, 0), taughtConcepts: chapterProgress.reduce((sum, chapter) => sum + chapter.taught, 0),
        curriculum: chapterProgress,
        lessons: history.map(lesson => ({ id: lesson.id, lessonNumber: lesson.lessonNumber, date: lesson.date, status: lesson.status, chapterName: library.chapters.find(chapter => chapter.id === lesson.chapterId)?.name ?? 'Chapter',
          concepts: lessonItems.filter(item => item.lessonId === lesson.id).map(item => ({ id: item.conceptId, name: lesson.status === 'confirmed' ? item.teachingBrief?.conceptName ?? item.name : item.name, ...(role === 'staff' ? { reviewGoals: item.reviewGoals, teachingBrief: lesson.status === 'planned' ? { conceptName: item.name, prerequisites: item.prerequisites, learningOutcomes: item.learningOutcomes } : item.teachingBrief ?? { conceptName: item.name, prerequisites: item.prerequisites, learningOutcomes: item.learningOutcomes } } : {}) })),
          homework: homeworkRows.filter(hw => hw.lessonId === lesson.id && lesson.status === 'confirmed').map(hw => ({ id: hw.id, dueDate: hw.dueDate,
            questions: questionRows.filter(question => question.homeworkId === hw.id).map(question => ({ id: question.id, body: question.body, conceptId: question.conceptId, ...(role === 'staff' ? { memo: question.hasMemo } : {}) })) })) })) });
    }
    type Task = { id: string; classSubjectId: number; lessonId: number; subjectName: string; className: string; kind: string; date: string };
    const needsYou: Task[] = [], waitingForYou: Task[] = [], comingUp: Task[] = [];
    for (const subject of subjectList) for (const lesson of subject.lessons) {
      const task = { classSubjectId: subject.id, lessonId: lesson.id, subjectName: subject.subjectName, className: subject.className, date: lesson.date };
      if (role === 'staff') {
        if (lesson.status === 'planned' && lesson.date < today) needsYou.push({ ...task, id: 'confirm-' + lesson.id, kind: 'Confirm what was taught' });
        if (lesson.status === 'confirmed' && lesson.concepts.length > 0 && lesson.homework.length === 0) needsYou.push({ ...task, id: 'homework-' + lesson.id, kind: 'Create homework' });
      } else {
        const nextPlan = lessonRows.filter(row => row.classSubjectId === subject.id && (row.createdAt > lessonRows.find(source => source.id === lesson.id)!.createdAt || (+row.createdAt === +lessonRows.find(source => source.id === lesson.id)!.createdAt && row.lessonNumber > lesson.lessonNumber)));
        if (lesson.status === 'confirmed' && !nextPlan.length && lessonItems.some(item => item.lessonId === lesson.id && !responses.some(response => response.lessonConceptId === item.id))) waitingForYou.push({ ...task, id: 'feedback-' + lesson.id, kind: 'Lesson feedback' });
        for (const hw of lesson.homework) {
          const stored = homeworkRows.find(row => row.id === hw.id)!;
          if (hw.questions.some(question => { const response = questionResponses.find(row => row.questionId === question.id); return !response?.isDone; })) waitingForYou.push({ ...task, id: 'homework-' + hw.id, kind: 'Homework', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(stored.dueDate) });
        }
      }
    }
    if (role === 'learner') for (const subject of subjectList) {
      const next = subject.lessons.filter(lesson => lesson.status === 'planned' && lesson.date >= today).sort((a,b) => a.date.localeCompare(b.date) || a.id-b.id)[0];
      if (next) comingUp.push({ id: 'preview-' + next.id, classSubjectId: subject.id, lessonId: next.id, subjectName: subject.subjectName, className: subject.className, date: next.date, kind: 'Preview next lesson' });
    }
    const relevantClasses = role === 'learner' ? [learnerClass!] : allocations.filter(row => visible.some(subject => subject.id === row.id)).map(row => ({ id: row.classId, gradeId: row.gradeId, streamId: row.streamId }));
    const notices = (await tx.select({ id: announcements.id, title: announcements.title, body: announcements.body, audienceType: announcements.audienceType, audienceId: announcements.audienceId, createdAt: announcements.createdAt }).from(announcements).where(eq(announcements.schoolId, schoolId)).orderBy(desc(announcements.createdAt)))
      .filter(notice => notice.audienceType === 'all' || relevantClasses.some(cls => (notice.audienceType === 'class' && notice.audienceId === cls.id) || (notice.audienceType === 'grade' && notice.audienceId === cls.gradeId) || (notice.audienceType === 'stream' && cls.streamId !== null && notice.audienceId === cls.streamId)));
    return { profile: { ...account, schoolName: school.name, className: learnerClass?.name ?? null, gradeNumber: learnerClass?.gradeNumber ?? null }, subjects: subjectList, needsYou, waitingForYou, comingUp, announcements: notices };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
