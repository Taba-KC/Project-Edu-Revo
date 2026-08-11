import 'dotenv/config';
import { db } from '../src/db';
import {
  lessonPreviewFeedback,
  lessonFeedback,
  questionFeedback,
  questions,
  homework,
  lessonConcepts,
  lessons,
  concepts,
  chapters,
} from '../src/db/schema';

async function cleanup() {
  await db.delete(lessonPreviewFeedback);
  await db.delete(lessonFeedback);
  await db.delete(questionFeedback);
  await db.delete(questions);
  await db.delete(homework);
  await db.delete(lessonConcepts);
  await db.delete(lessons);
  await db.delete(concepts);
  await db.delete(chapters);
  console.log('Done. All chapter-related test data cleared.');
}

cleanup();