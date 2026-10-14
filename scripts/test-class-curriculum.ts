import 'dotenv/config';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, subjects, classSubjects, chapters, topics, concepts } from '../src/db/schema';
import { getClassCurriculum } from '../src/services/classCurriculumService';
import { SetupError } from '../src/services/classSubjectService';

async function run() {
  const rollback = new Error('Rollback curriculum browser fixtures');
  let checks = 0;
  try {
    await db.transaction(async tx => {
      const key = 'class-curriculum-test-' + Date.now();
      const [circuit] = await tx.select().from(circuits).limit(1);
      assert.ok(circuit);
      const [school, other] = await tx.insert(schools).values([
        { circuitId: circuit.id, name: key, activationCode: key },
        { circuitId: circuit.id, name: key + '-other', activationCode: key + '-other' },
      ]).returning();
      const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11)));
      const [cls, sibling] = await tx.insert(classes).values([{ gradeId: grade!.id, name: '11TEST' }, { gradeId: grade!.id, name: '11OTHER' }]).returning();
      const [subject, emptySubject] = await tx.insert(subjects).values([{ name: key }, { name: key + '-empty' }]).returning();
      const [allocation, emptyAllocation] = await tx.insert(classSubjects).values([
        { classId: cls!.id, subjectId: subject!.id }, { classId: cls!.id, subjectId: emptySubject!.id },
      ]).returning();
      const [second, first, archived] = await tx.insert(chapters).values([
        { subjectId: subject!.id, gradeNumber: 11, name: 'Second chapter', orderIndex: 2 },
        { subjectId: subject!.id, gradeNumber: 11, name: 'First chapter', orderIndex: 1 },
        { subjectId: subject!.id, gradeNumber: 11, name: 'Archived chapter', orderIndex: 3, active: false },
        { subjectId: subject!.id, gradeNumber: 10, name: 'Wrong grade', orderIndex: 1 },
        { subjectId: emptySubject!.id, gradeNumber: 10, name: 'Other grade only', orderIndex: 1 },
      ]).returning();
      const [topic2, topic1] = await tx.insert(topics).values([
        { chapterId: first!.id, name: 'Second topic', orderIndex: 2 },
        { chapterId: first!.id, name: 'First topic', orderIndex: 1 },
        { chapterId: archived!.id, name: 'Archived chapter topic', orderIndex: 1 },
        { chapterId: second!.id, name: 'Inactive topic', orderIndex: 1, active: false },
      ]).returning();
      await tx.insert(concepts).values([
        { chapterId: first!.id, topicId: topic1!.id, name: 'Second concept', orderIndex: 2 },
        { chapterId: first!.id, topicId: topic1!.id, name: 'First concept', orderIndex: 1 },
        { chapterId: first!.id, topicId: topic1!.id, name: 'Inactive concept', orderIndex: 3, active: false },
        { chapterId: first!.id, topicId: topic2!.id, name: 'Custom concept', orderIndex: 1, isCustom: true },
      ]);
      const result = await getClassCurriculum(school!.id, cls!.id, allocation!.id, tx);
      assert.equal(result.gradeNumber, 11); assert.equal(result.subjectId, subject!.id); checks++;
      assert.deepEqual(result.chapters.map(c => c.name), ['First chapter', 'Second chapter']); checks++;
      assert.deepEqual(result.chapters[0]!.topics.map(t => t.name), ['First topic', 'Second topic']); checks++;
      assert.deepEqual(result.chapters[0]!.topics[0]!.concepts.map(c => c.name), ['First concept', 'Second concept']); checks++;
      assert.equal(result.chapters[0]!.topics[1]!.concepts.length, 0); assert.equal(result.chapters[1]!.topics.length, 0); checks++;
      assert.equal(result.className, cls!.name); assert.equal(result.subjectName, subject!.name); checks++;
      const empty = await getClassCurriculum(school!.id, cls!.id, emptyAllocation!.id, tx);
      assert.equal(empty.gradeNumber, 11); assert.deepEqual(empty.chapters, []); checks++;
      await assert.rejects(getClassCurriculum(other!.id, cls!.id, allocation!.id, tx), SetupError); checks++;
      await assert.rejects(getClassCurriculum(school!.id, sibling!.id, allocation!.id, tx), SetupError); checks++;
      await tx.update(classSubjects).set({ active: false }).where(eq(classSubjects.id, allocation!.id));
      await assert.rejects(getClassCurriculum(school!.id, cls!.id, allocation!.id, tx), SetupError); checks++;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(checks + ' class curriculum checks passed; all fixtures rolled back.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
