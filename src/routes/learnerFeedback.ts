import { Router } from 'express';
import { z } from 'zod';
import {
  getLessonPreview,
  upsertPreviewFeedback,
  upsertLessonFeedback,
  upsertQuestionFeedback,
  getAggregatedLessonFeedback,
} from '../services/learnerFeedbackService';

const router = Router();

const previewFeedbackSchema = z.object({
  learnerId:   z.number().int().positive(),
  conceptId:   z.number().int().positive(),
  reaction:    z.enum(['new_to_me', 'getting_it', 'will_see_it']),
  isAnonymous: z.boolean().default(true),
});

const lessonFeedbackSchema = z.object({
  learnerId:       z.number().int().positive(),
  lessonConceptId: z.number().int().positive(),
  reaction:        z.enum(['understood', 'not_sure', 'didnt_understand']),
  isAnonymous:     z.boolean().default(true),
});

const questionFeedbackSchema = z.object({
  learnerId:    z.number().int().positive(),
  questionId:   z.number().int().positive(),
  isDone:       z.boolean().optional(),
  memoRevealed: z.boolean().optional(),
  reaction:     z.enum(['understood', 'didnt_get_it']).optional(),
  isAnonymous:  z.boolean().optional(),
});

// Flow 5 — get lesson preview (planned concepts)
router.get('/lessons/:lessonId/preview', async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const concepts = await getLessonPreview(lessonId);
  return res.json(concepts);
});

// Flow 5 — learner submits or updates preview reaction
router.post('/lessons/:lessonId/preview-feedback', async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);

  const result = previewFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const feedback = await upsertPreviewFeedback({ ...result.data, lessonId });
  return res.status(200).json(feedback);
});

// Flow 3 — learner submits or updates post-lesson feedback
router.post('/lesson-feedback', async (req, res) => {
  const result = lessonFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const feedback = await upsertLessonFeedback(result.data);
  return res.status(200).json(feedback);
});


// Flow 4 — learner marks done, reveals memo, or submits reaction
router.post('/question-feedback', async (req, res) => {
  const result = questionFeedbackSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const feedback = await upsertQuestionFeedback(result.data);
  return res.status(200).json(feedback);
});

// Flow 6 — teacher views aggregated feedback for a lesson
router.get('/lessons/:lessonId/feedback', async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  const aggregated = await getAggregatedLessonFeedback(lessonId);
  return res.json(aggregated);
});

export default router;