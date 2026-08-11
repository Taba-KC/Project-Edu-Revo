import 'dotenv/config';
import { db } from '../src/db';
import {
  grades, classes, streams, streamSubjects, classSubjects,
  subjects, chapters, classChapters,
} from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { assignStreamToClass } from '../src/services/classService';

async function run() {
  console.log('--- Current state ---');

  const allGrades    = await db.select().from(grades);
  const allClasses   = await db.select().from(classes);
  const allStreams    = await db.select().from(streams);
  const allSubjects  = await db.select().from(subjects);
  const allChapters  = await db.select().from(chapters);

  console.log('Grades:', allGrades.map(g => `id=${g.id} number=${g.number} schoolId=${g.schoolId}`));
  console.log('Classes:', allClasses.map(c => `id=${c.id} name=${c.name} gradeId=${c.gradeId} streamId=${c.streamId}`));
  console.log('Streams:', allStreams.map(s => `id=${s.id} name=${s.name}`));
  console.log('Subjects:', allSubjects.map(s => `id=${s.id} name=${s.name}`));
  console.log('Curriculum chapters:', allChapters.map(c => `id=${c.id} name=${c.name} subjectId=${c.subjectId} gradeNumber=${c.gradeNumber}`));

  // Find a class with no stream assigned
  const unassigned = allClasses.find(c => !c.streamId);
  if (!unassigned) {
    console.log('\nAll classes already have streams. Creating a test class...');
    const testGrade = allGrades[0];
    if (!testGrade) { console.log('No grades found — cannot proceed.'); return; }
    const [newClass] = await db.insert(classes).values({ gradeId: testGrade.id, name: 'TestClass' }).returning();
    console.log('Created test class:', newClass);
    await testAssign(newClass.id, allStreams, allGrades, newClass.gradeId);
  } else {
    console.log(`\nFound class without stream: id=${unassigned.id} name=${unassigned.name}`);
    await testAssign(unassigned.id, allStreams, allGrades, unassigned.gradeId);
  }
}

async function testAssign(classId: number, allStreams: any[], allGrades: any[], gradeId: number) {
  if (allStreams.length === 0) { console.log('No streams found — cannot test.'); return; }

  const stream = allStreams[0];
  const grade  = allGrades.find(g => g.id === gradeId);
  console.log(`\nAssigning stream id=${stream.id} (${stream.name}) to class id=${classId}`);
  console.log(`Class grade number: ${grade?.number}`);

  await assignStreamToClass(classId, stream.id);

  const assignedClassSubjects = await db.select().from(classSubjects).where(eq(classSubjects.classId, classId));
  console.log('\nClassSubjects created:', assignedClassSubjects.map(cs => `id=${cs.id} subjectId=${cs.subjectId}`));

  const assignedClassChapters = await db.select().from(classChapters)
    .where(eq(classChapters.classSubjectId, assignedClassSubjects[0]?.id ?? 0));
  console.log('ClassChapters auto-assigned:', assignedClassChapters.length > 0
    ? assignedClassChapters.map(cc => `chapterId=${cc.chapterId}`)
    : 'none (no curriculum chapters exist for this subject+grade combination)');
}

run();
