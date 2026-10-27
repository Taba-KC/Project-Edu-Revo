/** Integration checks use an isolated school and roll all fixture data back. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, people, learners, subjects, classSubjects, chapters, topics, concepts, lessons, lessonConcepts, homework, questions, lessonFeedback, lessonReviewConcepts } from '../src/db/schema';
import { StreamChoiceError } from '../src/services/classStreamService';
import { getLearnerWorkspace, getLearnerAnswer, answerRelease } from '../src/services/learnerWorkspaceService';
import { submitLearningGoalFeedback } from '../src/services/lessonResponseService';
import { getLessonFeedback, addLessonConceptToNextLesson } from '../src/services/teacherLessonFeedbackService';
import { getPlanning, savePlan, TeacherError } from '../src/services/teacherWorkspaceService';
import { goalUnderstanding } from '../src/services/lessonGoals';
import app from '../src/app';
import jwt from 'jsonwebtoken';

async function run() {
  const before = new Date('2026-10-25T09:59:59Z'), release = new Date('2026-10-25T10:00:00Z');
  assert.equal(answerRelease({ memoReleaseType: 'custom', createdAt: before, dueDate: release, memoReleaseAt: release }, before).canReveal, false);
  assert.equal(answerRelease({ memoReleaseType: 'custom', createdAt: before, dueDate: release, memoReleaseAt: release }, release).canReveal, true);
  assert.equal(answerRelease({ memoReleaseType: 'custom', createdAt: before, dueDate: release, memoReleaseAt: null }, release).canReveal, false);
  assert.equal(answerRelease({ memoReleaseType: 'unknown', createdAt: before, dueDate: release, memoReleaseAt: release }, release).canReveal, false);
  assert.deepEqual(goalUnderstanding(['A'], [{ learnerId: 1, goalResponses: [{ goalIndex: 0, goal: 'Different goal', answer: 'no' }] }], 2), [{ goalIndex: 0, goal: 'A', yes: 0, no: 0, responses: 0, noResponse: 2 }]);
  const rollback = new Error('Rollback learner workspace fixtures');
  try {
    await db.transaction(async tx => {
      const key = `learner-library-${Date.now()}`;
      const [circuit] = await tx.select().from(circuits).limit(1);
      const [school] = await tx.insert(schools).values({ circuitId: circuit!.id, name: key, activationCode: key }).returning();
      const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11)));
      const [cls, otherClass] = await tx.insert(classes).values([{ gradeId: grade!.id, name: '11B' }, { gradeId: grade!.id, name: '11C' }]).returning();
      const [teacher] = await tx.insert(people).values({ title: 'Ms', firstName: 'Test', surname: 'Teacher', staffNumber: 'T', schoolId: school!.id, accountSetUp: true }).returning();
      const staff = { accountId: teacher!.id, accountType: 'person', role: 'teacher', schoolId: school!.id };
      const roster = await tx.insert(learners).values([0, 1, 2].map(index => ({ firstName: 'Private', surname: String(index), admissionNumber: String(index), classId: index === 2 ? otherClass!.id : cls!.id, schoolId: school!.id, accountSetUp: true }))).returning();
      const caller = { accountId: roster[0]!.id, accountType: 'learner', schoolId: school!.id };
      const otherLearner = { ...caller, accountId: roster[1]!.id }, outsider = { ...caller, accountId: roster[2]!.id };
      const [subject] = await tx.insert(subjects).values({ name: key }).returning();
      const [allocation] = await tx.insert(classSubjects).values({ classId: cls!.id, subjectId: subject!.id, personId: teacher!.id }).returning();
      const chapterRows = await tx.insert(chapters).values([1, 2].map(orderIndex => ({ subjectId: subject!.id, gradeNumber: 11, name: `Chapter ${orderIndex}`, orderIndex }))).returning();
      const topicRows = await tx.insert(topics).values(chapterRows.map(chapter => ({ chapterId: chapter.id, name: `Topic ${chapter.orderIndex}`, orderIndex: 1 }))).returning();
      const conceptRows = await tx.insert(concepts).values([0, 1, 2].map(index => ({ chapterId: chapterRows[index === 0 ? 0 : 1]!.id, topicId: topicRows[index === 0 ? 0 : 1]!.id, name: `Concept ${index}`, orderIndex: index + 1, prerequisites: ['Identify triangle sides'], learningOutcomes: [`Goal ${index} A`, `Goal ${index} B`] }))).returning();
      const [oldLesson, source] = await tx.insert(lessons).values([0, 1].map(index => ({ classSubjectId: allocation!.id, chapterId: chapterRows[0]!.id, date: `2026-10-${20 + index}`, status: 'confirmed' }))).returning();
      await tx.insert(lessonConcepts).values({ lessonId: oldLesson!.id, conceptId: conceptRows[0]!.id });
      const links = await tx.insert(lessonConcepts).values(conceptRows.slice(0, 2).map(concept => ({ lessonId: source!.id, conceptId: concept.id, teachingBrief: { conceptName: concept.name, prerequisites: concept.prerequisites, learningOutcomes: concept.learningOutcomes } }))).returning();
      // Later curriculum edits must not change the goals being answered for a completed lesson.
      await tx.update(concepts).set({ learningOutcomes: ['Edited shared goal'] }).where(eq(concepts.id, conceptRows[0]!.id));
      await assert.rejects(submitLearningGoalFeedback(outsider, links[0]!.id, { goalIndex: 0, answer: 'no' }, tx), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      await assert.rejects(submitLearningGoalFeedback({ ...caller, schoolId: -1 }, links[0]!.id, { goalIndex: 0, answer: 'no' }, tx), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      await assert.rejects(submitLearningGoalFeedback(caller, links[0]!.id, { goalIndex: 2, answer: 'no' }, tx), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      await assert.rejects(submitLearningGoalFeedback(caller, links[0]!.id, { goalIndex: 0, answer: 'maybe' as any }, tx), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      await submitLearningGoalFeedback(caller, links[0]!.id, { goalIndex: 0, answer: 'no' }, tx);
      await submitLearningGoalFeedback(caller, links[0]!.id, { goalIndex: 1, answer: 'yes' }, tx);
      await submitLearningGoalFeedback(caller, links[0]!.id, { goalIndex: 1, answer: 'no' }, tx);
      await submitLearningGoalFeedback(otherLearner, links[0]!.id, { goalIndex: 0, answer: 'yes' }, tx);
      await submitLearningGoalFeedback(caller, links[1]!.id, { goalIndex: 0, answer: 'yes' }, tx);
      const saved = await tx.select().from(lessonFeedback).where(and(eq(lessonFeedback.lessonConceptId, links[0]!.id), eq(lessonFeedback.learnerID, caller.accountId)));
      assert.equal(saved.length, 1); assert.equal(saved[0]!.goalResponses.length, 2);
      const feedback = await getLessonFeedback(staff, allocation!.id, tx);
      assert.equal(feedback[0]!.concepts[0]!.id, conceptRows[0]!.id);
      assert.equal(feedback[0]!.concepts[0]!.noCount, 2);
      assert.deepEqual(feedback[0]!.concepts[0]!.learningGoals[1], { goalIndex: 1, goal: 'Goal 0 B', yes: 0, no: 1, responses: 1, noResponse: 1 });
      assert.ok(!JSON.stringify(feedback).includes('Private'));
      const activities = await tx.insert(homework).values([
        { lessonId: oldLesson!.id, dueDate: release, memoReleaseType: 'immediately', createdAt: new Date('2026-10-20T10:00:00Z') },
        { lessonId: source!.id, dueDate: release, memoReleaseType: 'at_due_date', createdAt: new Date('2026-10-21T10:00:00Z') },
      ]).returning();
      const questionRows = await tx.insert(questions).values(activities.map((activity, index) => ({ homeworkId: activity.id, conceptId: conceptRows[index]!.id, orderIndex: 1, body: `Question ${index}`, memo: `SECRET detailed memo ${index}` }))).returning();
      const workspace = await getLearnerWorkspace(caller, tx, before);
      assert.equal(workspace.subjects.length, 1);
      assert.deepEqual(workspace.subjects[0]!.syllabus.map(item => item.taught), [true, true, false]);
      assert.equal(workspace.subjects[0]!.lessons[1]!.concepts[0]!.learningOutcomes[0], 'Goal 0 A');
      assert.deepEqual(workspace.subjects[0]!.lessons[1]!.concepts[0]!.answers, ['no', 'no']);
      assert.deepEqual(workspace.subjects[0]!.homework.map(item => item.activityNumber), [1, 2]);
      assert.ok(!JSON.stringify(workspace).includes('SECRET')); assert.ok(!JSON.stringify(workspace).includes('passwordHash'));
      assert.equal((await getLearnerWorkspace(otherLearner, tx, before)).subjects[0]!.lessons[1]!.concepts[0]!.answers[0], 'yes');
      assert.equal((await getLearnerWorkspace(outsider, tx)).subjects.length, 0);
      await assert.rejects(getLearnerWorkspace(staff, tx), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      await assert.rejects(getLearnerAnswer(caller, questionRows[1]!.id, tx, before), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      assert.equal((await getLearnerAnswer(caller, questionRows[1]!.id, tx, release)).memo, 'SECRET detailed memo 1');
      assert.equal((await getLearnerAnswer(caller, questionRows[0]!.id, tx, before)).memo, 'SECRET detailed memo 0');
      await assert.rejects(getLearnerAnswer(outsider, questionRows[0]!.id, tx, release), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      // Goal focus persists into the queued draft and the selected next plan, in curriculum order.
      await addLessonConceptToNextLesson(staff, source!.id, conceptRows[0]!.id, tx, release);
      const planning = await getPlanning(staff, allocation!.id, tx);
      assert.deepEqual(planning.reviewConcepts[0]!.reviewGoals, ['Goal 0 A', 'Goal 0 B']);
      const plan = await savePlan(staff, allocation!.id, { chapterId: chapterRows[1]!.id, date: '2026-10-26', conceptIds: [conceptRows[2]!.id, conceptRows[0]!.id], reviewConceptIds: [conceptRows[0]!.id] }, tx);
      const [review] = await tx.select().from(lessonConcepts).where(and(eq(lessonConcepts.lessonId, plan.id), eq(lessonConcepts.conceptId, conceptRows[0]!.id)));
      assert.deepEqual(review!.reviewGoals, ['Goal 0 A', 'Goal 0 B']);
      assert.equal((await tx.select().from(lessonReviewConcepts).where(eq(lessonReviewConcepts.classSubjectId, allocation!.id))).length, 0);
      await assert.rejects(submitLearningGoalFeedback(caller, links[0]!.id, { goalIndex: 0, answer: 'yes' }, tx), (error: unknown) => error instanceof TeacherError || error instanceof StreamChoiceError);
      await submitClosedReview();
      async function submitClosedReview() {
        await addLessonConceptToNextLesson(staff, source!.id, conceptRows[0]!.id, tx, release);
        const [existingReview] = await tx.select().from(lessonConcepts).where(and(eq(lessonConcepts.lessonId, plan.id), eq(lessonConcepts.conceptId, conceptRows[0]!.id)));
        assert.deepEqual(existingReview!.reviewGoals, ['Goal 0 A', 'Goal 0 B']);
      }
      const after = await getLearnerWorkspace(caller, tx, release);
      assert.equal(after.subjects[0]!.lessons.at(-1)!.status, 'planned');
      assert.equal(after.subjects[0]!.syllabus.at(-1)!.taught, false);
      assert.deepEqual(after.subjects[0]!.lessons[1]!.concepts[0]!.answers, ['no', 'no']);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  // Exercise the actual mounted HTTP guards and payload validation without persistent fixtures.
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const port = (server.address() as import('node:net').AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(base + '/learners/me/workspace')).status, 401);
    const staffToken = jwt.sign({ accountId: -1, accountType: 'person', role: 'teacher', schoolId: -1 }, process.env.JWT_SECRET!);
    assert.equal((await fetch(base + '/learners/me/workspace', { headers: { Authorization: `Bearer ${staffToken}` } })).status, 403);
    const token = jwt.sign({ accountId: -1, accountType: 'learner', schoolId: -1 }, process.env.JWT_SECRET!);
    assert.equal((await fetch(base + '/learners/me/lesson-concepts/1/goals', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ goalIndex: 0, answer: 'maybe' }) })).status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  console.log('Learner integration checks passed: scoped library, frozen goals, Yes/No updates, teacher aggregation, review focus, answer release boundaries and HTTP guards. All database fixtures rolled back.');
}
run().then(() => pool.end()).catch(async error => { console.error(error); await pool.end(); process.exitCode = 1; });
