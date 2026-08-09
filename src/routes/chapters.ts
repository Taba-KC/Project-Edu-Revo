import { Router } from 'express';
import { z } from 'zod';
import { createChapter, assignPersonToChapter, getChaptersByClassSubject } from '../services/chapterService';

const router = Router();

const createChapterSchema = z.object({
  name:       z.string().min(1),
  orderIndex: z.number().int().positive(),
  label:      z.string().optional(),
});

const assignPersonSchema = z.object({
  personId: z.number().int().positive(),
});

// Add a chapter to a class-subject
router.post('/class-subjects/:classSubjectId/chapters', async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);

  const result = createChapterSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const chapter = await createChapter({ ...result.data, classSubjectId });
  return res.status(201).json(chapter);
});

// List all chapters in a class-subject
router.get('/class-subjects/:classSubjectId/chapters', async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const chapterList = await getChaptersByClassSubject(classSubjectId);
  return res.json(chapterList);
});

// Assign a person to a chapter
router.patch('/chapters/:chapterId/assign', async (req, res) => {
  const chapterId = parseInt(req.params.chapterId as string);

  const result = assignPersonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const chapter = await assignPersonToChapter(chapterId, result.data.personId);
  return res.status(200).json(chapter);
});

export default router;