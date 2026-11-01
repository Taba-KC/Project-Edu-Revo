import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireTeacher } from '../middleware/auth';
import { attemptLimit } from '../middleware/authRateLimit';
import { AccountReviewError, managedAccounts, reviewAccount, submitAccountClaim } from '../services/accountReviewService';
const router = Router();
const input = z.object({ schoolCode: z.string().trim().min(1).max(100), admissionNumber: z.string().trim().min(1).max(100), initials: z.string().trim().min(1).max(20), username: z.string().trim().min(3).max(100), password: z.string().min(6).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72) }).strict();
function endpoint(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof AccountReviewError) return void res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError) return void res.status(400).json({ error: 'Provide valid account details and a password between 6 and 72 characters.' });
      next(error);
    }
  };
}
for (const [path, kind] of [['/learners/onboarding', 'claim'], ['/learners/password-recovery', 'password']] as const) router.post(path, attemptLimit('learner-credential-ip', 60, 900), endpoint(async (req, res) => res.status(201).json(await submitAccountClaim(input.parse(req.body), kind))));
router.get('/staff/me/accounts', requireAuth, requireTeacher, endpoint(async (req, res) => res.json(await managedAccounts(req.caller!))));
router.post('/staff/me/accounts/:learnerId/review', requireAuth, requireTeacher, endpoint(async (req, res) => {
  const payload = z.object({ action: z.enum(['confirm', 'revoke', 'suspend', 'resume']), reference: z.string().regex(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/).optional() }).strict().parse(req.body);
  res.json(await reviewAccount(req.caller!, z.coerce.number().int().positive().parse(req.params.learnerId), payload.action, payload.reference));
}));
export default router;
