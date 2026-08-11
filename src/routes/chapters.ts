import { Router } from 'express';
import { z } from 'zod';
import {
  createChapter,
  getChaptersBySubjectGrade,
  assignChapterToClass,
  assignPersonToClassChapter,
  getClassChapters,
} from '../services/chapterService';
import { requireAuth, requirePerson } from '../middleware/auth';

const router = Router();

const createChapterSchema = z.object({
  name:       z.string().min(1),
  orderIndex: z.number().int().positive(),
  label:      z.string().optional(),
});

const assignChapterSchema = z.object({
  chapterId: z.number().int().positive(),
});

const assignPersonSchema = z.object({
  personId: z.number().int().positive(),
});

router.post('/subjects/:subjectId/grades/:gradeNumber/chapters', requireAuth, requirePerson, async (req, res) => {
  const subjectId   = parseInt(req.params.subjectId as string);
  const gradeNumber = parseInt(req.params.gradeNumber as string);

  const result = createChapterSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const chapter = await createChapter({ ...result.data, subjectId, gradeNumber });
  return res.status(201).json(chapter);
});

// List all chapters for a subject and grade
router.get('/subjects/:subjectId/grades/:gradeNumber/chapters', requireAuth, requirePerson, async (req, res) => {
  const subjectId   = parseInt(req.params.subjectId as string);
  const gradeNumber = parseInt(req.params.gradeNumber as string);

  const chapterList = await getChaptersBySubjectGrade(subjectId, gradeNumber);
  return res.json(chapterList);
});

// Assign a curriculum chapter to a class
router.post('/class-subjects/:classSubjectId/chapters/assign', requireAuth, requirePerson, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);

  const result = assignChapterSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const classChapter = await assignChapterToClass(classSubjectId, result.data.chapterId);
  return res.status(201).json(classChapter);
});

// Assign a person to a chapter for a specific class
router.patch('/class-subjects/:classSubjectId/chapters/:chapterId/person', requireAuth, requirePerson, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const chapterId      = parseInt(req.params.chapterId as string);

  const result = assignPersonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const updated = await assignPersonToClassChapter(classSubjectId, chapterId, result.data.personId);
  if (!updated) return res.status(404).json({ error: 'Class chapter assignment not found' });
  return res.status(200).json(updated);
});

// List all chapters assigned to a class
router.get('/class-subjects/:classSubjectId/chapters', requireAuth, requirePerson, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const classChapterList = await getClassChapters(classSubjectId);
  return res.json(classChapterList);
});

export default router;