import { db } from '../db';
import { homework, questions } from '../db/schema';
import { eq } from 'drizzle-orm';

export async function createHomework(data: {
  lessonId: number;
  dueDate: string;
  memoReleaseType: string;
  memoReleaseAt?: string;
}) {
  const [hw] = await db.insert(homework).values({
    ...data,
    dueDate: new Date(data.dueDate),
    memoReleaseAt: data.memoReleaseAt ? new Date(data.memoReleaseAt) : undefined,
  }).returning();
  return hw;
}

export async function getHomeworkByLesson(lessonId: number) {
  const [hw] = await db.select().from(homework).where(eq(homework.lessonId, lessonId));
  if (!hw) return null;
  const questionList = await db.select().from(questions)
    .where(eq(questions.homeworkId, hw.id))
    .orderBy(questions.orderIndex);
  return { homework: hw, questions: questionList };
}

export async function addQuestion(data: {
  homeworkId: number;
  conceptId: number;
  orderIndex: number;
  body: string;
  memo?: string;
}) {
  const [question] = await db.insert(questions).values(data).returning();
  return question;
}

export async function getQuestionsByHomework(homeworkId: number) {
  return db.select().from(questions)
    .where(eq(questions.homeworkId, homeworkId))
    .orderBy(questions.orderIndex);
}