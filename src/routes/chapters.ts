/**
 * HTTP routing for this feature. Chapter lookup/creation and class-chapter teacher
 * assignment endpoints. req.params contains URL IDs, req.body contains submitted JSON, and
 * res.json sends the response. Read each handler's guards before assuming access is allowed.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  createChapter,
  getChaptersBySubjectGrade,
  assignChapterToClass,
  assignPersonToClassChapter,
  getClassChapters,
} from '../services/chapterService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

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

/**
 * POST /subjects/:subjectId/grades/:gradeNumber/chapters: Create data or run the submitted
 * operation.
 */
router.post('/subjects/:subjectId/grades/:gradeNumber/chapters', requireAuth, requirePrincipal, async (req, res) => {
  const subjectId   = parseInt(req.params.subjectId as string);
  const gradeNumber = parseInt(req.params.gradeNumber as string);

  const result = createChapterSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const chapter = await createChapter({ ...result.data, subjectId, gradeNumber });
  return res.status(201).json(chapter);
});

// List all chapters for a subject and grade
/**
 * GET /subjects/:subjectId/grades/:gradeNumber/chapters: Read/return data.
 */
router.get('/subjects/:subjectId/grades/:gradeNumber/chapters', requireAuth, requirePrincipal, async (req, res) => {
  const subjectId   = parseInt(req.params.subjectId as string);
  const gradeNumber = parseInt(req.params.gradeNumber as string);

  const chapterList = await getChaptersBySubjectGrade(subjectId, gradeNumber);
  return res.json(chapterList);
});

// Assign a curriculum chapter to a class
/**
 * POST /class-subjects/:classSubjectId/chapters/assign: Create data or run the submitted
 * operation.
 */
router.post('/class-subjects/:classSubjectId/chapters/assign', requireAuth, requirePrincipal, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);

  const result = assignChapterSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const classChapter = await assignChapterToClass(classSubjectId, result.data.chapterId);
  return res.status(201).json(classChapter);
});

// Assign a person to a chapter for a specific class
/**
 * PATCH /class-subjects/:classSubjectId/chapters/:chapterId/person: Apply an edit to an
 * existing record.
 */
router.patch('/class-subjects/:classSubjectId/chapters/:chapterId/person', requireAuth, requirePrincipal, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const chapterId      = parseInt(req.params.chapterId as string);

  const result = assignPersonSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const updated = await assignPersonToClassChapter(classSubjectId, chapterId, result.data.personId);
  if (!updated) return res.status(404).json({ error: 'Class chapter assignment not found' });
  return res.status(200).json(updated);
});

// List all chapters assigned to a class
/**
 * GET /class-subjects/:classSubjectId/chapters: Read/return data.
 */
router.get('/class-subjects/:classSubjectId/chapters', requireAuth, requirePrincipal, async (req, res) => {
  const classSubjectId = parseInt(req.params.classSubjectId as string);
  const classChapterList = await getClassChapters(classSubjectId);
  return res.json(classChapterList);
});

export default router;