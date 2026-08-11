import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  createStream,
  getStreamsBySchool,
  addSubjectToStream,
  getStreamSubjects,
} from '../services/streamService';
import { getSchoolById } from '../services/schoolService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

const router = Router();

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

export default router;