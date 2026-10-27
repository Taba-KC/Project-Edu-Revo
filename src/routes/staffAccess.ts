import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { people, administrativeWork } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { CAPABILITIES, staffAccess, AccessError } from '../services/staffAccessService';
const router = Router();
router.get('/staff/me/access', requireAuth, async (req, res) => {
  try { return res.json(await staffAccess(req.caller!)); } catch (error) { if (error instanceof AccessError) return res.status(error.status).json({ error: error.message }); throw error; }
});
router.put('/schools/:schoolId/people/:personId/administrative-work', requireAuth, async (req, res) => {
  try {
    const access = await staffAccess(req.caller!);
    if (!access.isPrincipal || access.schoolId !== Number(req.params.schoolId)) throw new AccessError('Only this school’s principal can assign administrative work.');
    const input = z.object({ capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length) }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Choose valid administrative work.' });
    const [person] = await db.select().from(people).where(and(eq(people.id, Number(req.params.personId)), eq(people.schoolId, access.schoolId)));
    if (!person || !['teacher', 'principal'].includes(person.role)) return res.status(404).json({ error: 'School staff member not found.' });
    await db.transaction(async tx => {
      await tx.select().from(people).where(eq(people.id, person.id)).for('update');
      await tx.delete(administrativeWork).where(eq(administrativeWork.personId, person.id));
      const keys = [...new Set(input.data.capabilities)];
      if (keys.length) await tx.insert(administrativeWork).values(keys.map(capability => ({ personId: person.id, schoolId: access.schoolId, capability })));
    });
    return res.json({ saved: true });
  } catch (error) { if (error instanceof AccessError) return res.status(error.status).json({ error: error.message }); throw error; }
});
export default router;
