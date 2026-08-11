import 'dotenv/config';
import { db } from '../src/db';
import { classes, classSubjects, classChapters, chapters } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { assignStreamToClass } from '../src/services/classService';

async function run() {
  // Grade 10 = gradeId 3, Science Stream = streamId 1
  // Create a fresh Grade 10 test class
  const [testClass] = await db.insert(classes).values({ gradeId: 3, name: 'TestGrade10' }).returning();
  console.log('Created Grade 10 test class:', testClass.id);

  // Assign Science Stream — this should auto-assign the Algebra chapter
  await assignStreamToClass(testClass.id, 1);
  console.log('Stream assigned.');

  // Check classSubjects created
  const cs = await db.select().from(classSubjects).where(eq(classSubjects.classId, testClass.id));
  console.log('ClassSubjects created:', cs.map(s => `id=${s.id} subjectId=${s.subjectId}`));

  // Check classChapters auto-assigned
  const cc = await db.select().from(classChapters);
  const relevant = cc.filter(c => cs.some(s => s.id === c.classSubjectId));
  console.log('ClassChapters auto-assigned:', relevant.length > 0
    ? relevant.map(r => `classSubjectId=${r.classSubjectId} chapterId=${r.chapterId}`)
    : 'none');

  // Show what chapter that is
  if (relevant.length > 0) {
    const ch = await db.select().from(chapters).where(eq(chapters.id, relevant[0].chapterId));
    console.log('Chapter details:', ch.map(c => `"${c.name}" subjectId=${c.subjectId} gradeNumber=${c.gradeNumber}`));
  }

  // Clean up test class
  await db.delete(classChapters).where(eq(classChapters.classSubjectId, cs[0]?.id ?? 0));
  await db.delete(classSubjects).where(eq(classSubjects.classId, testClass.id));
  await db.delete(classes).where(eq(classes.id, testClass.id));
  console.log('\nTest class cleaned up.');
}

run();
