import 'dotenv/config';
import assert from 'node:assert/strict';
import { db, pool } from '../src/db';
import { schools, circuits, grades, classes, subjects, streams, streamSubjects, classSubjects, people, chapters, classChapters, lessons } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { syncClassSubjects, syncStreamClasses, assignSubjectTeacher, SetupError } from '../src/services/classSubjectService';

const rollback = new Error('Rollback test fixtures');
async function run() {
  let checks = 0;
  try {
    await db.transaction(async tx => {
      const [circuit] = await tx.select().from(circuits).limit(1);
      assert.ok(circuit, 'A circuit is needed for test fixtures');
      const key = 'setup-test-' + Date.now();
      const [school, otherSchool] = await tx.insert(schools).values([
        { circuitId: circuit.id, name: key, activationCode: key },
        { circuitId: circuit.id, name: key + '-other', activationCode: key + '-other' }
      ]).returning();
      const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11)));
      const [a,b,c] = await tx.insert(subjects).values([{name:key+'-A'},{name:key+'-B'},{name:key+'-C'}]).returning();
      const [stream, second] = await tx.insert(streams).values([{schoolId:school!.id,name:key},{schoolId:school!.id,name:key+'-2'}]).returning();
      await tx.insert(streamSubjects).values([{streamId:stream!.id,subjectId:a!.id},{streamId:stream!.id,subjectId:b!.id},{streamId:second!.id,subjectId:b!.id}]);
      const [cls, sibling] = await tx.insert(classes).values([{gradeId:grade!.id,name:'11TESTA',streamId:stream!.id},{gradeId:grade!.id,name:'11TESTB',streamId:stream!.id}]).returning();
      const [teacher, replacement, outsider] = await tx.insert(people).values([
        {schoolId:school!.id,title:'Mr',firstName:'Test',surname:'Teacher',staffNumber:key+'-1'},
        {schoolId:school!.id,title:'Ms',firstName:'Test',surname:'Replacement',staffNumber:key+'-2'},
        {schoolId:otherSchool!.id,title:'Mr',firstName:'Test',surname:'Outsider',staffNumber:key+'-3'}
      ]).returning();
      await syncStreamClasses(tx, stream!.id);
      let rows = await tx.select().from(classSubjects).where(eq(classSubjects.classId,cls!.id));
      assert.equal(rows.length,2); checks++;
      const allocation = rows.find(r=>r.subjectId===a!.id)!;
      await assignSubjectTeacher(tx,school!.id,cls!.id,allocation.id,teacher!.id);
      assert.equal((await tx.select().from(classSubjects).where(eq(classSubjects.id,allocation.id)))[0]!.personId,teacher!.id); checks++;
      await assert.rejects(assignSubjectTeacher(tx,school!.id,cls!.id,allocation.id,outsider!.id),SetupError); checks++;
      await assert.rejects(assignSubjectTeacher(tx,otherSchool!.id,cls!.id,allocation.id,teacher!.id),SetupError); checks++;
      const [ch1,ch2] = await tx.insert(chapters).values([{subjectId:a!.id,gradeNumber:11,name:key+'-1',orderIndex:1},{subjectId:a!.id,gradeNumber:11,name:key+'-2',orderIndex:2}]).returning();
      await syncClassSubjects(tx,cls!.id);
      const [lesson] = await tx.insert(lessons).values({chapterId:ch1!.id,classSubjectId:allocation.id,date:'2026-10-07',status:'confirmed'}).returning();
      let links = await tx.select().from(classChapters).where(eq(classChapters.classSubjectId,allocation.id));
      assert.equal(links.length,2); assert.ok(links.every(r=>r.personId===teacher!.id)); checks++;
      await tx.update(classChapters).set({personId:replacement!.id}).where(eq(classChapters.chapterId,ch2!.id));
      await assignSubjectTeacher(tx,school!.id,cls!.id,allocation.id,null);
      links = await tx.select().from(classChapters).where(eq(classChapters.classSubjectId,allocation.id));
      assert.equal(links.find(r=>r.chapterId===ch1!.id)!.personId,null);
      assert.equal(links.find(r=>r.chapterId===ch2!.id)!.personId,replacement!.id); checks++;
      await tx.insert(streamSubjects).values({streamId:stream!.id,subjectId:c!.id});
      await syncStreamClasses(tx,stream!.id);
      assert.equal((await tx.select().from(classSubjects).where(and(eq(classSubjects.classId,sibling!.id),eq(classSubjects.active,true)))).length,3); checks++;
      await tx.update(streamSubjects).set({subjectId:c!.id}).where(and(eq(streamSubjects.streamId,second!.id),eq(streamSubjects.subjectId,b!.id)));
      await tx.update(classes).set({streamId:second!.id}).where(eq(classes.id,cls!.id));
      await syncClassSubjects(tx,cls!.id);
      rows=await tx.select().from(classSubjects).where(eq(classSubjects.classId,cls!.id));
      assert.equal((await tx.select().from(lessons).where(eq(lessons.id,lesson!.id))).length,1); checks++;
      assert.deepEqual(rows.filter(r=>r.active).map(r=>r.subjectId),[c!.id]);
      assert.equal((await tx.select().from(classChapters).where(eq(classChapters.classSubjectId,allocation.id))).length,2); checks++;
      await assert.rejects(assignSubjectTeacher(tx,school!.id,cls!.id,allocation.id,teacher!.id),SetupError); checks++;
      await tx.delete(streamSubjects).where(and(eq(streamSubjects.streamId,stream!.id),eq(streamSubjects.subjectId,b!.id)));
      await syncStreamClasses(tx,stream!.id);
      assert.equal((await tx.select().from(classSubjects).where(and(eq(classSubjects.classId,sibling!.id),eq(classSubjects.active,true)))).length,2); checks++;
      await tx.update(classes).set({streamId:null}).where(eq(classes.id,cls!.id));
      await syncClassSubjects(tx,cls!.id);
      assert.equal((await tx.select().from(classSubjects).where(and(eq(classSubjects.classId,cls!.id),eq(classSubjects.active,true)))).length,0); checks++;
      await tx.update(classes).set({streamId:stream!.id}).where(eq(classes.id,cls!.id));
      await syncClassSubjects(tx,cls!.id);await syncClassSubjects(tx,cls!.id);
      assert.equal((await tx.select().from(classSubjects).where(eq(classSubjects.classId,cls!.id))).length,3);
      assert.equal((await tx.select().from(classChapters).where(eq(classChapters.classSubjectId,allocation.id))).length,2); checks++;
      throw rollback;
    });
  } catch (err) { if (err !== rollback) throw err; }
  console.log(checks + ' principal setup checks passed; all fixtures rolled back.');
}
run().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>pool.end());
