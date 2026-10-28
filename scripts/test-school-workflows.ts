import 'dotenv/config';
import assert from 'node:assert/strict';
import { and,eq,isNull } from 'drizzle-orm';
import { db,pool } from '../src/db';
import { circuits,schools,grades,classes,subjects,streams,streamSubjects,learners,learnerStreamSelections,classSubjects,learnerClassHistory,people,administrativeWork,chapters,lessons,lessonConcepts,topics,concepts } from '../src/db/schema';
import { saveClassStreams,streamOptions,learnerLearningSetup,learnerSubjectIds,subjectRoster,StreamChoiceError } from '../src/services/classStreamService';
import { syncClassSubjects,syncStreamClasses } from '../src/services/classSubjectService';
import { reviewLearnerRoster,commitLearnerRoster } from '../src/services/learnerRosterService';
import { getLearnerWorkspace } from '../src/services/learnerWorkspaceService';
import { RosterImportError } from '../src/services/rosterImportService';
import { requireSchoolAdministration } from '../src/middleware/schoolAdministration';
import { staffAccess } from '../src/services/staffAccessService';
import app from '../src/app';
import jwt from 'jsonwebtoken';

const rollback=new Error('Rollback school workflow test fixtures');
let checks=0;
const check=(value:unknown)=>{assert.ok(value);checks++;};
async function run(){
 try{await db.transaction(async tx=>{
  const key='workflows-'+Date.now();
  const [circuit]=await tx.select().from(circuits).limit(1);
  const [school]=await tx.insert(schools).values({circuitId:circuit.id,name:key,activationCode:key}).returning();
  const [grade]=await tx.select().from(grades).where(and(eq(grades.schoolId,school.id),eq(grades.number,11)));
  const [master,other]=await tx.insert(classes).values([{gradeId:grade.id,name:'11A'},{gradeId:grade.id,name:'11B'}]).returning();
  const year=master.academicYear;
  const [common,agric,geography,extra]=await tx.insert(subjects).values(['Shared','Agric','Geography','Extra'].map(name=>({name:key+name}))).returning();
  const [a,b]=await tx.insert(streams).values(['Agriculture','Geography'].map(name=>({schoolId:school.id,name}))).returning();
  await tx.insert(streamSubjects).values([{streamId:a.id,subjectId:common.id},{streamId:a.id,subjectId:agric.id},{streamId:b.id,subjectId:common.id},{streamId:b.id,subjectId:geography.id}]);
  // Use a savepoint for expected failures: failed configuration must leave no partial links.
  await assert.rejects(tx.transaction(nested=>saveClassStreams(nested,master.id,school.id,[a.id,b.id],null)),StreamChoiceError);checks++;
  check((await streamOptions(tx,master.id)).options.length===0);
  await saveClassStreams(tx,master.id,school.id,[a.id,b.id],{primarySubjectId:agric.id,locations:[{subjectId:geography.id,building:'Science block',classroom:'G1'}]});
  await syncClassSubjects(tx,master.id);
  const info=await streamOptions(tx,master.id);
  check(info.common.length===1&&info.different.length===2);
  const allocations=await tx.select().from(classSubjects).where(eq(classSubjects.classId,master.id));
  check(allocations.length===3&&allocations.filter(row=>row.subjectId===common.id).length===1);
  const [oldChapter]=await tx.insert(chapters).values({subjectId:common.id,gradeNumber:11,name:key,orderIndex:1}).returning();
  const [oldTopic]=await tx.insert(topics).values({chapterId:oldChapter.id,name:key,orderIndex:1}).returning();
  const [oldConcept]=await tx.insert(concepts).values({chapterId:oldChapter.id,topicId:oldTopic.id,name:key,orderIndex:1}).returning();
  const [oldLesson]=await tx.insert(lessons).values({classSubjectId:allocations.find(row=>row.subjectId===common.id)!.id,chapterId:oldChapter.id,date:`${year}-10-01`,status:'confirmed'}).returning();
  await tx.insert(lessonConcepts).values({lessonId:oldLesson.id,conceptId:oldConcept.id});
  const [l1,l2,l3]=await tx.insert(learners).values([1,2,3].map(index=>({schoolId:school.id,classId:index===3?other.id:master.id,firstName:'Learner',surname:String(index),admissionNumber:String(index),accountSetUp:true,username:key+index,passwordHash:'preserved-hash'}))).returning();
  await tx.insert(learnerClassHistory).values([l1,l2,l3].map(learner=>({learnerId:learner.id,classId:learner.classId,academicYear:year})));
  const caller={accountId:l1.id,accountType:'learner',schoolId:school.id};
  check((await learnerLearningSetup(tx,caller)).status==='choose-subjects');
  await assert.rejects(learnerSubjectIds(tx,caller),StreamChoiceError);checks++;
  await tx.insert(learnerStreamSelections).values([{learnerId:l1.id,classId:master.id,academicYear:year,streamId:a.id,revision:info.cls.streamRevision},{learnerId:l2.id,classId:master.id,academicYear:year,streamId:b.id,revision:info.cls.streamRevision}]);
  check((await learnerSubjectIds(tx,caller)).includes(agric.id)&&!(await learnerSubjectIds(tx,caller)).includes(geography.id));
  check((await subjectRoster(tx,allocations.find(row=>row.subjectId===common.id)!.id)).length===2);
  check((await subjectRoster(tx,allocations.find(row=>row.subjectId===agric.id)!.id)).length===1);
  const workspace=await getLearnerWorkspace(caller,tx);
  check(workspace.subjects.length===2&&!workspace.subjects.some(row=>row.subjectId===geography.id));
  // Returning to the same split class must not silently reuse its previous confirmation.
  const returnRollback=new Error('Rollback return-to-class scenario');
  try { await tx.transaction(async nested=>{
    const moving=[{firstName:'Learner',surname:'1',identifier:'1'}];
    const leave=await reviewLearnerRoster(nested,school.id,other.id,moving,'update',year);
    await commitLearnerRoster(nested,school.id,other.id,moving,'update',year,leave.reviewHash);
    const back=await reviewLearnerRoster(nested,school.id,master.id,moving,'update',year);
    await commitLearnerRoster(nested,school.id,master.id,moving,'update',year,back.reviewHash);
    check((await learnerLearningSetup(nested,caller)).status==='choose-subjects');
    check((await nested.select().from(learnerStreamSelections).where(eq(learnerStreamSelections.learnerId,l1.id)))[0].streamId===a.id);
    throw returnRollback;
  }); } catch(error) { if(error!==returnRollback)throw error; }
  // Updating keeps the unlisted learner, transfers an existing learner, adds a new one.
  const rows=[{firstName:'Corrected',surname:'One',identifier:'1'},{firstName:'Transferred',surname:'Three',identifier:'3'},{firstName:'New',surname:'Four',identifier:'4'}];
  const update=await reviewLearnerRoster(tx,school.id,master.id,rows,'update',year);
  check(update.retained===1&&update.transfers.length===1&&update.added===1&&update.removed.length===0);
  await assert.rejects(commitLearnerRoster(tx,school.id,master.id,rows,'update',year,'stale'),RosterImportError);checks++;
  await commitLearnerRoster(tx,school.id,master.id,rows,'update',year,update.reviewHash);
  const [kept]=await tx.select().from(learners).where(eq(learners.id,l1.id));
  check(kept.username===l1.username&&kept.passwordHash==='preserved-hash'&&kept.firstName==='Corrected');
  check((await tx.select().from(learners).where(eq(learners.id,l2.id)))[0].classId===master.id);
  check((await tx.select().from(learnerClassHistory).where(and(eq(learnerClassHistory.learnerId,l3.id),isNull(learnerClassHistory.endedAt))))[0].classId===master.id);
  const nextRows=rows.slice(0,1);
  const progression=await reviewLearnerRoster(tx,school.id,master.id,nextRows,'progression',year+1);
  check(progression.removed.length===3);
  await commitLearnerRoster(tx,school.id,master.id,nextRows,'progression',year+1,progression.reviewHash);
  check((await tx.select().from(learners).where(eq(learners.id,l2.id)))[0].classId===null);
  check((await learnerLearningSetup(tx,{...caller,accountId:l2.id})).status==='awaiting-class');
  const after=await tx.select().from(classSubjects).where(eq(classSubjects.classId,master.id));
  check(after.filter(row=>row.academicYear===year).every(row=>!row.active));
  check(after.filter(row=>row.academicYear===year+1&&row.active).length===3);
  check((await tx.select().from(lessons).where(eq(lessons.id,oldLesson.id))).length===1);
  check(!(await tx.select().from(lessons)).some(lesson=>after.some(allocation=>allocation.academicYear===year+1&&allocation.id===lesson.classSubjectId)));
  check((await learnerLearningSetup(tx,caller)).status==='choose-subjects');
  await assert.rejects(reviewLearnerRoster(tx,school.id,master.id,nextRows,'progression',year),RosterImportError);checks++;
  await assert.rejects(reviewLearnerRoster(tx,school.id,other.id,[...nextRows,...nextRows],'update',year),RosterImportError);checks++;
  // Editing stream membership invalidates room configuration and subject confirmations.
  await tx.insert(streamSubjects).values({streamId:b.id,subjectId:extra.id});await syncStreamClasses(tx,b.id);
  check((await learnerLearningSetup(tx,caller)).status==='awaiting-class-setup');

  const [staff]=await tx.insert(people).values({schoolId:school.id,title:'Ms',firstName:'Admin',surname:'Helper',staffNumber:key,accountSetUp:true}).returning();
  const [principal]=await tx.insert(people).values({schoolId:school.id,title:'Mr',firstName:'School',surname:'Principal',staffNumber:key+'-P',role:'principal',accountSetUp:true}).returning();
  await tx.insert(administrativeWork).values({schoolId:school.id,personId:staff.id,capability:'grades'});
  // Access helpers normally use db. Route their reads to this rollback fixture transaction.
  const originalSelect=db.select.bind(db);(db as any).select=tx.select.bind(tx);
  try{
   const staffCaller={accountId:staff.id,accountType:'person',role:'teacher',schoolId:school.id};
   check((await staffAccess(staffCaller)).capabilities.join()==='grades');
   const originalTransaction=db.transaction.bind(db);(db as any).transaction=tx.transaction.bind(tx);
   const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
   try{
    const url=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const token=jwt.sign(staffCaller,process.env.JWT_SECRET!);const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    check((await fetch(url+`/schools/${school.id}/grades`,{headers})).status===200);
    check((await fetch(url+`/schools/${school.id+100000}/grades`,{headers})).status===403);
    check((await fetch(url+`/schools/${school.id}/people`,{method:'POST',headers,body:JSON.stringify({title:'Mr',firstName:'Cannot',surname:'Escalate',staffNumber:'denied'})})).status===403);
    check((await fetch(url+`/schools/${school.id}/people/${staff.id}/administrative-work`,{method:'PUT',headers,body:JSON.stringify({capabilities:['staff']})})).status===403);
    const principalHeaders={Authorization:'Bearer '+jwt.sign({accountId:principal.id,accountType:'person',role:'principal',schoolId:school.id},process.env.JWT_SECRET!),'Content-Type':'application/json'};
    check((await fetch(url+`/schools/${school.id}/people/${staff.id}/administrative-work`,{method:'PUT',headers:principalHeaders,body:JSON.stringify({capabilities:['grades','curriculum']})})).status===200);
    check((await staffAccess(staffCaller)).capabilities.includes('curriculum'));
    check((await fetch(url+`/schools/${school.id}/people/${staff.id}/administrative-work`,{method:'PUT',headers:principalHeaders,body:JSON.stringify({capabilities:['superuser']})})).status===400);
    check((await fetch(url+`/subjects/${common.id}/grades/11/chapters`,{headers})).status===200);
    const classList=await fetch(url+`/schools/${school.id}/grades/${grade.id}/classes`,{headers});check(classList.status===200);
    check((await classList.json() as {id:number;academicYear:number;streamIds:number[]}[]).some(row=>row.id===master.id&&row.academicYear===year+1&&row.streamIds.length===2));
    const learnerHeaders={Authorization:'Bearer '+jwt.sign(caller,process.env.JWT_SECRET!),'Content-Type':'application/json'};
    check((await fetch(url+'/learners/me/workspace',{headers:learnerHeaders})).status===409);
    check((await fetch(url+'/learners/me/learning-setup',{method:'POST',headers:learnerHeaders,body:JSON.stringify({classId:master.id,academicYear:year+1,streamId:a.id,revision:info.cls.streamRevision})})).status===409);
    check((await fetch(url+`/schools/${school.id}/classes/${master.id}/streams`,{method:'PUT',headers,body:JSON.stringify({streamIds:[a.id,b.id],configuration:null})})).status===400);
    const valid=await fetch(url+`/schools/${school.id}/classes/${master.id}/streams`,{method:'PUT',headers,body:JSON.stringify({streamIds:[a.id,b.id],configuration:{primarySubjectId:agric.id,locations:[{subjectId:geography.id,building:'Block B',classroom:'G1'},{subjectId:extra.id,building:'Block B',classroom:'E1'}]}})});check(valid.status===200);
    const current=await learnerLearningSetup(tx,caller);
    check((await fetch(url+'/learners/me/learning-setup',{method:'POST',headers:learnerHeaders,body:JSON.stringify({classId:master.id,academicYear:year+1,streamId:a.id,revision:current.revision})})).status===200);
    check((await fetch(url+'/learners/me/workspace',{headers:learnerHeaders})).status===200);
    const register=await fetch(url+`/schools/${school.id}/classes/${master.id}/learners`,{headers});check(register.status===200);
    const registerRows=await register.json() as {selectedStreamName:string;passwordHash?:string}[];
    check(registerRows[0].selectedStreamName==='Agriculture'&&!('passwordHash' in registerRows[0]));
    const reviewPayload={rows:nextRows,mode:'update',academicYear:year+1};
    const reviewed=await fetch(url+`/schools/${school.id}/classes/${master.id}/learners/import/review`,{method:'POST',headers,body:JSON.stringify(reviewPayload)});check(reviewed.status===200);
    const {reviewHash}=await reviewed.json() as {reviewHash:string};
    check((await fetch(url+`/schools/${school.id}/classes/${master.id}/learners/import/commit`,{method:'POST',headers,body:JSON.stringify({...reviewPayload,reviewHash})})).status===201);
    check((await fetch(url+'/learners/me/learning-setup',{method:'POST',headers:learnerHeaders,body:JSON.stringify({classId:master.id,academicYear:year+1,streamId:b.id,revision:current.revision})})).status===409);
    check((await fetch(url+`/schools/${school.id}/classes/${master.id}/learners/${l1.id}/stream-selection`,{method:'DELETE',headers})).status===200);
    check((await learnerLearningSetup(tx,caller)).status==='choose-subjects');
    // Direct transfers use the same live administrative grants and preserve accounts.
    const [moveTarget]=await tx.insert(classes).values({gradeId:grade.id,name:'11D',academicYear:year+1}).returning();
    const moveBase=`/schools/${school.id}/classes/${master.id}/learner-transfers`;
    const moveBody={targetClassId:moveTarget.id,learnerIds:[l1.id]};
    check((await fetch(url+`/schools/${school.id+100000}/classes/${master.id}/learner-transfers/review`,{method:'POST',headers,body:JSON.stringify(moveBody)})).status===403);
    check((await fetch(url+moveBase+'/review',{method:'POST',headers,body:JSON.stringify({targetClassId:other.id,learnerIds:[l1.id]})})).status===400);
    const moveReview=await fetch(url+moveBase+'/review',{method:'POST',headers,body:JSON.stringify(moveBody)});check(moveReview.status===200);
    const moveHash=(await moveReview.json() as {reviewHash:string}).reviewHash;
    check((await fetch(url+moveBase+'/commit',{method:'POST',headers,body:JSON.stringify({...moveBody,reviewHash:'0'.repeat(64)})})).status===409);
    check((await fetch(url+moveBase+'/commit',{method:'POST',headers,body:JSON.stringify({...moveBody,reviewHash:moveHash})})).status===200);
    check((await tx.select().from(learners).where(eq(learners.id,l1.id)))[0].classId===moveTarget.id);
    const backBase=`/schools/${school.id}/classes/${moveTarget.id}/learner-transfers`;
    const backBody={targetClassId:master.id,learnerIds:[l1.id]};
    const backReview=await fetch(url+backBase+'/review',{method:'POST',headers,body:JSON.stringify(backBody)});check(backReview.status===200);
    const backHash=(await backReview.json() as {reviewHash:string}).reviewHash;
    check((await fetch(url+backBase+'/commit',{method:'POST',headers,body:JSON.stringify({...backBody,reviewHash:backHash})})).status===200);
    check((await learnerLearningSetup(tx,caller)).status==='choose-subjects');
   }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));(db as any).transaction=originalTransaction;}
   let passed=false,status=200;const res={status(value:number){status=value;return this;},json(){return this;}};
   await requireSchoolAdministration(['grades'])({caller:staffCaller,params:{schoolId:String(school.id)},method:'POST'} as any,res as any,()=>{passed=true;});check(passed);
   passed=false;await requireSchoolAdministration(['staff'])({caller:staffCaller,params:{schoolId:String(school.id)},method:'POST'} as any,res as any,()=>{passed=true;});check(!passed&&status===403);
   await tx.delete(administrativeWork).where(eq(administrativeWork.personId,staff.id));passed=false;
   await requireSchoolAdministration(['grades'])({caller:staffCaller,params:{schoolId:String(school.id)},method:'POST'} as any,res as any,()=>{passed=true;});check(!passed&&status===403);
  }finally{(db as any).select=originalSelect;}
  throw rollback;
 });}catch(error){if(error!==rollback)throw error;}
 console.log(`Passed ${checks} school workflow checks; all fixture records rolled back.`);
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
