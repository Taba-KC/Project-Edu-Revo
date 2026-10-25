/**
 * One-off maintenance operation that loads curated concept guidance from scripts/data and
 * updates shared curriculum records. It changes the connected database when run; normal
 * lesson planning reads the saved guidance instead.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db, pool } from '../src/db';
import { concepts, chapters } from '../src/db/schema';
import { curriculumSchema, getCurriculum, saveCurriculum } from '../src/services/curriculumService';

// Reviewed, local content only. No external generation requests.
async function run() {
  const guidance = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shared-concept-guidance.json'), 'utf8')) as { id: number; name: string; prerequisites: string[]; learningOutcomes: string[] }[];
  await db.transaction(async tx => {
    const rows = await tx.select({ id: concepts.id, name: concepts.name, prerequisites: concepts.prerequisites, learningOutcomes: concepts.learningOutcomes, subjectId: chapters.subjectId, gradeNumber: chapters.gradeNumber }).from(concepts).innerJoin(chapters, eq(chapters.id, concepts.chapterId)).where(and(inArray(concepts.id, guidance.map(item => item.id)), eq(concepts.active, true), eq(concepts.isCustom, false)));
    if (rows.length !== guidance.length || rows.some(row => guidance.find(item => item.id === row.id)?.name !== row.name)) throw Error('The reviewed curriculum has changed. Review the content before applying it.');
    if (rows.some(row => row.prerequisites.length || row.learningOutcomes.length)) throw Error('Guidance is already populated. Edit it in Curriculum manager; this one-time script will not overwrite existing guidance.');
    const libraries = [...new Map(rows.map(row => [`${row.subjectId}/${row.gradeNumber}`, row])).values()];
    for (const row of libraries) {
      const library = await getCurriculum(row.subjectId, row.gradeNumber, tx);
      for (const chapter of library.chapters) for (const topic of chapter.topics) for (const concept of topic.concepts) {
        const item = guidance.find(item => item.id === concept.id);
        if (item) { concept.prerequisites = item.prerequisites; concept.learningOutcomes = item.learningOutcomes; }
      }
      await saveCurriculum(curriculumSchema.parse(library), tx);
    }
    console.log(`Updated ${guidance.length} shared concepts across ${libraries.length} subject/grade curricula.`);
  });
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
