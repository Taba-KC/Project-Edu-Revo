import 'dotenv/config';
import assert from 'node:assert/strict';
import app from '../src/app';
import { db,pool } from '../src/db';
import { people } from '../src/db/schema';
import { and,eq } from 'drizzle-orm';
import { generateAccessToken } from '../src/services/authService';
async function run(){let checks=0;const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
 const request=(path:string,token?:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
 assert.equal((await request('/staff/class-subjects/1/planning')).status,401);checks++;
 assert.equal((await request('/staff/class-subjects/1/planning',generateAccessToken(-1,'learner',-1))).status,403);checks++;
 const staff=await db.select({id:people.id,schoolId:people.schoolId}).from(people).where(and(eq(people.accountSetUp,true),eq(people.role,'teacher')));
 let assigned:{token:string;classSubjectId:number;chapterId:number}|null=null;let unassignedToken:string|null=null;
 for(const account of staff){const token=generateAccessToken(account.id,'person',account.schoolId,'teacher');const dashboard=await request('/staff/me/dashboard',token);assert.equal(dashboard.status,200);const data=await dashboard.json() as {subjects:{id:number;currentChapter:{id:number}|null}[]};
 if(data.subjects[0]?.currentChapter)assigned={token,classSubjectId:data.subjects[0].id,chapterId:data.subjects[0].currentChapter.id};else if(!data.subjects.length)unassignedToken=token;}
 if(assigned){
  const path='/staff/class-subjects/'+assigned.classSubjectId;
  const response=await request(path+'/planning',assigned.token);assert.equal(response.status,200);const data=await response.json() as {chapter:{id:number};aiAvailable:boolean};assert.equal(data.chapter.id,assigned.chapterId);checks++;
  if(unassignedToken){assert.equal((await request(path+'/planning',unassignedToken)).status,403);assert.equal((await request(path+'/plans',unassignedToken,'POST',{chapterId:assigned.chapterId,date:'2026-10-10',conceptIds:[1]})).status,403);checks+=2;}
  assert.equal((await request(path+'/plans',assigned.token,'POST',{chapterId:assigned.chapterId,date:'2026-02-30',conceptIds:[1]})).status,400);checks++;
  assert.equal((await request('/staff/lessons/2147483647/confirm',assigned.token,'PATCH',{conceptIds:[]})).status,404);checks++;
  assert.equal((await request('/staff/lessons/2147483647/generate-homework',assigned.token,'POST',{counts:[{conceptId:1,count:11}]})).status,400);checks++;
  assert.equal((await request('/staff/lessons/2147483647/homework',assigned.token,'POST',{dueDate:'2030-01-01T12:00:00Z',memoReleaseType:'immediately',questions:[{conceptId:1,body:'Question'}]})).status,404);checks++;
  assert.equal((await request('/lessons/2147483647/homework',assigned.token,'POST',{})).status,410);checks++;
  assert.equal((await request('/staff/questions/2147483647/memo',assigned.token,'PATCH',{memo:'Answer'})).status,404);checks++;
 }
 console.log(checks+' teacher HTTP checks passed; no records changed or AI requests sent.');
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
