/**
 * HTTP routing for this feature. Read fixed school grades and validate the school used by
 * the request. req.params contains URL IDs, req.body contains submitted JSON, and res.json
 * sends the response. Read each handler's guards before assuming access is allowed.
 */
import { Router } from 'express';
import { getGradesBySchool } from '../services/gradeService';
import { getSchoolById } from '../services/schoolService';
import { requireAuth } from '../middleware/auth';

import { requireSchoolAdministration } from "../middleware/schoolAdministration";
const requireSchoolAdmin = requireSchoolAdministration(["grades"],["grades", "learners", "curriculum"]);
const router = Router();
router.use('/schools/:schoolId/grades', requireAuth, requireSchoolAdmin, (req, res, next) => {
  const schoolId = Number(req.params.schoolId);
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return res.status(400).json({ error: 'Invalid school ID' });
  if (schoolId !== req.caller?.schoolId) return res.status(403).json({ error: 'School access denied' });
  next();
});
/**
 * GET /schools/:schoolId/grades: Read/return data.
 */
router.get('/schools/:schoolId/grades', async (req, res) => {
  const schoolId = Number(req.params.schoolId);
  if (!await getSchoolById(schoolId)) return res.status(404).json({ error: 'School not found' });
  return res.json(await getGradesBySchool(schoolId));
});
/**
 * POST /schools/:schoolId/grades: Create data or run the submitted operation.
 */
router.post('/schools/:schoolId/grades', (_req, res) => {
  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'Grades 8–12 are provided automatically. Custom grades cannot be created.' });
});
/**
 * DELETE /schools/:schoolId/grades/:gradeId: Remove data through the handler below.
 */
router.delete('/schools/:schoolId/grades/:gradeId', (_req, res) => {
  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'School grades are fixed and cannot be deleted. Manage classes within a grade instead.' });
});
export default router;
