/** Explicit learner-only routes. IDs identify resources; the services still check ownership. */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireLearner } from '../middleware/auth';
import { TeacherError } from '../services/teacherWorkspaceService';
import { getLearnerWorkspace, getLearnerAnswer } from '../services/learnerWorkspaceService';
import { submitLearningGoalFeedback } from '../services/lessonResponseService';
const router = Router();
router.use('/learners/me', requireAuth, requireLearner);
const id = z.coerce.number().int().positive();
const answer = z.object({ goalIndex: z.number().int().min(0).max(4), answer: z.enum(['yes', 'no']) }).strict();
function endpoint(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof TeacherError) return void res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError) return void res.status(400).json({ error: 'Choose a valid learning goal and Yes or No.' });
      next(error);
    }
  };
}
router.get('/learners/me/workspace', endpoint(async (req, res) => res.json(await getLearnerWorkspace(req.caller!))));
router.get('/learners/me/questions/:id/answer', endpoint(async (req, res) => res.json(await getLearnerAnswer(req.caller!, id.parse(req.params.id)))));
router.post('/learners/me/lesson-concepts/:id/goals', endpoint(async (req, res) => res.json(await submitLearningGoalFeedback(req.caller!, id.parse(req.params.id), answer.parse(req.body)))));
export default router;
