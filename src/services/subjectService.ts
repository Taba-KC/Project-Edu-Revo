import { db } from '../db';
import { subjects } from '../db/schema';
export class DuplicateSubjectError extends Error {}
export async function createSubject(data: { name: string }, database: Pick<typeof db, 'insert'> = db) {
  const name = data.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) throw new Error('Enter a subject name (1–120 characters).');
  try { const [subject] = await database.insert(subjects).values({ name }).returning(); return subject; }
  catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (failure.code === '23505' || failure.cause?.code === '23505') throw new DuplicateSubjectError('That subject already exists.');
    throw error;
  }
}
export async function getAllSubjects() { return db.select().from(subjects).orderBy(subjects.name); }
