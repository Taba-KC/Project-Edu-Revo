import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createClass,
  getClassesByGrade,
  assignStreamToClass,
  deleteClassById,
  updateClass,
  ClassNotFoundError,
  DuplicateClassNameError,
  InvalidClassNameError,
} from '../services/classService';
import { getSchoolById } from '../services/schoolService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

import { db } from '../db';
import { grades, classes } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { SetupError } from '../services/classSubjectService';

const router = Router();
router.use('/schools/:schoolId/grades/:gradeId/classes', requireAuth, requirePrincipal, async (req, res, next) => {
  const schoolId = Number(req.params.schoolId), gradeId = Number(req.params.gradeId);
  if (!Number.isSafeInteger(gradeId) || gradeId <= 0) return res.status(400).json({ error: 'Invalid grade ID' });
  if (schoolId !== req.caller?.schoolId) return res.status(403).json({ error: 'School access denied' });
  const [grade] = await db.select().from(grades).where(and(eq(grades.id, gradeId), eq(grades.schoolId, schoolId)));
  if (!grade) return res.status(404).json({ error: 'Grade not found' });
  next();
});
router.use('/schools/:schoolId/grades/:gradeId/classes/:classId', async (req, res, next) => {
  if (!Number.isSafeInteger(Number(req.params.classId)) || Number(req.params.classId) <= 0) return res.status(400).json({ error: 'Invalid class ID' });
  const [cls] = await db.select().from(classes).where(and(eq(classes.id, Number(req.params.classId)), eq(classes.gradeId, Number(req.params.gradeId))));
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  next();
});
const createClassSchema = z.object({
  name: z.string().min(1),
  streamId: z.number().int().positive().nullable().optional(),
  classTeacherId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
});

const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  streamId: z.number().int().positive().nullable().optional(),
  classTeacherId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
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

  try {
    const cls = await createClass({ gradeId, ...result.data });
    res.status(201).json(cls);
  } catch (err) {
    if (err instanceof DuplicateClassNameError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidClassNameError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
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

router.patch('/schools/:schoolId/grades/:gradeId/classes/:classId', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
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

  const result = updateClassSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  try {
    const cls = await updateClass(classId, result.data);
    res.json(cls);
  } catch (err) {
    if (err instanceof DuplicateClassNameError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidClassNameError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete('/schools/:schoolId/grades/:gradeId/classes/:classId', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
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

  try {
    const deleted = await deleteClassById(classId, gradeId, schoolId);
    res.json(deleted);
  } catch (err) {
    if (err instanceof ClassNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.use((err: unknown, _req: Request, res: Response, next: import('express').NextFunction) => {
  if (err instanceof SetupError) return res.status(err.status).json({ error: err.message });
  next(err);
});
export default router;
