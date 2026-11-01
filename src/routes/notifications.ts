import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireLearner, requireTeacher } from '../middleware/auth';
import { getNotifications, markNotificationsRead } from '../services/notificationService';
import { TeacherError } from '../services/teacherWorkspaceService';
import { DashboardError } from '../services/dashboardService';

const router = Router();
for (const role of ['staff', 'learners'] as const) {
  const route = `/${role}/me/notifications`;
  const guard = role === 'staff' ? requireTeacher : requireLearner;
  router.get(route, requireAuth, guard, async (req, res, next) => {
    try { res.json(await getNotifications(req.caller!)); }
    catch (error) { if (error instanceof TeacherError || error instanceof DashboardError) res.status(error.status).json({ error: error.message }); else next(error); }
  });
  router.post(`${route}/read`, requireAuth, guard, async (req, res, next) => {
    try {
      const { ids } = z.object({ ids: z.array(z.string().min(1).max(160)).min(1).max(500) }).parse(req.body);
      res.json(await markNotificationsRead(req.caller!, ids));
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Choose valid notifications.' });
      else if (error instanceof TeacherError || error instanceof DashboardError) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  });
}
export default router;
