import { Router } from 'express';
import { getGradesBySchool } from '../services/gradeService';
import { getSchoolById } from '../services/schoolService';
import { requireAuth, requirePrincipal } from '../middleware/auth';

const router = Router();
router.use('/schools/:schoolId/grades', requireAuth, requirePrincipal, (req, res, next) => {
  const schoolId = Number(req.params.schoolId);
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return res.status(400).json({ error: 'Invalid school ID' });
  if (schoolId !== req.caller?.schoolId) return res.status(403).json({ error: 'School access denied' });
  next();
});
router.get('/schools/:schoolId/grades', async (req, res) => {
  const schoolId = Number(req.params.schoolId);
  if (!await getSchoolById(schoolId)) return res.status(404).json({ error: 'School not found' });
  return res.json(await getGradesBySchool(schoolId));
});
router.post('/schools/:schoolId/grades', (_req, res) => {
  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Grades 8–12 are provided automatically. Custom grades cannot be created.' });
});
router.delete('/schools/:schoolId/grades/:gradeId', (_req, res) => {
  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'School grades are fixed and cannot be deleted. Manage classes within a grade instead.' });
});
export default router;
