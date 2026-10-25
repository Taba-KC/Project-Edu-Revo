/**
 * Developer check for lesson feedback. This file is run explicitly, not during normal app
 * requests. Inspect its fixtures and database target before running it; the assertions below
 * document the behaviour being checked.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, people, learners, subjects, classSubjects, classChapters, chapters, topics, concepts, lessons, lessonConcepts, homework, questions, questionFeedback, lessonFeedback, lessonReviewConcepts } from '../src/db/schema';
import { getLessonFeedback, addLessonConceptToNextLesson } from '../src/services/teacherLessonFeedbackService';
import { getPlanning, savePlan, confirmPlan, getHomeworkContext, TeacherError } from '../src/services/teacherWorkspaceService';
import { getLearnerLessonFeedback, submitLessonFeedback } from '../src/services/lessonResponseService';
import { getDashboard } from '../src/services/dashboardService';
import { conceptUnderstanding, understandingScore } from '../src/services/lessonUnderstanding';

async function run() {
  let checks = 0;
  assert.equal(understandingScore(conceptUnderstanding(1, [], 3)), Infinity); checks++;
  const rollback = new Error('Rollback lesson feedback fixtures');
  try {
    await db.transaction(async tx => {
      const key = `lesson-feedback-${Date.now()}`;
      const [circuit] = await tx.select().from(circuits).limit(1);
      assert.ok(circuit);
      const [school] = await tx.insert(schools).values({ circuitId: circuit.id, name: key, activationCode: key }).returning();
      const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school.id), eq(grades.number, 11)));
      const [cls, otherClass] = await tx.insert(classes).values([{ gradeId: grade.id, name: '11B' }, { gradeId: grade.id, name: '11C' }]).returning();
      const [teacher, stranger] = await tx.insert(people).values(['T', 'S'].map(staffNumber => ({ title: 'Ms', firstName: 'Test', surname: staffNumber, staffNumber, schoolId: school.id, accountSetUp: true }))).returning();
      const caller = { accountId: teacher.id, accountType: 'person', schoolId: school.id, role: 'teacher' };
      const outsider = { ...caller, accountId: stranger.id };
      const [subject] = await tx.insert(subjects).values({ name: key }).returning();
      const [allocation] = await tx.insert(classSubjects).values({ subjectId: subject.id, classId: cls.id, personId: teacher.id }).returning();
      const [chapter, nextChapter] = await tx.insert(chapters).values([{ subjectId: subject.id, gradeNumber: 11, name: 'First chapter', orderIndex: 1 }, { subjectId: subject.id, gradeNumber: 11, name: 'Next chapter', orderIndex: 2 }]).returning();
      const [topic, nextTopic] = await tx.insert(topics).values([{ chapterId: chapter.id, name: 'First topic', orderIndex: 1 }, { chapterId: nextChapter.id, name: 'Next topic', orderIndex: 1 }]).returning();
      // Insert out of curriculum order to catch accidental ordering by database id.
      const [third, first, second, fourth] = await tx.insert(concepts).values([
        { chapterId: chapter.id, topicId: topic.id, name: 'Third', orderIndex: 3 },
        { chapterId: chapter.id, topicId: topic.id, name: 'First', orderIndex: 1 },
        { chapterId: chapter.id, topicId: topic.id, name: 'Second', orderIndex: 2 },
        { chapterId: nextChapter.id, topicId: nextTopic.id, name: 'Fourth', orderIndex: 1 },
      ]).returning();
      const [source] = await tx.insert(lessons).values({ classSubjectId: allocation.id, chapterId: chapter.id, date: '2026-10-01', status: 'confirmed' }).returning();
      assert.equal(source.lessonNumber, 1, 'The first lesson starts at 1'); checks++;
      const sourceItems = await tx.insert(lessonConcepts).values([third, second, first].map(concept => ({ lessonId: source.id, conceptId: concept.id }))).returning();
      const firstItem = sourceItems.find(item => item.conceptId === first.id)!;
      const secondItem = sourceItems.find(item => item.conceptId === second.id)!;
      const learnerCaller = { accountId: 0, accountType: 'learner', schoolId: school.id };
      const [set] = await tx.insert(homework).values({ lessonId: source.id, dueDate: new Date('2026-10-09'), memoReleaseType: 'immediately' }).returning();
      const [q1, q2, q3] = await tx.insert(questions).values([
        { homeworkId: set.id, conceptId: first.id, body: 'First question', orderIndex: 1 },
        { homeworkId: set.id, conceptId: first.id, body: 'Another first question', orderIndex: 2 },
        { homeworkId: set.id, conceptId: second.id, body: 'Second question', orderIndex: 3 },
        { homeworkId: set.id, conceptId: third.id, body: 'Third question', orderIndex: 4 },
      ]).returning();
      const roster = await tx.insert(learners).values([1, 2, 3, 4].map((n) => ({ schoolId: school.id, classId: n === 4 ? otherClass.id : cls.id, firstName: 'PrivateLearner', surname: String(n), admissionNumber: String(n), accountSetUp: true }))).returning();
      learnerCaller.accountId = roster[0].id;
      await tx.insert(lessonFeedback).values([
        { learnerID: roster[0].id, lessonConceptId: firstItem.id, reaction: 'didnt_understand' },
        { learnerID: roster[1].id, lessonConceptId: firstItem.id, reaction: 'understood' },
        { learnerID: roster[2].id, lessonConceptId: firstItem.id, reaction: 'not_sure' },
        { learnerID: roster[0].id, lessonConceptId: secondItem.id, reaction: 'understood' },
        { learnerID: roster[3].id, lessonConceptId: secondItem.id, reaction: 'didnt_understand' },
      ]);
      // Historical homework reactions never influence lesson feedback.
      await tx.insert(questionFeedback).values({ learnerId: roster[0].id, questionId: q3.id, reaction: 'didnt_understand' });
      assert.equal((await getLearnerLessonFeedback(learnerCaller, source.id, tx)).canRespond, true); checks++;
      await assert.rejects(getLearnerLessonFeedback({ ...learnerCaller, accountId: roster[3].id }, source.id, tx), TeacherError); checks++;
      await assert.rejects(submitLessonFeedback(learnerCaller, { lessonConceptId: firstItem.id, reaction: 'not_sure' as any, isAnonymous: true }, tx), TeacherError); checks++;
      await submitLessonFeedback(learnerCaller, { lessonConceptId: firstItem.id, reaction: 'understood', isAnonymous: true }, tx);
      await submitLessonFeedback(learnerCaller, { lessonConceptId: firstItem.id, reaction: 'didnt_understand', isAnonymous: true }, tx);
      assert.equal((await tx.select().from(lessonFeedback).where(and(eq(lessonFeedback.learnerID, roster[0].id), eq(lessonFeedback.lessonConceptId, firstItem.id)))).length, 1); checks++;
      const feedback = await getLessonFeedback(caller, allocation.id, tx);
      assert.deepEqual(feedback[0].concepts.map(concept => concept.id), [first.id, second.id, third.id]); checks++;
      assert.deepEqual(feedback[0].concepts[0].counts, { understood: 1, notUnderstood: 1, responses: 2, noResponse: 1 }); checks++;
      assert.equal(feedback[0].concepts[1].counts.notUnderstood, 0, 'Feedback from another class is excluded'); checks++;
      assert.equal(feedback[0].concepts[2].counts.noResponse, 3, 'Missing responses are not recorded as uncertainty'); checks++;
      assert.ok(!JSON.stringify(feedback).includes('PrivateLearner')); checks++;
      await assert.rejects(getLessonFeedback(outsider, allocation.id, tx), TeacherError); checks++;
      await assert.rejects(addLessonConceptToNextLesson(outsider, source.id, first.id, tx), TeacherError); checks++;
      await assert.rejects(addLessonConceptToNextLesson(caller, source.id, fourth.id, tx), TeacherError); checks++;
      await assert.rejects(getLessonFeedback({ ...caller, schoolId: -1 }, allocation.id, tx), TeacherError); checks++;
      const now = new Date('2026-10-10T12:00:00Z');
      assert.equal((await addLessonConceptToNextLesson(caller, source.id, second.id, tx, now)).destination, 'draft');
      await addLessonConceptToNextLesson(caller, source.id, first.id, tx, now);
      await addLessonConceptToNextLesson(caller, source.id, first.id, tx, now);
      assert.equal((await tx.select().from(lessonReviewConcepts).where(eq(lessonReviewConcepts.classSubjectId, allocation.id))).length, 2, 'Repeated clicks do not duplicate the draft'); checks++;
      const planning = await getPlanning(caller, allocation.id, tx);
      assert.equal(planning.chapter?.id, nextChapter.id);
      assert.deepEqual(planning.reviewConcepts.map(concept => concept.id), [first.id, second.id]);
      assert.deepEqual(planning.planningConcepts.map(concept => concept.id), [first.id, second.id, fourth.id]); checks++;
      // A checked review is included; an unchecked review is declined without changing taught history.
      const plan = await savePlan(caller, allocation.id, { chapterId: nextChapter.id, date: '2026-10-11', conceptIds: [first.id, fourth.id], reviewConceptIds: [first.id, second.id] }, tx);
      assert.equal(plan.lessonNumber, 2, 'Plans continue the class subject sequence'); checks++;
      await tx.update(lessons).set({ date: '2026-10-10' }).where(eq(lessons.id, plan.id));
      assert.equal((await tx.select().from(lessons).where(eq(lessons.id, plan.id)))[0].lessonNumber, 2, 'Date edits do not change the lesson name'); checks++;
      assert.equal((await tx.select().from(lessonReviewConcepts).where(eq(lessonReviewConcepts.classSubjectId, allocation.id))).length, 0); checks++;
      assert.deepEqual((await tx.select().from(lessonConcepts).where(eq(lessonConcepts.lessonId, source.id))).map(item => item.conceptId).sort((a,b)=>a-b), [first.id, second.id, third.id].sort((a,b)=>a-b), 'Declining a review never removes the original taught concept'); checks++;
      assert.ok((await getPlanning(caller, allocation.id, tx)).taughtConceptIds.includes(second.id)); checks++;
      const dashboard = await getDashboard('staff', teacher.id, school.id, tx, now);
      assert.equal(dashboard.subjects[0].lessons.find(lesson => lesson.id === plan.id)?.lessonNumber, 2); checks++;
      assert.deepEqual(dashboard.subjects[0].lessons.find(lesson => lesson.id === plan.id)?.concepts.map(concept => concept.id), [first.id, fourth.id]); checks++;
      assert.equal((await getLearnerLessonFeedback(learnerCaller, source.id, tx)).canRespond, false); checks++;
      await assert.rejects(submitLessonFeedback(learnerCaller, { lessonConceptId: firstItem.id, reaction: 'understood', isAnonymous: true }, tx), TeacherError); checks++;
      const added = await addLessonConceptToNextLesson(caller, source.id, third.id, tx, now);
      assert.equal(added.destination, 'lesson'); assert.equal(added.lessonId, plan.id); checks++;
      await addLessonConceptToNextLesson(caller, source.id, third.id, tx, now);
      assert.equal((await tx.select().from(lessonConcepts).where(eq(lessonConcepts.lessonId, plan.id))).length, 3); checks++;
      await confirmPlan(caller, plan.id, [fourth.id, third.id, first.id], tx, new Date('2026-10-12'));
      assert.deepEqual((await getHomeworkContext(caller, plan.id, tx)).concepts.map(concept => concept.id), [first.id, third.id, fourth.id]); checks++;
      await tx.update(concepts).set({ active: false }).where(eq(concepts.id, third.id));
      assert.equal((await getLessonFeedback(caller, allocation.id, tx)).find(set => set.id === plan.id)!.concepts.find(concept => concept.id === third.id)?.canReview, false);
      await assert.rejects(addLessonConceptToNextLesson(caller, source.id, third.id, tx, now), TeacherError); checks++;
      // Last ten confirmed lessons follow their permanent sequence, not teaching date.
      const older = [];
      for (let i = 0; i < 11; i++) {
        const [lesson] = await tx.insert(lessons).values({ classSubjectId: allocation.id, chapterId: chapter.id, date: '2000-01-01', status: 'confirmed', createdAt: new Date(Date.UTC(2000, 0, i + 1)) }).returning();
        const [hw] = await tx.insert(homework).values({ lessonId: lesson.id, dueDate: new Date('2030-01-01'), memoReleaseType: 'immediately', createdAt: new Date(Date.UTC(2000, 0, i + 1)) }).returning();
        older.push(lesson);
      }
      const recent = await getLessonFeedback(caller, allocation.id, tx);
      assert.equal(recent.length, 10); assert.equal(recent[0].id, older[10].id);
      assert.ok(!recent.some(lesson => lesson.id === older[0].id)); checks++;
      const [otherAllocation] = await tx.insert(classSubjects).values({ subjectId: subject.id, classId: otherClass.id, personId: teacher.id }).returning();
      const [otherFirst, otherSecond] = await tx.insert(lessons).values([
        { classSubjectId: otherAllocation.id, chapterId: chapter.id, date: '2030-01-01', lessonNumber: 999 },
        { classSubjectId: otherAllocation.id, chapterId: chapter.id, date: '2000-01-01' },
      ]).returning();
      assert.deepEqual([otherFirst.lessonNumber, otherSecond.lessonNumber], [1, 2], 'Number by creation within each allocation, not date or a client-supplied value'); checks++;
      await tx.delete(lessons).where(eq(lessons.id, otherSecond.id));
      const [afterDelete] = await tx.insert(lessons).values({ classSubjectId: otherAllocation.id, chapterId: chapter.id, date: '2026-10-10' }).returning();
      assert.equal(afterDelete.lessonNumber, 3, 'Deleted lesson numbers are not reused'); checks++;
      await tx.insert(classChapters).values({ classSubjectId: allocation.id, chapterId: chapter.id, personId: stranger.id });
      await assert.rejects(addLessonConceptToNextLesson(caller, source.id, first.id, tx, now), TeacherError); checks++;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(`${checks} lesson feedback checks passed; all database fixtures rolled back.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
