import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createClass, getClassesByGrade, assignStreamToClass } from '../services/classService';
import { getSchoolById } from '../services/schoolService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

const router = Router();

const createClassSchema = z.object({
  name: z.string().min(1),
});

const assignStreamSchema = z.object({
  streamId: z.number().int().positive(),
});

router.post('/schools/:schoolId/grades/:gradeId/classes', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const gradeId = parseInt(req.params.gradeId as string);

  if (isNaN(schoolId) || isNaN(gradeId)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const result = createClassSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const cls = await createClass({ gradeId, name: result.data.name });
  res.status(201).json(cls);
});

router.get('/schools/:schoolId/grades/:gradeId/classes', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const gradeId = parseInt(req.params.gradeId as string);

  if (isNaN(schoolId) || isNaN(gradeId)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const classList = await getClassesByGrade(gradeId);
  res.json(classList);
});

router.post('/schools/:schoolId/grades/:gradeId/classes/:classId/stream', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const gradeId = parseInt(req.params.gradeId as string);
  const classId = parseInt(req.params.classId as string);

  if (isNaN(schoolId) || isNaN(gradeId) || isNaN(classId)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const result = assignStreamSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const cls = await assignStreamToClass(classId, result.data.streamId);
  res.json(cls);
});

export default router;