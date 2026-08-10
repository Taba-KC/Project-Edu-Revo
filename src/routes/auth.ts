import { Router } from 'express';
import { z } from 'zod';
import { loginPerson, loginLearner, refreshAccessToken, logout } from '../services/authService';

const router = Router();

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

router.post('/auth/people/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  try {
    const tokens = await loginPerson(result.data.username, result.data.password);
    return res.json(tokens);
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/auth/learners/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  try {
    const tokens = await loginLearner(result.data.username, result.data.password);
    return res.json(tokens);
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/auth/refresh', async (req, res) => {
  const result = refreshSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  try {
    const accessToken = await refreshAccessToken(result.data.refreshToken);
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.post('/auth/logout', async (req, res) => {
  const result = refreshSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  await logout(result.data.refreshToken);
  return res.json({ message: 'Logged out' });
});

export default router;