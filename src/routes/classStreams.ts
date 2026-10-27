import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { and, eq, sql } from 'drizzle-orm';
import { classes, grades, learners, learnerStreamSelections } from '../db/schema';
import { requireAuth, requireLearner } from '../middleware/auth';
import { requireSchoolAdministration } from '../middleware/schoolAdministration';
import { saveClassStreams, streamOptions, learnerLearningSetup, StreamChoiceError } from '../services/classStreamService';
import { syncClassSubjects } from '../services/classSubjectService';
const router = Router();
const config = z.object({ streamIds: z.array(z.number().int().positive()).min(1).max(10), configuration: z.object({ primarySubjectId: z.number().int().positive(), locations: z.array(z.object({ subjectId: z.number().int().positive(), building: z.string().trim().min(1).max(120), classroom: z.string().trim().min(1).max(120) })).max(100) }).nullable() });
router.get('/schools/:schoolId/classes/:classId/streams', requireAuth, requireSchoolAdministration(['grades'], ['grades', 'curriculum', 'learners']), async (req, res) => {
  try {
return res.json(await db.transaction(async tx => {
      const [cls] = await tx.select({ id: classes.id }).from(classes).innerJoin(grades, eq(grades.id, classes.gradeId)).where(and(eq(classes.id, Number(req.params.classId)), eq(grades.schoolId, Number(req.params.schoolId))));
      if (!cls) throw new StreamChoiceError('Class not found.', 404); return streamOptions(tx, cls.id);
    }));
} catch (error) { if (error instanceof StreamChoiceError) return res.status(error.status).json({ error: error.message }); throw error; }
});
router.put('/schools/:schoolId/classes/:classId/streams', requireAuth, requireSchoolAdministration(['grades']), async (req, res) => {
  const input = config.safeParse(req.body); if (!input.success) return res.status(400).json({ error: 'Choose streams and valid classroom locations.' });
  try { await db.transaction(async tx => { await saveClassStreams(tx, Number(req.params.classId), Number(req.params.schoolId), input.data.streamIds, input.data.configuration); await syncClassSubjects(tx, Number(req.params.classId)); }); return res.json({ saved: true }); } catch (error) { if (error instanceof StreamChoiceError) return res.status(error.status).json({ error: error.message }); throw error; }
});
router.get('/learners/me/learning-setup', requireAuth, requireLearner, async (req, res) => {
  try { return res.json(await db.transaction(tx => learnerLearningSetup(tx, req.caller!))); } catch (error) { if (error instanceof StreamChoiceError) return res.status(error.status).json({ error: error.message }); throw error; }
});
// School staff can correct a mistaken confirmation; the learner cannot silently switch tracks.
router.delete('/schools/:schoolId/classes/:classId/learners/:learnerId/stream-selection', requireAuth, requireSchoolAdministration(['grades', 'learners']), async (req, res) => {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
    const [target] = await tx.select({ id: learners.id }).from(learners).where(and(eq(learners.id, Number(req.params.learnerId)), eq(learners.classId, Number(req.params.classId)), eq(learners.schoolId, Number(req.params.schoolId)))).for('update');
    if (!target) throw new StreamChoiceError('Learner not found in this class.', 404);
    await tx.delete(learnerStreamSelections).where(eq(learnerStreamSelections.learnerId, target.id));
  });
  return res.json({ saved: true });
});
router.post('/learners/me/learning-setup', requireAuth, requireLearner, async (req, res) => {
  const input = z.object({ classId:z.number().int().positive(),academicYear:z.number().int(),streamId: z.number().int().positive(), revision: z.number().int().min(0) }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Confirm one of your school’s subject combinations.' });
  try {
await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(7411,0)`);
      const [learner] = await tx.select().from(learners).where(eq(learners.id, req.caller!.accountId)).for('update');
      if (learner?.classId) await tx.select().from(classes).where(eq(classes.id, learner.classId)).for('update');
      const setup = await learnerLearningSetup(tx, req.caller!);
      if (setup.status !== 'choose-subjects' || setup.classId !== input.data.classId || setup.academicYear!==input.data.academicYear || setup.revision !== input.data.revision || !setup.options.some(option => option.id === input.data.streamId)) throw new StreamChoiceError('Your class subjects changed or were already confirmed. Reload to continue.', 409);
      await tx.insert(learnerStreamSelections).values({ learnerId: learner.id, classId: setup.classId, academicYear: setup.academicYear!, streamId: input.data.streamId, revision: setup.revision }).onConflictDoUpdate({ target: [learnerStreamSelections.learnerId, learnerStreamSelections.classId, learnerStreamSelections.academicYear], set: { streamId: input.data.streamId, revision: setup.revision } });
    }); return res.json({ saved: true });
} catch (error) { if (error instanceof StreamChoiceError) return res.status(error.status).json({ error: error.message }); throw error; }
});
export default router;
