import 'dotenv/config';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, people, learners } from '../src/db/schema';
import { parseRosterWorkbook, previewRoster, saveRoster, validateRosterRows, RosterImportError } from '../src/services/rosterImportService';
function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Roster');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
async function run() {
  let checks = 0;
  const staffFile = workbook([['title','firstName','surname','staffNumber'],['Mr','John','Doe','001'],['Ms','','Smith','002']]);
  const parsed = parseRosterWorkbook(staffFile, 'staff');
  assert.equal(parsed[0]!.identifier, '001'); checks++;
  assert.equal(validateRosterRows(parsed, []).length, 1); checks++;
  assert.throws(() => parseRosterWorkbook(workbook([['title','firstName','surname'],['Mr','John','Doe']]), 'staff'), RosterImportError); checks++;
  assert.throws(() => parseRosterWorkbook(workbook([['title','firstName','surname','staffNumber']]), 'staff'), RosterImportError); checks++;
  assert.equal(validateRosterRows([parsed[0]!, { ...parsed[0]!, identifier: ' 001 ' }], []).length, 2); checks++;
  const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet([['title','firstName','surname','staffNumber'],['Mr','John','Doe',7]]);
  sheet.D2!.z = '0000'; XLSX.utils.book_append_sheet(book, sheet, 'Staff');
  assert.equal(parseRosterWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'staff')[0]!.identifier, '0007'); checks++;
  sheet.B2 = { t: 's', f: '"John"', v: 'John' };
  assert.throws(() => parseRosterWorkbook(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'staff'), RosterImportError); checks++;
  const rollback = new Error('Rollback roster test fixtures');
  try { await db.transaction(async tx => {
    const [circuit] = await tx.select().from(circuits).limit(1); assert.ok(circuit);
    const key = 'roster-test-' + Date.now();
    const [school, other] = await tx.insert(schools).values([{ name: key, circuitId: circuit.id, activationCode: key }, { name: key+'-other', circuitId: circuit.id, activationCode: key+'-other' }]).returning();
    const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId, school!.id), eq(grades.number, 11)));
    const [otherGrade] = await tx.select().from(grades).where(and(eq(grades.schoolId, other!.id), eq(grades.number, 11)));
    const [cls, otherClass] = await tx.insert(classes).values([{ name: '11TEST', gradeId: grade!.id }, { name: '11OTHER', gradeId: otherGrade!.id }]).returning();
    const preview = await previewRoster(school!.id, 'staff', staffFile, undefined, tx);
    assert.equal(preview.rows.length, 2); assert.equal(preview.issues.length, 1); checks++;
    assert.equal((await tx.select().from(people).where(eq(people.schoolId, school!.id))).length, 0); checks++;
    await assert.rejects(saveRoster(school!.id, 'staff', preview.rows, undefined, tx), RosterImportError);
    assert.equal((await tx.select().from(people).where(eq(people.schoolId, school!.id))).length, 0); checks++;
    preview.rows[1]!.firstName = ' Edited ';
    assert.equal((await saveRoster(school!.id, 'staff', preview.rows, undefined, tx)).saved, 2); checks++;
    const savedStaff = await tx.select().from(people).where(eq(people.schoolId, school!.id));
    assert.equal(savedStaff.find(row => row.staffNumber === '002')!.firstName, 'Edited');
    assert.ok(savedStaff.every(row => !row.accountSetUp && row.role === 'teacher' && !row.username && !row.passwordHash)); checks++;
    const repeated = await previewRoster(school!.id, 'staff', staffFile, undefined, tx);
    assert.equal(repeated.issues.length, 2); checks++;
    await assert.rejects(saveRoster(school!.id, 'staff', [{...parsed[0]!,identifier:'003'}, parsed[0]!], undefined, tx), RosterImportError);
    assert.equal((await tx.select().from(people).where(eq(people.schoolId, school!.id))).length, 2); checks++;
    await assert.rejects(saveRoster(school!.id, 'staff', [{...parsed[0]!,identifier:'a'},{...parsed[0]!,identifier:'A'}], undefined, tx), RosterImportError); checks++;
    const learnerFile = workbook([['title','firstName','surname','admissionNumber'],['Ms','Lerato','Dlamini','0009']]);
    const learnerPreview = await previewRoster(school!.id, 'learners', learnerFile, cls!.id, tx);
    assert.equal((await tx.select().from(learners).where(eq(learners.schoolId, school!.id))).length, 0); checks++;
    await saveRoster(school!.id, 'learners', learnerPreview.rows, cls!.id, tx);
    const [learner] = await tx.select().from(learners).where(eq(learners.schoolId, school!.id));
    assert.equal(learner!.classId, cls!.id); assert.equal(learner!.admissionNumber, '0009'); assert.equal(learner!.accountSetUp, false); checks++;
    await assert.rejects(previewRoster(school!.id, 'learners', learnerFile, otherClass!.id, tx), RosterImportError); checks++;
    await assert.rejects(saveRoster(school!.id, 'learners', [{...learnerPreview.rows[0]!, identifier:'0010'}], otherClass!.id, tx), RosterImportError); checks++;
    await assert.rejects(saveRoster(school!.id, 'staff', [], undefined, tx), RosterImportError); checks++;
    const fresh = await previewRoster(school!.id, 'staff', workbook([['title','firstName','surname','staffNumber'],['Mr','New','Person','009']]), undefined, tx);
    await tx.insert(people).values({ schoolId: school!.id, title:'Mr', firstName:'Elsewhere', surname:'Added', staffNumber:'009' });
    await assert.rejects(saveRoster(school!.id, 'staff', fresh.rows, undefined, tx), RosterImportError); checks++;
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  console.log(checks + ' roster import checks passed; all fixtures rolled back.');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
