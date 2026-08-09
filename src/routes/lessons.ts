import { Router } from 'express';
import { z } from 'zod';
import { createLesson, getLessonsByClassSubject, getLessonConcepts } from '../services/lessonService';

const router = Router();

const createLessonSchema = z.object({
  chapterId:  z.number().int().positive(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  conceptIds: z.array(z.number().int().positive()).min(1),
});

// Confirm a lesson was taught
router.post('/class-subjects/:classSubjectId/lessons', async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);

  const result = createLessonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const lesson = await createLesson({ ...result.data, classSubjectId });
  return res.status(201).json(lesson);
});

// List all lessons for a class-subject
router.get('/class-subjects/:classSubjectId/lessons', async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const lessonList = await getLessonsByClassSubject(classSubjectId);
  return res.json(lessonList);
});

// Get concepts covered in a lesson
router.get('/lessons/:lessonId/concepts', async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const concepts = await getLessonConcepts(lessonId);
  return res.json(concepts);
});

export default router;