import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { subjects, appManagers } from '../db/schema';
import { createSubject, DuplicateSubjectError } from '../services/subjectService';
import { requireAuth } from '../middleware/auth';
import { CurriculumError, curriculumSchema, previewWorkbook, getCurriculum, saveCurriculum } from '../services/curriculumService';

const router = Router();
router.use('/manager', requireAuth, async (req, res, next) => {
  if (req.caller?.accountType !== 'manager') return res.status(403).json({ error: 'App manager access required' });
  const [manager] = await db.select().from(appManagers).where(eq(appManagers.id, req.caller.accountId));
  if (!manager?.active) return res.status(403).json({ error: 'App manager account is inactive' });
  next();
});
router.get('/manager/subjects', async (_req, res) => res.json(await db.select().from(subjects).orderBy(subjects.name)));
router.post('/manager/subjects', async (req, res) => {
  const result = z.object({ name: z.string().trim().min(1).max(120) }).safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Enter a subject name (1–120 characters).' });
  try { const subject = await createSubject(result.data); return res.status(201).json(subject); }
  catch (error) { if (error instanceof DuplicateSubjectError) return res.status(409).json({ error: 'That subject already exists.' }); throw error; }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } });
router.post('/manager/curricula/preview', (req, res, next) => {
  upload.single('file')(req, res, error => { if (error) return res.status(400).json({ error: 'Upload one spreadsheet, up to 2 MB.' }); next(); });
}, (req, res) => {
  if (!req.file || !/\.(xlsx|csv)$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Upload an .xlsx or .csv file.' });
  try { return res.json({ sheets: previewWorkbook(req.file.buffer) }); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid spreadsheet.' }); }
});
const selection = z.object({ subjectId: z.coerce.number().int().positive(), gradeNumber: z.coerce.number().int().min(8).max(12) });
router.get('/manager/curricula/:subjectId/:gradeNumber', async (req, res) => {
  const result = selection.safeParse(req.params);
  if (!result.success) return res.status(400).json({ error: 'Choose a subject and grade (8–12).' });
  return res.json(await getCurriculum(result.data.subjectId, result.data.gradeNumber));
});
router.post('/manager/curricula', async (req, res) => {
  const result = curriculumSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Check the subject, grade and labels. Labels must contain 1–1,000 characters.' });
  if (result.data.chapters.reduce((n,c) => n + c.topics.reduce((sum, t) => sum + t.concepts.length, 0), 0) > 5000) return res.status(400).json({ error: 'Use at most 5,000 concepts per curriculum.' });
  try { return res.json(await saveCurriculum(result.data)); }
  catch (error) { if (error instanceof CurriculumError) return res.status(error.status).json({ error: error.message }); throw error; }
});
export default router;
