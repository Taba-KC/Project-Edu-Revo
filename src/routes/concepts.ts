import { Router } from 'express';
import { z } from 'zod';
import { createConcept, getConceptsByChapter } from '../services/conceptService';

const router = Router();

const createConceptSchema = z.object({
  name:       z.string().min(1),
  orderIndex: z.number().int().positive(),
});

// Add a concept to a chapter
router.post('/chapters/:chapterId/concepts', async (req, res) => {
  const chapterId = parseInt(req.params.chapterId as string);

  const result = createConceptSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const concept = await createConcept({ ...result.data, chapterId });
  return res.status(201).json(concept);
});

// List all concepts in a chapter
router.get('/chapters/:chapterId/concepts', async (req, res) => {
  const chapterId = parseInt(req.params.chapterId as string);
  const conceptList = await getConceptsByChapter(chapterId);
  return res.json(conceptList);
});

export default router;