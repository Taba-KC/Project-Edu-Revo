/** Real database integration scenarios; every fixture is rolled back. */
import 'dotenv/config';
import { reviewLearnerTransfer, commitLearnerTransfer } from '../src/services/learnerTransferService';

import assert from 'node:assert/strict';
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { circuits, schools, grades, classes, subjects, streams, streamSubjects, people, learners, classSubjects, chapters, topics, concepts, lessons, lessonConcepts, lessonFeedback, learnerClassHistory, lessonReviewConcepts, classChapters } from '../src/db/schema';
import { savePlan, confirmPlan, getPlanning, TeacherError } from '../src/services/teacherWorkspaceService';
import { getLessonFeedback, addLessonConceptToNextLesson } from '../src/services/teacherLessonFeedbackService';
import { submitLearningGoalFeedback } from '../src/services/lessonResponseService';
import { assignSubjectTeacher, syncClassSubjects } from '../src/services/classSubjectService';
import { saveClassStreams } from '../src/services/classStreamService';
import { reviewLearnerRoster, commitLearnerRoster } from '../src/services/learnerRosterService';
import { getLearnerWorkspace } from '../src/services/learnerWorkspaceService';
import { deleteClassContents, ClassHistoryError } from '../src/services/classService';
import { requireAuth, requirePrincipal } from '../src/middleware/auth';
import jwt from 'jsonwebtoken';
const rollback = new Error('Rollback lifecycle fixtures');
let checks = 0;
function check(value: unknown) { assert.ok(value); checks++; }
async function run() {
 try { await db.transaction(async tx => {
  const key = 'lifecycle-' + Date.now();
  const [circuit] = await tx.select().from(circuits).limit(1);
  const [school, otherSchool] = await tx.insert(schools).values([key,key+'-other'].map(name => ({ name, circuitId:circuit!.id, activationCode:name }))).returning();
  const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId,school!.id),eq(grades.number,11)));
  const [a,b] = await tx.insert(classes).values(['11A','11B'].map(name=>({gradeId:grade!.id,name}))).returning();
  const [teacher,replacement] = await tx.insert(people).values(['Teacher','Replacement'].map(name=>({schoolId:school!.id,title:'Ms',firstName:name,surname:'Test',staffNumber:name,accountSetUp:true}))).returning();
  const teacherCaller={accountType:'person',accountId:teacher!.id,schoolId:school!.id,role:'teacher'};
  const replacementCaller={...teacherCaller,accountId:replacement!.id};
  const [subject] = await tx.insert(subjects).values({name:key}).returning();
  const [stream] = await tx.insert(streams).values({name:key,schoolId:school!.id}).returning();
  await tx.insert(streamSubjects).values({streamId:stream!.id,subjectId:subject!.id});
  for (const cls of [a!,b!]) { await saveClassStreams(tx,cls.id,school!.id,[stream!.id],null); await syncClassSubjects(tx,cls.id); }
  const [allocation] = await tx.select().from(classSubjects).where(eq(classSubjects.classId,a!.id));
  await assignSubjectTeacher(tx,school!.id,a!.id,allocation!.id,teacher!.id);
  const [chapter] = await tx.insert(chapters).values({subjectId:subject!.id,gradeNumber:11,name:key,orderIndex:1}).returning();
  const [topic] = await tx.insert(topics).values({chapterId:chapter!.id,name:key,orderIndex:1}).returning();
  const [concept] = await tx.insert(concepts).values({chapterId:chapter!.id,topicId:topic!.id,name:'Explain forces',orderIndex:1,learningOutcomes:['Can you identify a force?']}).returning();
  await syncClassSubjects(tx,a!.id);
  const students=await tx.insert(learners).values([1,2,3].map(n=>({schoolId:school!.id,classId:n===3?b!.id:a!.id,firstName:'Learner',surname:String(n),admissionNumber:String(n),accountSetUp:true}))).returning();
  await tx.insert(learnerClassHistory).values(students.map(student=>({learnerId:student.id,classId:student.classId,academicYear:a!.academicYear})));
  const studentCaller={accountType:'learner',accountId:students[0]!.id,schoolId:school!.id};
  const plan=await savePlan(teacherCaller,allocation!.id,{chapterId:chapter!.id,date:'2026-01-01',conceptIds:[concept!.id]},tx);
  await confirmPlan(teacherCaller,plan.id,[concept!.id],tx);
  const [link]=await tx.select().from(lessonConcepts).where(eq(lessonConcepts.lessonId,plan.id));
  await submitLearningGoalFeedback(studentCaller,link!.id,{goalIndex:0,answer:'no'},tx);
  check((await getLessonFeedback(teacherCaller,allocation!.id,tx))[0]!.totalLearners===2);
  const transferRows=[{firstName:'Learner',surname:'1',identifier:'1'}];
  const transfer=await reviewLearnerTransfer(tx,school!.id,a!.id,b!.id,[students[0]!.id]);
  await assert.rejects(commitLearnerTransfer(tx,school!.id,a!.id,b!.id,[students[0]!.id],'stale'));checks++;
  check((await tx.select().from(learners).where(eq(learners.id,students[0]!.id)))[0]!.classId===a!.id);
  await assert.rejects(reviewLearnerTransfer(tx,school!.id,a!.id,a!.id,[students[0]!.id]));checks++;
  await assert.rejects(reviewLearnerTransfer(tx,school!.id,a!.id,b!.id,[students[2]!.id]));checks++;
  await assert.rejects(reviewLearnerTransfer(tx,otherSchool!.id,a!.id,b!.id,[students[0]!.id]));checks++;
  await assert.rejects(reviewLearnerTransfer(tx,school!.id,a!.id,b!.id,[students[0]!.id,students[0]!.id]));checks++;
  await commitLearnerTransfer(tx,school!.id,a!.id,b!.id,[students[0]!.id],transfer.reviewHash);
  const after=await getLessonFeedback(teacherCaller,allocation!.id,tx);
  check(after[0]!.totalLearners===2&&after[0]!.concepts[0]!.learningGoals[0]!.no===1);
  check((await tx.select().from(lessonFeedback).where(eq(lessonFeedback.learnerID,students[0]!.id))).length===1);
  await assert.rejects(submitLearningGoalFeedback(studentCaller,link!.id,{goalIndex:0,answer:'yes'},tx),TeacherError);checks++;
  const incomingRows=[{firstName:'Learner',surname:'3',identifier:'3'}];
  const incoming=await reviewLearnerTransfer(tx,school!.id,b!.id,a!.id,[students[2]!.id]);
  await commitLearnerTransfer(tx,school!.id,b!.id,a!.id,[students[2]!.id],incoming.reviewHash);
  const newcomer={...studentCaller,accountId:students[2]!.id};
  await assert.rejects(submitLearningGoalFeedback(newcomer,link!.id,{goalIndex:0,answer:'no'},tx),TeacherError);checks++;
  check(!(await getLearnerWorkspace(newcomer,tx)).subjects[0]!.lessons[0]!.canRespond);
  await addLessonConceptToNextLesson(teacherCaller,plan.id,concept!.id,tx);
  await assignSubjectTeacher(tx,school!.id,a!.id,allocation!.id,replacement!.id);
  await assert.rejects(getPlanning(teacherCaller,allocation!.id,tx),TeacherError);checks++;
  check((await getPlanning(replacementCaller,allocation!.id,tx)).reviewConcepts.some(item=>item.id===concept!.id));
  check((await getLessonFeedback(replacementCaller,allocation!.id,tx))[0]!.concepts[0]!.learningGoals[0]!.no===1);
  const year=a!.academicYear+1;
  const reviewed=await reviewLearnerRoster(tx,school!.id,a!.id,incomingRows,'progression',year);
  await commitLearnerRoster(tx,school!.id,a!.id,incomingRows,'progression',year,reviewed.reviewHash);
  const active=(await tx.select().from(classSubjects).where(and(eq(classSubjects.classId,a!.id),eq(classSubjects.active,true))))[0]!;
  await assert.rejects(savePlan(replacementCaller,active.id,{chapterId:chapter!.id,date:`${year-1}-01-01`,conceptIds:[concept!.id]},tx),TeacherError);checks++;
  const futurePlan=await savePlan(replacementCaller,active.id,{chapterId:chapter!.id,date:`${year}-01-01`,conceptIds:[concept!.id]},tx);
  check(futurePlan.date===`${year}-01-01`);

  check(active.academicYear===year&&active.id!==allocation!.id);
  check((await getPlanning(replacementCaller,active.id,tx)).taughtConceptIds.length===0);
  check((await tx.select().from(lessons).where(eq(lessons.id,plan.id)))[0]!.learnerIdsSnapshot!.length===2);
  check((await tx.select().from(learnerClassHistory).where(and(eq(learnerClassHistory.learnerId,students[1]!.id),isNull(learnerClassHistory.endedAt)))).length===0);
  const [secondChapter]=await tx.insert(chapters).values({subjectId:subject!.id,gradeNumber:11,name:'Second chapter',orderIndex:2}).returning();
  const [secondTopic]=await tx.insert(topics).values({chapterId:secondChapter!.id,name:'Second topic',orderIndex:1}).returning();
  const [secondConcept]=await tx.insert(concepts).values({chapterId:secondChapter!.id,topicId:secondTopic!.id,name:'Second concept',orderIndex:1}).returning();
  await syncClassSubjects(tx,a!.id);
  const mixed=await savePlan(replacementCaller,active.id,{chapterId:chapter!.id,date:`${year}-01-01`,conceptIds:[concept!.id,secondConcept!.id]},tx);
  await tx.update(classChapters).set({personId:teacher!.id}).where(and(eq(classChapters.classSubjectId,active.id),eq(classChapters.chapterId,secondChapter!.id)));
  await assert.rejects(confirmPlan(replacementCaller,mixed.id,[concept!.id,secondConcept!.id],tx,new Date(`${year}-01-02`)),(error:unknown)=>error instanceof TeacherError&&error.status===403);checks++;
  // A deliberately late error must roll back earlier successful row processing.
  const before=await tx.select().from(learners).where(eq(learners.schoolId,school!.id));
  await assert.rejects(tx.transaction(async nested=>{
    const review=await reviewLearnerRoster(nested,school!.id,b!.id,[{firstName:'Changed',surname:'1',identifier:'1'}],'update',b!.academicYear);
    await commitLearnerRoster(nested,school!.id,b!.id,[{firstName:'Changed',surname:'1',identifier:'1'}],'update',b!.academicYear,review.reviewHash);
    throw new Error('Simulated late failure');
  }));
  assert.deepEqual(await tx.select().from(learners).where(eq(learners.schoolId,school!.id)),before);checks++;
  await assert.rejects(tx.transaction(nested=>nested.update(learners).set({schoolId:otherSchool!.id}).where(eq(learners.id,students[0]!.id))));checks++;
  // Exercise the real deletion guard through the transaction's PostgreSQL connection.
  await assert.rejects(deleteClassContents((tx as any).session.client,[a!.id]),ClassHistoryError);checks++;
  // A token claiming principal must not retain that power after the live role changes.
  const original=db.select.bind(db);(db as any).select=tx.select.bind(tx);
  try {
    const request:any={headers:{authorization:'Bearer '+jwt.sign({...teacherCaller,role:'principal'},process.env.JWT_SECRET!)}};
    let status=200,authorized=false;
    const response:any={status(value:number){status=value;return this;},json(){return this;}};
    await requireAuth(request,response,()=>{});
    requirePrincipal(request,response,()=>{authorized=true;});
    check(!authorized&&status===403&&request.caller.role==='teacher');
  } finally { (db as any).select=original; }
  throw rollback;
 }); } catch(error) { if(error!==rollback)throw error; }
 console.log(`Passed ${checks} lifecycle integrity checks; all fixture records rolled back.`);
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
