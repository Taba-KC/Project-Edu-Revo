/** Isolated fixtures are rolled back, including all read receipts. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, people, learners, subjects, classSubjects, chapters, topics, concepts, lessons, lessonConcepts, homework, questions, notificationReads } from '../src/db/schema';
import { getNotifications, learningNotifications, markNotificationsRead } from '../src/services/notificationService';
import { submitLearningGoalFeedback } from '../src/services/lessonResponseService';
import app from '../src/app';

async function run() {
  const now = new Date('2026-10-30T10:00:00Z');
  const rollback = new Error('Rollback notification fixtures');
  try {
    await db.transaction(async tx => {
      const key = `notifications-${Date.now()}`;
      const [circuit] = await tx.select().from(circuits).limit(1);
      const [school] = await tx.insert(schools).values({ circuitId: circuit!.id, name: key, activationCode: key }).returning();
      const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11)));
      const [cls] = await tx.insert(classes).values({ gradeId: grade!.id, name: '11B' }).returning();
      const [teacher] = await tx.insert(people).values({ title: 'Ms', firstName: 'Test', surname: 'Teacher', staffNumber: 'T', schoolId: school!.id, accountSetUp: true }).returning();
      const staff = { accountId: teacher!.id, accountType: 'person', role: 'teacher', schoolId: school!.id };
      const roster = await tx.insert(learners).values([0, 1].map(index => ({ firstName: 'Private', surname: String(index), admissionNumber: String(index), classId: cls!.id, schoolId: school!.id, accountSetUp: true }))).returning();
      const learner = { accountId: roster[0]!.id, accountType: 'learner', schoolId: school!.id };
      const other = { ...learner, accountId: roster[1]!.id };
      const [subject] = await tx.insert(subjects).values({ name: key }).returning();
      const [allocation] = await tx.insert(classSubjects).values({ classId: cls!.id, subjectId: subject!.id, personId: teacher!.id }).returning();
      const [chapter] = await tx.insert(chapters).values({ subjectId: subject!.id, gradeNumber: 11, name: 'Chapter', orderIndex: 1 }).returning();
      const [topic] = await tx.insert(topics).values({ chapterId: chapter!.id, name: 'Topic', orderIndex: 1 }).returning();
      const [concept] = await tx.insert(concepts).values({ chapterId: chapter!.id, topicId: topic!.id, name: 'Concept', orderIndex: 1, learningOutcomes: ['First goal', 'Second goal', 'Third goal'] }).returning();
      const [lesson] = await tx.insert(lessons).values({ classSubjectId: allocation!.id, chapterId: chapter!.id, date: '2026-10-30', status: 'confirmed' }).returning();
      const [link] = await tx.insert(lessonConcepts).values({ lessonId: lesson!.id, conceptId: concept!.id, teachingBrief: { conceptName: 'Concept', prerequisites: [], learningOutcomes: concept!.learningOutcomes } }).returning();
      const [activity] = await tx.insert(homework).values({ lessonId: lesson!.id, dueDate: new Date('2026-10-31T10:00:00Z'), memoReleaseType: 'custom', memoReleaseAt: new Date('2026-10-30T10:01:00Z') }).returning();
      await tx.insert(questions).values({ homeworkId: activity!.id, conceptId: concept!.id, orderIndex: 1, body: 'Question', memo: 'SECRET worked answer' });

      let alerts = await getNotifications(learner, tx, now);
      assert.equal(alerts.filter(item => item.id.startsWith('respond-')).length, 1);
      assert.equal(alerts.filter(item => item.id.startsWith('homework-')).length, 1);
      assert.ok(!alerts.some(item => item.id.startsWith('answers-')), 'Answers stay unannounced before release');
      const reminder = alerts.find(item => item.id.startsWith('respond-'))!;
      assert.equal(reminder.pageId, `subject-${allocation!.id}`);
      assert.equal(reminder.tab, 'completed');
      assert.deepEqual((await markNotificationsRead(learner, [reminder.id, reminder.id, 'another-account-notification'], tx, now)).ids, [reminder.id]);
      assert.equal((await getNotifications(learner, tx, now)).find(item => item.id === reminder.id)!.read, true, 'Read status survives a fresh request');
      assert.equal((await getNotifications(other, tx, now)).find(item => item.id === reminder.id)!.read, false, 'Receipts cannot cross accounts');
      const release = new Date('2026-10-30T10:01:00Z');
      assert.ok((await getNotifications(learner, tx, release)).some(item => item.id.startsWith('answers-')));
      await tx.update(questions).set({ memo: '   ' }).where(eq(questions.homeworkId, activity!.id));
      assert.ok(!(await getNotifications(learner, tx, release)).some(item => item.id.startsWith('answers-')), 'Blank answers are not announced');
      await tx.update(questions).set({ memo: 'SECRET worked answer' }).where(eq(questions.homeworkId, activity!.id));

      assert.ok((await getNotifications(staff, tx, now)).some(item => item.message === 'You have no lessons planned for tomorrow.'));
      for (const goalIndex of [0, 1, 2]) await submitLearningGoalFeedback(learner, link!.id, { goalIndex, answer: 'no' }, tx);
      assert.ok(!(await learningNotifications(learner, tx, now)).some(item => item.id.startsWith('respond-')), 'Completed feedback reminders disappear');
      let feedback = await getNotifications(staff, tx, now);
      assert.ok(feedback.some(item => item.message === 'Learners have submitted feedback on today\'s lesson.'));
      assert.ok(feedback.some(item => item.message === '3 learning outcomes received low understanding ratings.'));
      const firstFeedback = feedback.find(item => item.id.startsWith('feedback-'))!;
      await markNotificationsRead(staff, [firstFeedback.id], tx, now);
      await submitLearningGoalFeedback(other, link!.id, { goalIndex: 0, answer: 'yes' }, tx);
      feedback = await getNotifications(staff, tx, now);
      assert.ok(feedback.some(item => item.id.startsWith('feedback-') && item.id !== firstFeedback.id && !item.read), 'New feedback reopens the badge');
      assert.ok(!JSON.stringify(feedback).includes('Private'));

      const [plan] = await tx.insert(lessons).values({ classSubjectId: allocation!.id, chapterId: chapter!.id, date: '2026-10-31', status: 'planned' }).returning();
      await tx.insert(lessonConcepts).values({ lessonId: plan!.id, conceptId: concept!.id });
      alerts = await getNotifications(learner, tx, now);
      assert.ok(alerts.some(item => item.message === `Your ${key} teacher has published tomorrow's lesson.` && item.tab === 'upcoming'));
      assert.ok(!(await getNotifications(staff, tx, now)).some(item => item.id.startsWith('planning-')));
      assert.ok(!JSON.stringify(alerts).includes('SECRET'));
      await assert.rejects(learningNotifications({ ...learner, schoolId: -1 }, tx, now));
      assert.equal((await tx.select().from(notificationReads).where(eq(notificationReads.schoolId, school!.id))).length, 2, 'Only permitted unique IDs were stored');
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    for (const role of ['staff', 'learners']) assert.equal((await fetch(`${base}/${role}/me/notifications`)).status, 401);
    const token = jwt.sign({ accountId: -1, accountType: 'learner', schoolId: -1 }, process.env.JWT_SECRET!);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    // A nonexistent learner is rejected by the live session check before role or body validation.
    assert.equal((await fetch(`${base}/staff/me/notifications`, { headers })).status, 401);
    for (const body of [{ ids: [] }, { ids: ['x'.repeat(161)] }, { ids: Array(501).fill('x') }]) assert.equal((await fetch(`${base}/learners/me/notifications/read`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log('Notification checks passed: six notification types, scoped receipts, deduplication, new feedback, release boundaries, deep links, privacy and HTTP guards. Fixtures rolled back.');
}
run().then(() => pool.end()).catch(async error => { console.error(error); await pool.end(); process.exitCode = 1; });
