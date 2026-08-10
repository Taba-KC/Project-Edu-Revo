import { Router } from 'express';
import { z } from 'zod';
import {
  getLessonPreview,
  upsertPreviewFeedback,
  upsertLessonFeedback,
  upsertQuestionFeedback,
  getAggregatedLessonFeedback,
} from '../services/learnerFeedbackService';
import { requireAuth, requireLearner, requirePerson } from '../middleware/auth';

const router = Router();

const previewFeedbackSchema = z.object({
  conceptId:   z.number().int().positive(),
  reaction:    z.enum(['new_to_me', 'getting_it', 'will_see_it']),
  isAnonymous: z.boolean().default(true),
});

const lessonFeedbackSchema = z.object({
  lessonConceptId: z.number().int().positive(),
  reaction:        z.enum(['understood', 'not_sure', 'didnt_understand']),
  isAnonymous:     z.boolean().default(true),
});

const questionFeedbackSchema = z.object({
  questionId:   z.number().int().positive(),
  isDone:       z.boolean().optional(),
  memoRevealed: z.boolean().optional(),
  reaction:     z.enum(['understood', 'didnt_get_it']).optional(),
  isAnonymous:  z.boolean().optional(),
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

// Flow 3 — learner submits or updates post-lesson feedback
router.post('/lesson-feedback', requireAuth, requireLearner, async (req, res) => {
  const learnerId = req.caller!.accountId;

  const result = lessonFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const feedback = await upsertLessonFeedback({ ...result.data, learnerId });
  return res.status(200).json(feedback);
});

// Flow 4 — learner marks done, reveals memo, or submits reaction
router.post('/question-feedback', requireAuth, requireLearner, async (req, res) => {
  const learnerId = req.caller!.accountId;

  const result = questionFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const feedback = await upsertQuestionFeedback({ ...result.data, learnerId });
  return res.status(200).json(feedback);
});

// Flow 6 — teacher views aggregated feedback for a lesson
router.get('/lessons/:lessonId/feedback', requireAuth, requirePerson, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const aggregated = await getAggregatedLessonFeedback(lessonId);
  return res.json(aggregated);
});

export default router;