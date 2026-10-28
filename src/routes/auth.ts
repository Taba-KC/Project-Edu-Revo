import { writeRefreshCookie, clearRefreshCookie, readRefreshCookie, trustedAuthOrigin } from '../middleware/authCookie';
import { attemptLimit } from '../middleware/authRateLimit';
/**
 * HTTP routing for this feature. Login, token refresh/logout and account-claim endpoints for
 * the supported account types. req.params contains URL IDs, req.body contains submitted
 * JSON, and res.json sends the response. Read each handler's guards before assuming access
 * is allowed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { loginPerson, loginLearner, loginManager, refreshAccessToken, logout } from '../services/authService';

const router = Router();
router.use('/auth',trustedAuthOrigin);
const loginLimit=attemptLimit('login-account',12,900,req=>req.path+':'+String(req.body?.username??'').trim().toLowerCase().slice(0,200));

const loginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(1024),
});

const refreshSchema = z.object({
  refreshToken: z.string().regex(/^[a-f0-9]{128}$/).optional(),
});

/**
 * POST /auth/people/login: Create data or run the submitted operation.
 */
router.post('/auth/people/login', loginLimit, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  try {
    const tokens = await loginPerson(result.data.username, result.data.password);
    writeRefreshCookie(res,tokens.refreshToken);
    return res.json({accessToken:tokens.accessToken});
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

/**
 * POST /auth/learners/login: Create data or run the submitted operation.
 */
router.post('/auth/learners/login', loginLimit, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  try {
    const tokens = await loginLearner(result.data.username, result.data.password);
    writeRefreshCookie(res,tokens.refreshToken);
    return res.json({accessToken:tokens.accessToken});
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

/**
 * POST /auth/refresh: Create data or run the submitted operation.
 */
router.post('/auth/refresh', async (req, res) => {
  const result = refreshSchema.safeParse(req.body ?? {});
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  try {
    const token=readRefreshCookie(req)??result.data.refreshToken;
    if(!token)throw new Error('No refresh token');
    const accessToken = await refreshAccessToken(token);
    writeRefreshCookie(res,token);
    return res.json({ accessToken });
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * POST /auth/logout: Create data or run the submitted operation.
 */
router.post('/auth/logout', async (req, res) => {
  const result = refreshSchema.safeParse(req.body ?? {});
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const token=readRefreshCookie(req)??result.data.refreshToken;
  if(token)await logout(token);
  clearRefreshCookie(res);
  return res.json({ message: 'Logged out' });
});

/**
 * POST /auth/managers/login: Create data or run the submitted operation.
 */
router.post('/auth/managers/login', loginLimit, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Username and password are required' });
  try { const tokens=await loginManager(result.data.username, result.data.password);writeRefreshCookie(res,tokens.refreshToken);return res.json({accessToken:tokens.accessToken}); }
  catch { return res.status(401).json({ error: 'Invalid credentials' }); }
});
export default router;