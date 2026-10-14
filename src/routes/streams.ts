import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createStream,
  getStreamsBySchool,
  updateStream,
  deleteStream,
  addSubjectToStream,
  updateStreamSubject,
  removeSubjectFromStream,
  getStreamSubjects,
} from '../services/streamService';
import { getSchoolById } from '../services/schoolService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

import { db } from '../db';
import { streams as streamTable, streamSubjects as streamSubjectTable } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const router = Router();
router.use('/schools/:schoolId/streams', requireAuth, requirePrincipal, (req, res, next) => {
  if (Number(req.params.schoolId) !== req.caller?.schoolId) return res.status(403).json({ error: 'School access denied' });
  next();
});
router.use('/schools/:schoolId/streams/:streamId', async (req, res, next) => {
  if (!Number.isSafeInteger(Number(req.params.streamId)) || Number(req.params.streamId) <= 0) return res.status(400).json({ error: 'Invalid stream ID' });
  const [stream] = await db.select().from(streamTable).where(and(eq(streamTable.id, Number(req.params.streamId)), eq(streamTable.schoolId, Number(req.params.schoolId))));
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  next();
});
router.use('/schools/:schoolId/streams/:streamId/subjects/:streamSubjectId', async (req, res, next) => {
  if (!Number.isSafeInteger(Number(req.params.streamSubjectId)) || Number(req.params.streamSubjectId) <= 0) return res.status(400).json({ error: 'Invalid stream subject ID' });
  const [subject] = await db.select().from(streamSubjectTable).where(and(eq(streamSubjectTable.id, Number(req.params.streamSubjectId)), eq(streamSubjectTable.streamId, Number(req.params.streamId))));
  if (!subject) return res.status(404).json({ error: 'Stream subject not found' });
  next();
});

const createStreamSchema = z.object({
  name: z.string().min(1),
});

const addSubjectSchema = z.object({
  subjectId: z.number().int().positive(),
});

router.post('/schools/:schoolId/streams', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  if (isNaN(schoolId)) {
    res.status(400).json({ error: 'Invalid school ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const result = createStreamSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const stream = await createStream({ schoolId, name: result.data.name });
  res.status(201).json(stream);
});

router.get('/schools/:schoolId/streams', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  if (isNaN(schoolId)) {
    res.status(400).json({ error: 'Invalid school ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const streams = await getStreamsBySchool(schoolId);
  res.json(streams);
});

router.patch('/schools/:schoolId/streams/:streamId', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const streamId = parseInt(req.params.streamId as string);

  if (isNaN(schoolId) || isNaN(streamId)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const result = createStreamSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const stream = await updateStream(streamId, { name: result.data.name });
  if (!stream) {
    res.status(404).json({ error: 'Stream not found' });
    return;
  }

  res.json(stream);
});

router.delete('/schools/:schoolId/streams/:streamId', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const streamId = parseInt(req.params.streamId as string);

  if (isNaN(schoolId) || isNaN(streamId)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const result = await deleteStream(streamId);
  res.json(result);
});

router.post('/schools/:schoolId/streams/:streamId/subjects', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  const streamId = parseInt(req.params.streamId as string);

  if (isNaN(schoolId) || isNaN(streamId)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const result = addSubjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const streamSubject = await addSubjectToStream({
    streamId,
    subjectId: result.data.subjectId,
  });
  res.status(201).json(streamSubject);
});

router.get('/schools/:schoolId/streams/:streamId/subjects', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const streamId = parseInt(req.params.streamId as string);
  if (isNaN(streamId)) {
    res.status(400).json({ error: 'Invalid stream ID' });
    return;
  }

  const subjects = await getStreamSubjects(streamId);
  res.json(subjects);
});

router.patch('/schools/:schoolId/streams/:streamId/subjects/:streamSubjectId', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const streamSubjectId = parseInt(req.params.streamSubjectId as string);

  if (isNaN(streamSubjectId)) {
    res.status(400).json({ error: 'Invalid stream subject ID' });
    return;
  }

  const result = addSubjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const streamSubject = await updateStreamSubject({
    streamSubjectId,
    subjectId: result.data.subjectId,
  });
  if (!streamSubject) {
    res.status(404).json({ error: 'Stream subject not found' });
    return;
  }

  res.json(streamSubject);
});

router.delete('/schools/:schoolId/streams/:streamId/subjects/:streamSubjectId', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const streamSubjectId = parseInt(req.params.streamSubjectId as string);

  if (isNaN(streamSubjectId)) {
    res.status(400).json({ error: 'Invalid stream subject ID' });
    return;
  }

  const result = await removeSubjectFromStream(streamSubjectId);
  res.json(result);
});

router.use((err: unknown, _req: Request, res: Response, next: import('express').NextFunction) => {
  const error = err as { code?: string; cause?: { code?: string } };
  if (error.code === '23505' || error.cause?.code === '23505') return res.status(409).json({ error: 'This subject is already in the stream' });
  next(err);
});
export default router;
