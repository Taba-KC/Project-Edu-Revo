/**
 * Developer check for curriculum manager. This file is run explicitly, not during normal app
 * requests. Inspect its fixtures and database target before running it; the assertions below
 * document the behaviour being checked.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { eq, and } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { subjects, chapters, topics, concepts, classChapters, classSubjects, circuits, schools, grades, classes, people, lessons, lessonConcepts } from '../src/db/schema';
import { createSubject, DuplicateSubjectError } from '../src/services/subjectService';
import { getConceptsByChapter } from '../src/services/conceptService';
import { previewWorkbook, saveCurriculum, getCurriculum, CurriculumError, curriculumSchema, type CurriculumInput } from '../src/services/curriculumService';

async function run() {
 let checks = 0;
 const book = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Mechanics','Mechanics','Vectors'],['Laws','Diagrams','Components'],['First law','Free body diagram','Resultant'],['','',''],['Third law','','']]),'Topics');
 const preview = previewWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
 assert.deepEqual(preview[0]!.chapters[0]!.topics[0]!.concepts.map(c=>c.name),['First law','Third law']); checks++;
 const bad = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(bad,XLSX.utils.aoa_to_sheet([[''],['Missing heading']]),'Bad');
 assert.throws(()=>previewWorkbook(XLSX.write(bad,{type:'buffer',bookType:'xlsx'})),CurriculumError); checks++;
 assert.equal(curriculumSchema.safeParse({subjectId:1,gradeNumber:11,revision:0,chapters:[{name:' ',concepts:[]}]}).success,false); checks++;
 const headers=['Chapter','Topic','Concept',...Array.from({length:5},(_,i)=>'Prerequisite '+(i+1)),...Array.from({length:5},(_,i)=>'Learning outcome '+(i+1))];
 const richBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(richBook,XLSX.utils.aoa_to_sheet([headers,['Vectors','Direction','Direction of resultant','Identify opposite and adjacent sides','Use inverse tangent','','','','Can you calculate a reference angle?']]),'Curriculum');
 const rich=previewWorkbook(XLSX.write(richBook,{type:'buffer',bookType:'xlsx'}));
 assert.deepEqual(rich[0]!.chapters[0]!.topics[0]!.concepts[0]!.prerequisites,['Identify opposite and adjacent sides','Use inverse tangent']);checks++;
 assert.deepEqual(rich[0]!.chapters[0]!.topics[0]!.concepts[0]!.learningOutcomes,['Can you calculate a reference angle?']);checks++;
 const tooMany=XLSX.utils.book_new();XLSX.utils.book_append_sheet(tooMany,XLSX.utils.aoa_to_sheet([[...headers,'Prerequisite 6'],['Vectors','Direction','Resultant']]),'Bad');assert.throws(()=>previewWorkbook(XLSX.write(tooMany,{type:'buffer',bookType:'xlsx'})),CurriculumError);checks++;
 const formulaBook=XLSX.utils.book_new(),formulaSheet=XLSX.utils.aoa_to_sheet([headers,['Vectors','Direction','Resultant']]);formulaSheet.D2={t:'s',f:'A2',v:'Example'};XLSX.utils.book_append_sheet(formulaBook,formulaSheet,'Bad');assert.throws(()=>previewWorkbook(XLSX.write(formulaBook,{type:'buffer',bookType:'xlsx'})),CurriculumError);checks++;
 const rollback = new Error('rollback curriculum tests');
 try { await db.transaction(async tx=>{
   const key='curriculum-test-'+Date.now();
   const [subject] = await tx.insert(subjects).values({name:key}).returning();
   const [circuit] = await tx.select().from(circuits).limit(1); assert.ok(circuit);
   const [school] = await tx.insert(schools).values({circuitId:circuit.id,name:key,activationCode:key}).returning();
   const [grade] = await tx.select().from(grades).where(and(eq(grades.schoolId,school!.id),eq(grades.number,11)));
   const [cls] = await tx.insert(classes).values({gradeId:grade!.id,name:'11TEST'}).returning();
   const [teacher] = await tx.insert(people).values({schoolId:school!.id,title:'Mr',firstName:'Test',surname:'Teacher',staffNumber:key}).returning();
   const [allocation] = await tx.insert(classSubjects).values({classId:cls!.id,subjectId:subject!.id,personId:teacher!.id}).returning();
   const input={subjectId:subject!.id,gradeNumber:11,revision:0,chapters:preview[0]!.chapters};
   const saved = await saveCurriculum(input,tx);
   assert.equal(saved.revision,1); assert.equal(saved.chapters.length,2); checks++;
   assert.equal(saved.chapters[0]!.topics.length,2); checks++;
   assert.deepEqual((await getConceptsByChapter(saved.chapters[0]!.id!,tx)).map(c=>c.name),['First law','Third law','Free body diagram']); checks++;
   const guidanceEdit:CurriculumInput=structuredClone(saved);const guided=guidanceEdit.chapters[0]!.topics[0]!.concepts[0]!;
   guided.prerequisites=['Be able to identify an object and a force.'];guided.learningOutcomes=['Can you explain the first law?'];
   const withGuidance=await saveCurriculum(guidanceEdit,tx);saved.revision=withGuidance.revision;saved.chapters=withGuidance.chapters;
   const reloaded=await getCurriculum(subject!.id,11,tx);assert.deepEqual(reloaded.chapters[0]!.topics[0]!.concepts[0]!.prerequisites,guided.prerequisites);checks++;
   const revised:CurriculumInput=structuredClone(withGuidance);revised.chapters[0]!.topics[0]!.concepts[0]!.prerequisites=[];revised.chapters[0]!.topics[0]!.concepts[0]!.learningOutcomes=['Can you apply the first law?'];
   const revisedResult=await saveCurriculum(revised,tx);saved.revision=revisedResult.revision;saved.chapters=revisedResult.chapters;assert.equal(saved.chapters[0]!.topics[0]!.concepts[0]!.id,guided.id);assert.deepEqual(saved.chapters[0]!.topics[0]!.concepts[0]!.prerequisites,[]);checks++;
   const excessive:CurriculumInput=structuredClone(saved);excessive.chapters[0]!.topics[0]!.concepts[0]!.prerequisites=Array(6).fill('Skill');await assert.rejects(saveCurriculum(excessive,tx),CurriculumError);checks++;
   const renamed: CurriculumInput = structuredClone(saved);
   renamed.chapters[0]!.topics[0]!.name = 'Laws renamed';
   renamed.chapters[0]!.topics.reverse();
   const restructured = await saveCurriculum(renamed,tx);
   assert.equal(restructured.chapters[0]!.topics[1]!.id,saved.chapters[0]!.topics[0]!.id); checks++;
   assert.deepEqual((await getConceptsByChapter(saved.chapters[0]!.id!,tx)).map(c=>c.name),['Free body diagram','First law','Third law']); checks++;
   const restored: CurriculumInput = structuredClone(restructured); restored.chapters[0]!.topics.reverse();
   const restoredResult = await saveCurriculum(restored,tx);
   saved.revision = restoredResult.revision;
   saved.chapters = restoredResult.chapters;
   await assert.rejects(tx.transaction(inner=>createSubject({name:'  '+key.toUpperCase()+'  '},inner)),DuplicateSubjectError); checks++;
   await assert.rejects(tx.transaction(inner=>inner.insert(subjects).values({name:' '+key.toUpperCase()+' '}))); checks++;
   const links = await tx.select().from(classChapters).where(eq(classChapters.classSubjectId,allocation!.id));
   assert.equal(links.length,2); assert.ok(links.every(x=>x.personId===teacher!.id)); checks++;
   await assert.rejects(saveCurriculum(input,tx),e=>e instanceof CurriculumError&&e.status===409); checks++;
   const original = saved.chapters[0]!.topics[0]!.concepts[0]!;
   const [lesson] = await tx.insert(lessons).values({chapterId:saved.chapters[0]!.id!,classSubjectId:allocation!.id,date:'2026-10-07',status:'confirmed'}).returning();
   await tx.insert(lessonConcepts).values({lessonId:lesson!.id,conceptId:original.id!});
   const edited: CurriculumInput = structuredClone(saved);
   edited.chapters[0]!.name='Newton laws revised';
   edited.chapters[0]!.topics[0]!.concepts.splice(1,0,{name:'Second law'});
   const updated = await saveCurriculum(edited,tx);
   assert.equal(updated.chapters[0]!.id,saved.chapters[0]!.id); assert.equal(updated.chapters[0]!.topics[0]!.concepts[0]!.id,original.id); checks++;
   const ordered=await tx.select().from(concepts).where(and(eq(concepts.topicId,updated.chapters[0]!.topics[0]!.id!),eq(concepts.active,true))).orderBy(concepts.orderIndex);
   assert.deepEqual(ordered.map(c=>c.name),['First law','Second law','Third law']); checks++;
   const replacement: CurriculumInput=structuredClone(updated); replacement.chapters[0]!.topics[0]!.concepts[0]={name:'Replacement law'};
   replacement.chapters.splice(1,1);
   const replaced=await saveCurriculum(replacement,tx);
   assert.notEqual(replaced.chapters[0]!.topics[0]!.concepts[0]!.id,original.id); checks++;
   assert.equal((await tx.select().from(concepts).where(eq(concepts.id,original.id!)))[0]!.active,false);
   assert.equal((await tx.select().from(lessonConcepts).where(eq(lessonConcepts.lessonId,lesson!.id)))[0]!.conceptId,original.id); checks++;
   assert.equal((await tx.select().from(chapters).where(eq(chapters.id,saved.chapters[1]!.id!)))[0]!.active,false); checks++;
   assert.equal((await tx.select().from(topics).where(eq(topics.id,saved.chapters[1]!.topics[0]!.id!)))[0]!.active,false); checks++;
   assert.deepEqual((await getConceptsByChapter(saved.chapters[1]!.id!,tx)),[]); checks++;
   const invalidTopic: CurriculumInput=structuredClone(replaced); invalidTopic.chapters[0]!.topics[0]!.id=saved.chapters[1]!.topics[0]!.id!;
   await assert.rejects(saveCurriculum(invalidTopic,tx),CurriculumError); checks++;
   await assert.rejects(tx.transaction(inner=>inner.insert(concepts).values({chapterId:saved.chapters[0]!.id!,topicId:saved.chapters[1]!.topics[0]!.id!,name:'Wrong parent',orderIndex:1}))); checks++;
   const invalid=structuredClone(replaced); invalid.chapters[0]!.topics[0]!.concepts[0]!.id=99999999;
   await assert.rejects(saveCurriculum(invalid,tx),CurriculumError); checks++;
   const duplicate=structuredClone(replaced); duplicate.chapters[0]!.topics[0]!.concepts.push({...duplicate.chapters[0]!.topics[0]!.concepts[0]!});
   await assert.rejects(saveCurriculum(duplicate,tx),CurriculumError); checks++;
   throw rollback;
 }); } catch(e) {if(e!==rollback)throw e;}
 console.log(checks+' curriculum checks passed; fixtures rolled back.');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
