import 'dotenv/config';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, people, learners, subjects, classSubjects, classChapters, chapters, topics, concepts, lessons, lessonConcepts, homework, questions, lessonFeedback, questionFeedback, announcements } from '../src/db/schema';
import { getDashboard, DashboardError } from '../src/services/dashboardService';
async function run() {
  const rollback = new Error('Rollback dashboard fixtures'); let checks = 0;
  try { await db.transaction(async tx => {
    const key = 'dashboard-' + Date.now();
    const [circuit] = await tx.select().from(circuits).limit(1); assert.ok(circuit);
    const [school, otherSchool] = await tx.insert(schools).values([{ circuitId: circuit.id, name: key, activationCode: key }, { circuitId: circuit.id, name: key+'other', activationCode: key+'other' }]).returning();
    const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11)));
    const [cls, sibling] = await tx.insert(classes).values([{ gradeId: grade!.id, name: '11A' }, { gradeId: grade!.id, name: '11B' }]).returning();
    const [teacher, unassigned, chapterTeacher, unclaimed] = await tx.insert(people).values(['T','U','C','N'].map(number => ({ schoolId: school!.id, title: 'Mr', firstName: number, surname: 'Test', staffNumber: number, username: key+number, passwordHash: 'DO-NOT-EXPOSE', accountSetUp: number !== 'N' }))).returning();
    const [learner, otherLearner] = await tx.insert(learners).values([cls!, sibling!].map((c,i) => ({ schoolId: school!.id, classId: c.id, firstName: 'Learner', surname: 'Test', admissionNumber: String(i), accountSetUp: true }))).returning();
    const [subject] = await tx.insert(subjects).values({ name: key }).returning();
    const [allocation, otherAllocation] = await tx.insert(classSubjects).values([{ classId: cls!.id, subjectId: subject!.id, personId: teacher!.id }, { classId: sibling!.id, subjectId: subject!.id, personId: unassigned!.id, active: false }]).returning();
    const [chapter, handedOver] = await tx.insert(chapters).values([{ subjectId: subject!.id, gradeNumber: 11, name: 'Mechanics', orderIndex: 1 }, { subjectId: subject!.id, gradeNumber: 11, name: 'Chemistry', orderIndex: 2 }, { subjectId: subject!.id, gradeNumber: 10, name: 'WRONG GRADE', orderIndex: 1 }]).returning();
    const [topic] = await tx.insert(topics).values({ chapterId: chapter!.id, name: 'Forces', orderIndex: 1 }).returning();
    const [first, second] = await tx.insert(concepts).values(['First law','Second law'].map((name,i) => ({ chapterId: chapter!.id, topicId: topic!.id, name, orderIndex: i }))).returning();
    await tx.insert(classChapters).values({ classSubjectId: allocation!.id, chapterId: handedOver!.id, personId: chapterTeacher!.id });
    const [confirmed, past, upcoming] = await tx.insert(lessons).values([
      { classSubjectId: allocation!.id, chapterId: chapter!.id, date: '2026-10-08', status: 'confirmed', createdAt: new Date('2026-10-09') },
      { classSubjectId: allocation!.id, chapterId: chapter!.id, date: '2026-10-09', status: 'planned', createdAt: new Date('2026-10-08') },
      { classSubjectId: allocation!.id, chapterId: chapter!.id, date: '2026-10-12', status: 'planned', createdAt: new Date('2026-10-08') },
    ]).returning();
    const [item] = await tx.insert(lessonConcepts).values([{ lessonId: confirmed!.id, conceptId: first!.id }, { lessonId: past!.id, conceptId: second!.id }]).returning();
    await tx.insert(announcements).values([
      { schoolId: school!.id, createdBy: teacher!.id, title: 'Everyone', body: 'School notice', audienceType: 'all' },
      { schoolId: school!.id, createdBy: teacher!.id, title: 'Class only', body: 'Class notice', audienceType: 'class', audienceId: cls!.id },
      { schoolId: otherSchool!.id, createdBy: teacher!.id, title: 'PRIVATE', body: 'Other school', audienceType: 'all' },
    ]);
    const now = new Date('2026-10-10T12:00:00Z');
    const dashboard = (role: 'staff'|'learner', id: number) => getDashboard(role, id, school!.id, tx, now);
    const waiting = await dashboard('staff', unassigned!.id);
    assert.equal(waiting.subjects.length,0); assert.equal(waiting.needsYou.length,0); assert.deepEqual(waiting.announcements.map(n=>n.title),['Everyone']); checks++;
    const staff = await dashboard('staff',teacher!.id);
    assert.equal(staff.subjects.length,1); assert.equal(staff.subjects[0]!.curriculum.length,1); assert.equal(staff.subjects[0]!.gradeNumber,11); checks++;
    assert.equal(staff.subjects[0]!.taughtConcepts,1); assert.equal(staff.subjects[0]!.totalConcepts,2); checks++;
    assert.deepEqual(staff.needsYou.map(t=>t.kind).sort(),['Confirm what was taught','Create homework']); checks++;
    const handover = await dashboard('staff',chapterTeacher!.id);
    assert.equal(handover.subjects.length,1); assert.deepEqual(handover.subjects[0]!.curriculum.map(c=>c.name),['Chemistry']); assert.equal(handover.subjects[0]!.lessons.length,0); checks++;
    const student = await dashboard('learner',learner!.id);
    assert.equal(student.subjects.length,1); assert.equal(student.subjects[0]!.curriculum.length,2); assert.equal(student.waitingForYou.length,1); assert.equal(student.comingUp[0]!.lessonId,upcoming!.id); checks++;
    assert.equal((await dashboard('learner',otherLearner!.id)).subjects.length,0); checks++;
    await tx.insert(lessonFeedback).values({ learnerID: otherLearner!.id, lessonConceptId: item!.id, reaction: 'understood' });
    assert.equal((await dashboard('learner',learner!.id)).waitingForYou.length,1); checks++;
    await tx.insert(lessonFeedback).values({ learnerID: learner!.id, lessonConceptId: item!.id, reaction: 'understood' });
    assert.equal((await dashboard('learner',learner!.id)).waitingForYou.length,0); checks++;
    const [hw] = await tx.insert(homework).values({ lessonId: confirmed!.id, dueDate: new Date('2026-10-11'), memoReleaseType: 'at_due_date' }).returning();
    const [question] = await tx.insert(questions).values({ homeworkId: hw!.id, conceptId: first!.id, orderIndex: 1, body: 'Explain inertia', memo: 'SECRET ANSWER' }).returning();
    assert.equal((await dashboard('learner',learner!.id)).waitingForYou[0]!.kind,'Homework'); checks++;
    await tx.insert(questionFeedback).values({ learnerId: learner!.id, questionId: question!.id, isDone: true });
    assert.equal((await dashboard('learner',learner!.id)).waitingForYou.length,0); checks++;
    assert.equal((await getDashboard('learner',learner!.id,school!.id,tx,new Date('2026-10-12'))).waitingForYou.length,0); checks++;
    const serialized = JSON.stringify(await dashboard('learner',learner!.id));
    assert.ok(!serialized.includes('SECRET ANSWER') && !serialized.includes('DO-NOT-EXPOSE') && !serialized.includes('WRONG GRADE') && !serialized.includes('PRIVATE') && !serialized.includes('learnerID')); checks++;
    await assert.rejects(getDashboard('staff',teacher!.id,otherSchool!.id,tx,now),DashboardError); checks++;
    await assert.rejects(dashboard('staff',unclaimed!.id),DashboardError); checks++;
    await tx.update(classSubjects).set({ active:false }).where(eq(classSubjects.id,allocation!.id));
    assert.equal((await dashboard('staff',teacher!.id)).subjects.length,0); assert.equal((await dashboard('learner',learner!.id)).waitingForYou.length,0); checks++;
    throw rollback;
  }); } catch(error) { if(error !== rollback) throw error; }
  console.log(checks+' dashboard checks passed; all fixtures rolled back.');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
