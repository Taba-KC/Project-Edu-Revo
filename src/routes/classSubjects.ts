/**
 * HTTP routing for this feature. Read active subjects for a class and assign their teachers.
 * req.params contains URL IDs, req.body contains submitted JSON, and res.json sends the
 * response. Read each handler's guards before assuming access is allowed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { classes, grades } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, requirePrincipal } from '../middleware/auth';
import { getClassSubjects, assignSubjectTeacher, SetupError } from '../services/classSubjectService';
import { getClassCurriculum } from '../services/classCurriculumService';
const router = Router();
router.use('/schools/:schoolId/classes/:classId/subjects', requireAuth, requirePrincipal, async (req, res, next) => {
  const schoolId = Number(req.params.schoolId), classId = Number(req.params.classId);
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0 || !Number.isSafeInteger(classId) || classId <= 0) return res.status(400).json({ error: 'Invalid ID' });
  if (req.caller?.schoolId !== schoolId) return res.status(403).json({ error: 'School access denied' });
  const [cls] = await db.select({ id: classes.id }).from(classes).innerJoin(grades, eq(grades.id, classes.gradeId))
    .where(and(eq(classes.id, classId), eq(grades.schoolId, schoolId)));
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  next();
});
/**
 * GET /schools/:schoolId/classes/:classId/subjects: Read/return data.
 */
router.get('/schools/:schoolId/classes/:classId/subjects', async (req, res) => {
  res.json(await getClassSubjects(Number(req.params.schoolId), Number(req.params.classId)));
});
/**
 * GET /schools/:schoolId/classes/:classId/subjects/:classSubjectId/curriculum: Read/return
 * data.
 */
router.get('/schools/:schoolId/classes/:classId/subjects/:classSubjectId/curriculum', async (req, res) => {
  const classSubjectId = Number(req.params.classSubjectId);
  if (!Number.isSafeInteger(classSubjectId) || classSubjectId <= 0) return res.status(400).json({ error: 'Invalid class subject ID' });
  try {
    return res.json(await getClassCurriculum(Number(req.params.schoolId), Number(req.params.classId), classSubjectId));
  } catch (error) {
    if (error instanceof SetupError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
/**
 * PATCH /schools/:schoolId/classes/:classId/subjects/:classSubjectId/teacher: Apply an edit
 * to an existing record.
 */
router.patch('/schools/:schoolId/classes/:classId/subjects/:classSubjectId/teacher', async (req, res) => {
  const result = z.object({ personId: z.number().int().positive().nullable() }).safeParse(req.body);
  const classSubjectId = Number(req.params.classSubjectId);
  if (!result.success || !Number.isSafeInteger(classSubjectId) || classSubjectId <= 0) return res.status(400).json({ error: 'Invalid teacher assignment' });
  try {
    await db.transaction(tx => assignSubjectTeacher(tx, Number(req.params.schoolId), Number(req.params.classId), classSubjectId, result.data.personId));
    res.json(await getClassSubjects(Number(req.params.schoolId), Number(req.params.classId)));
  } catch (err) {
    if (err instanceof SetupError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});
export default router;
