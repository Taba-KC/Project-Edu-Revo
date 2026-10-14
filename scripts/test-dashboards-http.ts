import 'dotenv/config';
import assert from 'node:assert/strict';
import app from '../src/app';
import { db, pool } from '../src/db';
import { people, learners } from '../src/db/schema';
import { and, eq } from 'drizzle-orm';
import { generateAccessToken } from '../src/services/authService';
async function run() {
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address && typeof address !== 'string');
  const base='http://127.0.0.1:'+address.port;let checks=0;
  const get=(path:string,token?:string)=>fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}});
  try {
    for(const path of ['/staff/me/dashboard','/learners/me/dashboard']) { assert.equal((await get(path)).status,401);checks++; }
    const learnerToken=generateAccessToken(-1,'learner',-1);
    const staffToken=generateAccessToken(-1,'person',-1,'teacher');
    assert.equal((await get('/staff/me/dashboard',learnerToken)).status,403);checks++;
    assert.equal((await get('/learners/me/dashboard',staffToken)).status,403);checks++;
    assert.equal((await get('/staff/me/dashboard',generateAccessToken(-1,'person',null,'teacher'))).status,403);checks++;
    assert.equal((await get('/staff/me/dashboard',staffToken)).status,404);checks++;
    assert.equal((await get('/learners/me/dashboard',learnerToken)).status,404);checks++;
    const [person]=await db.select().from(people).where(eq(people.accountSetUp,true)).limit(1);
    if(person) { const response=await get('/staff/me/dashboard',generateAccessToken(person.id,'person',person.schoolId,'teacher')); assert.equal(response.status,200); const body=await response.json() as {profile:{id:number,passwordHash?:string},subjects:unknown[]};assert.equal(body.profile.id,person.id);assert.equal(body.profile.passwordHash,undefined);checks++; }
    const [learner]=await db.select().from(learners).where(eq(learners.accountSetUp,true)).limit(1);
    if(learner) { const response=await get('/learners/me/dashboard',generateAccessToken(learner.id,'learner',learner.schoolId)); assert.equal(response.status,200);checks++; }
    console.log(checks+' dashboard HTTP checks passed; no records changed.');
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
