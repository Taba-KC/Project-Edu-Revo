import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requirePrincipal, requireLearner } from '../middleware/auth';
import { createAnnouncement, getSchoolAnnouncements, getLearnerAnnouncements } from '../services/announcementService';

const router = Router();

const createSchema = z.object({
  title:        z.string().min(1),
  body:         z.string().min(1),
  audienceType: z.enum(['all', 'grade', 'class', 'stream']),
  audienceId:   z.number().int().positive().optional(),
}).refine(
  data => data.audienceType === 'all' || data.audienceId !== undefined,
  { message: 'audienceId is required when audienceType is not all' }
);

// Principal creates an announcement
router.post('/schools/:schoolId/announcements', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: result.error.flatten() }); return; }

  const announcement = await createAnnouncement({
    schoolId:  req.caller!.schoolId,
    createdBy: req.caller!.accountId,
    ...result.data,
  });
  res.status(201).json(announcement);
});

// Principal views all announcements for the school
router.get('/schools/:schoolId/announcements', requireAuth, requirePrincipal, async (req: Request, res: Response) => {
  const schoolId = req.caller!.schoolId;
  if (isNaN(schoolId)) { res.status(400).json({ error: 'Invalid school ID' }); return; }

  const list = await getSchoolAnnouncements(schoolId);
  res.json(list);
});

// Learner views their relevant announcements
router.get('/learners/me/announcements', requireAuth, requireLearner, async (req: Request, res: Response) => {
  const { accountId, schoolId } = req.caller!;

  const { learners } = await import('../db/schema');
  const { db } = await import('../db');
  const { eq } = await import('drizzle-orm');

  const [learner] = await db.select().from(learners).where(eq(learners.id, accountId));
  if (!learner || !learner.classId) { res.json([]); return; }

  const list = await getLearnerAnnouncements(schoolId, learner.classId);
  res.json(list);
});

export default router;