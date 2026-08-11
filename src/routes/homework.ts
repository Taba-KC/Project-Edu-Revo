import { Router } from 'express';
import { z } from 'zod';
import {
  createHomework,
  getHomeworkByLesson,
  addQuestion,
  getQuestionsByHomework,
} from '../services/homeworkService';
import { requireAuth, requireTeacher } from '../middleware/auth';

const router = Router();

const createHomeworkSchema = z.object({
  dueDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use format YYYY-MM-DDTHH:MM'),
  memoReleaseType: z.enum(['immediately', 'at_due_date', 'custom']),
  memoReleaseAt:   z.string().optional(),
});

const addQuestionSchema = z.object({
  conceptId:  z.number().int().positive(),
  orderIndex: z.number().int().positive(),
  body:       z.string().min(1),
  memo:       z.string().optional(),
});

// Create a homework set for a lesson
router.post('/lessons/:lessonId/homework', requireAuth, requireTeacher, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);

  const result = createHomeworkSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const hw = await createHomework({ ...result.data, lessonId });
  return res.status(201).json(hw);
});

// Get the homework set for a lesson
router.get('/lessons/:lessonId/homework', requireAuth, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const hw = await getHomeworkByLesson(lessonId);
  if (!hw) return res.status(404).json({ error: 'No homework found for this lesson' });
  return res.json(hw);
});

// Add a question to a homework set
router.post('/homework/:homeworkId/questions', requireAuth, requireTeacher, async (req, res) => {
  const homeworkId = parseInt(req.params.homeworkId as string);

  const result = addQuestionSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const question = await addQuestion({ ...result.data, homeworkId });
  return res.status(201).json(question);
});

// List all questions in a homework set
router.get('/homework/:homeworkId/questions', requireAuth, requireTeacher, async (req, res) => {
  const homeworkId = parseInt(req.params.homeworkId as string);
  const questionList = await getQuestionsByHomework(homeworkId);
  return res.json(questionList);
});

export default router;