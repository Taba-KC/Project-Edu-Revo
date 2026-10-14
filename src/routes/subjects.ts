import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createSubject, getAllSubjects, DuplicateSubjectError } from '../services/subjectService';

const router = Router();

const createSubjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

router.post('/subjects', async (req: Request, res: Response) => {
  const result = createSubjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  try { const subject = await createSubject(result.data); res.status(201).json(subject); }
  catch (error) { if (error instanceof DuplicateSubjectError) { res.status(409).json({ error: error.message }); return; } throw error; }
});

router.get('/subjects', async (_req: Request, res: Response) => {
  const subjects = await getAllSubjects();
  res.json(subjects);
});

export default router;