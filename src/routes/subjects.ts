import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createSubject, getAllSubjects } from '../services/subjectService';

const router = Router();

const createSubjectSchema = z.object({
  name: z.string().min(1),
});

router.post('/subjects', async (req: Request, res: Response) => {
  const result = createSubjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const subject = await createSubject(result.data);
  res.status(201).json(subject);
});

router.get('/subjects', async (_req: Request, res: Response) => {
  const subjects = await getAllSubjects();
  res.json(subjects);
});

export default router;