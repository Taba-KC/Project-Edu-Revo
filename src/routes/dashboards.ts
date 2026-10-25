/**
 * HTTP routing for this feature. Role-specific dashboard responses for staff and learners,
 * assembled by dashboardService. req.params contains URL IDs, req.body contains submitted
 * JSON, and res.json sends the response. Read each handler's guards before assuming access
 * is allowed.
 */
import { Router } from 'express';
import { requireAuth, requireLearner, requireTeacher } from '../middleware/auth';
import { DashboardError, getDashboard } from '../services/dashboardService';
const router = Router();
for (const role of ['staff', 'learner'] as const) {
  /**
   * GET the path constructed below: Read/return data.
   */
  router.get('/' + (role === 'staff' ? 'staff' : 'learners') + '/me/dashboard', requireAuth, role === 'staff' ? requireTeacher : requireLearner, async (req, res) => {
    const caller = req.caller!;
    if (!caller.schoolId) return res.status(403).json({ error: 'School access required' });
    try { return res.json(await getDashboard(role, caller.accountId, caller.schoolId)); }
    catch (error) { if (error instanceof DashboardError) return res.status(error.status).json({ error: error.message }); throw error; }
  });
}
export default router;
