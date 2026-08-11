import { Router } from 'express';
import { z } from 'zod';
import {
  planLesson,
  confirmLesson,
  getLessonsByClassSubject,
  getLessonConcepts,
} from '../services/lessonService';
import { requireAuth, requireTeacher } from '../middleware/auth';

const router = Router();

const planLessonSchema = z.object({
  chapterId:  z.number().int().positive(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  conceptIds: z.array(z.number().int().positive()).min(1),
});

const confirmLessonSchema = z.object({
  conceptIds: z.array(z.number().int().positive()).min(1),
});

// Plan a lesson
router.post('/class-subjects/:classSubjectId/lessons', requireAuth, requireTeacher, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);

  const result = planLessonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const lesson = await planLesson({ ...result.data, classSubjectId });
  return res.status(201).json(lesson);
});

// Confirm a lesson was taught
router.patch('/lessons/:lessonId/confirm', requireAuth, requireTeacher, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);

  const result = confirmLessonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const lesson = await confirmLesson(lessonId, result.data.conceptIds);
  return res.status(200).json(lesson);
});

// List all lessons for a class-subject
router.get('/class-subjects/:classSubjectId/lessons', requireAuth, requireTeacher, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const lessonList = await getLessonsByClassSubject(classSubjectId);
  return res.json(lessonList);
});

// Get concepts for a lesson
router.get('/lessons/:lessonId/concepts', requireAuth, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const concepts = await getLessonConcepts(lessonId);
  return res.json(concepts);
});

export default router;