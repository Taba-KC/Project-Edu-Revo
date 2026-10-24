import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  getLessonPreview,
  upsertPreviewFeedback,
} from '../services/learnerFeedbackService';
import { requireAuth, requireLearner } from '../middleware/auth';

import { getLearnerLessonFeedback, submitLessonFeedback } from '../services/lessonResponseService';
import { TeacherError } from '../services/teacherWorkspaceService';
const router = Router();
function endpoint(handler: (req: Request, res: Response) => Promise<unknown>) { return async (req: Request, res: Response, next: NextFunction) => { try { await handler(req, res); } catch (error) { if (error instanceof TeacherError) return res.status(error.status).json({ error: error.message }); if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(' ') }); next(error); } }; }

const previewFeedbackSchema = z.object({
  conceptId:   z.number().int().positive(),
  reaction:    z.enum(['new_to_me', 'getting_it', 'will_see_it']),
  isAnonymous: z.boolean().default(true),
});

const lessonFeedbackSchema = z.object({
  lessonConceptId: z.number().int().positive(),
  reaction:        z.enum(['understood', 'didnt_understand']),
  isAnonymous:     z.boolean().default(true),
});


// Flow 5 — get lesson preview (planned concepts)
router.get('/lessons/:lessonId/preview', requireAuth, requireLearner, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const concepts = await getLessonPreview(lessonId);
  return res.json(concepts);
});

// Flow 5 — learner submits or updates preview reaction
router.post('/lessons/:lessonId/preview-feedback', requireAuth, requireLearner, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const learnerId = req.caller!.accountId;

  const result = previewFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const feedback = await upsertPreviewFeedback({ ...result.data, lessonId, learnerId });
  return res.status(200).json(feedback);
});

// Lesson feedback belongs to taught concepts, never homework questions.
router.get('/learners/me/lessons/:lessonId/feedback', requireAuth, requireLearner, endpoint(async (req, res) => {
  res.json(await getLearnerLessonFeedback(req.caller!, z.coerce.number().int().positive().parse(req.params.lessonId)));
}));
router.post('/lesson-feedback', requireAuth, requireLearner, endpoint(async (req, res) => {
  res.json(await submitLessonFeedback(req.caller!, lessonFeedbackSchema.strict().parse(req.body)));
}));
export default router;
