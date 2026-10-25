/**
 * Developer check for roster import http. This file is run explicitly, not during normal app
 * requests. Inspect its fixtures and database target before running it; the assertions below
 * document the behaviour being checked.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import app from '../src/app';
import { db, pool } from '../src/db';
import { people, classes, grades, learners, schools } from '../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { generateAccessToken } from '../src/services/authService';

async function run() {
  const [principal] = await db.select().from(people).where(eq(people.role, 'principal')).limit(1);
  assert.ok(principal);
  const token = generateAccessToken(principal.id, 'person', principal.schoolId, 'principal');
  const teacherToken = generateAccessToken(principal.id, 'person', principal.schoolId, 'teacher');
  const base = '/schools/' + principal.schoolId + '/people/import';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port;
  let checks = 0;
  try {
    assert.equal((await fetch(url + base + '/preview', { method:'POST' })).status, 401); checks++;
    assert.equal((await fetch(url + base + '/preview', { method:'POST', headers:{Authorization:'Bearer '+teacherToken} })).status, 403); checks++;
    assert.equal((await fetch(url + '/schools/' + (principal.schoolId+10000) + '/people/import/preview', { method:'POST',headers:{Authorization:'Bearer '+token} })).status,403); checks++;
    const before = await db.select({ count: sql<number>`count(*)::int` }).from(people).where(eq(people.schoolId, principal.schoolId));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['title','firstName','surname','staffNumber'],['Mr','Preview','Only','PREVIEW-ONLY']]), 'Staff');
    const buffer = XLSX.write(book, { type:'buffer', bookType:'xlsx' });
    const form = new FormData(); form.append('file', new Blob([buffer]), 'staff.xlsx');
    const response = await fetch(url + base + '/preview', { method:'POST',headers:{Authorization:'Bearer '+token},body:form });
    assert.equal(response.status,200); const preview = await response.json() as {rows:{identifier:string}[]}; assert.equal(preview.rows[0]!.identifier,'PREVIEW-ONLY'); checks++;
    assert.deepEqual(await db.select({ count: sql<number>`count(*)::int` }).from(people).where(eq(people.schoolId, principal.schoolId)), before); checks++;
    assert.equal((await fetch(url + base + '/commit', { method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({rows:[{title:'Mr',firstName:'',surname:'Test',identifier:'INVALID-NO-SAVE'}]}) })).status,400); checks++;
    assert.equal((await fetch(url + base, {method:'POST',headers:{Authorization:'Bearer '+token}})).status,400); checks++;
    const [cls] = await db.select({id:classes.id}).from(classes).innerJoin(grades,eq(grades.id,classes.gradeId)).where(eq(grades.schoolId,principal.schoolId)).limit(1);
    if (cls) {
      const learnerBefore = await db.select({ count: sql<number>`count(*)::int` }).from(learners).where(eq(learners.schoolId,principal.schoolId));
      const learnerBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(learnerBook,XLSX.utils.aoa_to_sheet([['firstName','surname','admissionNumber'],['Preview','Only','LEARNER-PREVIEW']]),'Learners');
      const learnerForm=new FormData();learnerForm.append('file',new Blob([XLSX.write(learnerBook,{type:'buffer',bookType:'xlsx'})]),'learners.xlsx');
      const learnerResponse = await fetch(url+'/schools/'+principal.schoolId+'/classes/'+cls.id+'/learners/import/preview',{method:'POST',headers:{Authorization:'Bearer '+token},body:learnerForm});
      assert.equal(learnerResponse.status,200); checks++;
      const learnerPreview = await learnerResponse.json() as {rows: Record<string, unknown>[]};
      assert.equal(Object.hasOwn(learnerPreview.rows[0]!, 'title'), false); checks++;
      assert.deepEqual(await db.select({ count: sql<number>`count(*)::int` }).from(learners).where(eq(learners.schoolId,principal.schoolId)),learnerBefore);checks++;
      const [candidate] = await db.select({ schoolCode: schools.code, admissionNumber: learners.admissionNumber, firstName: learners.firstName, surname: learners.surname })
        .from(learners).innerJoin(schools, eq(schools.id, learners.schoolId)).where(and(eq(learners.schoolId, principal.schoolId), eq(learners.accountSetUp, false))).limit(1);
      if (candidate) {
        const lookup = await fetch(url+'/learners/onboarding/lookup', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ schoolCode:candidate.schoolCode, admissionNumber:candidate.admissionNumber, initials:(candidate.firstName[0]+candidate.surname[0]).toUpperCase() }) });
        assert.equal(lookup.status,200);
        assert.deepEqual(await lookup.json(), {firstName:candidate.firstName,surname:candidate.surname}); checks++;
      }
    }
    console.log(checks+' roster API checks passed; no records created.');
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
