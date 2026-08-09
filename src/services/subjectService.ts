import { db } from '../db';
import { subjects } from '../db/schema';

export async function createSubject(data: { name: string }) {
  const [subject] = await db.insert(subjects).values(data).returning();
  return subject;
}

export async function getAllSubjects() {
  return db.select().from(subjects).orderBy(subjects.name);
}