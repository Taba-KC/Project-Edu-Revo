import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { chapters, topics, concepts, curriculumLibraries, subjects, classes, grades, classSubjects, classChapters } from '../db/schema';
export class CurriculumError extends Error { constructor(message: string, public status = 400) { super(message); } }
const label = z.string().trim().min(1).max(1000);
const identity = { id: z.number().int().positive().optional(), name: label };
export const conceptGuidanceSchema = z.object({ prerequisites: z.array(label).max(5).optional(), learningOutcomes: z.array(label).max(5).optional() });
export const curriculumSchema = z.object({
  subjectId: z.number().int().positive(), gradeNumber: z.number().int().min(8).max(12), revision: z.number().int().min(0),
  chapters: z.array(z.object({ ...identity, topics: z.array(z.object({ ...identity,
    concepts: z.array(z.object({ ...identity, ...conceptGuidanceSchema.shape })).max(2000),
  })).max(100) })).min(1).max(100),
});
export type CurriculumInput = z.infer<typeof curriculumSchema>;
const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
type PreviewChapter = { name: string; topics: { name: string; concepts: { name: string; prerequisites?: string[]; learningOutcomes?: string[] }[] }[] };
function similar(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2 || Math.min(a.length, b.length) < 8) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j-1]! + 1, previous[j]! + 1, previous[j-1]! + (a[i-1] === b[j-1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]! <= 2;
}
export function previewWorkbook(buffer: Buffer) {
  let book: XLSX.WorkBook;
  try { book = XLSX.read(buffer, { type: 'buffer', sheetRows: 2003 }); }
  catch { throw new CurriculumError('This file could not be read as a spreadsheet.'); }
  if (!book.SheetNames.length || book.SheetNames.length > 10) throw new CurriculumError('Use a workbook with 1–10 worksheets.');
  return book.SheetNames.map(name => {
    const sheet = book.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
    if (range.e.c >= 100 || range.e.r > 2001) throw new CurriculumError('Use at most 100 topic columns and 2,000 concept rows.');
    const result: PreviewChapter[] = [];
    const read = (r: number, c: number): string => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell?.f) throw new CurriculumError('Use plain labels, not spreadsheet formulas.');
      if (r === 0 && !cell) {
        const merge = sheet['!merges']?.find(m => m.s.r === 0 && m.e.r === 0 && m.s.c <= c && m.e.c >= c);
        if (merge && merge.s.c !== c) return read(0, merge.s.c);
      }
      return String(cell?.v ?? '').trim();
    };
    if (key(read(0, 0)) === 'chapter' && key(read(0, 1)) === 'topic' && key(read(0, 2)) === 'concept') {
      const headers = ['Chapter', 'Topic', 'Concept', ...Array.from({ length: 5 }, (_, i) => 'Prerequisite ' + (i + 1)), ...Array.from({ length: 5 }, (_, i) => 'Learning outcome ' + (i + 1))];
      for (let c = 0; c <= Math.max(range.e.c, 12); c++) {
        if (key(read(0, c)) !== key(headers[c] ?? '')) throw new CurriculumError('Use the 13 template columns: Chapter, Topic, Concept, Prerequisite 1–5, Learning outcome 1–5.');
      }
      for (let r = 1; r <= range.e.r; r++) {
        for (let c = 13; c <= range.e.c; c++) if (read(r, c)) throw new CurriculumError('Use at most five prerequisites and five learning outcomes. Extra data was found in row ' + (r + 1) + '.');
        const values = headers.map((_, c) => read(r, c));
        if (values.every(value => !value)) continue;
        if (!values[0] || !values[1] || !values[2]) throw new CurriculumError('Row ' + (r + 1) + ' needs Chapter, Topic and Concept.');
        if (values.some(value => value.length > 1000)) throw new CurriculumError('Use at most 1,000 characters per cell.');
        let chapter = result.find(chapter => key(chapter.name) === key(values[0]));
        if (!chapter) { chapter = { name: values[0], topics: [] }; result.push(chapter); }
        let topic = chapter.topics.find(topic => key(topic.name) === key(values[1]));
        if (!topic) { topic = { name: values[1], concepts: [] }; chapter.topics.push(topic); }
        if (topic.concepts.some(concept => key(concept.name) === key(values[2]))) throw new CurriculumError('Repeated concept in row ' + (r + 1) + '. Use one row per concept.');
        topic.concepts.push({ name: values[2], prerequisites: values.slice(3, 8).filter(Boolean), learningOutcomes: values.slice(8, 13).filter(Boolean) });
      }
      if (!result.length) throw new CurriculumError('Add at least one concept below the headers.');
      return { name, chapters: result, warnings: [] };
    }
    for (let c = 0; c <= range.e.c; c++) {
      const chapterName = read(0, c), topicName = read(1, c);
      const items: { name: string }[] = [];
      for (let r = 2; r <= range.e.r; r++) { const text = read(r, c); if (text) items.push({ name: text }); }
      if (!chapterName && !topicName && !items.length) continue;
      if (!chapterName || !topicName) throw new CurriculumError('Column ' + XLSX.utils.encode_col(c) + ' needs a chapter in row 1 and a topic in row 2. Concepts start in row 3.');
      let chapter = result.find(ch => key(ch.name) === key(chapterName));
      if (!chapter) { chapter = { name: chapterName, topics: [] }; result.push(chapter); }
      chapter.topics.push({ name: topicName, concepts: items });
    }
    const warnings: string[] = [];
    for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
      if (similar(key(result[i]!.name), key(result[j]!.name))) warnings.push('Similar chapter headings: “' + result[i]!.name + '” and “' + result[j]!.name + '”. Check the labels; you can combine them during review.');
    }
    for (const ch of result) {
      const names = ch.topics.map(t => key(t.name));
      if (new Set(names).size !== names.length) warnings.push('Repeated topic labels in “' + ch.name + '”. Rename or remove duplicates before saving.');
    }
    return { name, chapters: result, warnings };
  });
}
export async function getCurriculum(subjectId: number, gradeNumber: number, database: Pick<typeof db, 'transaction'> = db) {
  return database.transaction(async tx => {
    const [library] = await tx.select().from(curriculumLibraries).where(and(eq(curriculumLibraries.subjectId, subjectId), eq(curriculumLibraries.gradeNumber, gradeNumber)));
    const rows = await tx.select().from(chapters).where(and(eq(chapters.subjectId, subjectId), eq(chapters.gradeNumber, gradeNumber), eq(chapters.active, true))).orderBy(chapters.orderIndex, chapters.id);
    const topicRows = rows.length ? await tx.select().from(topics).where(and(inArray(topics.chapterId, rows.map(r => r.id)), eq(topics.active, true))).orderBy(topics.orderIndex, topics.id) : [];
    const items = topicRows.length ? await tx.select().from(concepts).where(and(inArray(concepts.topicId, topicRows.map(t => t.id)), eq(concepts.active, true), eq(concepts.isCustom, false))).orderBy(concepts.orderIndex, concepts.id) : [];
    return { subjectId, gradeNumber, revision: library?.revision ?? 0, exists: !!library || rows.length > 0,
      chapters: rows.map(ch => ({ id: ch.id, name: ch.name, topics: topicRows.filter(t => t.chapterId === ch.id).map(t => ({ id: t.id, name: t.name, concepts: items.filter(c => c.topicId === t.id).map(c => ({ id: c.id, name: c.name, prerequisites: c.prerequisites, learningOutcomes: c.learningOutcomes })) })) })) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function saveCurriculum(input: CurriculumInput, database: Pick<typeof db, 'transaction'> = db) {
  const parsed = curriculumSchema.safeParse(input);
  if (!parsed.success) throw new CurriculumError('Check curriculum labels and use at most five prerequisites and five learning outcomes per concept.');
  input = parsed.data;
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411, 0)`);
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, input.subjectId));
    if (!subject) throw new CurriculumError('Subject not found', 404);
    const old = await tx.select().from(chapters).where(and(eq(chapters.subjectId, input.subjectId), eq(chapters.gradeNumber, input.gradeNumber)));
    const [library] = await tx.select().from(curriculumLibraries).where(and(eq(curriculumLibraries.subjectId, input.subjectId), eq(curriculumLibraries.gradeNumber, input.gradeNumber)));
    if ((library?.revision ?? 0) !== input.revision) throw new CurriculumError('This curriculum was changed elsewhere. Reload it before saving.', 409);
    const oldTopics = old.length ? await tx.select().from(topics).where(inArray(topics.chapterId, old.map(c => c.id))) : [];
    const oldConcepts = old.length ? await tx.select().from(concepts).where(inArray(concepts.chapterId, old.map(c => c.id))) : [];
    const chapterIds = new Set<number>(), topicIds = new Set<number>(), conceptIds = new Set<number>(), chapterNames = new Set<string>();
    for (const chapter of input.chapters) {
      if (chapterNames.has(key(chapter.name))) throw new CurriculumError('Chapter labels must be unique. Combine chapters that have the same label.');
      chapterNames.add(key(chapter.name));
      if (chapter.id && (!old.some(c => c.id === chapter.id && c.active) || chapterIds.has(chapter.id))) throw new CurriculumError('Invalid or repeated chapter ID.');
      if (chapter.id) chapterIds.add(chapter.id);
      const topicNames = new Set<string>();
      for (const topic of chapter.topics) {
        if (topicNames.has(key(topic.name))) throw new CurriculumError('Topic labels must be unique within a chapter.');
        topicNames.add(key(topic.name));
        if (topic.id && (!oldTopics.some(t => t.id === topic.id && t.chapterId === chapter.id && t.active) || topicIds.has(topic.id))) throw new CurriculumError('Invalid or repeated topic ID.');
        if (topic.id) topicIds.add(topic.id);
        const names = new Set<string>();
        for (const concept of topic.concepts) {
          if (names.has(key(concept.name))) throw new CurriculumError('Concept labels must be unique within a topic.');
          names.add(key(concept.name));
          if (concept.id && (!oldConcepts.some(c => c.id === concept.id && c.topicId === topic.id && c.active && !c.isCustom) || conceptIds.has(concept.id))) throw new CurriculumError('Invalid or repeated concept ID.');
          if (concept.id) conceptIds.add(concept.id);
        }
      }
    }
    for (const row of old) if (row.active && !chapterIds.has(row.id)) await tx.update(chapters).set({ active: false }).where(eq(chapters.id, row.id));
    for (const row of oldTopics) if (row.active && !topicIds.has(row.id)) await tx.update(topics).set({ active: false }).where(eq(topics.id, row.id));
    for (const row of oldConcepts) if (row.active && !row.isCustom && !conceptIds.has(row.id)) await tx.update(concepts).set({ active: false }).where(eq(concepts.id, row.id));
    const allocations = await tx.select({ id: classSubjects.id, personId: classSubjects.personId }).from(classSubjects)
      .innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(eq(classSubjects.subjectId, input.subjectId), eq(classSubjects.active, true), eq(grades.number, input.gradeNumber)));
    const saved = [];
    for (const [i, chapter] of input.chapters.entries()) {
      let chapterId = chapter.id;
      if (chapterId) await tx.update(chapters).set({ name: chapter.name, orderIndex: i + 1 }).where(eq(chapters.id, chapterId));
      else {
        const [row] = await tx.insert(chapters).values({ subjectId: input.subjectId, gradeNumber: input.gradeNumber, name: chapter.name, orderIndex: i + 1 }).returning(); chapterId = row.id;
        if (allocations.length) await tx.insert(classChapters).values(allocations.map(a => ({ classSubjectId: a.id, chapterId: chapterId!, personId: a.personId })));
      }
      const savedTopics = [];
      for (const [j, topic] of chapter.topics.entries()) {
        let topicId = topic.id;
        if (topicId) await tx.update(topics).set({ name: topic.name, orderIndex: j + 1 }).where(eq(topics.id, topicId));
        else { const [row] = await tx.insert(topics).values({ chapterId, name: topic.name, orderIndex: j + 1 }).returning(); topicId = row.id; }
        const savedConcepts = [];
        for (const [k, concept] of topic.concepts.entries()) {
          const previous = oldConcepts.find(row => row.id === concept.id);
          const guidance = { prerequisites: concept.prerequisites ?? previous?.prerequisites ?? [], learningOutcomes: concept.learningOutcomes ?? previous?.learningOutcomes ?? [] };
          if (concept.id) { await tx.update(concepts).set({ name: concept.name, orderIndex: k + 1, ...guidance }).where(eq(concepts.id, concept.id)); savedConcepts.push({ id: concept.id, name: concept.name, ...guidance }); }
          else { const [row] = await tx.insert(concepts).values({ chapterId, topicId, name: concept.name, orderIndex: k + 1, ...guidance }).returning(); savedConcepts.push({ id: row.id, name: row.name, ...guidance }); }
        }
        savedTopics.push({ id: topicId, name: topic.name, concepts: savedConcepts });
      }
      saved.push({ id: chapterId, name: chapter.name, topics: savedTopics });
    }
    const revision = input.revision + 1;
    await tx.insert(curriculumLibraries).values({ subjectId: input.subjectId, gradeNumber: input.gradeNumber, revision })
      .onConflictDoUpdate({ target: [curriculumLibraries.subjectId, curriculumLibraries.gradeNumber], set: { revision, updatedAt: new Date() } });
    return { subjectId: input.subjectId, gradeNumber: input.gradeNumber, exists: true, revision, chapters: saved };
  });
}
