import { requireAppManager } from '../middleware/appManager';
/**
 * HTTP routing for this feature. Lower-level chapter concept endpoints; shared curriculum
 * editing also has manager endpoints. req.params contains URL IDs, req.body contains
 * submitted JSON, and res.json sends the response. Read each handler's guards before
 * assuming access is allowed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { createConcept, getConceptsByChapter } from '../services/conceptService';
import { requireAuth } from '../middleware/auth';
import { requireCurriculumReader } from '../middleware/schoolAdministration';

const router = Router();

const createConceptSchema = z.object({
  topicId:    z.number().int().positive().optional(),
  name:       z.string().min(1),
  orderIndex: z.number().int().positive(),
});

// Add a concept to a chapter
/**
 * POST /chapters/:chapterId/concepts: Create data or run the submitted operation.
 */
router.post('/chapters/:chapterId/concepts', requireAuth, requireAppManager, async (req, res) => {
  const chapterId = parseInt(req.params.chapterId as string);

  const result = createConceptSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const concept = await createConcept({ ...result.data, chapterId });
  return res.status(201).json(concept);
});

// List all concepts in a chapter
/**
 * GET /chapters/:chapterId/concepts: Read/return data.
 */
router.get('/chapters/:chapterId/concepts', requireAuth, requireCurriculumReader, async (req, res) => {
  const chapterId = parseInt(req.params.chapterId as string);
  const conceptList = await getConceptsByChapter(chapterId);
  return res.json(conceptList);
});

export default router;
